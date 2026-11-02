export function parsePdb(pdbText) {
  const atoms = [];
  let firstModel = false;
  let firstModelEnded = false;
  let insideFirstModel = false;
  //定义pdb读取函数
  const lines = pdbText.split(/\r?\n/);
  //\r回车符 \n换行符 以换行符切割
  //判断MODEL存在
  for (const line of lines) {
    const record = line.substring(0, 6).trim();
    if (record === "MODEL") {
      if (!firstModel) {
        firstModel = true;
        insideFirstModel = true;
      } else {
      //通过insidefirstmodel来判断是否遇到model
        insideFirstModel = false;
      }
      //判断ENDMDL存在
    }
    if (record === "ENDMDL") {
      if (insideFirstModel) {
        insideFirstModel = false;
        firstModelEnded = true;
      }
    }

    //读取原子
    if (record == "ATOM" || record == "HETATM") {
      if (firstModel && (!insideFirstModel || firstModelEnded)) {
        continue;
      }
      const atom = parseAtomLine(line);
      atoms.push(atom);
    }
    //前六列如果是ATOM或者是HETATM记录到原子数组

    if (record === "END") {
      break;
    }
  }
    //return一个{}自动将传出的属性调整为键值对
  return { atoms };
}

function parseAtomLine(line) {
  const recordName = line.substring(0, 6).trim();
  //读取编号
  const serial = line.substring(6, 11).trim();
  //读取原子名字
  const name = line.substring(12, 16).trim();
  //替代位置标识
  const altLoc = line.substring(16, 17).trim();
  //残基名称
  const resName = line.substring(17, 20).trim();
  //链标识
  const chainID = line.substring(21, 22).trim();
  //残基编号
  const resSeq = line.substring(22, 26).trim();
  //读取x坐标
  let x = parseFloat(line.substring(30, 38).trim());
  //读取y坐标
  let y = parseFloat(line.substring(38, 46).trim());
  //读取z坐标
  let z = parseFloat(line.substring(46, 54).trim());
  //读取该原子的元素名称
  const element = line.substring(76, 78).trim();

  return {
    recordName:recordName,
    serial: serial,
    name: name,
    altLoc: altLoc,
    resName: resName,
    chainID: chainID,
    resSeq: resSeq,
    x: x,
    y: y,
    z: z,
    element: element,
  };
}
/** 输入目标字符行、起始下标和文本；只修改传入的字符行。 */
function put(line, start, text) {
  for (let i = 0; i < text.length; i++) {
    line[start + i] = text[i];
  }
}
export function outputPdb(molecule) {
  const lines = [];

  for (const atom of molecule.atoms) {
    // 一个原子对应一行
    const line = Array(80).fill(" ");


    const element = atom.element.toUpperCase();
    const name = atom.name;
    let atomName = name.padEnd(4);

    // 调整原子名称的对齐方式
    if (
      element.length === 1 &&
      name.length < 4 &&
      !"0123456789".includes(name[0])
    ) {
      atomName = " " + name.padEnd(3);
    }

    put(line, 0, atom.recordName);

    // 对应你的 parseAtomLine 中读取的位置
    put(line, 6, String(atom.serial).padStart(5)); // 原子编号
    put(line, 12, atomName); // 原子名称
    put(line, 16, atom.altLoc); // 替代位置标识
    put(line, 17, atom.resName.padStart(3)); // 残基名称
    put(line, 21, atom.chainID); // 链标识
    put(line, 22, String(atom.resSeq).padStart(4)); // 残基编号

    // 坐标：保留三位小数，每个坐标占八列
    put(line, 30, atom.x.toFixed(3).padStart(8));
    put(line, 38, atom.y.toFixed(3).padStart(8));
    put(line, 46, atom.z.toFixed(3).padStart(8));

    // 你的解析器没有保存这两项，暂用默认值
    put(line, 54, "  1.00"); // 占有率
    put(line, 60, "  0.00"); // 温度因子

    put(line, 76, element.padStart(2)); // 元素

    // 当前行转成字符串，加入所有行的数组
    lines.push(line.join(""));
  }

  lines.push("END");

  // 所有行用换行符连接
  return lines.join("\n") + "\n";
}

/** 输入全局边表和两端 index；校验并记录一个无向键，无其他副作用。 */
function addEdge(edges, from, to, order) {
  if (!Number.isInteger(from) || !Number.isInteger(to) || from === to) throw new Error('输出连接引用无效');
  if (![1, 2, 3].includes(order)) throw new Error('PDB 输出仅支持单键、双键和三键');
  const a = Math.min(from, to);
  const b = Math.max(from, to);
  const key = `${a}:${b}`;
  if (edges.has(key) && edges.get(key).order !== order) throw new Error('同一化学键的键级不一致');
  edges.set(key, { a, b, order });
}

/**
 * 输入聚合结构；输出独立全局原子数组，不修改任何单元。
 * maps 在逐单元编号时赋值，随后按本地 index/serial 读取以重建内部键及单元间连接。
 */
