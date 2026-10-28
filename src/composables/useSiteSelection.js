import { ref, shallowRef, computed, watch } from "vue";

// 每次调用创建独立的标定状态；由 home.vue 调用一次并连接 viewer。
export function useSiteSelection(onChange) {
  const phase = ref("head"); // head：选择头部；tail：选择尾部；ready：已完成。
  const bond = shallowRef(null); // 当前键的两个 serial；null 表示未选中。
  const atom = ref(null); // 当前键中指定为保留端的原子 serial。
  const sites = ref({ head: null, tail: null }); // 通过按钮确认的结果。

  // 端点顺序不影响键的身份，例如 [1, 2] 与 [2, 1] 是同一条键。
  const sameBond = (a, b) =>
    !!a && !!b && a.every(id => b.includes(id));

  const canConfirm = computed(() =>
    phase.value !== "ready" && !!bond.value?.includes(atom.value)
  );

  function selectBond(pair) {
    if (phase.value === "ready") return;
    // 尾部必须使用另一条键；拒绝时保留当前正在编辑的选择。
    if (phase.value === "tail" && sameBond(pair, sites.value.head.bondSerials)) return;

    atom.value = null;
    bond.value = sameBond(pair, bond.value) ? null : [...pair];
  }

  function selectAtom(serial) {
    // 只接受当前键的端点；再次点击同一端点可取消端点选择。
    if (phase.value === "ready" || !bond.value?.includes(serial)) return;
    atom.value = atom.value === serial ? null : serial;
  }

  function confirm() {
    if (!canConfirm.value) return false;

    // 保存编号快照，后续选择尾部不会覆盖已确认的头部。
    // 此处仅记录位点，不计算或删除基团。
    sites.value[phase.value] = {
      bondSerials: [...bond.value],
      retainedSerial: atom.value,
    };
    phase.value = phase.value === "head" ? "tail" : "ready";
    bond.value = null;
    atom.value = null;
    return true;
  }

  function notify() {
    onChange({
      bondSerials: bond.value,
      retainedSerial: atom.value,
      phase: phase.value,
      sites: { ...sites.value },
    });
  }

  // 合并本轮状态变化，向显示层传递当前阶段及已确认的头尾。
  watch([bond, atom, phase, sites], notify, { deep: true });

  function reset() {
    phase.value = "head";
    sites.value = { head: null, tail: null };
    bond.value = null;
    atom.value = null;
    notify(); // 状态原本为空时，也需要清除普通原子点击留下的高亮。
  }

  return {
    phase, bond, atom, sites, canConfirm,
    selectBond, selectAtom, confirm, reset,
  };
}
