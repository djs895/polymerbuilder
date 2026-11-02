import test from 'node:test';
import assert from 'node:assert/strict';
import { minimumCrossDistance } from '../src/utils/minimumCrossDistance.js';
import { scanFullTurn } from '../src/utils/scanFullTurn.js';
import { placeScannedMonomer } from '../src/utils/placeScannedMonomer.js';
import { placeMonomer } from '../src/utils/MonomerPlacement.js';
import { buildPolymer } from '../src/utils/buildPolymer.js';

function fixture() {
  return {
    atoms: [
      { index: 2, serial: 10, elem: 'C', x: 0, y: 0, z: 0, bonds: [5], bondOrder: [1] },
      { index: 5, serial: 20, elem: 'C', x: 1, y: 1, z: 0, bonds: [2, 9], bondOrder: [1, 1] },
      { index: 9, serial: 30, elem: 'C', x: 0, y: 2, z: 0, bonds: [5], bondOrder: [1] },
    ],
    geometry: {
      head: { retainedSerial: 10, removedSerial: 1, retainedPosition: [0, 0, 0], removedPosition: [-1, 0, 0], direction: [-1, 0, 0], bondLength: 1 },
      tail: { retainedSerial: 30, removedSerial: 40, retainedPosition: [0, 2, 0], removedPosition: [1, 2, 0], direction: [1, 0, 0], bondLength: 1 },
    },
  };
}

// scanFullTurn 显式提供 angle 和 context；记录采样位置以验证步长与边界。
function score(angle, context) { context.visited.push(angle); return -Math.abs(angle - context.target); }
function equalScore() { return 1; }

test('fixed scan visits one full turn and returns best angle, keeping first on ties', function () {
  const context = { visited: [], target: 37 };
  assert.equal(scanFullTurn(score, context), 37);
  assert.equal(context.visited.length, 360);
  for (let i = 0; i < 360; i++) assert.equal(context.visited[i], i - 180);
  assert.equal(scanFullTurn(equalScore, null), -180);
  assert.throws(scanFullTurn.bind(null, score, context, 0));
});

test('minimum distance uses every cross pair, rather than a sum or a fixed pair', function () {
  const fixed = [{ x: 0, y: 0, z: 0 }, { x: 10, y: 0, z: 0 }];
  assert.equal(minimumCrossDistance(fixed, [{ x: 2, y: 0, z: 0 }, { x: 9, y: 0, z: 0 }]), 1);
  assert.equal(minimumCrossDistance(fixed, [{ x: 3, y: 0, z: 0 }, { x: 6, y: 0, z: 0 }]), 3);
});

test('scanned placement matches independent exhaustive maximin excluding only joining atoms', function () {
  const template = fixture();
  const units = [structuredClone(template), structuredClone(template)];
  // 相同 serial 在不同单元出现；只能排除真正的成键原子。
  units[0].atoms[2].x = -2;
  const before = structuredClone({ template, units });
  const anchor = units[1].geometry.tail;
  const options = { bondLength: 1.5 };
  let bestDistance = -Infinity;
  let expected;
  for (let angle = -180; angle < 180; angle++) {
    const candidate = placeMonomer(template, anchor, 'head', { ...options, twist: angle });
    let minimum = Infinity;
    for (let u = 0; u < units.length; u++) {
      for (const a of units[u].atoms) {
        if (u === 1 && a.serial === 30) continue;
        for (const b of candidate.atoms) {
          if (b.serial === 10) continue;
          minimum = Math.min(minimum, Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z));
        }
      }
    }
    if (minimum > bestDistance) { bestDistance = minimum; expected = candidate; }
  }
  assert.deepEqual(placeScannedMonomer(template, units, 'tail', 'head', options), expected);
  assert.deepEqual({ template, units }, before);
});

test('both builders use scanned placement before next join and preserve earlier units', function () {
  for (const type of ['head-tail', 'head-head']) {
    const template = fixture();
    const options = { n: 3, bondLength: 1.5 };
    const result = buildPolymer(type, template, options);
    const shorter = buildPolymer(type, template, { ...options, n: 2 });
    assert.deepEqual(result.units.slice(0, 2), shorter.units);
    const role = type === 'head-tail' ? 'tail' : 'head';
    assert.deepEqual(result.units[1], placeScannedMonomer(template, [template], role, 'head', options));
    assert.deepEqual(Object.keys(result).sort(), ['connections', 'units']);
  }
});
