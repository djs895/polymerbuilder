import test from "node:test";
import assert from "node:assert/strict";
import { effectScope, ref, shallowRef } from "vue";
import { useSiteSelection } from "../src/composables/useSiteSelection.js";
import { MoleculeViewerController } from "../src/controllers/MoleculeViewerController.js";
import { confirmSiteSettings, resetSiteSettings, startSiteSettings } from "../src/utils/siteSettings.js";

// 本测试只验证选择和计算，不触发 WebGL 绘制。
function ignoreSelection() {}

class ModelFixture {
  constructor() {
    this.atoms = [
      { index: 0, serial: 10, bonds: [1] },
      { index: 1, serial: 20, bonds: [0, 2] },
      { index: 2, serial: 30, bonds: [1, 3] },
      { index: 3, serial: 40, bonds: [2] },
    ];
  }
  selectedAtoms() { return this.atoms; }
}

function settingsFixture() {
  const scope = effectScope();
  const selection = scope.run(useSiteSelection.bind(null, ignoreSelection));
  const controller = new MoleculeViewerController({
    containerRef: null, props: {}, emit: null, origin: {}, createViewer: null,
  });
  controller.model = new ModelFixture();
  return {
    scope, selection, siteViewer: shallowRef(controller),
    editingSite: ref(false), setting: ref(false),
    leavingGroups: shallowRef(null), siteError: ref(""),
  };
}

function selectHead(state) {
  startSiteSettings(state);
  state.selection.selectBond([10, 20]);
  state.selection.selectAtom(20);
  confirmSiteSettings(state);
}

function selectTail(state, retainedSerial) {
  state.selection.selectBond([30, 40]);
  state.selection.selectAtom(retainedSerial);
  confirmSiteSettings(state);
}

// node:test 传入 TestContext，用于在每例结束后停止真实 Vue 侦听。
test("confirms head first, then computes both groups before completing tail", function (context) {
  const state = settingsFixture();
  context.after(state.scope.stop.bind(state.scope));
  selectHead(state);
  assert.equal(state.selection.phase.value, "tail");
  assert.equal(state.setting.value, false);
  assert.equal(state.leavingGroups.value, null);
  selectTail(state, 30);
  assert.equal(state.selection.phase.value, "ready");
  assert.equal(state.editingSite.value, false);
  assert.equal(state.setting.value, true);
  assert.deepEqual(state.leavingGroups.value, { head: [10], tail: [40] });
});

test("failure preserves editable tail and a corrected endpoint succeeds", function (context) {
  const state = settingsFixture();
  context.after(state.scope.stop.bind(state.scope));
  selectHead(state);
  selectTail(state, 40);
  assert.match(state.siteError.value, /另一端/);
  assert.equal(state.selection.phase.value, "tail");
  assert.equal(state.selection.sites.value.tail, null);
  assert.deepEqual(state.selection.bond.value, [30, 40]);
  assert.equal(state.editingSite.value, true);
  assert.equal(state.setting.value, false);
  assert.equal(state.leavingGroups.value, null);
  state.selection.selectAtom(30);
  confirmSiteSettings(state);
  assert.equal(state.siteError.value, "");
  assert.deepEqual(state.leavingGroups.value, { head: [10], tail: [40] });
});

test("restart and import reset clear previous results and errors", function (context) {
  const state = settingsFixture();
  context.after(state.scope.stop.bind(state.scope));
  selectHead(state);
  selectTail(state, 30);
  startSiteSettings(state);
  assert.equal(state.selection.phase.value, "head");
  assert.equal(state.leavingGroups.value, null);
  assert.equal(state.setting.value, false);
  assert.equal(state.editingSite.value, true);
  state.siteError.value = "previous error";
  resetSiteSettings(state);
  assert.equal(state.siteError.value, "");
  assert.equal(state.editingSite.value, false);
  assert.deepEqual(state.selection.sites.value, { head: null, tail: null });
});

test("missing model cannot confirm tail or reuse another instance's results", function (context) {
  const first = settingsFixture();
  const second = settingsFixture();
  context.after(first.scope.stop.bind(first.scope));
  context.after(second.scope.stop.bind(second.scope));
  selectHead(first);
  selectTail(first, 30);
  selectHead(second);
  second.siteViewer.value.model = null;
  selectTail(second, 30);
  assert.match(second.siteError.value, /模型/);
  assert.equal(second.selection.phase.value, "tail");
  assert.equal(second.leavingGroups.value, null);
  assert.deepEqual(first.leavingGroups.value, { head: [10], tail: [40] });
});
