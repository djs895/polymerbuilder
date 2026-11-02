import test from 'node:test';
import assert from 'node:assert/strict';
import { ref, shallowRef } from 'vue';
import { importPdbFile } from '../src/utils/importPdbFile.js';

class ImportFixture {
  constructor() {
    this.active = ref('PDB');
    this.isImporting = ref(false);
    this.busy = ref(false);
    this.importError = ref('');
    this.pending = Promise.withResolvers();
    this.file = { text: this.read.bind(this) };
    this.pdbInput = shallowRef({ files: [this.file] });
    this.accepted = null;
  }
  read() { return this.pending.promise; }
  acceptText(text) { this.accepted = text; }
  reset() { this.accepted = null; }
}

test('import delivers raw text and releases busy state', async function () {
  const state = new ImportFixture();
  const pending = importPdbFile(state);
  assert.equal(state.isImporting.value, true);
  state.pending.resolve('HEADER example\r\nEND\r\n');
  await pending;
  assert.equal(state.accepted, 'HEADER example\r\nEND\r\n');
  assert.equal(state.isImporting.value, false);
});

test('stale reads cannot overwrite a newer file and deletion blocks import', async function () {
  const state = new ImportFixture();
  state.busy.value = true;
  await importPdbFile(state);
  assert.equal(state.isImporting.value, false);
  state.busy.value = false;
  const pending = importPdbFile(state);
  state.pdbInput.value = { files: [] };
  state.pending.resolve('old file');
  await pending;
  assert.equal(state.accepted, null);
  assert.equal(state.isImporting.value, false);
});

test('failed read shows an error without accepting text', async function () {
  const state = new ImportFixture();
  const pending = importPdbFile(state);
  state.pending.reject(new Error('read failed'));
  await pending;
  assert.equal(state.accepted, null);
  assert.match(state.importError.value, /read failed/);
  assert.equal(state.isImporting.value, false);
});
