/** 输入三维数组及名称；验证有限坐标，无副作用。 */
export function validateVector(vector, label) {
  if (!Array.isArray(vector) || vector.length !== 3) throw new Error(`${label}必须是三维向量`);
  for (const component of vector) {
    if (!Number.isFinite(component)) throw new Error(`${label}包含无效坐标`);
  }
}

/** 输入端点几何；验证位置、方向及原始键长，无副作用。 */
export function validateGeometrySite(site) {
  if (!site) throw new Error('缺少端点几何信息');
  validateVector(site.retainedPosition, '保留原子位置');
  validateVector(site.removedPosition, '删除原子位置');
  validateVector(site.direction, '端点方向');
  if (Math.abs(Math.hypot(...site.direction) - 1) > 1e-6) throw new Error('端点方向必须是非零单位向量');
  if (!Number.isFinite(site.bondLength) || site.bondLength <= 0) throw new Error('原始键长必须为正数');
}

/** 输入构建参数；输出单元数及键长，不修改输入。 */
export function validateBuildOptions(options) {
  const { n, bondLength } = options ?? {};
  if (!Number.isSafeInteger(n) || n < 1) throw new Error('重复单元数量必须是大于等于 1 的整数');
  validatePlacementOptions({ bondLength });
  return { n, bondLength };
}

/** 输入放置参数；输出补全 twist 的参数，不修改输入。 */
export function validatePlacementOptions(options) {
  const { bondLength, twist = 0 } = options ?? {};
  if (!Number.isFinite(bondLength) || bondLength <= 0) throw new Error('连接键长必须是正数');
  if (!Number.isFinite(twist)) throw new Error('扭转角必须是有限数值');
  return { bondLength, twist };
}

/** 输入删除基团后的模板；验证编号、连接和两个保留端点，无副作用。 */
export function validateTemplate(template) {
  if (!Array.isArray(template?.atoms) || !template.atoms.length) throw new Error('单体模板没有原子');
  const bySerial = new Map();
  const byIndex = new Map();
  for (const atom of template.atoms) {
    if (!Number.isSafeInteger(atom.serial) || !Number.isSafeInteger(atom.index) ||
        bySerial.has(atom.serial) || byIndex.has(atom.index)) {
      throw new Error('单体原子编号无效或重复');
    }
    validateVector([atom.x, atom.y, atom.z], '原子坐标');
    bySerial.set(atom.serial, atom);
    byIndex.set(atom.index, atom);
  }
  for (const atom of template.atoms) {
    if (!Array.isArray(atom.bonds)) throw new Error('单体缺少原子连接信息');
    for (const neighbor of atom.bonds) {
      if (!byIndex.has(neighbor) || neighbor === atom.index) throw new Error('单体连接引用无效');
    }
  }
  for (const role of ['head', 'tail']) {
    const site = template.geometry?.[role];
    validateGeometrySite(site);
    const atom = bySerial.get(site.retainedSerial);
    if (!atom || bySerial.has(site.removedSerial)) throw new Error('单体端点与删除后的原子不一致');
    const [x, y, z] = site.retainedPosition;
    if (Math.hypot(atom.x - x, atom.y - y, atom.z - z) > 1e-6) {
      throw new Error('单体端点位置已失效，请重新标定');
    }
  }
}
