<template>
  <div class="w-full h-full border border-gray-300 rounded-lg bg-white">
    <!-- viewer-box -->
    <div ref="viewerRef" class="w-full h-full"></div>
  </div>
</template>

<script setup>
import * as $3Dmol from "3dmol/build/3Dmol.js";
import { ref, onMounted, onBeforeUnmount } from "vue";
import { origin } from "../utils/oringin";
const viewerRef = ref(null);
const props = defineProps({ siteMode: Boolean });
const emit = defineEmits(["bond-click", "atom-click"]);

// 圆柱对象只保存在显示层，位点记录仅使用原子的 serial。
const bondEntries = [];
let selection = { bondSerials: null, retainedSerial: null };
let refreshSite = () => {};
let frame = null;

// home.vue 通过模板 ref 调用此方法；不让显示层另建一套选中状态。
defineExpose({
  setSiteSelection(value) {
    selection = value;
    // 两个 watch 可能同时通知；同一帧只按最新状态绘制一次。
    if (frame !== null) return;
    frame = requestAnimationFrame(() => {
      frame = null;
      refreshSite();
    });
  },
});

onBeforeUnmount(() => {
  if (frame !== null) cancelAnimationFrame(frame);
});

// 使用 3Dmol 模型的成键信息，为每对成键原子添加一个交互圆柱体。
function addBondCylinders(viewer, model) {
  // {} 表示获取当前模型的全部原子；bonds 存储的是模型内索引。
  const atoms = model.selectedAtoms({});
  const byIndex = new Map(atoms.map(atom => [atom.index, atom]));
  const seen = new Set();
  const shapes = [];

  for (const atom of atoms) {
    for (const index of atom.bonds ?? []) {
      const other = byIndex.get(index);
      if (!other || atom.index === index) continue;

      // A—B 与 B—A 使用相同标识，避免同一条键被重复绘制。
      const key = [
        Math.min(atom.index, index),
        Math.max(atom.index, index),
      ].join(":");
      if (seen.has(key)) continue;
      seen.add(key);

      const pair = [atom.serial, other.serial];
      const shape = viewer.addCylinder({
        // 起终点分别为两个原子的中心；原子移动后需要重建圆柱体。
        start: { x: atom.x, y: atom.y, z: atom.z },
        end: { x: other.x, y: other.y, z: other.z },
        radius: 0.27, // 略大于现有 stick 半径 0.25，方便拾取。
        fromCap: 0,
        toCap: 0,
        color: "orange",
        opacity: 0, // 默认透明，保留原有 stick 的配色。
        clickable: true,
        hoverable: true,

        hover_callback(shape) {
          // 选中键后，由位点状态统一管理高亮，避免悬停覆盖选择结果。
          if (selection.bondSerials) return;
          shape.updateStyle({ opacity: 0.45 });
          viewer.render();
        },

        unhover_callback(shape) {
          if (selection.bondSerials) return;
          shape.updateStyle({ opacity: 0 });
          viewer.render();
        },

        // 只上报键的端点编号；选中、取消和头尾阶段由父组件管理。
        callback() {
          if (props.siteMode) emit("bond-click", pair);
        },
      });

      shapes.push(shape);
      bondEntries.push({ shape, pair });
    }
  }

  // 返回形状对象，便于后续通过 viewer.removeShape(shape) 单独清理。
  return shapes;
}

onMounted(() => {
  const pdbText = `
HETATM    1  C1  UNL     1       0.000   0.000   0.000  1.00  0.00           C
HETATM    2  O1  UNL     1       1.430   0.000   0.000  1.00  0.00           O
HETATM    3  H1  UNL     1      -0.540   0.935   0.000  1.00  0.00           H
HETATM    4  H2  UNL     1      -0.540  -0.935   0.000  1.00  0.00           H

END
`;

  let item = null;
  let viewer = $3Dmol.createViewer(viewerRef.value, {
    backgroundColor: "white",
  });
  // 缩短悬停等待时间，使键的高亮响应更及时（单位：毫秒）。
  viewer.setHoverDuration(50);
  const model = viewer.addModel(pdbText, "pdb", { keepH: true });
  viewer.setStyle(
    {},
    {
      stick: {
        radius: 0.25,
        colorscheme: "Jmol",
      },
      sphere: {
        scale: 0.4,
        colorscheme: "Jmol",
      },
    },
  );

  let defaultStyle = {
    stick: { radius: 0.25, colorscheme: "Jmol" },
    sphere: { scale: 0.4, colorscheme: "Jmol" },
  };

  refreshSite = () => {
    const { bondSerials, retainedSerial } = selection;
    item = null;
    viewer.setStyle({}, defaultStyle);

    // 清除旧圆柱高亮，最多保留一条当前正在编辑的键。
    for (const { shape, pair } of bondEntries) {
      const selected = bondSerials && pair.every(id => bondSerials.includes(id));
      shape.updateStyle({
        color: selected ? "red" : "orange",
        opacity: selected ? 1 : 0,
      });
    }

    // 两端原子保持原始大小并显示橙色，指定的保留端改为绿色。
    // 不扩大球体及其点击区域，减少对键圆柱拾取的遮挡。
    // 只追加 sphere 样式，不把端点连接的其他键一起染色。
    for (const serial of bondSerials ?? []) {
      viewer.addStyle(
        { model, serial },
        { sphere: { scale: 0.4, color: serial === retainedSerial ? "green" : "orange" } },
      );
    }

    viewer.render();
  };

  viewer.setClickable({}, true, function (atom) {
    // 手动标定只接受当前键的端点；原子点击不会取消已选中的键。
    if (props.siteMode) {
      if (!selection.bondSerials?.includes(atom.serial)) return;
      origin.position = [atom.x, atom.y, atom.z];
      emit("atom-click", atom.serial);
      return;
    }

    // 非手动标定时，保留下面原有的原子选中、取消及坐标更新逻辑。
    // 每次点击先将全部原子恢复默认样式
    viewer.setStyle({}, defaultStyle);

    if (item !== atom.index) {
      item = atom.index;

      viewer.setStyle(
        { model: atom.model, index: item },
        {
          stick: { radius: 0.25, color: "red" },
          sphere: { scale: 0.4, color: "red" },
        },
      );
    } else {
      // 再次点击同一个原子，取消选中
      item = null;
    }
    console.log("原子坐标：", [atom.x, atom.y, atom.z]);
    origin.position = [atom.x, atom.y, atom.z];
    console.log(origin.position);
    viewer.render();
  });
  addBondCylinders(viewer, model);

  viewer.zoomTo();
  viewer.render();
});

</script>
