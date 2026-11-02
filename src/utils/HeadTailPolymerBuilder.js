import { placeScannedMonomer } from './placeScannedMonomer.js';

/** 输入已验证模板和参数；输出头尾相连的单元和连接，无输入副作用。 */
export function buildHeadTailPolymer(template, options) {
  const units = [structuredClone(template)];
  const connections = [];
  for (let i = 1; i < options.n; i++) {
    const anchor = units[i - 1].geometry.tail;
    const unit = placeScannedMonomer(template, units, 'tail', 'head', options);
    units.push(unit);
    connections.push({
      from: { unit: i - 1, serial: anchor.retainedSerial },
      to: { unit: i, serial: unit.geometry.head.retainedSerial },
      order: 1,
    });
  }
  return { units, connections };
}
