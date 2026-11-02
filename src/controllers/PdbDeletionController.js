import { nextTick, ref, shallowRef } from 'vue';
import { removeAtomsFromPdb } from '../utils/removeAtomsFromPdb.js';
import { resetSiteSettings, startSiteSettings } from '../utils/siteSettings.js';
import { captureMonomerGeometry } from '../utils/MonomerGeometry.js';

/** 输入：普通快照；输出：递归冻结的独立副本，不持有查看器对象。 */
function immutableSnapshot(value) {
  if (value === null || typeof value !== 'object') return value;
  const copy = Array.isArray(value) ? [] : {};
  for (const [key, child] of Object.entries(value)) copy[key] = immutableSnapshot(child);
  return Object.freeze(copy);
}

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
    // 删除成功后保存原始单体；反复聚合只读取它，导入/重新标定时清空。
    this.monomerTemplate = shallowRef(null);
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
      const geometry = captureMonomerGeometry(atoms, { head, tail });
      const text = removeAtomsFromPdb(this.pdbText.value, removed, atoms);
      // 文本转换和模型刷新都成功后才提交位点状态。
      const remainingAtoms = await this.replaceText(text, false);
      const template = immutableSnapshot({ atoms: remainingAtoms, geometry });
      state.selection.reset();
      state.leavingGroups.value = null;
      state.editingSite.value = false;
      this.connectionSites.value = endpoints;
      this.monomerTemplate.value = template;
    } catch (error) {
      state.siteError.value = error instanceof Error ? error.message : '应用删除失败';
    } finally {
      this.busy.value = false;
    }
  }

  /** 输入：新文本和推断开关；输出：实际新模型的原子快照；刷新失败时回滚文本。 */
  async replaceText(text, inferBonds) {
    const previousText = this.pdbText.value;
    const previousInference = this.inferBonds.value;
    try {
      this.inferBonds.value = inferBonds;
      this.pdbText.value = text;
      await nextTick();
      // Vue 刷新完成不等于模型加载成功，必须由查看器确认。
      const viewer = this.siteState.siteViewer.value;
      if (!viewer) throw new Error('分子查看器已关闭');
      return viewer.getAtomSnapshot(text);
    } catch (error) {
      this.inferBonds.value = previousInference;
      this.pdbText.value = previousText;
      try {
        await nextTick();
        const viewer = this.siteState.siteViewer.value;
        if (!viewer) throw new Error('分子查看器已关闭');
        viewer.getAtomSnapshot(previousText);
        // 模型重建清空了查看器选择，但父组件 ref 没变，需显式恢复交互。
        const selection = this.siteState.selection;
        viewer.setSiteSelection({
          phase: selection.phase.value,
          bondSerials: selection.bond.value,
          retainedSerial: selection.atom.value,
          sites: { ...selection.sites.value },
        });
      } catch {
        throw new Error('模型刷新及恢复失败，请重新导入原始文件');
      }
      throw error;
    }
  }

  /** 输入：无；输出：Promise<void>；恢复当前导入的原始文本，再开始标定。 */
  async restart() {
    if (this.busy.value || this.isImporting.value) return;
    this.busy.value = true;
    try {
      await this.replaceText(this.originalPdbText.value, true);
      this.resetSettings();
      startSiteSettings(this.siteState);
    } catch (error) {
      this.siteState.siteError.value = error instanceof Error ? error.message : '恢复失败';
    } finally {
      this.busy.value = false;
    }
  }

  /** 输入：导入器读取的新文本；输出：无；同步替换工作文本和恢复来源。 */
  acceptText(text) {
    if (this.busy.value) throw new Error('请等待当前操作完成');
    this.resetSettings();
    this.inferBonds.value = true;
    this.originalPdbText.value = text;
    this.pdbText.value = text;
  }

  /** 导入器/重新标定调用；清空单体和位点，模板 watcher 同步清空聚合结果。 */
  resetSettings() {
    resetSiteSettings(this.siteState);
    this.connectionSites.value = null;
    this.monomerTemplate.value = null;
  }
}
