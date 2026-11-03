<template>
  <div class="w-full h-full border border-gray-300 rounded-lg bg-white">
    <!-- Vue 挂载后将此 DOM 写入 viewerRef.value，控制器在 mount 中读取。 -->
    <div ref="viewerRef" class="w-full h-full"></div>
  </div>
</template>

<script setup>
// 来源：第三方依赖 3dmol；用于创建查看器、加载 PDB 和绘制可交互的分子模型。
import * as $3Dmol from "3dmol/build/3Dmol.js";
import { ref, toRef, watch, onMounted, onBeforeUnmount } from "vue";
import { origin } from "../utils/oringin";
import { MoleculeViewerController } from "../controllers/MoleculeViewerController.js";

/**
 * 来源：父组件 home.vue。
 * siteMode：是否开启位点标定，控制器在点击发生时读取最新值。
 * pdbText：PDB 原始文本；首次挂载时读取，后续变化通过 watch 传入。
 */
const props = defineProps({
  //用来检查目前是否进行位点标定
  siteMode: Boolean,
  pdbText: { type: String, required: true },
  // 删除后的文本包含完整连接，父组件关闭自动推断以保持拓扑。
  inferBonds: { type: Boolean, default: true },
});

/**
 * Vue 提供的事件发送函数，控制器通过它通知父组件。
 * bond-click 传递两个端点的 serial 数组，atom-click 传递原子的 serial。
 */
const emit = defineEmits(["bond-click", "atom-click"]);

/**
 * 来源：模板中的 ref="viewerRef"。
 * setup 时 value 为 null，挂载后由 Vue 写入 DOM。
 * 传入 ref 本身，控制器才能在 mount 中读取实际 DOM，而非初始 null。
 */
const viewerRef = ref(null);

/**
 * 每个组件实例创建独立控制器，并明确注入依赖：
 * containerRef：容器引用；props：保留与父组件最新属性值的关联；
 * emit：当前组件的通知函数；createViewer：3Dmol 的查看器创建函数。
 * origin 是现有模块共享的坐标对象，显式传入不会使其变成独立副本。
 * viewer、model、选择状态及动画帧编号均由控制器实例保存。
 */
const controller = new MoleculeViewerController({
  containerRef: viewerRef,
  props,
  emit,
  origin,
  createViewer: $3Dmol.createViewer,
});

/**
 * Vue 在 DOM 挂载后调用 mount，在卸载前调用 dispose。
 * bind 显式指定方法的 this，避免使用捕获 controller 的包装函数。
 * 控制器负责模型初始化，以及任务、交互对象和外部监听的清理。
 */
onMounted(controller.mount.bind(controller));
onBeforeUnmount(controller.dispose.bind(controller));

/**
 * toRef 将 props.pdbText 作为监听来源，不需要捕获 props 的 getter。
 * Vue 将新文本作为第一个参数传给 replaceModel(text)。
 * 初始加载由 mount 完成，因此不使用 immediate。
 * 此 watch 在 setup 中同步创建，随组件卸载自动停止。
 */
watch(
  toRef(props, "pdbText"),
  controller.replaceModel.bind(controller),
);

/**
 * home.vue 通过 siteViewer.value?.setSiteSelection(selection) 调用。
 * selection 来自父组件的位点标定逻辑，由绑定方法交给当前控制器。
 */
defineExpose({
  setSiteSelection: controller.setSiteSelection.bind(controller),
  // home.vue 传入头尾位点，得到当前模型的基团编号，不执行删除。
  findLeavingGroups: controller.findLeavingGroups.bind(controller),
  getAtomSnapshot: controller.getAtomSnapshot.bind(controller),
});
</script>
