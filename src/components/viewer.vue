<template>
  <div class="w-full h-full border border-gray-300 rounded-lg bg-white">
    <!-- viewer-box -->
    <div ref="viewerRef" class="w-full h-full"></div>
  </div>
</template>

<script setup>
import * as $3Dmol from "3dmol/build/3Dmol.js";
import { ref, watch, onMounted, onBeforeUnmount } from "vue";
import { origin } from "../utils/oringin";
const viewerRef = ref(null);
const props = defineProps({
  siteMode: Boolean,
  pdbText: { type: String, required: true },
});
const emit = defineEmits(["bond-click", "atom-click"]);
const sphereScale = 0.3;
const siteSphereScale = sphereScale * 1.5;
const siteColors = { head: 0xFF1493, tail: 0x00D6B2 };
const defaultStyle = {
  stick: { radius: 0.25, colorscheme: "Jmol" },
  sphere: { scale: sphereScale, colorscheme: "Jmol" },
};

// 圆柱对象只保存在显示层，位点记录仅使用原子的 serial。
const bondEntries = [];
let selection = { bondSerials: null, retainedSerial: null };
let refreshSite = () => {};
let frame = null;

function sameBond(pair, serials) {
  return serials?.length === 2 &&
    pair.every(id => serials.includes(id));
}

// 返回已确认键的角色；端点顺序不影响匹配。
function confirmedBondRole(pair) {
  return ["head", "tail"].find(role =>
    sameBond(pair, selection.sites?.[role]?.bondSerials)
  );
}

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
          if (confirmedBondRole(pair) || selection.bondSerials) return;
          shape.updateStyle({ opacity: 0.45 });
          viewer.render();
        },

        unhover_callback(shape) {
          if (confirmedBondRole(pair) || selection.bondSerials) return;
          shape.updateStyle({ opacity: 0 });
          viewer.render();
        },

        // 只上报键的端点编号；选中、取消和头尾阶段由父组件管理。
        callback() {
          if (!props.siteMode || confirmedBondRole(pair)) return;
          emit("bond-click", pair);
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
  let item = null;
  let viewer = $3Dmol.createViewer(viewerRef.value, {
    backgroundColor: "white",
  });
  // 缩短悬停等待时间，使键的高亮响应更及时（单位：毫秒）。
  viewer.setHoverDuration(50);
  let model = viewer.addModel(props.pdbText, "pdb", { keepH: true });

  viewer.setStyle({}, defaultStyle);

  // 只覆盖球体；清除继承的 Jmol 配色，避免覆盖指定颜色。
  function highlightAtom(serial, scale, color) {
    viewer.addStyle(
      { model, serial },
      { sphere: { scale, color, colorscheme: undefined } },
    );
  }

  function highlightSites() {
    const { bondSerials, retainedSerial, phase, sites } = selection;
    for (const serial of bondSerials ?? []) {
      highlightAtom(serial, sphereScale, "orange");
    }
    // 已确认的头尾持续显示，选择下一条键时不会丢失。
    for (const role of ["head", "tail"]) {
      const serial = sites?.[role]?.retainedSerial;
      if (serial != null) highlightAtom(serial, siteSphereScale, siteColors[role]);
    }
    if (retainedSerial != null && siteColors[phase] !== undefined) {
      highlightAtom(retainedSerial, siteSphereScale, siteColors[phase]);
    }
  }

  refreshSite = () => {
    const { bondSerials } = selection;
    item = null;
    viewer.setStyle({}, defaultStyle);

    // 已确认的头尾键持续高亮，当前正在编辑的键使用红色。
    for (const { shape, pair } of bondEntries) {
      const role = confirmedBondRole(pair);
      const selected = sameBond(pair, bondSerials);
      shape.updateStyle({
        color: role ? siteColors[role] : selected ? "red" : "orange",
        opacity: role || selected ? 1 : 0,
      });
    }

    highlightSites();

    viewer.render();
  };

  // 保留原点击逻辑，导入新模型后复用这个回调。
  function handleAtomClick(atom) {
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
          // 普通选中保持缩小后的球体大小。
          sphere: { scale: sphereScale, color: 0xFF00FF },
        },
      );
    } else {
      // 再次点击同一个原子，取消选中
      item = null;
    }
    console.log("原子坐标：", [atom.x, atom.y, atom.z]);
    origin.position = [atom.x, atom.y, atom.z];
    console.log(origin.position);
    highlightSites();
    viewer.render();
  }
  viewer.setClickable({}, true, handleAtomClick);
  addBondCylinders(viewer, model);

  viewer.zoomTo();
  viewer.render();

  // 导入新文本后替换当前模型，并重建对应的可交互键圆柱。
  watch(() => props.pdbText, text => {
    if (frame !== null) {
      cancelAnimationFrame(frame);
      frame = null;
    }
    selection = { bondSerials: null, retainedSerial: null };
    item = null;
    delete origin.position;
    for (const { shape } of bondEntries) viewer.removeShape(shape);
    bondEntries.length = 0;
    viewer.removeModel(model);
    model = viewer.addModel(text, "pdb", { keepH: true });

    viewer.setStyle({}, defaultStyle);
    viewer.setClickable({}, true, handleAtomClick);
    addBondCylinders(viewer, model);
    viewer.zoomTo();
    viewer.render();
  });
});

</script>
