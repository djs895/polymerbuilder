import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import { removeAtomsFromPdb } from '../src/utils/removeAtomsFromPdb.js';

export function moleculeFixture() {
  const lines = [
    'HETATM   10  H1  UNL     1      -1.000   0.000   0.000  1.00  0.00           H',
    'HETATM   20  C1  UNL     1       0.000   0.000   0.000  1.00  0.00           C',
    'HETATM   30  C2  UNL     1       1.400   0.000   0.000  1.00  0.00           C',
    'HETATM   40  H2  UNL     1       2.400   0.000   0.000  1.00  0.00           H',
  ];
  const atoms = [
    { index: 7, serial: 10, bonds: [8], bondOrder: [1] },
    { index: 8, serial: 20, bonds: [7, 9], bondOrder: [1, 2] },
    { index: 9, serial: 30, bonds: [8, 10], bondOrder: [2, 1] },
    { index: 10, serial: 40, bonds: [9], bondOrder: [1] },
  ];
  return { lines, atoms, text: [...lines, 'END'].join('\n') + '\n' };
}

test('real 3Dmol parser preserves coordinates and double bonds after deletion', function () {
  // 补齐库加载所需全局，使用真实解析器，不启动 WebGL。
  const require = createRequire(import.meta.url);
  const sandbox = {
    navigator: { userAgent: 'node' }, document: {},
    module: { exports: {} }, exports: {}, console, TextEncoder, TextDecoder,
  };
  sandbox.window = sandbox;
  runInNewContext(readFileSync(require.resolve('3dmol'), 'utf8'), sandbox);
  const { text, atoms } = moleculeFixture();
  const result = removeAtomsFromPdb(text, [10, 40], atoms);
  const parsed = sandbox.module.exports.Parsers.PDB(result, { keepH: true, assignBonds: false })[0];
  assert.equal(parsed.length, 2);
  assert.equal(parsed[0].serial, 20);
  assert.equal(parsed[1].serial, 30);
  assert.equal(parsed[1].x, 1.4);
  assert.deepEqual(Array.from(parsed[0].bonds), [1]);
  assert.deepEqual(Array.from(parsed[0].bondOrder), [2]);
  assert.deepEqual(Array.from(parsed[1].bondOrder), [2]);
});

test('deletion preserves atom lines and reconstructs bonds absent from source', function () {
  const { lines, atoms, text } = moleculeFixture();
  const before = structuredClone(atoms);
  const result = removeAtomsFromPdb(text, new Set([10, 40]), atoms);
  assert.equal(result, [lines[1], lines[2], 'CONECT   20   30   30', 'CONECT   30   20   20', 'END', ''].join('\n'));
  assert.deepEqual(atoms, before);
});

test('cleans attached records and obsolete connections/counts', function () {
  const { lines, atoms } = moleculeFixture();
  const text = [...lines, 'ANISOU   10 old', 'ANISOU   20 kept', 'CONECT   20   10   30', 'MASTER old', 'TER', 'END'].join('\r\n');
  const result = removeAtomsFromPdb(text, [10, 40], atoms);
  assert.ok(result.includes('ANISOU   20 kept'));
  assert.ok(!result.includes('old'));
  assert.ok(!result.includes('TER'));
});

test('rejects unsupported models, references, stale serials and empty result', function () {
  const { text, atoms } = moleculeFixture();
  for (const prefix of ['MODEL        1\nMODEL        2\n', 'LINK  unsupported\n']) {
    assert.throws(removeAtomsFromPdb.bind(null, prefix + text, [10], atoms));
  }
  assert.throws(removeAtomsFromPdb.bind(null, text, [999], atoms));
  assert.throws(removeAtomsFromPdb.bind(null, text, [10, 20, 30, 40], atoms));
  assert.throws(removeAtomsFromPdb.bind(null, text, [10], atoms.slice(1)));
});
