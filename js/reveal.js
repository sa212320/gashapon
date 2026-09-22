// 演出播放器。它只負責把 gacha.js 已經決定好的 revealSteps 播出來,
// 不做任何隨機、不決定任何結果。
import { RARITIES, RARITY_META } from './constants.js';
import { sfx } from './sound.js';

const DURATION = {
  drop: 700, shake: 360, upgrade: 480, crack: 420, burst: 900, show: 320,
};

const prefersReducedMotion = () =>
  globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

export function createRevealer(els) {
  let skipping = false;
  let playing = false;
  const running = new Set();

  const isSkipping = () => skipping || prefersReducedMotion();

  // 分頁被切到背景時瀏覽器會暫停動畫,anim.finished 就永遠不會 resolve。
  // 小孩切去別的 App 再切回來不能卡死在遮罩上,所以補一道逾時保險。
  function animate(el, keyframes, duration, options = {}) {
    const ms = isSkipping() ? 1 : duration;
    const anim = el.animate(keyframes, {
      easing: 'ease-out',
      fill: 'forwards',
      ...options,
      duration: ms,
    });
    running.add(anim);

    const settled = anim.finished.catch(() => {});
    const guard = new Promise(resolve => setTimeout(resolve, ms + 1500));

    return Promise.race([settled, guard]).then(() => {
      try { anim.finish(); } catch { /* 已經結束了 */ }
      running.delete(anim);
    });
  }

  function reset() {
    els.capsule.hidden = false;
    els.capsule.dataset.rarity = 'N';
    els.capsule.style.transform = 'translateY(-46vh)';
    els.top.style.transform = '';
    els.bottom.style.transform = '';
    els.top.style.opacity = '1';
    els.bottom.style.opacity = '1';
    els.capsule.style.opacity = '1';
    els.aura.hidden = true;
    els.aura.dataset.rarity = 'N';
    els.particles.replaceChildren();
    els.card.hidden = true;
    els.card.style.opacity = '';
    els.card.style.transform = '';
  }

  async function flashAura(rarity, scale) {
    els.aura.hidden = false;
    els.aura.dataset.rarity = rarity;
    await animate(els.aura,
      [{ transform: 'scale(.2)', opacity: 0.9 }, { transform: `scale(${scale})`, opacity: 0 }],
      isSkipping() ? 1 : 520);
    els.aura.hidden = true;
  }

  function spawnParticles(rarity, amount) {
    if (isSkipping()) return;
    const meta = RARITY_META[rarity];
    const frag = document.createDocumentFragment();
    for (let i = 0; i < amount; i++) {
      const dot = document.createElement('span');
      dot.className = 'particle';
      if (rarity === 'UR') dot.classList.add('particle--rainbow');
      else dot.style.background = meta.color;
      frag.appendChild(dot);
      const angle = (Math.PI * 2 * i) / amount + Math.random() * 0.4;
      const distance = 120 + Math.random() * 220;
      dot.animate([
        { transform: 'translate(0,0) scale(1)', opacity: 1 },
        {
          transform: `translate(${Math.cos(angle) * distance}px, ${Math.sin(angle) * distance}px) scale(0)`,
          opacity: 0,
        },
      ], { duration: 700 + Math.random() * 500, easing: 'cubic-bezier(.2,.7,.4,1)', fill: 'forwards' });
    }
    els.particles.appendChild(frag);
    setTimeout(() => els.particles.replaceChildren(), 1400);
  }

  const stepHandlers = {
    async drop() {
      sfx.crank();
      await animate(els.capsule,
        [{ transform: 'translateY(-46vh) rotate(-25deg)' },
         { transform: 'translateY(6px) rotate(8deg)', offset: 0.72 },
         { transform: 'translateY(0) rotate(0deg)' }],
        DURATION.drop, { easing: 'cubic-bezier(.34,1.3,.64,1)' });
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
      spawnParticles(step.rarity, 18 + level * 12);
      await flashAura(step.rarity, 3.4 + level * 0.8);
    },

    async show(step) {
      els.capsule.hidden = true;
      els.card.hidden = false;
      els.card.dataset.rarity = step.rarity;
      els.cardName.textContent = step.prize?.name ?? '';
      els.cardBadge.textContent = RARITY_META[step.rarity].label;
      els.cardBadge.dataset.rarity = step.rarity;
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
      running.forEach(anim => { try { anim.finish(); } catch { /* 已經結束了 */ } });
    },

    async play(steps) {
      playing = true;
      skipping = false;
      running.clear();
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
