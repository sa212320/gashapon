// 畫面層:桌面渲染(散落的籤紙)、翻籤演出、設定對話框。
// main.js 只管接線跟 store,DOM 怎麼長、動畫怎麼播都在這裡。
import { TIERS, TIER_META, createIchibanPrize } from './ichiban.js';
import { remaining, needsRebuild, entriesChanged } from '../../shared/js/roster.js';
import { createDialogShell } from '../../shared/js/dialog.js';
import { sfx } from '../../shared/js/sound.js';
import { faceColorFor, critterFor, tiltFor, layoutDesk } from './desk-layout.js';
import { dealPlan, dealLength, flightAt, boxYAt } from './desk-deal.js';
import { loadCardArt, drawFace, traceTicket } from './card-art.js';
import { createTearDrag } from './tear-drag.js';

// 最後一抽賞永遠是金色,不看賞別 —— 它是額外加碼的驚喜,不是某個賞別的籤。
const GOLD = Object.freeze({ label: '🌟 最後一抽賞', color: '#FFD24C', glow: 'rgba(255,210,76,.95)' });

/* ---------- 桌面:一張 canvas + 透明按鈕 ---------- */
// 按鈕負責排版(CSS grid)、點擊、焦點、飛出起點;canvas 只照著按鈕的位置畫,
// 而且只畫捲動後看得到的那幾排 —— canvas 永遠只有一個桌面大,張數再多也不會撐爆
// Safari 的 canvas 像素上限。
export function createDeskView({ deskEl, pileEl, canvasEl, boxEl, emptyStateEl, onPick }) {
  let setup = null;
  let layout = null;
  let slots = [];      // { no, el }
  let frame = 0;

  function inner() {
    const cs = getComputedStyle(deskEl);
    return {
      width: deskEl.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight),
      height: deskEl.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom),
    };
  }

  let laidOutAt = '';   // 排版時的桌面尺寸;ResizeObserver 只在它變了才重排
  const deskSize = () => `${deskEl.clientWidth}x${deskEl.clientHeight}`;

  function render(next) {
    // 開場動畫中又重排(轉手機、改設定):動畫直接結束,畫最終狀態
    if (dealing) finishDeal();
    setup = next;
    const undrawn = setup.tickets.filter(t => !t.drawn);
    laidOutAt = deskSize();
    layout = layoutDesk({ count: undrawn.length, ...inner() });
    pileEl.style.setProperty('--cols', String(layout.cols));
    pileEl.style.setProperty('--card-w', `${layout.cardW}px`);
    pileEl.style.setProperty('--card-h', `${layout.cardH}px`);
    pileEl.style.setProperty('--gap', `${layout.gap}px`);
    const buttons = undrawn.map(ticket => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'ticket';
      btn.dataset.no = String(ticket.no);
      btn.setAttribute('aria-label', `抽 ${ticket.no} 號籤`);
      // 跟 canvas 上畫的角度一樣,飛出去的起點才對得上
      btn.style.transform = `rotate(${tiltFor(ticket.no)}deg)`;
      return btn;
    });
    pileEl.replaceChildren(...buttons);
    slots = undrawn.map((t, i) => ({ no: t.no, el: buttons[i] }));
    pileEl.hidden = undrawn.length === 0;
    emptyStateEl.hidden = undrawn.length > 0;
    redraw();
  }

  // 每張卡先畫成一張小圖(含影子),捲動時只把小圖貼上去 —— 每格都重畫整張票卡
  // (雪花、號碼、頭)在手機上會跟不上捲動(review 2026-10-02)。卡片尺寸、dpr、
  // 素材載好時整批作廢重畫。
  const SHADOW = 0.1;            // 影子往下偏移,卡高的比例
  let sprites = new Map();
  let spriteKey = '';

  function spriteFor(no, cardW, cardH, dpr) {
    let s = sprites.get(no);
    if (s) return s;
    const pad = Math.ceil(Math.max(1.5, cardH * SHADOW));
    s = document.createElement('canvas');
    s.width = Math.ceil(cardW * dpr);
    s.height = Math.ceil((cardH + pad) * dpr);
    const ctx = s.getContext('2d');
    ctx.scale(dpr, dpr);
    // 跟以前 box-shadow 一樣的下方實影
    ctx.save();
    ctx.translate(0, pad);
    traceTicket(ctx, { w: cardW, h: cardH });
    ctx.fillStyle = 'rgba(87, 66, 57, .35)';
    ctx.fill();
    ctx.restore();
    drawFace(ctx, {
      color: faceColorFor(no), no, critter: critterFor(no), w: cardW, h: cardH,
    });
    s.pad = pad;
    sprites.set(no, s);
    return s;
  }

  function draw() {
    frame = 0;
    if (!layout) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    const w = deskEl.clientWidth;
    const h = deskEl.clientHeight;
    if (canvasEl.width !== Math.round(w * dpr) || canvasEl.height !== Math.round(h * dpr)) {
      canvasEl.width = Math.round(w * dpr);
      canvasEl.height = Math.round(h * dpr);
    }
    // CSS 尺寸跟著畫的尺寸走:clientWidth 不含捲軸,寫死 100% 的話
    // 有傳統捲軸時整張會被橫向拉伸,卡跟按鈕對不齊(review 2026-10-02)
    canvasEl.style.width = `${w}px`;
    canvasEl.style.height = `${h}px`;
    const { cardW, cardH } = layout;
    const key = `${cardW}|${dpr}`;
    if (key !== spriteKey) { sprites = new Map(); spriteKey = key; }
    const ctx = canvasEl.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const top = deskEl.scrollTop;
    const elapsed = dealing ? performance.now() - dealing.t0 : 0;
    for (const s of slots) {
      // offsetLeft/Top 是排版位置(不含 rotate),相對於 .desk(position: relative)
      const y = s.el.offsetTop - top;
      if (y + cardH * 1.1 < 0 || y - cardH * 0.1 > h) continue;
      const sprite = spriteFor(s.no, cardW, cardH, dpr);
      const to = { x: s.el.offsetLeft + cardW / 2, y: y + cardH / 2 };
      let at = { ...to, scale: 1, rot: tiltFor(s.no) };
      const flight = dealing?.plan.get(s.no);
      if (flight) {
        const t = (elapsed - flight.start) / flight.duration;
        if (t <= 0) continue;                    // 還在盒子裡
        const from = { x: dealing.holeX, y: boxYAt(flight.start, dealing.holeMid, dealing.holeBottom) };
        if (t < 1) at = flightAt(t, from, to, tiltFor(s.no));
      }
      ctx.save();
      ctx.translate(at.x, at.y);
      ctx.rotate((at.rot * Math.PI) / 180);
      ctx.scale(at.scale, at.scale);
      ctx.drawImage(sprite, -cardW / 2, -cardH / 2, cardW, cardH + sprite.pad);
      ctx.restore();
    }
  }

  /* ---------- 開場動畫:抽獎箱搖一搖,籤從洞口一波一波飛出來 ---------- */
  // 只是演出:按鈕已經在最終位置,canvas 照時間表把籤畫在飛行途中。
  // 播放中按鈕不能點,點桌面任何地方就直接全部排好。
  let dealing = null;   // { plan: Map(no → { start, duration }), t0, length, holeX/Mid/Bottom, armed }

  // style:射法參數(desk-deal.js 的 dealPlan 選項),預設機關槍、隨機順序;預覽頁拿來比較不同射法。
  function deal(next, style) {
    render(next);
    const h = deskEl.clientHeight;
    const top = deskEl.scrollTop;
    // 只有看得到的籤飛;畫面外的直接在原位,往下捲就會看到
    const visible = slots.filter(s => {
      const y = s.el.offsetTop - top;
      return y + layout.cardH > 0 && y < h;
    });
    if (!visible.length) return;
    const plan = dealPlan(visible, Math.random, style);
    const boxH = boxEl.offsetHeight || 100;   // 抽獎箱在桌面正中央(css .deal-box)
    dealing = {
      plan: new Map(plan.map(p => [p.no, p])),
      t0: performance.now(),
      length: dealLength(plan),
      // 抽獎箱頂面的圓洞:先在桌面正中央,開始飛時滑到底部(css .deal-box 的 top 要對得上)
      holeX: deskEl.clientWidth / 2,
      holeMid: h / 2 - boxH * 0.28,
      holeBottom: h - 8 - boxH / 2 - boxH * 0.28,
      // 觸發動畫的那一下點擊(「重新鋪一桌」在桌面裡)會冒泡到桌面;下一幀才開始接受「點一下跳過」
      armed: false,
      // 每一發的出發時間(連射:每射一發箱子抖一下);fired 記到第幾發了
      shots: plan.reduce((a, p) => { a[p.shot] = Math.min(a[p.shot] ?? Infinity, p.start); return a; }, []),
      fired: 0,
    };
    pileEl.style.pointerEvents = 'none';
    boxEl.hidden = false;
    boxEl.classList.remove('is-out');
    boxEl.classList.add('is-in');
    draw();
    requestAnimationFrame(tick);
  }

  function tick() {
    if (!dealing) return;
    const elapsed = performance.now() - dealing.t0;
    if (elapsed >= dealing.length) { finishDeal(); return; }
    while (dealing.fired < dealing.shots.length && elapsed >= dealing.shots[dealing.fired]) {
      dealing.fired++;
      kick();
    }
    draw();
    dealing.armed = true;
    requestAnimationFrame(tick);
  }

  // 後座力:每射一發箱子被壓扁一點再彈回來(連射所以小而短)。用 scale 屬性,不跟 CSS 動畫的 transform 打架。
  function kick() {
    boxEl.animate?.(
      [{ scale: '1' }, { scale: '1.06 0.94' }, { scale: '1' }],
      { duration: 90, easing: 'ease-out' });
  }

  function finishDeal() {
    dealing = null;
    pileEl.style.pointerEvents = '';
    boxEl.classList.remove('is-in');
    boxEl.classList.add('is-out');   // 往下沉、淡出;動畫結束後藏起來(見下面的 animationend)
    redraw();
  }

  boxEl.addEventListener('animationend', () => {
    if (boxEl.classList.contains('is-out')) boxEl.hidden = true;
  });
  deskEl.addEventListener('click', () => { if (dealing?.armed) finishDeal(); });

  function redraw() {
    if (!frame) frame = requestAnimationFrame(draw);
  }

  deskEl.addEventListener('scroll', redraw, { passive: true });
  // 只有桌面真的變大小(轉手機、拉視窗)才重排。ResizeObserver 剛掛上時一定會先叫一次,
  // 那一次尺寸沒變;照樣重排的話會把進頁面的開場動畫當場收掉(手機實測看不到動畫,2026-10-02)。
  new ResizeObserver(() => {
    if (setup && deskSize() !== laidOutAt) render(setup);
  }).observe(deskEl);
  loadCardArt().then(() => { sprites = new Map(); redraw(); });

  pileEl.addEventListener('click', e => {
    const btn = e.target.closest('.ticket');
    if (btn) onPick(btn);
  });

  return {
    render,
    deal,
    redraw,
    get isDealing() { return dealing !== null; },
  };
}

