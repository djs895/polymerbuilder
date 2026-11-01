import test from "node:test";
import assert from "node:assert/strict";
import { findLeavingGroups } from "../src/utils/LeavingGroupFinder.js";

// 独立构造 10—20—30—40，index 刻意与 serial、数组位置不同。
function chain() {
  return [
    { index: 9, serial: 30, bonds: [2, 4] },
    { index: 7, serial: 10, bonds: [2] },
    { index: 4, serial: 40, bonds: [9] },
    { index: 2, serial: 20, bonds: [7, 9] },
  ];
}

function sites() {
  return {
    head: { bondSerials: [10, 20], retainedSerial: 20 },
    tail: { bondSerials: [30, 40], retainedSerial: 30 },
  };
}

test("collects entire branches without unrelated fragments or input mutation", function () {
  const atoms = chain();
  // 单向记录 11—10，也应作为无向键搜索。
  atoms.push({ index: 25, serial: 11, bonds: [7] });
  atoms.push({ index: 88, serial: 90, bonds: [] });
  const selection = sites();
  selection.head.bondSerials.reverse();
  const before = structuredClone({ atoms, selection });
  const result = findLeavingGroups(atoms, selection);
  assert.deepEqual(new Set(result.head), new Set([10, 11]));
  assert.deepEqual(result.tail, [40]);
  assert.deepEqual({ atoms, selection }, before);
});

test("rejects a selected ring bond instead of returning a partial group", function () {
  const atoms = chain();
  atoms[1].bonds.push(9); // 10—20—30—10 构成环。
  assert.throws(findLeavingGroups.bind(null, atoms, sites()), /无法分离/);
});

test("rejects removal of the opposite retained atom", function () {
  const selection = sites();
  selection.head.retainedSerial = 10;
  assert.throws(findLeavingGroups.bind(null, chain(), selection), /另一端/);
});

test("rejects overlapping groups", function () {
  const selection = sites();
  selection.tail = structuredClone(selection.head);
  assert.throws(findLeavingGroups.bind(null, chain(), selection), /重叠/);
});

test("rejects missing sites, invalid endpoints and nonexistent bonds", function () {
  const cases = [
    null,
    { head: sites().head },
    { ...sites(), head: { bondSerials: [10, 20], retainedSerial: 99 } },
    { ...sites(), head: { bondSerials: [10, 30], retainedSerial: 30 } },
    { ...sites(), head: { bondSerials: [10, 10], retainedSerial: 10 } },
  ];
  for (const selection of cases) {
    assert.throws(findLeavingGroups.bind(null, chain(), selection), Error);
  }
});

test("rejects ambiguous numbering and incomplete model data", function () {
  const invalidAtoms = [
    { index: 7, serial: 99, bonds: [] },
    { index: 99, serial: 10, bonds: [] },
    { serial: 99, bonds: [] },
    { index: 99, bonds: [] },
    { index: 99, serial: 99, bonds: [999] },
  ];
  for (const atom of invalidAtoms) {
    assert.throws(findLeavingGroups.bind(null, [...chain(), atom], sites()), Error);
  }
});

test("supports zero serials and independent consecutive calls", function () {
  const atoms = chain();
  atoms[1].serial = 0;
  const selection = sites();
  selection.head.bondSerials = [20, 0];
  assert.deepEqual(findLeavingGroups(atoms, selection), { head: [0], tail: [40] });
  assert.deepEqual(findLeavingGroups(chain(), sites()), { head: [10], tail: [40] });
});

test("iterative traversal handles a long leaving group", function () {
  const atoms = chain();
  let previousIndex = 7;
  for (let serial = 100; serial < 15100; serial++) {
    atoms.push({ index: serial, serial, bonds: [previousIndex] });
    previousIndex = serial;
  }
  const result = findLeavingGroups(atoms, sites());
  assert.equal(result.head.length, 15001);
  assert.ok(result.head.includes(15099));
  assert.deepEqual(result.tail, [40]);
});
