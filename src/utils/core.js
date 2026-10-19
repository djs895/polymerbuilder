import MathUtils from "./MathUtils";

function core(x1, y1, z1, x2, y2, z2, n,angle) {
  const number = n;
    //item为目标函数保存对象进行操作后的结果
  const item = {
    position: { position1: [x1, y1, z1] },
    direction: { direction1: [x2-x1, y2-y1, z2-z1] },
  };
  for (let i = 1; i <= number; i++) {
    //通过解构赋值的方式获取起始位点的坐标和将要平移的向量
    const[x,y,z] =item.position[`position${i}`]
    const[dx, dy, dz] = item.direction[`direction${i}`];
    //将目标的结果存入item结果对象，并作为一个元素保存
    item.direction[`direction${i+1}`] = MathUtils.rotate(dx, dy, dz, angle);
    item.position[`position${i+1}`]=MathUtils.translate(x,y,z,dx,dy,dz);
  }
  return item
}
export default core