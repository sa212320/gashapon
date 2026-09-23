// 畫面層:桌面渲染(散落的籤紙)、翻籤演出、設定對話框。
// main.js 只管接線跟 store,DOM 怎麼長、動畫怎麼播都在這裡。
import { TIERS, TIER_META, createIchibanPrize } from './ichiban.js';
import { remaining, needsRebuild, entriesChanged } from '../../shared/js/roster.js';
import { createDialogShell } from '../../shared/js/dialog.js';
import { sfx } from '../../shared/js/sound.js';

// 最後一抽賞永遠是金色,不看賞別 —— 它是額外加碼的驚喜,不是某個賞別的籤。
const GOLD = Object.freeze({ label: '🌟 最後一抽賞', color: '#FFD24C', glow: 'rgba(255,210,76,.95)' });

// 桌上籤紙的裝飾色。故意跟 TIER_META 無關 —— 賞別在撕開之前不能從桌面看出來。
const DESK_COLORS = Object.freeze([
  '#F6C6B8', '#C9B6E4', '#BBD9F0', '#F7DFA0', '#BFE3C8', '#F3B8CE', '#E8CFAE',
]);

// 一番賞票卡的輪廓:上下長邊一排方齒、左緣一個往外凸的半圓耳、右端圓頭。
// 套子表面的淺色蓋片、抽走後的白色凹槽、票卡本身,三個都吃這一條 —— 共用同一條
// 才保證三層完全疊合,任何一層自己畫一份都會在邊緣露出對不齊的縫。
//
// 百分比是相對各元素自己的框,所以會跟著卡片縮放;但 x 與 y 的 1% 長度不同
// (卡片是 34:15),圓弧的 x 半徑要乘上 15/34,不然半圓耳會變成扁橢圓。
function buildCardShape({ lobeOnRight }) {
  const XL = 10, XR = 95, YT = 13, YB = 87; // 票卡在套子裡佔的範圍
  const TOOTH_DEPTH = 7, TEETH = 12;
  const capX = 7, capY = 37;                   // 圓頭那一端
  const lobeY = 16, lobeX = lobeY * (15 / 34); // 半圓耳(換算後才是正圓)
  const flatR = XR - capX;
  const w = (flatR - XL) / TEETH;
  // lobeOnRight 時整個輪廓左右鏡射:耳朵換到右邊、圓頭換到左邊。
  const fx = x => (lobeOnRight ? 100 - x : x);
  const at = (x, y) => `${fx(x).toFixed(2)}% ${y.toFixed(2)}%`;
  const pts = [];

  for (let i = 0; i < TEETH; i++) {            // 一條長邊的方齒
    const a = XL + i * w;
    const m = a + w / 2;
    pts.push(at(a, YT), at(a, YT - TOOTH_DEPTH), at(m, YT - TOOTH_DEPTH), at(m, YT));
  }
  pts.push(at(flatR, YT));

  for (let i = 1; i < 12; i++) {               // 圓頭
    const t = -Math.PI / 2 + (Math.PI * i) / 12;
    pts.push(at(flatR + capX * Math.cos(t), 50 + capY * Math.sin(t)));
  }
  pts.push(at(flatR, YB));

  for (let i = TEETH - 1; i >= 0; i--) {       // 另一條長邊的方齒(x 範圍一致,上下才對稱)
    const a = XL + i * w;
    const m = a + w / 2;
    pts.push(at(m, YB), at(m, YB + TOOTH_DEPTH), at(a, YB + TOOTH_DEPTH), at(a, YB));
  }

  pts.push(at(XL, 50 + lobeY));                // 往外凸的半圓耳
  for (let i = 1; i < 10; i++) {
    const t = Math.PI / 2 + (Math.PI * i) / 10;
    pts.push(at(XL + lobeX * Math.cos(t), 50 + lobeY * Math.sin(t)));
  }
  pts.push(at(XL, 50 - lobeY), at(XL, YT));

  return `polygon(${pts.join(', ')})`;
}

// 凹槽、蓋片、票卡三層共用同一條輪廓。
// 試過讓票卡左右鏡像(參考圖裡單張票卡的耳朵在右邊),但鏡像之後票卡的耳朵會
// 凸到蓋片輪廓外面,還沒抽就從套子右側露出一塊深色 —— 提前爆雷。三層同形才安全。
const CARD_SHAPE = buildCardShape({ lobeOnRight: false });

