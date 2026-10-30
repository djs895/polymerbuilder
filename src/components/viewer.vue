<template>
  <div class="w-full h-full border border-gray-300 rounded-lg bg-white">
    <!-- viewerRef 获取此容器 DOM，供 3Dmol 创建三维分子查看器。 -->
    <div ref="viewerRef" class="w-full h-full"></div>
  </div>
</template>

<script setup>
// 来源：第三方依赖 3dmol；用于创建查看器、加载 PDB 和绘制可交互的分子模型。
import * as $3Dmol from "3dmol/build/3Dmol.js";
// 来源：Vue。ref 保存模板 DOM；watch 监听 PDB 变化；
// onMounted 等待容器挂载后初始化；onBeforeUnmount 在销毁前取消待执行的刷新。
import { ref, watch, onMounted, onBeforeUnmount } from "vue";
// 来源：src/utils/oringin.js 导出的共享对象。
// 保存点击原子的坐标，导入新模型时清空，保留供后续功能使用。
import { origin } from "../utils/oringin";
// 来源：本组件模板的 ref="viewerRef"；挂载后指向查看器容器 DOM。
const viewerRef = ref(null);
// 来源：src/components/home.vue 传入的属性。
// siteMode 对应 editingSite，控制位点标定模式；pdbText 对应 PDB 原始文本。
const props = defineProps({
  //用来检查目前是否进行位点标定
  siteMode: Boolean,
  pdbText: { type: String, required: true },
});
// 向 home.vue 上报点击结果：bond-click 传递两个端点 serial，atom-click 传递一个 serial。
// 父组件分别交给 selectBond、selectAtom；两者来自 src/composables/useSiteSelection.js。
// defineEmits 是 <script setup> 编译宏。

const emit = defineEmits(["bond-click", "atom-click"]);
// 本组件的显示参数：普通原子球体大小、标定位点球体大小，以及头尾配色。
const sphereScale = 0.3;
const siteSphereScale = sphereScale * 1.5;
const siteColors = { head: 0xFF1493, tail: 0x00D6B2 };
// 默认使用棒状化学键和按元素配色的原子球；刷新选择时先恢复此样式。
const defaultStyle = {
  stick: { radius: 0.25, colorscheme: "Jmol" },
  sphere: { scale: sphereScale, colorscheme: "Jmol" },
};

// 来源：addBondCylinders 写入的 { shape, pair }，分别为圆柱对象和端点 serial 数组。
// 用于更新键高亮、替换模型时清理旧圆柱；圆柱对象只保存在显示层。
const bondEntries = [];
// 来源：初始为空；后续由 home.vue 调用 setSiteSelection 更新。
// 数据由 useSiteSelection 生成，包含当前键、保留端、阶段和已确认头尾位点。
let selection = { bondSerials: null, retainedSerial: null };
// 挂载后替换为实际刷新函数；初始空函数使初始化前的调用安全返回。
let refreshSite = () => {};
// 来源：浏览器 requestAnimationFrame 返回的任务编号；null 表示没有待执行的刷新。
let frame = null;

// 判断两个端点数组是否表示同一条键，忽略端点排列顺序。
function sameBond(pair, serials) {
    // 1. 检查两个数组是否都包含两个原子编号
    if (pair?.length !== 2 || serials?.length !== 2) {
        return false;
    }

    // 2. 获取当前化学键的两个原子编号
    const atom1 = pair[0];
    const atom2 = pair[1];

    // 3. 判断两个原子是否都存在于目标化学键中
    const hasAtom1 = serials.includes(atom1);
    const hasAtom2 = serials.includes(atom2);

    // 4. 两个原子都匹配，说明是同一条化学键
    return hasAtom1 && hasAtom2;
}

// 从 selection.sites 查找已确认键的角色，返回 head、tail 或 undefined。
// 端点顺序不影响匹配；用于保护已确认键的高亮，并阻止重复选择。 
// 最终实现定义一个+

function confirmedBondRole(pair) {
  const headBond = selection.sites?.head?.bondSerials;
  const tailBond = selection.sites?.tail?.bondSerials;

  if (sameBond(pair, headBond)) {
    return "head";
  }

  if (sameBond(pair, tailBond)) {
    return "tail";
  }

  return undefined;
}

// defineExpose 是编译宏，将 setSiteSelection 暴露给父组件。
// home.vue 通过 siteViewer.value?.setSiteSelection(selection) 传入标定状态。
defineExpose({
  setSiteSelection(value) {
    selection = value;
    // 重置时的主动通知与 watch 通知可能连续到达；同一帧只按最新状态绘制一次。
    if (frame !== null) return;
    frame = requestAnimationFrame(() => {
      frame = null;
      refreshSite();
    });
  },
});

// 组件销毁前取消待执行的动画帧，避免该任务继续刷新已卸载的查看器。
onBeforeUnmount(() => {
  if (frame !== null) cancelAnimationFrame(frame);
});

// 使用 3Dmol 模型的成键信息，为每对成键原子添加一个交互圆柱体。
// viewer、model 来自下方 onMounted 创建的查看器和当前分子模型。
function addBondCylinders(viewer, model) {
  // {} 表示获取当前模型的全部原子；bonds 存储的是模型内索引。
  const atoms = model.selectedAtoms({});
  // index 是模型内索引，serial 是原子编号；两者不能混用。
  // 按 index 查找相邻原子，之后使用 serial 向父组件上报选择。
  const byIndex = new Map(atoms.map(atom => [atom.index, atom]));
  // seen 对无向键去重；shapes 收集本次创建的圆柱，作为返回值供后续使用。
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

      // 来源：当前成键的两个 3Dmol 原子对象；闭包中的回调复用这组编号。
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

        // shape 参数由 3Dmol 悬停事件传入，指向当前交互圆柱。
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

// 容器挂载后创建查看器，设置原子点击与键交互，并显示初始分子。
onMounted(() => {
  // 普通点击选中的原子 index；再次点击同一原子时取消，与头尾标定状态分开维护。
  let item = null;
  // 来源：3Dmol.createViewer；管理当前容器的模型、样式、交互和渲染。
  let viewer = $3Dmol.createViewer(viewerRef.value, {
    backgroundColor: "white",
  });
  // 缩短悬停等待时间，使键的高亮响应更及时（单位：毫秒）。
  viewer.setHoverDuration(50);
  // 来源：addModel 解析父组件传入的 PDB；keepH 保留氢原子。
  // 导入新文本后，model 会更新为新模型。
  let model = viewer.addModel(props.pdbText, "pdb", { keepH: true });

  viewer.setStyle({}, defaultStyle);

  // 只覆盖球体；清除继承的 Jmol 配色，避免覆盖指定颜色。
  // serial 来自标定状态，scale、color 来自本组件的显示参数。
  function highlightAtom(serial, scale, color) {
    viewer.addStyle(
      { model, serial },
      { sphere: { scale, color, colorscheme: undefined } },
    );
  }

  // 从父组件同步的 selection 读取数据，依次绘制当前键端点、已确认位点和当前保留端。
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

  // 供 setSiteSelection 的动画帧回调执行：清除普通选择，重画键和位点，再渲染。
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

  // atom 由 3Dmol 的 setClickable 回调传入，包含 index、serial、model 和坐标。
  // 标定模式上报端点编号；普通模式切换原子高亮并保存坐标。导入新模型后复用。
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

  // text 来自 home.vue 更新后的 pdbText。
  // 取消旧刷新、清空选择和坐标，移除旧圆柱与模型，再重建交互并调整视野。
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
