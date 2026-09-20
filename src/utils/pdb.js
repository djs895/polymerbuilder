function parsePdb(pdbText) {
  const atoms = [];
  const bonds = [];
  const atomMap = new Map();

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
        insideFirstModel = false;
      }
      //判断ENDMDL存在
    }
    if (record === "ENDMDL") {
      if (insideFirsrModel) {
        insideFirsrModel = false;
        firstModelEnded = true;
      }
    }

    //读取原子
    if (record === "ATOM" || record === "HETATM") {
      if (firstModel && (!insideFirstModel || firstModelEnded)) {
        countinue;
      }
      const atom = parseAtomLine(line);
      atoms.push(atom);
      atomMap.set(atom.serial, atom);
    } //前六列如果是ATOM或者是HETATM记录到原子数组

    if (record === "END") {
      break;
    }
  }
  return { atoms, bonds };
}

function parseAtomLine(line) {
  const serial = line.substring(6, 11).trim();
  const name = line.substring(12, 16).trim();
  const x = parseFloat(line.substring(30, 38).trim());
  const y = parseFloat(line.substring(38, 46).trim());
  const z = parseFloat(line.substring(46, 54).trim());
  let element = line.substring(76, 78).trim();
  return {
    "serial":serial,
    "name":name,
    "x":x,
    "y":y,
    "z":z,
    "element":element,
  }
}

export default parsePdb;