// 票卡要完全抽出套子,左緣得走到套子的右緣:輪廓左邊界在 10%,位移 90% 再多留一點。
const PULL_OUT = 93;

/* ---------- 桌面:散落的籤紙 ---------- */
// 用 index 算一個穩定的假隨機值(sine hash),同一張籤紙在沒被抽走之前
// 位置跟角度都不會變 —— 不用真的 Math.random(),不然每次 render 都會全部重新洗牌。
function pseudoRandom(seed) {
  const h = Math.sin(seed * 12.9898 + 4.1414) * 43758.5453;
  return h - Math.floor(h);
}

function jitter(index) {
  const rot = pseudoRandom(index * 3 + 1) * 24 - 12; // -12deg ~ 12deg
  const dx = pseudoRandom(index * 3 + 2) * 14 - 7; // -7px ~ 7px
  const dy = pseudoRandom(index * 3 + 3) * 14 - 7;
  return { rot, dx, dy };
}

export function createDeskView({ pileEl, emptyStateEl, onPick }) {
  function render(setup) {
    const undrawn = setup.tickets.filter(t => !t.drawn);
    pileEl.replaceChildren(...undrawn.map((ticket, i) => {
      const { rot, dx, dy } = jitter(i);
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'ticket';
      btn.setAttribute('aria-label', '抽一張籤');
      btn.style.transform = `translate(${dx.toFixed(1)}px, ${dy.toFixed(1)}px) rotate(${rot.toFixed(1)}deg)`;
      btn.style.setProperty('--card-color', DESK_COLORS[i % DESK_COLORS.length]);
      btn.innerHTML = '<span class="ticket__mark">籤</span>';
      return btn;
    }));
    pileEl.hidden = undrawn.length === 0;
    emptyStateEl.hidden = undrawn.length > 0;
  }

  pileEl.addEventListener('click', e => {
    const btn = e.target.closest('.ticket');
    if (btn) onPick(btn);
  });

  return { render };
}

