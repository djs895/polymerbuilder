/**
 * 输入评分函数、显式上下文和固定步长（度）；返回评分最大的角度。
 * evaluate 的 angle/context 均由本函数传入；仅扫描 [-180, 180)，相同评分保留先到者。
 */
export function scanFullTurn(evaluate, context, step = 1) {
  if (!Number.isFinite(step) || step <= 0 || step > 360) throw new Error('扫描步长必须在 (0, 360] 度内');
  let bestAngle = -180;
  let bestScore = -Infinity;
  const count = Math.ceil(360 / step);
  for (let i = 0; i < count; i++) {
    const angle = -180 + i * step;
    const value = evaluate(angle, context);
    if (value > bestScore) {
      bestScore = value;
      bestAngle = angle;
    }
  }
  return bestAngle;
}
