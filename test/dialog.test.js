// 設定對話框骨殼。這裡釘死一件事:open() 一定要真的把對話框打開。
//
// 這個 bug 上線過:tabs 只給了 name,showTab 卻去讀 tab.panelEl,
// 於是 open() 在 showModal() **之前**就丟例外 —— 三個模式的設定面板
// 按下去完全沒反應,而且畫面上沒有任何錯誤訊息。
import test from 'node:test';
import assert from 'node:assert/strict';

function el(extra = {}) {
  return {
    hidden: false,
    disabled: false,
    classList: { toggle() {} },
    dataset: {},
    addEventListener() {},
    replaceChildren() {},
    querySelectorAll: () => [],
    ...extra,
  };
}

// 只做這份 markup 骨架需要的最小 DOM:panel 由 dialog.querySelector 找出來。
function fakeDialog(panelNames) {
  const panels = new Map(panelNames.map(n => [n, el()]));
  let opened = false;
  const dialog = el({
    showModal() { opened = true; },
    close() { opened = false; },
    querySelector: sel => {
      const m = /\[data-panel="(.+)"\]/.exec(sel);
      return m ? panels.get(m[1]) ?? null : null;
    },
  });
  return { dialog, panels, isOpen: () => opened };
}

function shellFor(names) {
  const { dialog, panels, isOpen } = fakeDialog(names);
  const els = {
    dialog,
    setupSelect: el({ value: 's1' }),
    addSetupBtn: el(),
    deleteSetupBtn: el(),
    tabsNav: el(),
    confirmBtn: el(),
    cancelBtn: el(),
    closeBtn: el(),
  };
  const actions = {
    getState: () => ({ setups: [{ id: 's1', name: '一' }], activeSetupId: 's1' }),
    getActiveSetup: () => ({ id: 's1', name: '一' }),
    snapshot() {},
    isDirty: () => false,
    renderPanels() {},
    switchSetup() {},
    addSetup() {},
    deleteSetup() {},
    applyDraft() {},
  };
  return { els, actions, panels, isOpen, tabs: names.map(name => ({ name })) };
}

globalThis.document = { createElement: () => ({}) };

test('open() 真的把對話框打開 —— 分頁設定只給 name 也不能丟例外', async () => {
  const { createDialogShell } = await import('../shared/js/dialog.js');
  const { els, actions, tabs, isOpen } = shellFor(['teams', 'items', 'other']);
  const shell = createDialogShell({ els, ask: async () => true, actions, tabs });
  shell.open();
  assert.equal(isOpen(), true, '對話框沒有打開');
});

test('open() 停在第一個分頁,其他分頁收起來', async () => {
  const { createDialogShell } = await import('../shared/js/dialog.js');
  const { els, actions, tabs, panels } = shellFor(['teams', 'items', 'other']);
  createDialogShell({ els, ask: async () => true, actions, tabs }).open();
  assert.equal(panels.get('teams').hidden, false);
  assert.equal(panels.get('items').hidden, true);
  assert.equal(panels.get('other').hidden, true);
});

test('showTab 切到哪一頁,就只有那一頁是開的', async () => {
  const { createDialogShell } = await import('../shared/js/dialog.js');
  const { els, actions, tabs, panels } = shellFor(['teams', 'items', 'other']);
  const shell = createDialogShell({ els, ask: async () => true, actions, tabs });
  shell.open();
  shell.showTab('items');
  assert.equal(panels.get('teams').hidden, true);
  assert.equal(panels.get('items').hidden, false);
});
