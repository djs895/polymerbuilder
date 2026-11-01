// 3Dmol 2.5.5 没有完整 dispose API。它在构造时直接 bind 全局监听，
// 因此只在同步创建期间记录准确的回调引用，finally 中立即恢复注册方法。
// 不修改 EventTarget.prototype，也不拦截其他实例后续的注册。
export class ViewerResources {
  constructor() {
    // create 成功后赋值，dispose 读取并清空。
    this.viewer = null;
    // recordListener 写入，removeListeners 遍历并清空。
    this.listeners = [];
  }

  /**
   * target、original 由 create 使用 bind 显式预先传入。
   * type、callback、options 来自 3Dmol 对 addEventListener 的调用。
   * 先执行实际注册，再记录移除监听需要的数据；没有返回值。
   */
  recordListener(target, original, type, callback, options) {
    original.call(target, type, callback, options);
    // removeEventListener 需要匹配注册时的 capture 标志。
    const capture = typeof options === "boolean" ? options : !!options?.capture;
    this.listeners.push({ target, type, callback, capture });
  }

  /**
   * 控制器 mount 显式传入创建函数、容器 DOM、配置和目标对象列表。
   * 返回创建好的查看器；同步创建期间临时替换目标的注册方法。
   * finally 恢复原属性；记录范围不包含以后异步添加的其他监听。
   */
  create(factory, container, config, targets) {
    // 本次临时替换的属性记录，仅在本方法执行期间使用。
    const patched = [];
    try {
      for (const target of new Set(targets)) {
        const descriptor = Object.getOwnPropertyDescriptor(target, "addEventListener");
        const original = target.addEventListener;
        Object.defineProperty(target, "addEventListener", {
          configurable: true, writable: true,
          // 明确绑定实例、目标和原方法，事件参数随后由 3Dmol 传入。
          value: this.recordListener.bind(this, target, original),
        });
        patched.push({ target, descriptor });
      }
      this.viewer = factory(container, config);
      if (!this.viewer) throw new Error("无法创建分子查看器。");
      return this.viewer;
    } catch (error) {
      // 创建失败时撤销已经记录的外部监听。
      this.removeListeners();
      throw error;
    } finally {
      // 逆序恢复；原先没有自有属性时删除临时属性，恢复原型链查找。
      for (const { target, descriptor } of patched.reverse()) {
        if (descriptor) Object.defineProperty(target, "addEventListener", descriptor);
        else delete target.addEventListener;
      }
    }
  }

  /**
   * 读取保存的监听记录，移除监听并清空数组，无返回值。
   * 使用原 callback 引用；重新 bind 会产生不同函数，不能用于移除。
   */
  removeListeners() {
    for (const { target, type, callback, capture } of this.listeners) {
      target.removeEventListener(type, callback, capture);
    }
    this.listeners.length = 0;
  }

  /**
   * 控制器 dispose 调用，移除监听、停止观察器和任务并清理查看器内容。
   * 控制器通常已先清理模型，此处处理属于查看器整体的资源。
   */
  dispose() {
    this.removeListeners();
    const viewer = this.viewer;
    this.viewer = null;
    if (!viewer) return;
    // 以下字段属于 3Dmol 2.5.5；升级依赖时需运行浏览器生命周期测试。
    // 断开尺寸和可见性观察，避免继续触发查看器更新。
    viewer.divwatcher?.disconnect();
    viewer.intwatcher?.disconnect();
    // 取消查看器内部的悬停、长按和旋转任务。
    clearTimeout(viewer.hoverTimeout);
    clearTimeout(viewer.longTouchTimeout);
    viewer.spin(false);
    // 先处理子节点资源，再清理剩余场景及交互缓存。
    releaseRenderedObjects(viewer.modelGroup);
    viewer.clear();
    viewer.clickables?.splice(0);
    viewer.hoverables?.splice(0);
    viewer.current_hover = null;
    // 将查看器创建的画布从组件容器中移除。
    viewer.getCanvas?.().remove();
    // OffscreenCanvas 可能共享 WebGL 上下文，不能调用 loseContext。
  }
}

/**
 * 输入：3Dmol 渲染对象根节点；无返回值。
 * 遍历后代，对 geometry/material 调用 dispose；根节点由库的移除操作处理。
 * Set 避免同一次遍历重复释放共享资源，循环不隐式捕获外层变量。
 */
export function releaseRenderedObjects(root) {
  if (!root) return;
  const pending = [...(root.children ?? [])];
  const released = new Set();
  while (pending.length) {
    const object = pending.pop();
    pending.push(...(object.children ?? []));
    for (const resource of [object.geometry, object.material]) {
      if (!resource || released.has(resource)) continue;
      released.add(resource);
      resource.dispose?.();
    }
  }
}