export function flattenPolymer(result) {
  if (!Array.isArray(result?.units) || !result.units.length || !Array.isArray(result.connections)) {
    throw new Error('聚合结果无效');
  }
  let count = 0;
  for (const unit of result.units) {
    if (!Array.isArray(unit.atoms)) throw new Error('聚合单元没有原子');
    count += unit.atoms.length;
  }
  if (!count || count > 99999) throw new Error('PDB 原子数量必须在 1 到 99999 之间');
  const atoms = [];
  const maps = [];
  const edges = new Map();
  for (const unit of result.units) {
    const byIndex = new Map();
    const bySerial = new Map();
    for (const atom of unit.atoms) {
      if (!Number.isSafeInteger(atom.index) || !Number.isSafeInteger(atom.serial) ||
          byIndex.has(atom.index) || bySerial.has(atom.serial)) {
        throw new Error('单元原子编号无效或重复');
      }
      const index = atoms.length;
      byIndex.set(atom.index, index);
      bySerial.set(atom.serial, index);
      atoms.push({ ...structuredClone(atom), index, serial: index + 1, bonds: [], bondOrder: [] });
    }
    maps.push({ byIndex, bySerial });
  }
  for (let i = 0; i < result.units.length; i++) {
    const { byIndex } = maps[i];
    for (const atom of result.units[i].atoms) {
      if (!Array.isArray(atom.bonds)) throw new Error('单元缺少连接信息');
      for (let j = 0; j < atom.bonds.length; j++) {
        addEdge(edges, byIndex.get(atom.index), byIndex.get(atom.bonds[j]), atom.bondOrder?.[j] ?? 1);
      }
    }
  }
  for (const connection of result.connections) {
    const from = maps[connection.from?.unit]?.bySerial.get(connection.from?.serial);
    const to = maps[connection.to?.unit]?.bySerial.get(connection.to?.serial);
    addEdge(edges, from, to, connection.order ?? 1);
  }
  for (const { a, b, order } of edges.values()) {
    atoms[a].bonds.push(b);
    atoms[a].bondOrder.push(order);
    atoms[b].bonds.push(a);
    atoms[b].bondOrder.push(order);
  }
  return atoms;
}

/** 输入字符行、字段位置、宽度和文本；只修改目标字段，超长时拒绝输出。 */
function putField(line, start, width, value, right = false) {
  const text = String(value);
  if (text.length > width || /[\r\n]/.test(text)) throw new Error('原子字段超过 PDB 格式范围');
  const padded = right ? text.padStart(width) : text.padEnd(width);
  for (let i = 0; i < width; i++) line[start + i] = padded[i];
}

/** 输入数字及精度；输出有限数值的固定小数文本，无副作用。 */
function decimal(value, precision) {
  if (!Number.isFinite(value)) throw new Error('PDB 输出包含无效数值');
  return value.toFixed(precision);
}

/** 输入已重编号的完整原子；输出 80 列原子记录，不修改原子。 */
function atomLine(atom) {
  const line = Array(80).fill(' ');
  const element = String(atom.elem ?? atom.element ?? '').toUpperCase();
  if (!element) throw new Error('原子缺少元素信息');
  const name = String(atom.atom ?? atom.name ?? element);
  const alignedName = element.length === 1 && name.length < 4 && !/^[0-9]/.test(name) ? ' ' + name : name;
  const record = atom.recordName ?? (atom.hetflag ? 'HETATM' : 'ATOM');
  if (!['ATOM', 'HETATM'].includes(record)) throw new Error('原子记录类型无效');
  const residue = atom.resi ?? atom.resSeq ?? 1;
  if (!Number.isInteger(Number(residue))) throw new Error('残基编号无效');
  putField(line, 0, 6, record);
  putField(line, 6, 5, atom.serial, true);
  putField(line, 12, 4, alignedName);
  putField(line, 16, 1, atom.altLoc ?? '');
  putField(line, 17, 3, atom.resn ?? atom.resName ?? 'MON', true);
  putField(line, 21, 1, atom.chain ?? atom.chainID ?? '');
  putField(line, 22, 4, residue, true);
  putField(line, 26, 1, atom.icode ?? '');
  putField(line, 30, 8, decimal(atom.x, 3), true);
  putField(line, 38, 8, decimal(atom.y, 3), true);
  putField(line, 46, 8, decimal(atom.z, 3), true);
  putField(line, 54, 6, decimal(atom.occupancy ?? 1, 2), true);
  putField(line, 60, 6, decimal(atom.b ?? atom.tempFactor ?? 0, 2), true);
  putField(line, 76, 2, element, true);
  return line.join('');
}

/** 输入聚合结构；输出包含显式键级 CONECT 的 PDB 字符串，无输入副作用。 */
export function serializePolymer(result) {
  const atoms = flattenPolymer(result);
  const lines = [];
  for (const atom of atoms) lines.push(atomLine(atom));
  for (const atom of atoms) {
    const neighbors = [];
    for (let i = 0; i < atom.bonds.length; i++) {
      for (let repeat = 0; repeat < atom.bondOrder[i]; repeat++) neighbors.push(atoms[atom.bonds[i]].serial);
    }
    // 与 3Dmol 一致，每个 CONECT 记录最多写四个邻居，重复编号表示键级。
    for (let start = 0; start < neighbors.length; start += 4) {
      let line = 'CONECT' + String(atom.serial).padStart(5);
      for (const serial of neighbors.slice(start, start + 4)) line += String(serial).padStart(5);
      lines.push(line);
    }
  }
  lines.push('END');
  return lines.join('\n') + '\n';
}
