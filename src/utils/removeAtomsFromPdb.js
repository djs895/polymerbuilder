/** 读取标准 PDB 的原子编号；输入字段，输出整数，无副作用。 */
function readSerial(field) {
  if (!/^\s*\d+\s*$/.test(field)) throw new Error('PDB 原子编号无效');
  return Number(field);
}

/**
 * 输入：完整模型快照和剩余 serial 集合；输出：CONECT 行，无副作用。
 * 使用 index 查找邻居、serial 输出；保留键级并补齐单向连接。
 */
function connectionLines(atoms, retained) {
  const byIndex = new Map();
  const bySerial = new Map();
  const edges = new Map();
  for (const atom of atoms) {
    if (byIndex.has(atom.index) || bySerial.has(atom.serial)) {
      throw new Error('模型原子编号重复');
    }
    byIndex.set(atom.index, atom);
    bySerial.set(atom.serial, atom);
  }
  for (const atom of atoms) {
    for (let i = 0; i < atom.bonds.length; i++) {
      const other = byIndex.get(atom.bonds[i]);
      if (!other) throw new Error('模型连接引用了不存在的原子');
      if (!retained.has(atom.serial) || !retained.has(other.serial)) continue;
      const order = atom.bondOrder?.[i] ?? 1;
      if (![1, 2, 3].includes(order)) throw new Error('当前 PDB 输出不支持该键级');
      const a = Math.min(atom.serial, other.serial);
      const b = Math.max(atom.serial, other.serial);
      if (a === b) throw new Error('模型包含原子自连接');
      const key = `${a}:${b}`;
      if (edges.has(key) && edges.get(key).order !== order) {
        throw new Error('模型两端的键级不一致');
      }
      edges.set(key, { a, b, order });
    }
  }
  const neighbors = new Map();
  for (const serial of retained) neighbors.set(serial, []);
  for (const { a, b, order } of edges.values()) {
    for (let i = 0; i < order; i++) {
      neighbors.get(a).push(b);
      neighbors.get(b).push(a);
    }
  }
  const lines = [];
  for (const [serial, bonded] of neighbors) {
    // 3Dmol 每行读取四个连接字段，多余连接分行输出。
    for (let i = 0; i < bonded.length; i += 4) {
      let line = 'CONECT' + String(serial).padStart(5);
      for (const neighbor of bonded.slice(i, i + 4)) line += String(neighbor).padStart(5);
      lines.push(line);
    }
  }
  return lines;
}

/**
 * 输入：单模型 PDB、待删 serial 集合、对应模型的完整原子快照。
 * 输出：保留坐标/编号并包含完整 CONECT 的新文本；不修改任何输入。
 * 模型快照由调用方提供，使缺少 CONECT 的源文件也能保留当前成键关系。
 */
export function removeAtomsFromPdb(pdbText, removedSerials, atoms) {
  const removed = new Set(removedSerials);
  const serials = new Set();
  const retained = new Set();
  const output = [];
  const attached = [];
  let models = 0;
  let ended = false;
  for (const line of pdbText.split(/\r?\n|\r/)) {
    const record = line.slice(0, 6).trim();
    if (!record) continue;
    if (ended) throw new Error('END 后存在额外记录');
    if (record === 'MODEL' && ++models > 1) throw new Error('暂只支持单模型 PDB');
    if (record === 'ATOM' || record === 'HETATM') {
      const serial = readSerial(line.slice(6, 11));
      if (serials.has(serial)) throw new Error('PDB 原子编号重复');
      if (line.slice(16, 17).trim()) throw new Error('暂不支持替代构象');
      for (const start of [30, 38, 46]) {
        const field = line.slice(start, start + 8).trim();
        if (!field || !Number.isFinite(Number(field))) throw new Error('原子坐标无效');
      }
      serials.add(serial);
      if (!removed.has(serial)) {
        retained.add(serial);
        output.push(line);
      }
    } else if (['ANISOU', 'SIGATM', 'SIGUIJ'].includes(record)) {
      attached.push(line);
    } else if (record === 'END') {
      ended = true;
    } else if (['MODEL', 'ENDMDL', 'CONECT', 'MASTER', 'TER'].includes(record)) {
      // 重新生成连接和结束标记，移除失效的计数与终止记录。
    } else if (/^(HEADER|TITLE|COMPND|SOURCE|KEYWDS|EXPDTA|AUTHOR|REVDAT|JRNL|REMARK|CRYST1|ORIGX[123]|SCALE[123])$/.test(record)) {
      output.push(line);
    } else {
      throw new Error(`暂不支持 PDB 记录 ${record}，未执行删除`);
    }
  }
  if (!retained.size) throw new Error('删除后没有剩余原子');
  for (const serial of removed) {
    if (!serials.has(serial)) throw new Error('待删除编号不属于当前 PDB');
  }
  const modelSerials = new Set();
  for (const atom of atoms) modelSerials.add(atom.serial);
  if (modelSerials.size !== serials.size) throw new Error('模型与 PDB 不一致，请重新标定');
  for (const serial of serials) {
    if (!modelSerials.has(serial)) throw new Error('模型与 PDB 不一致，请重新标定');
  }
  for (const line of attached) {
    if (retained.has(readSerial(line.slice(6, 11)))) output.push(line);
  }
  output.push(...connectionLines(atoms, retained), 'END');
  return output.join('\n') + '\n';
}
