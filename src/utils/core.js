import MathUtils from "./MathUtils";

function core(x1, y1, z1, x2, y2, z2, n, anglea, angleb, anglec) {
  const item = {
    position: { position1: [x1, y1, z1] },
    direction: { direction1: [x2 - x1, y2 - y1, z2 - z1] },
  };

  for (let i = 1; i <= n; i++) {
    const [x, y, z] = item.position[`position${i}`];
    const [dx, dy, dz] = item.direction[`direction${i}`];

    // 使用当前方向平移，得到下一个位置
    item.position[`position${i + 1}`] =
      MathUtils.translate(x, y, z, dx, dy, dz);

    // 将当前方向依次绕 z、x、z 轴旋转
    let [rx, ry, rz] = MathUtils.rotatez(dx, dy, dz, anglea);
    [rx, ry, rz] = MathUtils.rotatex(rx, ry, rz, angleb);
    [rx, ry, rz] = MathUtils.rotatez(rx, ry, rz, anglec);

    // 保存旋转后的方向，供下一轮平移使用
    item.direction[`direction${i + 1}`] = [rx, ry, rz];
  }

  return item;
}

export default core;