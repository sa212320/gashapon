// 設定對話框。裡面的修改都先進 draft,按「確定」才會真的套用;
// 按「取消」或關掉就整包丟掉。切換機台是例外 —— 那是立即生效的。
// 分頁切換、機台下拉、取消/確定、切換與新增時的 dirty 確認交給 shared/js/dialog.js 的骨殼;
// 這裡只留三個分頁自己的渲染,以及「什麼算 dirty」「確定時要不要重建池子」這兩件機台自己的事。
import { RARITIES, RARITY_META } from './constants.js';
import { createPrize, prizesChanged, needsRebuild, remaining } from './state.js';
import { createDialogShell } from '../../shared/js/dialog.js';

const clonePrizes = prizes => prizes.map(p => ({ ...p }));

export function createSettingsDialog({ els, ask, actions }) {
  let draft = null;

  const machine = () => actions.getActiveMachine();

  function snapshot() {
    const m = machine();
    draft = {
      name: m.name,
      removeOnDraw: m.removeOnDraw,
      prizes: clonePrizes(m.prizes),
      soundOn: actions.getState().soundOn,
    };
  }

  function isDirty() {
    const m = machine();
    return draft.name !== m.name
      || draft.removeOnDraw !== m.removeOnDraw
      || draft.soundOn !== actions.getState().soundOn
      || prizesChanged(m.prizes, draft.prizes);
  }

  /* ---------- 剩下什麼 ---------- */
  function renderList() {
    const m = machine();
    const left = remaining(m);
    els.listHint.textContent = m.removeOnDraw
      ? `還剩 ${left} 顆,總共 ${m.pool.length} 顆`
      : '這台扭蛋機抽到的不會消失,所以永遠是滿的';

    els.prizeList.replaceChildren(...m.prizes.map(prize => {
      const total = m.pool.filter(c => c.prizeId === prize.id).length;
      const rest = m.removeOnDraw
        ? m.pool.filter(c => c.prizeId === prize.id && !c.drawn).length
        : total;

      const li = document.createElement('li');
      li.className = 'prize-row' + (rest === 0 ? ' is-gone' : '');
      li.innerHTML = `
        <span class="dot" data-rarity="${prize.rarity}"></span>
        <span class="prize-row__name"></span>
        <span class="prize-row__count"><b>${rest}</b> / ${total}</span>`;
      li.querySelector('.prize-row__name').textContent = prize.name;
      return li;
    }));

    if (m.prizes.length === 0) {
      els.prizeList.innerHTML = '<li class="prize-row">還沒有獎項,去「編輯獎項」加一個吧!</li>';
    }
  }

  /* ---------- 編輯獎項 ---------- */
  function renderEdit() {
    els.editList.replaceChildren(...draft.prizes.map((prize, index) => {
      const li = document.createElement('li');
      li.className = 'edit-card';
      li.innerHTML = `
        <div class="edit-card__top">
          <input class="edit-card__name" type="text" maxlength="20" placeholder="獎項名字">
          <button class="icon-x" type="button" aria-label="刪掉這個獎項">✕</button>
        </div>
        <div class="edit-card__bottom">
          <div class="stepper">
            <button type="button" data-step="-1" aria-label="少一顆">−</button>
            <output>${prize.count}</output>
            <button type="button" data-step="1" aria-label="多一顆">＋</button>
          </div>
          <div class="rarity-picker"></div>
        </div>`;

      const nameInput = li.querySelector('.edit-card__name');
      nameInput.value = prize.name;
      nameInput.addEventListener('input', () => { draft.prizes[index].name = nameInput.value; });

      const output = li.querySelector('output');
      li.querySelectorAll('[data-step]').forEach(btn => {
        btn.addEventListener('click', () => {
          const next = Math.min(99, Math.max(0, prize.count + Number(btn.dataset.step)));
          prize.count = next;
          output.textContent = next;
        });
      });

      li.querySelector('.icon-x').addEventListener('click', () => {
        draft.prizes.splice(index, 1);
        renderEdit();
      });

      const picker = li.querySelector('.rarity-picker');
      picker.replaceChildren(...RARITIES.map(rarity => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'dot';
        btn.dataset.rarity = rarity;
        btn.setAttribute('aria-pressed', String(prize.rarity === rarity));
        btn.setAttribute('aria-label', RARITY_META[rarity].label);
        btn.style.width = btn.style.height = '38px';
        btn.addEventListener('click', () => {
          prize.rarity = rarity;
          picker.querySelectorAll('button').forEach(b => {
            b.setAttribute('aria-pressed', String(b.dataset.rarity === rarity));
          });
        });
        return btn;
      }));

      return li;
    }));
  }

  /* ---------- 其他 ---------- */
  function renderOther() {
    els.nameInput.value = draft.name;
    els.removeOnDrawInput.checked = draft.removeOnDraw;
    els.soundInput.checked = draft.soundOn;
  }

  function renderPanels() {
    renderList();
    renderEdit();
    renderOther();
  }

  /* ---------- 確定時要不要重建池子,機台自己決定 ---------- */
  async function applyDraft() {
    const m = machine();
    const willRebuild = needsRebuild(m.prizes, draft.prizes);
    if (willRebuild && !await ask('獎項改了,扭蛋機會重新裝滿喔!要嗎?')) return false;

    actions.applyDraft({
      name: draft.name.trim() || '我的扭蛋機',
      removeOnDraw: draft.removeOnDraw,
      prizes: draft.prizes.map(p => ({ ...p, name: p.name.trim() || '神祕獎項' })),
      rebuildPool: willRebuild,
      soundOn: draft.soundOn,
    });
  }

  /* ---------- 分頁各自的欄位,直接綁 draft ---------- */
  els.nameInput.addEventListener('input', () => { draft.name = els.nameInput.value; });
  els.removeOnDrawInput.addEventListener('change', () => { draft.removeOnDraw = els.removeOnDrawInput.checked; });
  els.soundInput.addEventListener('change', () => { draft.soundOn = els.soundInput.checked; });

  els.addPrizeBtn.addEventListener('click', () => {
    draft.prizes.push(createPrize({ name: '', count: 1, rarity: 'N' }));
    renderEdit();
    els.editList.lastElementChild?.querySelector('input')?.focus();
  });

  els.listRefillBtn.addEventListener('click', async () => {
    if (!await ask('要把扭蛋機重新裝滿嗎?已經抽掉的都會放回去。')) return;
    actions.refill();
    shell.refresh();
  });

  const shell = createDialogShell({
    els: {
      dialog: els.dialog,
      setupSelect: els.machineSelect,
      addSetupBtn: els.addMachineBtn,
      deleteSetupBtn: els.deleteMachineBtn,
      tabsNav: els.tabs,
      confirmBtn: els.confirmBtn,
      cancelBtn: els.cancelBtn,
      closeBtn: els.closeBtn,
    },
    ask,
    actions: {
      getState: () => {
        const state = actions.getState();
        return { setups: state.machines, activeSetupId: state.activeMachineId };
      },
      getActiveSetup: machine,
      switchSetup: id => actions.switchMachine(id),
      addSetup: () => actions.addMachine(),
      deleteSetup: id => actions.deleteMachine(id),
      snapshot,
      isDirty,
      applyDraft,
      renderPanels,
    },
    tabs: [
      { name: 'list', panelEl: els.dialog.querySelector('[data-panel="list"]') },
      { name: 'edit', panelEl: els.dialog.querySelector('[data-panel="edit"]') },
      { name: 'other', panelEl: els.dialog.querySelector('[data-panel="other"]') },
    ],
  });

  return {
    open() { shell.open(); },
  };
}
