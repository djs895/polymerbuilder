import test from "node:test";
import assert from "node:assert/strict";
import { MoleculeViewerController } from "../src/controllers/MoleculeViewerController.js";
import { ViewerResources } from "../src/utils/viewerResources.js";

// 使用真实 EventTarget 检查监听释放，不依赖浏览器或 WebGL。
class ListenerFixture {
  constructor() {
    this.target = new EventTarget();
    this.calls = 0;
  }
  receive() { this.calls += 1; }
  create() {
    this.target.addEventListener("resize", this.receive.bind(this));
    return null;
  }
}

// 模拟第三方清理失败，验证控制器仍断开自己持有的业务引用。
class FailingResources {
  dispose() { throw new Error("cleanup failed"); }
}

// WebGL 无法在 Node 中运行；此边界替身只记录绘制输入，不替代业务判断。
class InteractionFixture {
  constructor() {
    this.events = [];
    this.styles = [];
    this.renders = 0;
    this.props = { siteMode: false, pdbText: "" };
    this.origin = {};
    this.controller = new MoleculeViewerController({
      containerRef: { value: null }, props: this.props,
      emit: this.receive.bind(this), origin: this.origin, createViewer: null,
    });
    this.controller.viewer = this;
    this.shape = new ShapeFixture();
    this.controller.pairs.set(this.shape, [10, 20]);
    this.controller.bondEntries.push({ shape: this.shape, pair: [10, 20] });
  }
  // 控制器调用 emit 时传入事件名称和 serial 数据。
  receive(name, value) { this.events.push([name, value]); }
  setStyle(selection, style) { this.styles.push({ selection, style }); }
  addStyle(selection, style) { this.styles.push({ selection, style }); }
  render() { this.renders += 1; }
}

class ShapeFixture {
  constructor() { this.style = {}; }
  updateStyle(style) { Object.assign(this.style, style); }
}

// 用实例保存待执行帧，显式接收回调，避免测试自身隐式捕获业务状态。
class FrameFixture {
  constructor() { this.tasks = new Map(); this.nextId = 1; }
  request(callback) {
    const id = this.nextId++;
    this.tasks.set(id, callback);
    return id;
  }
  cancel(id) { this.tasks.delete(id); }
  flush() {
    const callbacks = [...this.tasks.values()];
    this.tasks.clear();
    for (const callback of callbacks) callback(0);
  }
}

test("failed viewer construction restores registration and removes listeners", function () {
  const fixture = new ListenerFixture();
  const resources = new ViewerResources();
  const original = fixture.target.addEventListener;
  assert.throws(resources.create.bind(
    resources, fixture.create.bind(fixture), {}, {}, [fixture.target],
  ), /无法创建/);
  assert.equal(fixture.target.addEventListener, original);
  assert.equal(Object.hasOwn(fixture.target, "addEventListener"), false);
  fixture.target.dispatchEvent(new Event("resize"));
  assert.equal(fixture.calls, 0);
});

test("controller releases dependencies when viewer construction fails", function () {
  const fixture = new ListenerFixture();
  const controller = new MoleculeViewerController({
    containerRef: { value: { ownerDocument: {
      defaultView: fixture.target, body: fixture.target,
    } } },
    props: { pdbText: "", siteMode: false },
    emit: fixture.receive.bind(fixture),
    origin: {},
    createViewer: fixture.create.bind(fixture),
  });
  assert.throws(controller.mount.bind(controller), /无法创建/);
  assert.equal(controller.disposed, true);
  assert.equal(controller.containerRef, null);
  assert.equal(controller.emit, null);
});

test("controller releases dependencies even when resource cleanup throws", function () {
  const controller = new MoleculeViewerController({
    containerRef: { value: null }, props: {}, emit: null,
    origin: {}, createViewer: null,
  });
  controller.resources = new FailingResources();
  assert.throws(controller.dispose.bind(controller), /cleanup failed/);
  assert.equal(controller.containerRef, null);
  assert.equal(controller.props, null);
  assert.equal(controller.origin, null);
  assert.equal(controller.callbacks, null);
  assert.doesNotThrow(controller.dispose.bind(controller));
});

test("bound events read latest mode and selection while isolating instances", function () {
  const first = new InteractionFixture();
  const second = new InteractionFixture();
  const { bond, atom, hover, unhover } = first.controller.callbacks;
  hover(first.shape);
  assert.equal(first.shape.style.opacity, 0.45);
  unhover(first.shape);
  assert.equal(first.shape.style.opacity, 0);
  bond(first.shape);
  assert.deepEqual(first.events, []);
  first.props.siteMode = true;
  bond(first.shape);
  assert.deepEqual(first.events, [["bond-click", [10, 20]]]);
  first.controller.selection = { bondSerials: [10, 20], retainedSerial: null };
  atom({ serial: 99, x: 1, y: 2, z: 3 });
  assert.equal(first.events.length, 1);
  atom({ serial: 20, x: 1, y: 2, z: 3 });
  assert.deepEqual(first.events[1], ["atom-click", 20]);
  assert.deepEqual(first.origin.position, [1, 2, 3]);
  assert.deepEqual(second.events, []);
  assert.deepEqual(second.origin, {});

  // 已确认的头部键不重复上报。
  first.controller.selection = {
    bondSerials: null,
    sites: { head: { bondSerials: [20, 10], retainedSerial: 20 } },
  };
  bond(first.shape);
  assert.equal(first.events.length, 2);
  first.props.siteMode = false;
  const clicked = { serial: 10, index: 0, model: 0, x: 4, y: 5, z: 6 };
  atom(clicked);
  assert.equal(first.controller.item, 0);
  atom(clicked);
  assert.equal(first.controller.item, null);
});

test("selection updates coalesce, render latest state and cancel pending refresh", function () {
  const originalRequest = Object.getOwnPropertyDescriptor(globalThis, "requestAnimationFrame");
  const originalCancel = Object.getOwnPropertyDescriptor(globalThis, "cancelAnimationFrame");
  const frames = new FrameFixture();
  Object.defineProperty(globalThis, "requestAnimationFrame", {
    configurable: true, value: frames.request.bind(frames),
  });
  Object.defineProperty(globalThis, "cancelAnimationFrame", {
    configurable: true, value: frames.cancel.bind(frames),
  });
  try {
    const fixture = new InteractionFixture();
    fixture.controller.setSiteSelection({ bondSerials: [10, 20] });
    fixture.controller.setSiteSelection({
      bondSerials: null,
      sites: { head: { bondSerials: [20, 10], retainedSerial: 20 } },
    });
    assert.equal(frames.tasks.size, 1);
    frames.flush();
    assert.equal(fixture.renders, 1);
    assert.equal(fixture.shape.style.color, 0xFF1493);
    assert.equal(fixture.shape.style.opacity, 1);
    assert.equal(fixture.controller.frame, null);
    assert.equal(fixture.styles.at(-1).selection.serial, 20);
    fixture.controller.setSiteSelection({ bondSerials: null });
    fixture.controller.cancelRefresh();
    frames.flush();
    assert.equal(fixture.renders, 1);
  } finally {
    if (originalRequest) Object.defineProperty(globalThis, "requestAnimationFrame", originalRequest);
    else delete globalThis.requestAnimationFrame;
    if (originalCancel) Object.defineProperty(globalThis, "cancelAnimationFrame", originalCancel);
    else delete globalThis.cancelAnimationFrame;
  }
});
