import { ref, shallowRef, computed, watch, effectScope } from "vue";

function sameBond(a, b) {
  if (!a || !b) return false;
  for (const serial of a) {
    if (!b.includes(serial)) return false;
  }
  return true;
}

// 独立实例保存响应式引用；业务方法只读取自己的实例。
export class SiteSelection {
  constructor(onChange) {
    this.phase = ref("head");
    this.bond = shallowRef(null);
    this.atom = ref(null);
    this.sites = ref({ head: null, tail: null });
    this.onChange = onChange;
    this.disposed = false;
    this.scope = effectScope(true);
    this.scope.run(this.initialize.bind(this));
  }

  initialize() {
    this.canConfirm = computed(this.isConfirmable.bind(this));
    watch([this.bond, this.atom, this.phase, this.sites], this.notify.bind(this), { deep: true });
  }

  isConfirmable() {
    return this.phase.value !== "ready" && !!this.bond.value?.includes(this.atom.value);
  }

  selectBond(pair) {
    if (this.disposed || this.phase.value === "ready") return;
    if (this.phase.value === "tail" && sameBond(pair, this.sites.value.head.bondSerials)) return;
    this.atom.value = null;
    this.bond.value = sameBond(pair, this.bond.value) ? null : [...pair];
  }

  selectAtom(serial) {
    if (this.disposed || this.phase.value === "ready" || !this.bond.value?.includes(serial)) return;
    this.atom.value = this.atom.value === serial ? null : serial;
  }

  confirm() {
    if (this.disposed || !this.canConfirm.value) return false;
    this.sites.value[this.phase.value] = {
      bondSerials: [...this.bond.value], retainedSerial: this.atom.value,
    };
    this.phase.value = this.phase.value === "head" ? "tail" : "ready";
    this.bond.value = null;
    this.atom.value = null;
    return true;
  }

  notify() {
    if (this.disposed) return;
    this.onChange({
      bondSerials: this.bond.value, retainedSerial: this.atom.value,
      phase: this.phase.value, sites: { ...this.sites.value },
    });
  }

  reset() {
    if (this.disposed) return;
    this.phase.value = "head";
    this.sites.value = { head: null, tail: null };
    this.bond.value = null;
    this.atom.value = null;
    this.notify(); // 即使状态原本为空，也清除普通点击高亮。
  }

  toInterface() {
    return {
      phase: this.phase, bond: this.bond, atom: this.atom,
      sites: this.sites, canConfirm: this.canConfirm,
      selectBond: this.selectBond.bind(this), selectAtom: this.selectAtom.bind(this),
      confirm: this.confirm.bind(this), reset: this.reset.bind(this),
    };
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    //移除监听器等响应式作用
    this.scope.stop();
    this.onChange = null;
  }
}
