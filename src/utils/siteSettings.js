/**
 * 输入：home.vue 提供的查看器 ref，以及 useSiteSelection 通知的最新状态。
 * 输出：无；副作用：更新当前查看器的位点显示。
 */
export function updateViewerSelection(viewerRef, selection) {
  viewerRef.value?.setSiteSelection(selection);
}

/**
 * 输入：home.vue 显式传入的 state（选择接口、查看器 ref 和界面状态 ref）。
 * 输出：无；副作用：确认位点、保存基团结果或显示错误，不修改分子。
 */
export function confirmSiteSettings(state) {
  const selection = state.selection;
  if (!state.editingSite.value || !selection.canConfirm.value) return;
  state.siteError.value = "";

  if (selection.phase.value === "head") {
    selection.confirm();
    return;
  }

  // 先验证尾端候选，失败时不进入 ready，用户仍可修改选择。
  let groups;
  try {
    if (!state.siteViewer.value) throw new Error("分子模型尚未就绪");
    groups = state.siteViewer.value.findLeavingGroups({
      head: selection.sites.value.head,
      tail: {
        bondSerials: [...selection.bond.value],
        retainedSerial: selection.atom.value,
      },
    });
  } catch (error) {
    state.leavingGroups.value = null;
    state.siteError.value = error instanceof Error ? error.message : "基团搜索失败";
    return;
  }

  if (!selection.confirm()) return;
  state.leavingGroups.value = groups;
  state.editingSite.value = false;
  state.setting.value = true;
}

/** 输入：同一 state；输出：无；副作用：导入或重置时清空选择、结果和错误。 */
export function resetSiteSettings(state) {
  state.editingSite.value = false;
  state.setting.value = false;
  state.leavingGroups.value = null;
  state.siteError.value = "";
  state.selection.reset();
}

/** 输入：同一 state；输出：无；副作用：重新开始头端标定。 */
export function startSiteSettings(state) {
  resetSiteSettings(state);
  state.editingSite.value = true;
}
