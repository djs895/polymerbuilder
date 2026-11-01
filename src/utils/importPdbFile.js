/**
 * 输入：父组件显式注入的输入框/状态 ref，以及接受新文本、重置位点的回调。
 * 输出：Promise<void>；副作用：读取文件、显示错误，成功时通知文本接收者。
 */
export async function importPdbFile(state) {
  if (state.isImporting.value || state.busy.value) return;
  if (state.active.value !== 'PDB') {
    state.reset();
    return;
  }
  state.importError.value = '';
  const file = state.pdbInput.value?.files?.[0];
  if (!file) {
    state.importError.value = '请先选择 PDB 文件。';
    return;
  }
  state.isImporting.value = true;
  try {
    const text = await file.text();
    if (state.active.value !== 'PDB' || state.pdbInput.value?.files?.[0] !== file) return;
    state.acceptText(text);
  } catch (error) {
    state.importError.value = error instanceof Error ? error.message : 'PDB 文件读取失败。';
  } finally {
    state.isImporting.value = false;
  }
}
