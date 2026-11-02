import test from 'node:test';
import assert from 'node:assert/strict';
import { ViewerFixture, polymerFixture } from './helpers/polymerFixture.js';
import { MoleculeViewerController } from '../src/controllers/MoleculeViewerController.js';

class ModelSnapshotFixture {
  constructor() {
    this.atoms = [{
      index: 0, serial: 20, x: 1, y: 2, z: 3, elem: 'C', atom: 'C1',
      resn: 'MON', resi: 1, chain: 'A', hetflag: true, bonds: [1], bondOrder: [2],
      callback: this.selectedAtoms.bind(this),
    }];
  }
  selectedAtoms() { return this.atoms; }
}

test('viewer snapshots copy spatial and bond data without rendering callbacks', function () {
  const controller = new MoleculeViewerController({});
  controller.model = new ModelSnapshotFixture();
  controller.modelText = 'current model';
  const snapshot = controller.getAtomSnapshot('current model');
  assert.equal(snapshot[0].x, 1);
  assert.equal(snapshot[0].elem, 'C');
  assert.equal(snapshot[0].callback, undefined);
  assert.doesNotThrow(structuredClone.bind(null, snapshot));
  snapshot[0].bonds.length = 0;
  snapshot[0].x = 99;
  assert.deepEqual(controller.model.atoms[0].bonds, [1]);
  assert.equal(controller.model.atoms[0].x, 1);
  assert.throws(controller.getAtomSnapshot.bind(controller, 'stale model'), /未就绪/);
});

test('deletion saves immutable geometry before removal and current indices after removal', async function () {
  const { deletion, stop } = polymerFixture();
  try {
    await deletion.apply();
    assert.equal(deletion.siteState.siteError.value, '');
    const template = deletion.monomerTemplate.value;
    assert.deepEqual(template.geometry.head.removedPosition, [-1, 0, 0]);
    assert.deepEqual(template.geometry.tail.direction, [1, 0, 0]);
    assert.equal(template.atoms[0].serial, 20);
    assert.equal(template.atoms[0].index, 0);
    assert.deepEqual(template.atoms[0].bonds, [1]);
    assert.ok(Object.isFrozen(template.atoms[0].bonds));
    assert.ok(Object.isFrozen(template.geometry.head.direction));
  } finally { stop(); }
});

test('repeated builds use the saved monomer, including switching connection type', async function () {
  const { deletion, polymer, stop } = polymerFixture();
  try {
    await deletion.apply();
    const template = deletion.monomerTemplate.value;
    const before = structuredClone(template);
    polymer.bondLength.value = 1.5;
    polymer.n.value = 3;
    await polymer.apply();
    assert.equal(polymer.error.value, '');
    assert.equal(polymer.result.value.atomCount, 6);
    assert.equal(new ViewerFixture().getAtomSnapshot(deletion.pdbText.value).length, 6);
    assert.equal(deletion.inferBonds.value, false);
    polymer.type.value = 'head-head';
    polymer.n.value = 2;
    await polymer.apply();
    assert.equal(polymer.result.value.atomCount, 4);
    assert.equal(new ViewerFixture().getAtomSnapshot(deletion.pdbText.value).length, 4);
    assert.equal(polymer.result.value.connections[0].from.serial, 20);
    assert.equal(polymer.result.value.connections[0].to.serial, 20);
    assert.equal(deletion.monomerTemplate.value, template);
    assert.deepEqual(template, before);
  } finally { stop(); }
});

class RejectLargerModel extends ViewerFixture {
  getAtomSnapshot(text) {
    const atoms = super.getAtomSnapshot(text);
    if (atoms.length > 4) throw new Error('模拟渲染失败');
    return atoms;
  }
}

test('failed build restores last rendered structure and preserves successful result for retry', async function () {
  const { deletion, polymer, stop } = polymerFixture();
  try {
    await deletion.apply();
    polymer.bondLength.value = 1.5;
    await polymer.apply();
    const previousText = deletion.pdbText.value;
    const previousResult = polymer.result.value;
    const template = deletion.monomerTemplate.value;
    deletion.siteState.siteViewer.value = new RejectLargerModel();
    polymer.n.value = 3;
    await polymer.apply();
    assert.match(polymer.error.value, /模拟渲染失败/);
    assert.equal(deletion.pdbText.value, previousText);
    assert.equal(polymer.result.value, previousResult);
    assert.equal(deletion.monomerTemplate.value, template);
    assert.equal(deletion.busy.value, false);
    deletion.siteState.siteViewer.value = new ViewerFixture();
    await polymer.apply();
    assert.equal(polymer.error.value, '');
    assert.equal(polymer.result.value.atomCount, 6);
  } finally { stop(); }
});

test('invalid inputs do not replace the model; busy and importing states block generation', async function () {
  const { deletion, polymer, stop } = polymerFixture();
  try {
    await deletion.apply();
    const text = deletion.pdbText.value;
    for (const length of [null, '', 0, NaN]) {
      polymer.bondLength.value = length;
      await polymer.apply();
      assert.match(polymer.error.value, /键长/);
      assert.equal(deletion.pdbText.value, text);
      assert.equal(deletion.busy.value, false);
    }
    polymer.bondLength.value = 1.5;
    deletion.busy.value = true;
    await polymer.apply();
    assert.equal(deletion.busy.value, true);
    deletion.busy.value = false;
    deletion.isImporting.value = true;
    await polymer.apply();
    assert.equal(polymer.result.value, null);
    assert.equal(deletion.pdbText.value, text);
  } finally { stop(); }
});

test('restart and import invalidate template and synchronously clear build state', async function () {
  for (const action of ['restart', 'import']) {
    const { deletion, polymer, stop } = polymerFixture();
    try {
      const original = deletion.pdbText.value;
      await deletion.apply();
      polymer.bondLength.value = 1.5;
      await polymer.apply();
      polymer.error.value = '旧错误';
      if (action === 'restart') await deletion.restart();
      else deletion.acceptText(original);
      assert.equal(deletion.pdbText.value, original);
      assert.equal(deletion.monomerTemplate.value, null);
      assert.equal(deletion.connectionSites.value, null);
      assert.equal(polymer.result.value, null);
      assert.equal(polymer.error.value, '');
      await polymer.apply();
      assert.equal(polymer.result.value, null);
    } finally { stop(); }
  }
});

test('separate controller instances keep their parameters, templates and results isolated', async function () {
  const first = polymerFixture();
  const second = polymerFixture();
  try {
    await first.deletion.apply();
    await second.deletion.apply();
    first.polymer.bondLength.value = 1.4;
    await first.polymer.apply();
    assert.equal(first.polymer.result.value.atomCount, 4);
    assert.equal(second.polymer.bondLength.value, null);
    assert.equal(second.polymer.result.value, null);
    assert.notEqual(first.deletion.monomerTemplate.value, second.deletion.monomerTemplate.value);
  } finally { first.stop(); second.stop(); }
});
