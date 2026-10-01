// 演出播放器。它只負責把 gacha.js 已經決定好的 revealSteps 播出來,
// 不做任何隨機、不決定任何結果。
import { RARITIES, RARITY_META } from './constants.js';
import { sfx } from '../../shared/js/sound.js';
import { outletPoint } from './machine-art.js';
import { createRevealFx, particleCount } from '../../shared/js/reveal-fx.js';
import { fitText } from './fit-text.js';
import { cssUrl, waitForImage } from './image-ready.js';


const DURATION = {
  turn: 1000, drop: 720, shake: 360, upgrade: 480, crack: 420, burst: 900, show: 320,
};

export function createRevealer(els) {
  let skipping = false;
  let playing = false;
  const running = new Set();
  const created = new Set();

  // 只有使用者自己點「跳過」、或分頁被切到背景,才會快轉。
  // 系統的「減少動態」不列入考慮 —— 這是一台扭蛋機,演出就是它的全部。
  const isSkipping = () => skipping;

  // 分頁被切到背景時瀏覽器會暫停動畫,anim.finished 就永遠不會 resolve。
  // 小孩切去別的 App 再切回來不能卡死在遮罩上,所以補一道逾時保險。
  // 分頁在背景時瀏覽器不跑 rendering step,anim.finished 永遠不會 settle
  // ——— 連呼叫過 finish() 也一樣。所以這裡自己掌握 promise 的解除時機:
  // 動畫正常結束、按了跳過、或逾時保險,三者先到先算。
  function animate(el, keyframes, duration, options = {}) {
    const skip = isSkipping();
    const ms = skip ? 1 : duration;
    const anim = el.animate(keyframes, {
      easing: 'ease-out',
      fill: 'forwards',
      ...options,
      duration: ms,
    });
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

  const { flashAura, spawnParticles } = createRevealFx({
    aura: els.aura, particles: els.particles, animate, isSkipping,
  });

  // 蛋是從扭蛋機的出蛋口滾出來的。出蛋口的位置來自 anchors.json(插畫上量出來的),
  // 乘上機台當下的實際位置,換成相對於畫面正中央那顆蛋的位移。
  function slotOffset() {
    const out = outletPoint(els.machine.getBoundingClientRect(), els.getAnchors());
    const capsule = els.capsule.getBoundingClientRect();
    return {
      x: out.x - (capsule.left + capsule.width / 2),
      y: out.y - (capsule.top + capsule.height / 2),
    };
  }

  function reset() {
    // 上一次演出的動畫是 fill: 'forwards',效果層級高於 inline style,
    // 不先取消掉的話下一顆蛋會是隱形的。
    created.forEach(anim => { try { anim.cancel(); } catch { /* 已經沒了 */ } });
    created.clear();
    running.clear();

    els.dim.style.opacity = '0';
    els.capsule.hidden = false;
    els.capsule.dataset.rarity = 'N';
    els.capsule.style.transform = '';
    els.top.style.transform = '';
    els.bottom.style.transform = '';
    els.top.style.opacity = '1';
    els.bottom.style.opacity = '1';
    els.capsule.style.opacity = '0';
    els.aura.hidden = true;
    els.aura.dataset.rarity = 'N';
    els.particles.replaceChildren();
    els.card.hidden = true;
    els.card.style.opacity = '';
    els.card.style.transform = '';
  }

  const stepHandlers = {
    // 轉把手:把手轉一圈,機身先壓扁、彈回、再左右晃。機台沒有臉(2026-10-01 決定),
    // 圓頂裡的蛋是插畫的一部分,跟著機身一起晃。這段畫面不變暗,重點就是看機台。
    async turn() {
      sfx.crank();
      await Promise.all([
        animate(els.knob,
          [{ transform: 'rotate(0deg)' }, { transform: 'rotate(360deg)' }],
          DURATION.turn, { easing: 'cubic-bezier(.45,0,.2,1)', fill: 'none' }),
        animate(els.machine, [
          { transform: 'scale(1, 1) rotate(0deg)' },
          { transform: 'scale(1.04, .94) rotate(0deg)', offset: .18 },
          { transform: 'scale(.97, 1.04) rotate(0deg)', offset: .36 },
          { transform: 'scale(1, 1) rotate(-1.8deg)', offset: .55 },
          { transform: 'scale(1, 1) rotate(1.8deg)', offset: .75 },
          { transform: 'scale(1, 1) rotate(0deg)' },
        ], DURATION.turn, { easing: 'ease-in-out', fill: 'none' }),
      ]);
      sfx.clunk();
    },

    async drop() {
      const from = slotOffset();
      await Promise.all([
        animate(els.dim, [{ opacity: 0 }, { opacity: 1 }], 460),
        animate(els.capsule, [
          { transform: `translate(${from.x}px, ${from.y}px) scale(.4) rotate(-20deg)`, opacity: 0 },
          { transform: `translate(${from.x * .7}px, ${from.y * .7}px) scale(.6) rotate(-10deg)`, opacity: 1, offset: .18 },
          { transform: `translate(${from.x * .1}px, ${from.y * .08}px) scale(1.08) rotate(6deg)`, offset: .72 },
          { transform: 'translate(0,0) scale(1) rotate(0deg)', opacity: 1 },
        ], DURATION.drop, { easing: 'cubic-bezier(.34,1.25,.64,1)' }),
      ]);
      sfx.drop();
    },

    async shake(step) {
      const swing = 7 + step.tension * 5;
      sfx.shake(step.tension);
      await animate(els.capsule, [
        { transform: 'rotate(0deg)' },
        { transform: `rotate(-${swing}deg) translateX(-${swing / 2}px)` },
        { transform: `rotate(${swing}deg) translateX(${swing / 2}px)` },
        { transform: `rotate(-${swing}deg) translateX(-${swing / 2}px)` },
        { transform: 'rotate(0deg)' },
      ], DURATION.shake, { easing: 'ease-in-out' });
    },

    async upgrade(step) {
      const index = Math.max(0, RARITIES.indexOf(step.to) - 1);
      sfx.upgrade(index);
      els.capsule.dataset.rarity = step.to;
      spawnParticles(step.to, particleCount('upgrade', index + 1), { near: true });
      const glow = flashAura(step.to, 2.6 + index * 0.5);
      await animate(els.capsule,
        [{ transform: 'scale(1)' }, { transform: 'scale(1.28)', offset: 0.45 }, { transform: 'scale(1)' }],
        DURATION.upgrade, { easing: 'cubic-bezier(.34,1.4,.64,1)' });
      await glow;
    },

    async crack(step) {
      sfx.crack();
      await Promise.all([
        animate(els.top,
          [{ transform: 'translateY(0) rotate(0)' }, { transform: 'translateY(-150px) rotate(-38deg)', opacity: 0 }],
          DURATION.crack),
        animate(els.bottom,
          [{ transform: 'translateY(0) rotate(0)' }, { transform: 'translateY(110px) rotate(20deg)', opacity: 0 }],
          DURATION.crack),
      ]);
    },

    async burst(step) {
      const level = RARITIES.indexOf(step.rarity);
      sfx.burst(level);
      spawnParticles(step.rarity, particleCount('burst', level));
      await flashAura(step.rarity, 3.4 + level * 0.8);
    },

    async show(step) {
      // 先換好等級,等這張外框圖解碼完才讓卡片出現(最多等 2 秒,等不到照樣顯示)。
      // 卡片還 hidden 時 getComputedStyle 一樣拿得到 background-image 的網址。
      els.card.dataset.rarity = step.rarity;
      const frameUrl = cssUrl(getComputedStyle(els.card).backgroundImage);
      const frameReady = await waitForImage(frameUrl);
      // 網路很慢、2 秒還沒到:先用保底外觀(奶油色圓角卡片),圖一到就換上外框
      els.card.classList.toggle('is-frame-loading', !frameReady);
      if (!frameReady) {
        waitForImage(frameUrl, { timeout: 60000 }).then(ok => {
          if (ok && els.card.dataset.rarity === step.rarity) els.card.classList.remove('is-frame-loading');
        });
      }
      els.capsule.hidden = true;
      els.card.hidden = false;
      els.cardName.textContent = step.prize?.name ?? '';
      // 標籤顯示稀有度代號(N / R / SR / SSR / UR),使用者 2026-10-01 指定
      els.cardBadge.textContent = step.rarity;
      els.cardBadge.dataset.rarity = step.rarity;
      // 卡片是固定大小的外框圖,名字太長就縮字(要在卡片顯示之後量)
      fitText(els.cardName, els.cardName.parentElement, { max: 44, min: 18 });
      await animate(els.card,
        [{ transform: 'scale(.6) translateY(20px)', opacity: 0 }, { transform: 'scale(1) translateY(0)', opacity: 1 }],
        DURATION.show, { easing: 'cubic-bezier(.34,1.5,.64,1)' });
    },
  };

  return {
    get isPlaying() { return playing; },
    // 跳過要連「正在播的這一步」一起結束,不然點了還要等它跑完
    requestSkip() {
      if (!playing) return;
      skipping = true;
      [...running].forEach(entry => entry.finish());
    },

    async play(steps) {
      playing = true;
      skipping = false;
      reset();
      try {
        for (const step of steps) {
          await stepHandlers[step.type](step);
        }
      } finally {
        playing = false;
        skipping = false;
      }
    },

    clear: reset,
  };
}
