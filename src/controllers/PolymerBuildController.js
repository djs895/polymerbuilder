import { ref, shallowRef } from 'vue';
import { buildPolymer } from '../utils/buildPolymer.js';
import { serializePolymer } from '../utils/pdb.js';

/** 聚合仅读取保存的单体，渲染成功后才提交结果；共享 busy 阻止并发改模。 */
export class PolymerBuildController {
  constructor({ template, busy, isImporting, replaceText }) {
    // home.vue 注入依赖；apply 每次读取最新 ref，replaceText 负责模型事务。
    this.template = template;
    this.busy = busy;
    this.isImporting = isImporting;
    this.replaceText = replaceText;
    // UI 编辑这些参数；未输入目标键长时不能生成。
    this.type = ref('head-tail');
    this.n = ref(2);
    this.bondLength = ref(null);
    // apply 写入成功结果/错误；home.vue 展示，reset 清空。
    this.result = shallowRef(null);
    this.error = ref('');
  }

  /** 按钮事件调用；无参数，使用实例依赖，失败保留上次成功结构和结果。 */
  async apply() {
    if (this.busy.value || this.isImporting.value || !this.template.value) return;
    this.busy.value = true;
    this.error.value = '';
    try {
      const type = this.type.value;
      const n = this.n.value;
      const bondLength = this.bondLength.value;
      if (!Number.isInteger(n) || n < 1) throw new Error('聚合度必须为正整数');
      if (!Number.isFinite(bondLength) || bondLength <= 0) throw new Error('请输入大于 0 的目标键长（Å）');
      const polymer = buildPolymer(type, this.template.value, { n, bondLength });
      const text = serializePolymer(polymer);
      await this.replaceText(text, false);
      this.result.value = {
        ...polymer, type, n, bondLength,
        atomCount: this.template.value.atoms.length * n,
      };
    } catch (error) {
      this.error.value = error instanceof Error ? error.message : '生成聚合结构失败';
    } finally {
      this.busy.value = false;
    }
  }

  /** Vue 的模板 watcher 调用；忽略新旧值，清空上个模板的结果及错误。 */
  reset() {
    this.result.value = null;
    this.error.value = '';
  }
}