/* ---------- 拿起 → 猶豫(取消/撕開)→ 撕開演出 ---------- */
// 三條規則(2D 扭蛋機吃過虧才寫出來的):
// 1. 每一步自己掌握 promise 的解除時機(動畫結束 / 按了跳過 / 逾時保險,先到先算)。
// 2. reset() 先 cancel() 掉上一次建立的動畫,fill:'forwards' 蓋過 inline style。
// 3. 分頁轉背景時自動快轉(main.js 的 visibilitychange 呼叫 requestSkip)。
export function createRevealer(els) {
  // 三層共用同一條輪廓。建立時就掛上去 —— 只在 reset() 設的話,
  // 任何還沒跑過 reset 的路徑都會畫出三張沒有齒孔的方卡。
  els.tearCard.style.setProperty('--card-shape', CARD_SHAPE);

  let skipping = false;
  let playing = false;
  const running = new Set();
  const created = new Set();

  const isSkipping = () => skipping;

  function animate(el, keyframes, duration, options = {}) {
    const skip = isSkipping();
    const ms = skip ? 1 : duration;
    const anim = el.animate(keyframes, { easing: 'ease-out', fill: 'forwards', ...options, duration: ms });
    created.add(anim);

    if (skip) {
      anim.finish();
      return Promise.resolve();
    }

    return new Promise(resolve => {
      let timer = null;
      let settled = false;
      const entry = {
        finish() {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          running.delete(entry);
          try { anim.finish(); } catch { /* 已經結束了 */ }
          resolve();
        },
      };
      running.add(entry);
      anim.finished.then(() => entry.finish(), () => entry.finish());
      timer = setTimeout(() => entry.finish(), ms + 1500);
    });
  }

  // 籤紙從桌面「飛」到畫面正中央,相對位移只需要知道起點跟畫面中心的差。
  function originOffset(originRect) {
    if (!originRect) return { x: 0, y: 0 };
    const toX = window.innerWidth / 2;
    const toY = window.innerHeight / 2;
    return {
      x: (originRect.left + originRect.width / 2) - toX,
      y: (originRect.top + originRect.height / 2) - toY,
    };
  }

  function reset() {
    // 上一次演出的動畫是 fill:'forwards',效果層級高於 inline style,
    // 不先取消掉的話下一張票卡會是隱形的,而且要重新整理才會好。
    created.forEach(anim => { try { anim.cancel(); } catch { /* 已經沒了 */ } });
    created.clear();
    running.clear();

    els.dim.style.opacity = '0';
    els.tearCard.style.opacity = '0';
    els.tearCard.style.transform = 'scale(.4)';
    els.tearCard.removeAttribute('data-bonus');
    els.ticket.style.transform = '';
    els.sleeve.style.transform = '';
    els.sleeve.style.opacity = '1';
    els.slot.style.opacity = '1';
    els.cover.style.opacity = '1';
    els.coverFill.style.clipPath = 'inset(0 0 0 0)';
    els.aura.style.opacity = '0';
    els.particles.replaceChildren();
  }

  async function flashAura(color, scale, duration) {
    els.aura.style.setProperty('--tier-color', color);
    await animate(els.aura,
      [{ transform: 'scale(.2)', opacity: .9 }, { transform: `scale(${scale})`, opacity: 0 }],
      isSkipping() ? 1 : duration);
  }

  function spawnParticles(color, amount) {
    if (isSkipping() || amount <= 0) return;
    const frag = document.createDocumentFragment();
    for (let i = 0; i < amount; i++) {
      const dot = document.createElement('span');
      dot.className = 'particle';
      dot.style.background = color;
      frag.appendChild(dot);
      const angle = (Math.PI * 2 * i) / amount + Math.random() * .4;
      const distance = 100 + Math.random() * 200;
      dot.animate([
        { transform: 'translate(0,0) scale(1)', opacity: 1 },
        {
          transform: `translate(${Math.cos(angle) * distance}px, ${Math.sin(angle) * distance}px) scale(0)`,
          opacity: 0,
        },
      ], { duration: 650 + Math.random() * 450, easing: 'cubic-bezier(.2,.7,.4,1)', fill: 'forwards' });
    }
    els.particles.appendChild(frag);
    setTimeout(() => els.particles.replaceChildren(), 1300);
  }

  // 純粹的停頓(最後一抽賞開獎前的小小停格),一樣要能被跳過或逾時解除。
  function wait(ms) {
    if (isSkipping()) return Promise.resolve();
    return new Promise(resolve => {
      let settled = false;
      let timer = null;
      const entry = {
        finish() {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          running.delete(entry);
          resolve();
        },
      };
      running.add(entry);
      timer = setTimeout(() => entry.finish(), ms);
    });
  }

  // level 0(最樸素)~ 6(最盛大)。用 TIERS.indexOf 反過來算,A 賞的 index 最小、等級最高。
  let pending = null;

  // 起 —— 票券從桌面飛到畫面正中央,亮出賞別顏色,但還沒撕開(名字沒揭曉)。
  async function playHold({ level, color, glow }, originRect) {
    playing = true;
    skipping = false;
    reset();
    pending = { level, color, glow };
    try {
      const offset = originOffset(originRect);
      els.tearCard.style.setProperty('--tier-color', color);
      els.tearCard.style.setProperty('--tier-glow', glow);

      sfx.drop();
      await Promise.all([
        animate(els.dim, [{ opacity: 0 }, { opacity: 1 }], 320),
        animate(els.tearCard, [
          { transform: `translate(${offset.x}px, ${offset.y}px) scale(.4) rotate(-8deg)`, opacity: 0 },
          { transform: 'translate(0,0) scale(1) rotate(0deg)', opacity: 1 },
        ], 420 + level * 30, { easing: 'cubic-bezier(.34,1.2,.64,1)' }),
      ]);
    } finally {
      playing = false;
      skipping = false;
    }
  }

  // 取消 —— 票卡飛回桌上原本的位置,那張籤沒有被抽掉。
  async function cancelReturn(originRect) {
    playing = true;
    skipping = false;
    try {
      const offset = originOffset(originRect);
      await animate(els.tearCard, [
        { transform: 'translate(0,0) scale(1) rotate(0deg)', opacity: 1 },
        { transform: `translate(${offset.x}px, ${offset.y}px) scale(.4) rotate(8deg)`, opacity: 0 },
      ], 320, { easing: 'cubic-bezier(.4,0,.2,1)' });
      await animate(els.dim, [{ opacity: 1 }, { opacity: 0 }], 220);
    } finally {
      playing = false;
      skipping = false;
      pending = null;
    }
  }

  // 撕 —— 票卡從套子裡往右抽出來,蓋片同步由左往右收掉,露出白色凹槽。
  //
  // 兩段:先抽出來(套子微微後仰,像被拉著),抽完套子才整個掉出畫面、
  // 票卡回到正中央放大。併成一段的話票卡還沒離開套子就開始往回飛,會打架。
  async function playTear({ name, badgeLabel, bonus }) {
    const { level, color } = pending ?? { level: 0, color: '#E7DFD4' };
    playing = true;
    skipping = false;
    try {
      els.tearCard.dataset.bonus = String(bonus);
      els.cardBadge.textContent = badgeLabel;
      els.cardName.textContent = name;

      sfx.crack();

      // 第一段:抽出來。票卡與蓋片的 duration 必須一樣 —— 差一點點就會看到
      // 票卡的左緣露在蓋片外面(提前爆雷),或白凹槽跑在票卡前面。
      const pull = 480 + level * 25;
      const ease = 'cubic-bezier(.34,.78,.3,1)';
      await Promise.all([
        animate(els.ticket, [
          { transform: 'translateX(0)' },
          { transform: `translateX(${PULL_OUT}%)` },
        ], pull, { easing: ease }),
        animate(els.coverFill, [
          { clipPath: 'inset(0 0 0 0)' },
          { clipPath: 'inset(0 0 0 100%)' },
        ], pull, { easing: ease }),
        animate(els.sleeve, [
          { transform: 'translate(0,0) rotate(0deg)' },
          { transform: 'translate(-14px, 4px) rotate(-2deg)' },
        ], pull, { easing: ease }),
      ]);

      // 第二段:空套子掉出畫面,票卡滑回正中央放大。
      const dropSleeve = [
        { opacity: 1, transform: 'translate(-14px,4px) rotate(-2deg)' },
        { opacity: 0, transform: 'translate(-70px,300px) rotate(-22deg)' },
      ];
      await Promise.all([
        animate(els.sleeve, dropSleeve, 360, { easing: 'cubic-bezier(.4,0,.75,1)' }),
        animate(els.slot, dropSleeve, 360, { easing: 'cubic-bezier(.4,0,.75,1)' }),
        animate(els.cover, [{ opacity: 1 }, { opacity: 0 }], 200),
        animate(els.ticket, [
          { transform: `translateX(${PULL_OUT}%) scale(1)` },
          { transform: 'translateX(0) scale(1.1)' },
        ], 400, { easing: 'cubic-bezier(.34,1.35,.64,1)' }),
      ]);

      // 賞別等級越高,光暈跟碎花越誇張;G 賞(level 0)乾脆不放光,樸素到底。
      sfx.upgrade(Math.min(level, 3));
      if (level > 0) {
        sfx.burst(Math.min(level - 1, 3));
        spawnParticles(color, 4 + level * 6);
        await flashAura(color, 2.2 + level * .6, 380 + level * 60);
      } else {
        sfx.clunk();
      }
    } finally {
      playing = false;
      skipping = false;
      pending = null;
    }
  }

  return {
    get isPlaying() { return playing; },
    // 跳過要連「正在播的這一步」一起結束,不然點了還要等它跑完。
    requestSkip() {
      if (!playing) return;
      skipping = true;
      [...running].forEach(entry => entry.finish());
    },

    hold({ tier }, originRect) {
      const rank = TIERS.indexOf(tier);
      const level = TIERS.length - 1 - (rank === -1 ? TIERS.length - 1 : rank);
      const meta = TIER_META[tier] ?? TIER_META.G;
      return playHold({ level, color: meta.color, glow: meta.glow }, originRect);
    },

    cancelReturn,

    tear({ name, tier }) {
      const meta = TIER_META[tier] ?? TIER_META.G;
      return playTear({ name, badgeLabel: meta.label, bonus: false });
    },

    // 最後一抽賞永遠是最盛大的等級,跟籤紙本身的賞別無關,而且不用猶豫直接開獎。
    async playBonus(name) {
      await playHold({ level: TIERS.length - 1, color: GOLD.color, glow: GOLD.glow }, null);
      await wait(260);
      await playTear({ name, badgeLabel: GOLD.label, bonus: true });
    },

    clear: reset,
  };
}

