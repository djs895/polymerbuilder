import MathUtils from './MathUtils.js';
import { validateGeometrySite, validatePlacementOptions, validateTemplate } from './PolymerValidation.js';

/** 输入单位向量；输出以度为单位的方位角、极角，无副作用。 */
function sphericalAngles(direction) {
  const azimuth = Math.atan2(direction[1], direction[0]) * 180 / Math.PI;
  const polar = Math.atan2(Math.hypot(direction[0], direction[1]), direction[2]) * 180 / Math.PI;
  return [azimuth, polar];
}

/** 输入向量和显式旋转参数；输出旋转后的数组，无副作用。 */
function rotateVector(vector, rotation) {
  let point = MathUtils.rotatez(...vector, -rotation.source[0]);
  point = MathUtils.rotatey(...point, -rotation.source[1]);
  point = MathUtils.rotatez(...point, rotation.twist);
  point = MathUtils.rotatey(...point, rotation.target[1]);
  return MathUtils.rotatez(...point, rotation.target[0]);
}

/** 输入点及变换；绕 removedPosition 旋转后平移，输出新点，无副作用。 */
function transformPoint(point, transform) {
  const [px, py, pz] = transform.pivot;
  const relative = MathUtils.translate(...point, -px, -py, -pz);
  const rotated = rotateVector(relative, transform.rotation);
  return MathUtils.translate(...rotated, ...transform.translation);
}

/**
 * 输入模板、上一单元端点、新单元连接角色及键长/角度；输出独立新单元。
 * transform 的 pivot/rotation/translation 在此赋值，由两个纯变换函数读取。
 * 原子和两个端点共用同一刚体变换，不修改模板或 anchor。
 */
export function placeMonomer(template, anchor, joiningRole, options) {
  validateTemplate(template);
  validateGeometrySite(anchor);
  if (!['head', 'tail'].includes(joiningRole)) throw new Error('连接端点类型无效');
  const { bondLength, twist } = validatePlacementOptions(options);
  const joining = template.geometry[joiningRole];
  // 两个端点都使用“保留 -> 删除”方向，相接时应彼此相向。
  const targetDirection = [-anchor.direction[0], -anchor.direction[1], -anchor.direction[2]];
  const transform = {
    pivot: joining.removedPosition,
    rotation: {
      source: sphericalAngles(joining.direction),
      target: sphericalAngles(targetDirection),
      twist,
    },
    translation: [0, 0, 0],
  };
  const rotatedRetained = transformPoint(joining.retainedPosition, transform);
  for (let axis = 0; axis < 3; axis++) {
    const target = anchor.retainedPosition[axis] + bondLength * anchor.direction[axis];
    transform.translation[axis] = target - rotatedRetained[axis];
  }
  const unit = structuredClone(template);
  for (const atom of unit.atoms) {
    [atom.x, atom.y, atom.z] = transformPoint([atom.x, atom.y, atom.z], transform);
  }
  for (const role of ['head', 'tail']) {
    const site = unit.geometry[role];
    site.retainedPosition = transformPoint(site.retainedPosition, transform);
    site.removedPosition = transformPoint(site.removedPosition, transform);
    site.direction = rotateVector(site.direction, transform.rotation);
  }
  return unit;
}
