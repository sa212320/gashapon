// 設定對話框的骨殼。分頁、設定組下拉、取消/確定、dirty 確認 —— 五個模式都一樣。
// 什麼欄位算 dirty、按確定時要不要重建池子,全部由各模式的 isDirty / applyDraft 決定,
// 這裡一概不知道。
//
// onSetupAdded(可選):新增一組設定之後呼叫,讓各模式自己決定要跳去哪個分頁、
// 要 focus 哪個欄位。不給的話預設「停在目前分頁」,不會自作主張跳頁。
//
// els 需要下面這些鍵,對應的 markup 可以直接照抄這份骨架(class 名稱、
// dialog__head / picker / tabs / dialog__body / dialog__foot 這一套排版
// 都吃 shared/css/tokens.css 的樣式;每個模式自己的分頁內容放進
// `[data-panel]`,名字要跟傳給 createDialogShell 的 `tabs` 陣列對上):
//
//   <dialog class="dialog" id="...">                      -- els.dialog
//     <header class="dialog__head">
//       <h2>OO設定</h2>
//       <button class="icon-btn icon-btn--light" id="..." -- els.closeBtn
//               type="button" aria-label="關閉">✕</button>
//     </header>
//
//     <div class="picker">
//       <select class="picker__select" id="..."           -- els.setupSelect
//               aria-label="選擇..."></select>
//       <button class="chip" id="..." type="button">      -- els.addSetupBtn
//         ＋ 新增</button>
//       <button class="chip chip--danger" id="..."        -- els.deleteSetupBtn
//               type="button">刪除</button>
//     </div>
//
//     <nav class="tabs" id="...">                          -- els.tabsNav
//       <button class="tab is-active" data-tab="第一個分頁的 name" type="button">...</button>
//       <button class="tab" data-tab="..." type="button">...</button>
//     </nav>
//
//     <div class="dialog__body">
//       <section class="panel" data-panel="第一個分頁的 name">...</section>
//       <section class="panel" data-panel="..." hidden>...</section>
//     </div>
//
//     <footer class="dialog__foot">
//       <button class="btn btn--ghost" id="..." type="button">取消</button>   -- els.cancelBtn
//       <button class="btn btn--primary" id="..." type="button">確定</button> -- els.confirmBtn
//     </footer>
//   </dialog>
const REQUIRED_ELS = [
  'dialog', 'setupSelect', 'addSetupBtn', 'deleteSetupBtn',
  'tabsNav', 'confirmBtn', 'cancelBtn', 'closeBtn',
];

export function createDialogShell({ els, ask, actions, tabs, onSetupAdded }) {
  // 開發期檢查:els 抄漏一個鍵,這個 module 就會整個掛掉 = 白紙一片。
  // 白屏是我們最怕的事,所以這裡只 warn、不 throw,讓抄漏的人至少看得到錯在哪。
  for (const key of REQUIRED_ELS) {
    if (!els[key]) console.warn(`createDialogShell: els.${key} 不見了,對話框可能沒辦法動。`);
  }

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

  // 分頁只要給 name,骨殼自己去 dialog 裡面找對應的 [data-panel]。
  // 以前是直接讀 tab.panelEl,但沒有任何一個模式傳過這個欄位 ——
  // 於是 open() 會在 showModal() **之前**丟例外,設定按鈕按下去完全沒反應。
  const panes = tabs.map(tab => {
    const panelEl = tab.panelEl ?? els.dialog?.querySelector(`[data-panel="${tab.name}"]`);
    if (!panelEl) console.warn(`createDialogShell: 找不到 [data-panel="${tab.name}"],這個分頁切不過去。`);
    return { name: tab.name, panelEl };
  });

  function showTab(name) {
    els.tabsNav.querySelectorAll('.tab').forEach(t => {
      t.classList.toggle('is-active', t.dataset.tab === name);
    });
    // 找不到的分頁就跳過,不能讓它拖著整個 open() 一起掛掉
    for (const pane of panes) {
      if (pane.panelEl) pane.panelEl.hidden = pane.name !== name;
    }
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
      showTab(panes[0].name);
      els.dialog.showModal();
    },
    close() { els.dialog.close(); },
    refresh,
    showTab,
  };
}
