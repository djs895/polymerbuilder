import { nextTick, ref, shallowRef } from 'vue';
import { removeAtomsFromPdb } from '../utils/removeAtomsFromPdb.js';
import { resetSiteSettings, startSiteSettings } from '../utils/siteSettings.js';

/** 删除流程只依赖显式注入的 ref 和位点接口，不操作 DOM 或 3Dmol。 */
export class PdbDeletionController {
  constructor({ pdbText, siteState, isImporting }) {
    this.pdbText = pdbText;
    this.siteState = siteState;
    this.isImporting = isImporting;
    // acceptText 更新原始文本，restart 读取；apply 不覆盖备份。
    this.originalPdbText = ref(pdbText.value);
    // apply 写入，父组件展示/后续聚合读取；导入或重新标定时清空。
    this.connectionSites = shallowRef(null);
    this.busy = ref(false);
    // 删除结果含完整连接；查看器读取此值决定是否推断额外的键。
    this.inferBonds = ref(true);
  }

  /** 输入：无，读取当前位点；输出：Promise<void>；成功才更新文本及结果。 */
  async apply() {
    const state = this.siteState;
    if (this.busy.value || this.isImporting.value || !state.leavingGroups.value) return;
    this.busy.value = true;
    state.siteError.value = '';
    try {
      if (state.selection.phase.value !== 'ready') throw new Error('请先完成位点标定');
      const { head, tail } = state.selection.sites.value;
      const endpoints = { headSerial: head?.retainedSerial, tailSerial: tail?.retainedSerial };
      const groups = state.leavingGroups.value;
      const removed = new Set([...groups.head, ...groups.tail]);
      if (!removed.size) throw new Error('没有待删除原子');
      if (endpoints.headSerial == null || endpoints.tailSerial == null ||
          removed.has(endpoints.headSerial) || removed.has(endpoints.tailSerial)) {
        throw new Error('保留端无效或包含在待删除原子中');
      }
      const atoms = state.siteViewer.value?.getAtomSnapshot(this.pdbText.value);
      if (!atoms) throw new Error('分子模型尚未就绪');
      const text = removeAtomsFromPdb(this.pdbText.value, removed, atoms);
      // 所有计算成功后才提交。清除旧断键选择，单独保留聚合连接端。
      state.selection.reset();
      state.leavingGroups.value = null;
      state.editingSite.value = false;
      this.connectionSites.value = endpoints;
      this.inferBonds.value = false;
      this.pdbText.value = text;
      await nextTick(); // 等待父子组件更新后再允许下一次操作。
    } catch (error) {
      state.siteError.value = error instanceof Error ? error.message : '应用删除失败';
    } finally {
      this.busy.value = false;
    }
  }

  /** 输入：无；输出：Promise<void>；恢复当前导入的原始文本，再开始标定。 */
  async restart() {
    if (this.busy.value || this.isImporting.value) return;
    this.busy.value = true;
    try {
      resetSiteSettings(this.siteState);
      this.connectionSites.value = null;
      this.inferBonds.value = true;
      this.pdbText.value = this.originalPdbText.value;
      await nextTick();
      startSiteSettings(this.siteState);
    } finally {
      this.busy.value = false;
    }
  }

  /** 输入：导入器读取的新文本；输出：无；同步替换工作文本和恢复来源。 */
  acceptText(text) {
    if (this.busy.value) throw new Error('请等待当前操作完成');
    resetSiteSettings(this.siteState);
    this.connectionSites.value = null;
    this.inferBonds.value = true;
    this.originalPdbText.value = text;
    this.pdbText.value = text;
  }
}