/* ---------- 設定對話框 ---------- */
export function createSettingsDialog({ els, ask, actions }) {
  let draft = null;

  const setup = () => actions.getActiveSetup();

  function snapshot() {
    const s = setup();
    draft = {
      name: s.name,
      lastOnePrize: s.lastOnePrize,
      prizes: s.prizes.map(p => ({ ...p })),
      soundOn: actions.getState().soundOn,
    };
  }

  function isDirty() {
    const s = setup();
    return draft.name !== s.name
      || draft.lastOnePrize !== s.lastOnePrize
      || draft.soundOn !== actions.getState().soundOn
      || entriesChanged(s.prizes, draft.prizes);
  }

  /* ---------- 剩下什麼 ---------- */
  function renderList() {
    const s = setup();
    const left = remaining(s.tickets);
    els.listHint.textContent = `還剩 ${left} 張,總共 ${s.tickets.length} 張`;

    els.prizeList.replaceChildren(...s.prizes.map(prize => {
      const own = s.tickets.filter(t => t.prizeId === prize.id);
      const total = own.length;
      const rest = remaining(own);

      const li = document.createElement('li');
      li.className = 'prize-row' + (rest === 0 ? ' is-gone' : '');

      const dot = document.createElement('span');
      dot.className = 'tier-dot';
      dot.style.background = TIER_META[prize.tier].color;

      const name = document.createElement('span');
      name.className = 'prize-row__name';
      name.textContent = prize.name;

      const count = document.createElement('span');
      count.className = 'prize-row__count';
      count.innerHTML = `<b>${rest}</b> / ${total}`;

      li.append(dot, name, count);
      return li;
    }));

    if (s.prizes.length === 0) {
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
            <button type="button" data-step="-1" aria-label="少一張">−</button>
            <output>${prize.count}</output>
            <button type="button" data-step="1" aria-label="多一張">＋</button>
          </div>
          <div class="tier-picker"></div>
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

      const picker = li.querySelector('.tier-picker');
      picker.replaceChildren(...TIERS.map(tier => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.style.background = TIER_META[tier].color;
        btn.setAttribute('aria-pressed', String(prize.tier === tier));
        btn.setAttribute('aria-label', TIER_META[tier].label);
        btn.addEventListener('click', () => {
          prize.tier = tier;
          picker.querySelectorAll('button').forEach((b, i) => {
            b.setAttribute('aria-pressed', String(TIERS[i] === tier));
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
    els.lastOneInput.value = draft.lastOnePrize;
    els.soundInput.checked = draft.soundOn;
  }

  function renderPanels() {
    renderList();
    renderEdit();
    renderOther();
  }

  async function applyDraft() {
    const s = setup();
    const willRebuild = needsRebuild(s.prizes, draft.prizes);
    if (willRebuild && !await ask('獎項改了,籤筒會重新鋪一桌喔!要嗎?')) return false;

    actions.applyDraft({
      name: draft.name.trim() || '我的一番賞',
      lastOnePrize: draft.lastOnePrize.trim(),
      prizes: draft.prizes.map(p => ({ ...p, name: p.name.trim() || '神祕獎項' })),
      rebuildTickets: willRebuild,
      soundOn: draft.soundOn,
    });
  }

  els.nameInput.addEventListener('input', () => { draft.name = els.nameInput.value; });
  els.lastOneInput.addEventListener('input', () => { draft.lastOnePrize = els.lastOneInput.value; });
  els.soundInput.addEventListener('change', () => { draft.soundOn = els.soundInput.checked; });

  els.addPrizeBtn.addEventListener('click', () => {
    draft.prizes.push(createIchibanPrize({ name: '', tier: 'G', count: 1 }));
    renderEdit();
    els.editList.lastElementChild?.querySelector('input')?.focus();
  });

  els.listRefillBtn.addEventListener('click', async () => {
    if (!await ask('要把籤筒重新鋪一桌嗎?已經抽掉的都會放回去。')) return;
    actions.refill();
    shell.refresh();
  });

  const shell = createDialogShell({
    els: {
      dialog: els.dialog,
      setupSelect: els.setupSelect,
      addSetupBtn: els.addSetupBtn,
      deleteSetupBtn: els.deleteSetupBtn,
      tabsNav: els.tabsNav,
      confirmBtn: els.confirmBtn,
      cancelBtn: els.cancelBtn,
      closeBtn: els.closeBtn,
    },
    ask,
    actions: {
      getState: actions.getState,
      getActiveSetup: setup,
      switchSetup: actions.switchSetup,
      addSetup: actions.addSetup,
      deleteSetup: actions.deleteSetup,
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
    // 新增一組一番賞之後,跳到「其他」分頁改名字,游標順便帶過去。
    onSetupAdded: () => {
      shell.showTab('other');
      els.nameInput.focus();
      els.nameInput.select();
    },
  });

  return {
    open() { shell.open(); },
  };
}
