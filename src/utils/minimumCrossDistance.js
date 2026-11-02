/** 输入已排除成键原子的两侧原子数组；返回所有跨侧原子对的最小距离，无副作用。 */
export function minimumCrossDistance(chainAtoms, monomerAtoms) {
  let minimum = Infinity;
  for (const a of chainAtoms) {
    for (const b of monomerAtoms) {
      minimum = Math.min(minimum, Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z));
    }
  }
  return minimum;
}