/* ---------- 拿起 → 猶豫(取消/撕開)→ 撕開演出 ---------- */
// 三條規則(2D 扭蛋機吃過虧才寫出來的):
// 1. 每一步自己掌握 promise 的解除時機(動畫結束 / 按了跳過 / 逾時保險,先到先算)。
// 2. reset() 先 cancel() 掉上一次建立的動畫,fill:'forwards' 蓋過 inline style。
// 3. 分頁轉背景時自動快轉(main.js 的 visibilitychange 呼叫 requestSkip)。
export function createRevealer(els) {
  // three.js 是站上最大的一包,所以等到第一次真的要開籤才載。
  // 萬一載不起來(檔案掉了、瀏覽器不支援 WebGL),也不能讓小孩抽掉一張籤卻什麼都沒看到:
  // 退路是直接把獎項那面畫在同一張 canvas 上,沒有動畫,但看得到抽到什麼。
  let stage = null;
  let stageReady = null;

  function loadStage() {
    // 紙紋與角色頭最多等 1.5 秒:慢網路不能卡住拿起動畫,沒等到就先畫沒有素材的版本。
    const art = new Promise(resolve => {
      const timer = setTimeout(resolve, 1500);
      loadCardArt().then(() => { clearTimeout(timer); resolve(); });
    });
    if (!stageReady) {
      stageReady = import('./curl.js')
        .then(m => { stage = m.createCurlStage(els.canvas); })
        .catch(err => {
          console.warn('[ichiban] 捲曲演出載不起來,改用靜態獎項卡', err);
          stage = null;
        });
    }
    return Promise.all([stageReady, art]);
  }

  // 退路:沒有 three.js 的時候,至少把獎項畫出來。
  async function drawStatic(card) {
    const { CARD_W, CARD_H, drawPrize } = await import('./card-art.js');
    els.canvas.width = CARD_W;
    els.canvas.height = CARD_H;
    drawPrize(els.canvas.getContext('2d'), card);
  }

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
  // 桌上那張歪了 tilt 度;飛到中央時轉正、放到全尺寸。
  function liftFrom(origin) {
    if (!origin) return { x: 0, y: 0, scale: 0.4, rot: -8 };
    const { x, y } = originOffset(origin.rect);
    const full = els.tearCard.offsetWidth || 340;
    const scale = origin.rect.width / full;
    return { x, y, scale, rot: origin.tilt ?? 0 };
  }

  async function playHold({ level, color, glow, card }, origin) {
    playing = true;
    skipping = false;
    reset();
    pending = { level, color, glow, card };
    try {
      await loadStage();
      if (stage) {
        stage.setCard(card);
        stage.reset();
      } else {
        await drawStatic(card);
      }

      const from = liftFrom(origin);
      els.tearCard.style.setProperty('--tier-color', color);
      els.tearCard.style.setProperty('--tier-glow', glow);

      sfx.drop();
      await Promise.all([
        animate(els.dim, [{ opacity: 0 }, { opacity: 1 }], 320),
        animate(els.tearCard, [
          { transform: `translate(${from.x}px, ${from.y}px) scale(${from.scale}) rotate(${from.rot}deg)`, opacity: .6 },
          { transform: 'translate(0,0) scale(1) rotate(0deg)', opacity: 1 },
        ], 420 + level * 30, { easing: 'cubic-bezier(.34,1.2,.64,1)' }),
      ]);
    } finally {
      playing = false;
      skipping = false;
    }
  }

  // 取消 —— 票卡飛回桌上原本的位置,那張籤沒有被抽掉。
  async function cancelReturn(origin) {
    playing = true;
    skipping = false;
    try {
      const to = liftFrom(origin);
      await animate(els.tearCard, [
        { transform: 'translate(0,0) scale(1) rotate(0deg)', opacity: 1 },
        { transform: `translate(${to.x}px, ${to.y}px) scale(${to.scale}) rotate(${origin ? to.rot : 8}deg)`, opacity: 0 },
      ], 320, { easing: 'cubic-bezier(.4,0,.2,1)' });
      await animate(els.dim, [{ opacity: 1 }, { opacity: 0 }], 220);
    } finally {
      playing = false;
      skipping = false;
      pending = null;
    }
  }

  // 撕 —— 上面那張捲起來走,底下的獎項留下來。
  // 捲曲本身是 curl.js 用 rAF 跑的,所以這裡自己接上跟 animate() 一樣的三條規則:
  // 動畫結束 / 按了跳過 / 逾時保險,先到先算。
  // from:手指已經撕到哪(2026-10-02 手指撕籤),從那裡接著自動撕完
  function runCurl(ms, from = 0) {
    if (!stage) return Promise.resolve();
    const handle = stage.playFrom(from, isSkipping() ? 1 : ms);
    if (isSkipping()) { handle.finish(); return handle.finished; }
    return new Promise(resolve => {
      let timer = null;
      let settled = false;
      const entry = {
        finish() {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          running.delete(entry);
          handle.finish();
          resolve();
        },
      };
      running.add(entry);
      handle.finished.then(() => entry.finish());
      timer = setTimeout(() => entry.finish(), ms + 1500);
    });
  }

  async function playTear(from = 0) {
    const { level, color } = pending ?? { level: 0, color: '#E7DFD4' };
    playing = true;
    skipping = false;
    try {
      sfx.crack();
      await runCurl(1150 + level * 45, from);

      // 賞別等級越高,光暈跟碎花越誇張;G 賞(level 0)乾脆不放光,樸素到底。
      sfx.upgrade(Math.min(level, 3));
      if (level > 0) {
        sfx.burst(Math.min(level - 1, 3));
        spawnParticles(color, 4 + level * 6);
        await flashAura(color, 2.2 + level * .6, 380 + level * 60);
      } else {
        sfx.clunk();
      }
      await animate(els.tearCard,
        [{ transform: 'scale(1)' }, { transform: 'scale(1.06)' }],
        300, { easing: 'cubic-bezier(.34,1.4,.64,1)' });
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

    hold({ tier, name, no = 1 }, origin) {
      const rank = TIERS.indexOf(tier);
      const level = TIERS.length - 1 - (rank === -1 ? TIERS.length - 1 : rank);
      const meta = TIER_META[tier] ?? TIER_META.G;
      const letter = TIER_META[tier] ? tier : 'G';
      // 獎項在這時候就畫進貼圖了,但它在蓋著的那一面底下,撕開之前看不到。
      els.cardBadge.textContent = meta.label;
      els.cardName.textContent = name;
      return playHold({
        level, color: meta.color, glow: meta.glow,
        card: {
          faceColor: faceColorFor(no), no, critter: critterFor(no),
          color: meta.color, letter, name, bonus: false,
        },
      }, origin);
    },

    cancelReturn,

    tear(from = 0) {
      return playTear(from);
    },

    // 等使用者撕(2026-10-02 手指撕籤,grill 定案):手指從籤上任何地方往右拉,或按「撕開」。
    //   拉超過 3% 就算抽走 → onCommit(main.js 在這裡存檔),「取消」同時消失;之後拉回 0% 也一樣
    //   放開停在原地,可以往回拉;到 90% 或按「撕開」→ resolve { from },由 tear(from) 自動撕完
    //   沒拉就按「取消」→ resolve 'cancel'
    // stopPropagation 是必要的,不是保險:這些元素都在 overlay 裡面,overlay 上掛著「播放中就快轉」。
    // 瀏覽器每呼叫完一個 listener 就清一次 microtask,resolve 的後續(playTear 會把 playing 設成 true)
    // 會搶在 overlay 的 listener 之前跑完 —— overlay 一看「正在播」就 requestSkip(),整段演出被快轉掉。
    waitForTear({ cancellable = true, onCommit } = {}) {
      const drag = createTearDrag();
      const ac = new AbortController();
      const on = (el, type, fn) => el.addEventListener(type, fn, { signal: ac.signal });
      els.holdCancelBtn.hidden = !cancellable;
      els.tearHint.hidden = false;
      els.ticketActions.hidden = false;
      return new Promise(resolve => {
        let done = false;
        const width = () => els.tearCard.offsetWidth || 340;
        const finish = value => {
          if (done) return;
          done = true;
          ac.abort();
          els.ticketActions.hidden = true;
          els.tearHint.hidden = true;
          resolve(value);
        };
        const apply = ({ progress, events }) => {
          for (const e of events) {
            if (e === 'commit') {
              els.holdCancelBtn.hidden = true;
              els.tearHint.hidden = true;
              onCommit?.();
            }
            if (e === 'rip') sfx.rip();
          }
          stage?.show(progress);
          if (events.includes('auto')) finish({ from: progress });
        };
        on(els.tearCard, 'pointerdown', e => {
          e.stopPropagation();
          // 只有左鍵 / 第一根手指能撕:右鍵拖、第二根手指都不算(review)
          if (e.button !== 0 || e.isPrimary === false) return;
          els.tearCard.setPointerCapture?.(e.pointerId);
          drag.down(e.clientX / width());
        });
        on(els.tearCard, 'pointermove', e => { if (drag.active) apply(drag.move(e.clientX / width())); });
        on(els.tearCard, 'pointerup', () => drag.up());
        on(els.tearCard, 'pointercancel', () => drag.up());
        // 單點不算撕,也不能被 overlay 接走當成「跳過」
        on(els.tearCard, 'click', e => e.stopPropagation());
        on(els.tearBtn, 'click', e => { e.stopPropagation(); apply(drag.button()); });
        on(els.holdCancelBtn, 'click', e => { e.stopPropagation(); if (!drag.committed) finish('cancel'); });
      });
    },

    // 最後一抽賞永遠是最盛大的等級,跟籤紙本身的賞別無關。金卡也用手撕(2026-10-02),只是沒有取消。
    holdBonus(name) {
      els.cardBadge.textContent = GOLD.label;
      els.cardName.textContent = name;
      return playHold({
        level: TIERS.length - 1, color: GOLD.color, glow: GOLD.glow,
        card: { faceColor: GOLD.color, no: '★', critter: 'both', color: GOLD.color, letter: '🌟', name, bonus: true },
      }, null);
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
