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
export function outputPdb(molecule) {
  const lines = [];

  for (const atom of molecule.atoms) {
    // 一个原子对应一行
    const line = Array(80).fill(" ");

    // 从指定下标开始写入字符串
    function put(start, text) {
      for (let i = 0; i < text.length; i++) {
        line[start + i] = text[i];
      }
    }

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

    put(0, atom.recordName);

    // 对应你的 parseAtomLine 中读取的位置
    put(6, String(atom.serial).padStart(5)); // 原子编号
    put(12, atomName); // 原子名称
    put(16, atom.altLoc); // 替代位置标识
    put(17, atom.resName.padStart(3)); // 残基名称
    put(21, atom.chainID); // 链标识
    put(22, String(atom.resSeq).padStart(4)); // 残基编号

    // 坐标：保留三位小数，每个坐标占八列
    put(30, atom.x.toFixed(3).padStart(8));
    put(38, atom.y.toFixed(3).padStart(8));
    put(46, atom.z.toFixed(3).padStart(8));

    // 你的解析器没有保存这两项，暂用默认值
    put(54, "  1.00"); // 占有率
    put(60, "  0.00"); // 温度因子

    put(76, element.padStart(2)); // 元素

    // 当前行转成字符串，加入所有行的数组
    lines.push(line.join(""));
  }

  lines.push("END");

  // 所有行用换行符连接
  return lines.join("\n") + "\n";
}
