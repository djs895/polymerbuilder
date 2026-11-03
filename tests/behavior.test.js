import test from "node:test";
import assert from "node:assert/strict";
import { effectScope, nextTick } from "vue";
import { useSiteSelection } from "../src/composables/useSiteSelection.js";
import { parsePdb, outputPdb } from "../src/utils/pdb.js";
import { findLeavingGroups, removeLeavingGroups } from "../src/utils/moleculeGraph.js";

class SelectionFixture {
  constructor() {
    this.events = [];
    this.scope = effectScope();
    this.selection = this.scope.run(this.create.bind(this));
  }
  create() { return useSiteSelection(this.receive.bind(this)); }
  receive(value) { this.events.push(value); }
}

test("selection preserves detached methods, head/tail constraints and reset", async function () {
  const fixture = new SelectionFixture();
  const { phase, bond, atom, sites, canConfirm, selectBond, selectAtom, confirm, reset } = fixture.selection;
  try {
    assert.equal(confirm(), false);
    selectBond([1, 2]);
    selectAtom(3);
    assert.equal(canConfirm.value, false);
    selectAtom(2);
    assert.equal(canConfirm.value, true);
    selectAtom(2);
    assert.equal(atom.value, null);
    selectAtom(2);
    assert.equal(confirm(), true);
    assert.equal(phase.value, "tail");
    selectBond([2, 1]);
    assert.equal(bond.value, null);
    selectBond([3, 4]);
    selectAtom(3);
    assert.equal(confirm(), true);
    assert.equal(phase.value, "ready");
    assert.deepEqual(sites.value, {
      head: { bondSerials: [1, 2], retainedSerial: 2 },
      tail: { bondSerials: [3, 4], retainedSerial: 3 },
    });
    selectBond([8, 9]);
    assert.equal(bond.value, null);
    await nextTick();
    assert.equal(fixture.events.length, 1);
    reset();
    assert.equal(fixture.events.length, 2);
    assert.equal(phase.value, "head");
    assert.deepEqual(sites.value, { head: null, tail: null });
    await nextTick();
    assert.equal(fixture.events.length, 3);
  } finally { fixture.scope.stop(); }
});

test("instances are isolated and queued notifications stop with their scope", async function () {
  const first = new SelectionFixture();
  const second = new SelectionFixture();
  try {
    first.selection.selectBond([1, 2]);
    first.scope.stop();
    await nextTick();
    assert.equal(first.events.length, 0);
    assert.equal(second.selection.bond.value, null);
    second.selection.selectBond([4, 5]);
    await nextTick();
    assert.equal(second.events.length, 1);
  } finally { first.scope.stop(); second.scope.stop(); }
});

function moleculeFixture() {
  return {
    atoms: [{ serial: 1 }, { serial: "2" }, { serial: 3 }, { serial: 4 }, { serial: 9 }],
    bonds: [{ serials: [1, 2], order: 1 }, { serials: [2, 3], order: 2 }, { serials: [3, 4], order: 1 }],
    sites: {
      head: { bondSerials: [1, 2], retainedSerial: 2 },
      tail: { bondSerials: [3, 4], retainedSerial: 3 },
    },
  };
}

test("DFS/BFS preserve input order, serial types and disconnected fragments", function () {
  const { atoms, bonds, sites } = moleculeFixture();
  const original = structuredClone({ atoms, bonds, sites });
  const expected = { headAtomSerials: [1], tailAtomSerials: [4], deleteAtomSerials: [1, 4] };
  assert.deepEqual(findLeavingGroups(atoms, bonds, sites, "dfs"), expected);
  assert.deepEqual(findLeavingGroups(atoms, bonds, sites, "bfs"), expected);
  const result = removeLeavingGroups(atoms, bonds, sites);
  assert.deepEqual(result.atoms, [{ serial: "2" }, { serial: 3 }, { serial: 9 }]);
  assert.deepEqual(result.bonds, [{ serials: [2, 3], order: 2 }]);
  assert.equal(result.atoms[0], atoms[1]);
  assert.deepEqual({ atoms, bonds, sites }, original);
});

test("leaving groups reject rings, duplicate sites and invalid serials", function () {
  const { atoms, bonds, sites } = moleculeFixture();
  assert.throws(findLeavingGroups.bind(null, atoms, [...bonds, { serials: [1, 3] }], sites), /保留端/);
  assert.throws(findLeavingGroups.bind(null, atoms, bonds, { head: sites.head, tail: sites.head }), /同一条键/);
  assert.throws(findLeavingGroups.bind(null, [...atoms, { serial: "1" }], bonds, sites), /重复/);
  assert.throws(findLeavingGroups.bind(null, atoms, bonds, sites, "invalid"), /dfs 或 bfs/);
});

test("PDB output retains fixed columns, coordinates and first-model parsing", function () {
  const atom = {
    recordName: "HETATM", serial: "12", name: "C1", altLoc: "", resName: "UNL",
    chainID: "A", resSeq: "2", x: -1.234, y: 2.5, z: 0, element: "C",
  };
  const text = outputPdb({ atoms: [atom] });
  const line = text.split("\n")[0];
  assert.equal(line.length, 80);
  assert.equal(line.slice(6, 11), "   12");
  assert.equal(line.slice(12, 16), " C1 ");
  assert.equal(line.slice(30, 54), "  -1.234   2.500   0.000");
  assert.deepEqual(parsePdb(text).atoms, [atom]);
  assert.deepEqual(parsePdb(`MODEL        1\n${line}\nENDMDL\nMODEL        2\n${line}\nENDMDL\nEND\n`).atoms, [atom]);
});
