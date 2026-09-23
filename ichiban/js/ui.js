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

// 票卡上下長邊的方齒。形狀是固定的(一番賞票卡本來就是規則的齒孔,不是隨機撕痕),
// 所以載入時算一次就好,之後每張票卡共用同一條 clip-path。
const TICKET_CLIP = (() => {
  const teeth = 13;
  const depth = 7; // %
  const top = [];
  const bottom = [];
  for (let i = 0; i < teeth; i++) {
    const a = (i / teeth) * 100;
    const m = ((i + 0.5) / teeth) * 100;
    top.push(`${a.toFixed(2)}% ${depth}%`, `${a.toFixed(2)}% 0%`, `${m.toFixed(2)}% 0%`, `${m.toFixed(2)}% ${depth}%`);
    bottom.push(
      `${(100 - a).toFixed(2)}% ${100 - depth}%`, `${(100 - a).toFixed(2)}% 100%`,
      `${(100 - m).toFixed(2)}% 100%`, `${(100 - m).toFixed(2)}% ${100 - depth}%`,
    );
  }
  return `polygon(${[...top, `100% ${depth}%`, `100% ${100 - depth}%`, ...bottom, `0% ${100 - depth}%`].join(', ')})`;
})();

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
  // 方齒是票卡的固定形狀,建立時就掛上去 —— 只靠 reset() 設的話,
  // 任何還沒跑過 reset 的路徑都會畫出一張沒有齒的方卡。
  els.ticket.style.clipPath = TICKET_CLIP;

  // 撕痕:一條由上到下的鋸齒線,位置用 x 參數左右移動。
  // 每一點的齒深固定、正負號逐點交替(不交替的話是一條抖動的曲線,不是鋸齒),
  // 所以 x=0 跟 x=100 兩組點的「數量與順序完全一致」,WAAPI 才能在兩者之間
  // 內插 —— 撕痕就會穩穩地從左掃到右,而不是每一格亂跳。
  const SEAM_POINTS = 19;
  let teeth = [];

  function newTearLine() {
    teeth = Array.from({ length: SEAM_POINTS }, (_, i) =>
      (i % 2 === 0 ? 1 : -1) * (0.7 + Math.random() * 1.5));
  }

  function seamAt(x) {
    return teeth.map((tooth, i) => `${(x + tooth).toFixed(2)}% ${((i / (SEAM_POINTS - 1)) * 100).toFixed(1)}%`).join(', ');
  }

  // 留在原地的那半取撕痕的右邊,被撕走的那半取左邊。
  const faceClip = x => `polygon(${seamAt(x)}, 100% 100%, 100% 0%)`;
  const flapClip = x => `polygon(0% 0%, ${seamAt(x)}, 0% 100%)`;

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
    els.ticket.style.clipPath = TICKET_CLIP;
    els.ticket.style.transform = '';
    newTearLine();
    els.face.style.clipPath = faceClip(0);
    els.flap.style.clipPath = flapClip(0);
    els.flap.style.transform = '';
    els.flap.style.opacity = '1';
    els.stub.style.opacity = '1';
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

  // 撕開瞬間沿著騎縫線噴幾張小紙屑,數量跟賞別等級一起長。
  function spawnShreds(color, amount) {
    if (isSkipping() || amount <= 0) return;
    const frag = document.createDocumentFragment();
    for (let i = 0; i < amount; i++) {
      const bit = document.createElement('span');
      bit.className = 'shred';
      bit.style.background = color;
      bit.style.left = `${Math.random() * 100}%`;
      frag.appendChild(bit);
      const dx = (Math.random() - .5) * 160;
      const dy = -40 - Math.random() * 120;
      const spin = (Math.random() - .5) * 540;
      bit.animate([
        { transform: 'translate(-50%,0) rotate(0deg)', opacity: 1 },
        { transform: `translate(calc(-50% + ${dx}px), ${dy}px) rotate(${spin}deg)`, opacity: 0 },
      ], { duration: 550 + Math.random() * 400, easing: 'cubic-bezier(.2,.7,.4,1)', fill: 'forwards' });
    }
    els.particles.appendChild(frag);
    setTimeout(() => els.particles.replaceChildren(), 1100);
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

  // 撕 —— 上面那張紙沿著一條鋸齒撕痕被撕下來,底下那張(獎項)露出來。
  //
  // 分兩段是刻意的:
  //   第一段撕痕從左掃到右,被撕走的那半只微微翹起來(位移小到撕痕還是連著的),
  //   看起來才是「沿著一條線撕」;讓它一開始就飛,就會變成「掉了一塊」。
  //   第二段撕痕已經走完,整張翹起來的紙才真的被拋開。
  async function playTear({ name, badgeLabel, bonus }) {
    const { level, color } = pending ?? { level: 0, color: '#E7DFD4' };
    playing = true;
    skipping = false;
    try {
      els.tearCard.dataset.bonus = String(bonus);
      els.cardBadge.textContent = badgeLabel;
      els.cardName.textContent = name;

      sfx.crack();
      spawnShreds(color, 3 + level * 4);

      // 第一段:撕開。三個動畫的 duration 必須一樣,不然撕痕的兩側會走不同步,
      // 中間會裂出一條空隙或疊出一條深色帶。
      const rip = 520 + level * 25;
      await Promise.all([
        animate(els.face, [{ clipPath: faceClip(0) }, { clipPath: faceClip(100) }], rip, { easing: 'cubic-bezier(.45,.05,.55,.95)' }),
        animate(els.flap, [
          { clipPath: flapClip(0), transform: 'translateY(0) rotateY(0deg)' },
          { clipPath: flapClip(100), transform: 'translateY(-8px) rotateY(-74deg)' },
        ], rip, { easing: 'cubic-bezier(.45,.05,.55,.95)' }),
        // 缺口是上面那張紙的一部分,而且就在最先被撕到的左緣,所以早早就要不見。
        animate(els.stub, [{ opacity: 1 }, { opacity: 0 }], Math.round(rip * 0.35)),
      ]);

      // 第二段:撕下來的那張被拋開,獎項自己留著。
      await Promise.all([
        animate(els.flap, [
          { transform: 'translate(0,-8px) rotate(0deg) rotateY(-74deg)', opacity: 1 },
          { transform: 'translate(-58px,-240px) rotate(-20deg) rotateY(-110deg)', opacity: 0 },
        ], 380, { easing: 'cubic-bezier(.4,0,.75,1)' }),
        animate(els.ticket, [
          { transform: 'scale(1)' },
          { transform: 'scale(1.08)' },
        ], 340, { easing: 'cubic-bezier(.34,1.4,.64,1)' }),
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
