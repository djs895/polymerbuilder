import { placeScannedMonomer } from './placeScannedMonomer.js';

/** 输入已验证模板和参数；输出交替头头、尾尾连接的单元，无输入副作用。 */
export function buildHeadHeadPolymer(template, options) {
  const units = [structuredClone(template)];
  const connections = [];
  for (let i = 1; i < options.n; i++) {
    // 新单元的连接端已占用，下一次从它的另一端继续延伸。
    const role = i % 2 === 1 ? 'head' : 'tail';
    const anchor = units[i - 1].geometry[role];
    const unit = placeScannedMonomer(template, units, role, role, options);
    units.push(unit);
    connections.push({
      from: { unit: i - 1, serial: anchor.retainedSerial },
      to: { unit: i, serial: unit.geometry[role].retainedSerial },
      order: 1,
    });
  }
  return { units, connections };
}
