import test from 'node:test';
import assert from 'node:assert/strict';
import { ref, shallowRef } from 'vue';
import { PdbDeletionController } from '../src/controllers/PdbDeletionController.js';

class SelectionFixture {
  constructor() {
    this.phase = ref('ready');
    this.bond = ref(null);
    this.atom = ref(null);
    this.sites = ref({ head: { retainedSerial: 20 }, tail: { retainedSerial: 30 } });
  }
  reset() { this.phase.value = 'head'; this.sites.value = { head: null, tail: null }; }
}
class ViewerFixture {
  setSiteSelection(selection) { this.selection = selection; }
  getAtomSnapshot() {
    return [
      { index: 0, serial: 10, bonds: [1] },
      { index: 1, serial: 20, bonds: [0, 2] },
      { index: 2, serial: 30, bonds: [1] },
    ];
  }
}
function fixture() {
  const pdbText = ref([
    'HETATM   10  H1  UNL     1      -1.000   0.000   0.000  1.00  0.00           H',
    'HETATM   20  C1  UNL     1       0.000   0.000   0.000  1.00  0.00           C',
    'HETATM   30  C2  UNL     1       1.400   0.000   0.000  1.00  0.00           C', 'END',
  ].join('\n'));
  const siteState = {
    selection: new SelectionFixture(), siteViewer: shallowRef(new ViewerFixture()),
    editingSite: ref(false), setting: ref(true),
    leavingGroups: shallowRef({ head: [10], tail: [] }), siteError: ref(''),
  };
  return new PdbDeletionController({ pdbText, siteState, isImporting: ref(false) });
}

test('apply preserves endpoints, clears selection, prevents repeat; restart restores source', async function () {
  const flow = fixture();
  const original = flow.pdbText.value;
  const pending = flow.apply();
  assert.equal(flow.busy.value, true);
  await flow.apply();
  await pending;
  assert.ok(!flow.pdbText.value.includes('HETATM   10'));
  assert.equal(flow.originalPdbText.value, original);
  assert.deepEqual(flow.connectionSites.value, { headSerial: 20, tailSerial: 30 });
  assert.equal(flow.siteState.leavingGroups.value, null);
  assert.equal(flow.inferBonds.value, false);
  assert.equal(flow.siteState.selection.sites.value.head, null);
  await flow.restart();
  assert.equal(flow.pdbText.value, original);
  assert.equal(flow.inferBonds.value, true);
  assert.equal(flow.connectionSites.value, null);
  assert.equal(flow.siteState.editingSite.value, true);
});

test('protected endpoints and invalid PDB keep text and selection intact', async function () {
  const flow = fixture();
  const original = flow.pdbText.value;
  flow.siteState.leavingGroups.value.head = [20];
  await flow.apply();
  assert.match(flow.siteState.siteError.value, /保留端/);
  assert.equal(flow.pdbText.value, original);
  assert.equal(flow.siteState.selection.phase.value, 'ready');
  flow.siteState.leavingGroups.value.head = [10];
  flow.pdbText.value = 'LINK  unsupported\n' + original;
  await flow.apply();
  assert.match(flow.siteState.siteError.value, /LINK/);
  assert.equal(flow.siteState.selection.phase.value, 'ready');
  assert.equal(flow.busy.value, false);
});

test('import replaces restore source and instances remain isolated', async function () {
  const first = fixture();
  const second = fixture();
  await first.apply();
  first.acceptText(second.pdbText.value + '\n');
  assert.equal(first.originalPdbText.value, second.pdbText.value + '\n');
  assert.equal(first.connectionSites.value, null);
  assert.equal(first.inferBonds.value, true);
  assert.equal(second.siteState.selection.phase.value, 'ready');
  first.isImporting.value = true;
  await first.restart();
  assert.equal(first.siteState.editingSite.value, false);
});

class FailedReplacementViewer extends ViewerFixture {
  getAtomSnapshot(text) {
    // 模型重载会清空查看器选择，父组件的 ref 则保持不变。
    this.selection = null;
    if (text.includes('CONECT')) throw new Error('模型刷新失败');
    return super.getAtomSnapshot();
  }
}

test('failed renderer acknowledgement restores text and preserves retry state', async function () {
  const flow = fixture();
  const original = flow.pdbText.value;
  flow.siteState.siteViewer.value = new FailedReplacementViewer();
  await flow.apply();
  assert.equal(flow.pdbText.value, original);
  assert.equal(flow.siteState.selection.phase.value, 'ready');
  assert.deepEqual(flow.siteState.leavingGroups.value, { head: [10], tail: [] });
  assert.equal(flow.connectionSites.value, null);
  assert.equal(flow.inferBonds.value, true);
  assert.match(flow.siteState.siteError.value, /刷新失败/);
  assert.equal(flow.siteState.siteViewer.value.selection.phase, 'ready');
  assert.equal(flow.siteState.siteViewer.value.selection.sites.head.retainedSerial, 20);
});
