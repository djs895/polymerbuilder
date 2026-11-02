import { validateVector } from './PolymerValidation.js';

/** 输入完整模型原子表和一个标定位点；输出独立的几何快照，无副作用。 */
function captureSite(bySerial, site) {
  const bond = site?.bondSerials;
  if (!Array.isArray(bond) || bond.length !== 2 || bond[0] === bond[1] ||
      !bond.includes(site.retainedSerial)) {
    throw new Error('端点标定无效');
  }
  const removedSerial = bond[0] === site.retainedSerial ? bond[1] : bond[0];
  const retained = bySerial.get(site.retainedSerial);
  const removed = bySerial.get(removedSerial);
  if (!retained || !removed) throw new Error('标定原子不存在');
  if (!retained.bonds?.includes(removed.index) && !removed.bonds?.includes(retained.index)) {
    throw new Error('标定原子之间没有化学键');
  }
  const retainedPosition = [retained.x, retained.y, retained.z];
  const removedPosition = [removed.x, removed.y, removed.z];
  validateVector(retainedPosition, '保留原子位置');
  validateVector(removedPosition, '删除原子位置');
  const direction = [removed.x - retained.x, removed.y - retained.y, removed.z - retained.z];
  const bondLength = Math.hypot(...direction);
  if (!Number.isFinite(bondLength) || bondLength <= 0) throw new Error('标定键长为零或无效');
  for (let axis = 0; axis < 3; axis++) direction[axis] /= bondLength;
  return {
    retainedSerial: retained.serial, removedSerial,
    retainedPosition, removedPosition, direction, bondLength,
  };
}

/** 输入删除前的完整原子快照和头尾标定；输出几何快照，不修改模型。 */
export function captureMonomerGeometry(atoms, sites) {
  if (!Array.isArray(atoms)) throw new Error('缺少单体原子');
  const bySerial = new Map();
  for (const atom of atoms) {
    if (bySerial.has(atom.serial)) throw new Error('原子编号重复');
    bySerial.set(atom.serial, atom);
  }
  return {
    head: captureSite(bySerial, sites?.head),
    tail: captureSite(bySerial, sites?.tail),
  };
}
