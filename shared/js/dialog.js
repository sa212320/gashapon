// 設定對話框的骨殼。分頁、設定組下拉、取消/確定、dirty 確認 —— 五個模式都一樣。
// 什麼欄位算 dirty、按確定時要不要重建池子,全部由各模式的 isDirty / applyDraft 決定,
// 這裡一概不知道。
//
// onSetupAdded(可選):新增一組設定之後呼叫,讓各模式自己決定要跳去哪個分頁、
// 要 focus 哪個欄位。不給的話預設「停在目前分頁」,不會自作主張跳頁。
export function createDialogShell({ els, ask, actions, tabs, onSetupAdded }) {
  function renderSetupPicker() {
    const state = actions.getState();
    els.setupSelect.replaceChildren(...state.setups.map(setup => {
      const opt = document.createElement('option');
      opt.value = setup.id;
      opt.textContent = setup.name || '沒有名字的設定';
      opt.selected = setup.id === state.activeSetupId;
      return opt;
    }));
    els.deleteSetupBtn.disabled = state.setups.length <= 1;
  }

  function showTab(name) {
    els.tabsNav.querySelectorAll('.tab').forEach(t => {
      t.classList.toggle('is-active', t.dataset.tab === name);
    });
    for (const tab of tabs) tab.panelEl.hidden = tab.name !== name;
  }

  function refresh() {
    renderSetupPicker();
    actions.renderPanels();
  }

  els.tabsNav.addEventListener('click', e => {
    const tab = e.target.closest('.tab');
    if (tab) showTab(tab.dataset.tab);
  });

  els.setupSelect.addEventListener('change', async () => {
    const id = els.setupSelect.value;
    if (actions.isDirty() && !await ask('還沒按確定的修改會不見喔,要換一組嗎?')) {
      renderSetupPicker();
      return;
    }
    actions.switchSetup(id);
    actions.snapshot();
    refresh();
  });

  els.addSetupBtn.addEventListener('click', async () => {
    if (actions.isDirty() && !await ask('還沒按確定的修改會不見喔,要新增一組嗎?')) return;
    actions.addSetup();
    actions.snapshot();
    refresh();
    onSetupAdded?.();
  });

  els.deleteSetupBtn.addEventListener('click', async () => {
    const setup = actions.getActiveSetup();
    if (!await ask(`要刪掉「${setup.name || '這一組'}」嗎?刪掉就找不回來了。`)) return;
    actions.deleteSetup(setup.id);
    actions.snapshot();
    refresh();
  });

  els.confirmBtn.addEventListener('click', async () => {
    // applyDraft 自己決定要不要先問、以及要不要重建池子。
    // 回 false 表示它決定不關對話框(例如使用者在重建確認時按了不要)。
    const applied = await actions.applyDraft();
    if (applied !== false) els.dialog.close();
  });

  els.cancelBtn.addEventListener('click', () => els.dialog.close());
  els.closeBtn.addEventListener('click', () => els.dialog.close());

  return {
    open() {
      actions.snapshot();
      refresh();
      showTab(tabs[0].name);
      els.dialog.showModal();
    },
    close() { els.dialog.close(); },
    refresh,
    showTab,
  };
}
