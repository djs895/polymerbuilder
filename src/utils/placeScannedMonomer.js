import { placeMonomer } from './MonomerPlacement.js';
import { minimumCrossDistance } from './minimumCrossDistance.js';
import { scanFullTurn } from './scanFullTurn.js';

/** 输入扫描角与上下文；从同一模板生成候选，原子与位点共用现有刚体变换。 */
function placeCandidate(angle, context) {
  return placeMonomer(context.template, context.anchor, context.joiningRole, {
    bondLength: context.options.bondLength, twist: angle,
  });
}

/** scanFullTurn 提供扫描角和上下文；只返回当前候选的跨侧最小距离。 */
function scoreCandidate(angle, context) {
  const unit = placeCandidate(angle, context);
  const monomerAtoms = [];
  const joiningSerial = unit.geometry[context.joiningRole].retainedSerial;
  for (const atom of unit.atoms) {
    if (atom.serial !== joiningSerial) monomerAtoms.push(atom);
  }
  return minimumCrossDistance(context.chainAtoms, monomerAtoms);
}

/**
 * 输入模板、已有链单元、两侧连接角色及放置参数；返回扫描后的新单体，不修改输入。
 * 只排除本次两个成键原子；不同单元内相同 serial 的其他原子仍参加比较。
 */
export function placeScannedMonomer(template, units, anchorRole, joiningRole, options) {
  const anchorUnit = units.length - 1;
  const anchor = units[anchorUnit].geometry[anchorRole];
  const chainAtoms = [];
  for (let i = 0; i < units.length; i++) {
    for (const atom of units[i].atoms) {
      if (i !== anchorUnit || atom.serial !== anchor.retainedSerial) chainAtoms.push(atom);
    }
  }
  // 此处创建上下文，扫描评分与候选放置均通过参数读取，不捕获外层变量。
  const context = { template, anchor, joiningRole, options, chainAtoms };
  const angle = scanFullTurn(scoreCandidate, context);
  return placeCandidate(angle, context);
}
