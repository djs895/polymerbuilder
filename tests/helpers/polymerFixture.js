import { ref, shallowRef, watch } from 'vue';
import { PdbDeletionController } from '../../src/controllers/PdbDeletionController.js';
import { PolymerBuildController } from '../../src/controllers/PolymerBuildController.js';

export class SelectionFixture {
  constructor() {
    this.phase = ref('ready');
    this.bond = ref(null);
    this.atom = ref(null);
    this.sites = ref({
      head: { retainedSerial: 20, bondSerials: [10, 20] },
      tail: { retainedSerial: 30, bondSerials: [30, 40] },
    });
  }
  reset() { this.phase.value = 'head'; this.sites.value = { head: null, tail: null }; }
}

/** 模拟模型重建：按 PDB 当前顺序重建 index，并读取当前 CONECT。 */
export class ViewerFixture {
  setSiteSelection(selection) { this.selection = selection; }
  getAtomSnapshot(text) {
    const atoms = [];
    const bySerial = new Map();
    const lines = text.split('\n');
    let hasConect = false;
    for (const line of lines) {
      if (line.startsWith('CONECT')) hasConect = true;
      if (!line.startsWith('HETATM') && !line.startsWith('ATOM  ')) continue;
      const atom = {
        index: atoms.length, serial: Number(line.slice(6, 11)),
        x: Number(line.slice(30, 38)), y: Number(line.slice(38, 46)), z: Number(line.slice(46, 54)),
        elem: line.slice(76, 78).trim(), atom: line.slice(12, 16).trim(),
        resn: line.slice(17, 20).trim(), resi: Number(line.slice(22, 26)),
        chain: line.slice(21, 22).trim(), hetflag: line.startsWith('HETATM'),
        bonds: [], bondOrder: [],
      };
      atoms.push(atom);
      bySerial.set(atom.serial, atom);
    }
    const connections = hasConect ? lines : ['CONECT   10   20', 'CONECT   20   10   30', 'CONECT   30   20   40', 'CONECT   40   30'];
    for (const line of connections) {
      if (!line.startsWith('CONECT')) continue;
      const source = bySerial.get(Number(line.slice(6, 11)));
      if (!source) continue;
      for (let offset = 11; offset + 5 <= line.length; offset += 5) {
        const target = bySerial.get(Number(line.slice(offset, offset + 5)));
        if (!target) continue;
        const existing = source.bonds.indexOf(target.index);
        if (existing < 0) {
          source.bonds.push(target.index);
          source.bondOrder.push(1);
        } else source.bondOrder[existing] += 1;
      }
    }
    return atoms;
  }
}

export function deletionFixture() {
  const pdbText = ref([
    'HETATM   10  H1  UNL     1      -1.000   0.000   0.000  1.00  0.00           H',
    'HETATM   20  C1  UNL     1       0.000   0.000   0.000  1.00  0.00           C',
    'HETATM   30  C2  UNL     1       1.400   0.000   0.000  1.00  0.00           C',
    'HETATM   40  H2  UNL     1       2.400   0.000   0.000  1.00  0.00           H', 'END',
  ].join('\n'));
  const siteState = {
    selection: new SelectionFixture(), siteViewer: shallowRef(new ViewerFixture()),
    editingSite: ref(false), setting: ref(true),
    leavingGroups: shallowRef({ head: [10], tail: [40] }), siteError: ref(''),
  };
  return new PdbDeletionController({ pdbText, siteState, isImporting: ref(false) });
}

export function polymerFixture() {
  const deletion = deletionFixture();
  const polymer = new PolymerBuildController({
    template: deletion.monomerTemplate, busy: deletion.busy,
    isImporting: deletion.isImporting, replaceText: deletion.replaceText.bind(deletion),
  });
  const stop = watch(deletion.monomerTemplate, polymer.reset.bind(polymer), { flush: 'sync' });
  return { deletion, polymer, stop };
}
