class MathUtils {
  static rotate(x, y, z, angleX,angleY,angleZ) {
    [x,y,z]=MathUtils.rotateX(x,y,z,angleX),
    [x,y,z]=MathUtils.rotateY(x,y,z,angleY)
    [x,y,z]=MathUtils.rotateZ(x,y,z,angleZ)
    return[x,y,z]
 
  }
     // 绕 x 轴旋转：x 不变
     static rotatex(x, y, z, angle) {
      const rad = (angle * Math.PI) / 180;
      const cos = Math.cos(rad);
      const sin = Math.sin(rad);

      return [x, y * cos - z * sin, y * sin + z * cos];
    }

    // 绕 y 轴旋转：y 不变
    static rotatey(x, y, z, angle) {
      const rad = (angle * Math.PI) / 180;
      const cos = Math.cos(rad);
      const sin = Math.sin(rad);

      return [x * cos + z * sin, y, -x * sin + z * cos];
    }

    // 绕 z 轴旋转：z 不变
    static rotatez(x, y, z, angle) {
      const rad = (angle * Math.PI) / 180;
      const cos = Math.cos(rad);
      const sin = Math.sin(rad);

      return [x * cos - y * sin, x * sin + y * cos, z];
    
    }
  static translate(x, y, z, dx, dy, dz) {
    return [x + dx, y + dy, z + dz];
  }
}

export default MathUtils;
