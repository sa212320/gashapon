// 揭曉演出的雪花粒子與光暈(2026-10-02 從扭蛋機頁抽出來,立體扭蛋機也用)。
// 只負責「在給定的容器裡噴、閃」;容器擺在哪裡由呼叫端決定 ——
// 2D 是畫面正中央的蛋,3D 是蛋投影到螢幕上的位置。
import { RARITY_META } from '../../gashapon/js/constants.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
// 雪花 <symbol id="snowflake"> 自己有 viewBox;外層 svg 的 viewBox 要從 0 開始,
// 不然 <use> 預設放在 (0,0) 會落在外層的正中央,整朵往右下偏半個身位。

// 演出的雪花粒子數量。升階時噴一小圈(2026-10-01 加入),一階比一階熱鬧;
// 最後爆開那一下維持原本的數量,永遠比升階多 —— 最後一下要最盛大。
// level 是稀有度在 RARITIES 裡的位置(N 0 … UR 4)。
export function particleCount(kind, level) {
  return kind === 'upgrade' ? 2 + level * 4 : 18 + level * 12;
}

// 沒給 animate 時用這個:動畫結束或逾時先到先算 ——
// 分頁在背景時瀏覽器不跑 rendering step,anim.finished 永遠不會 settle。
function defaultAnimate(el, keyframes, ms) {
  const anim = el.animate(keyframes, { easing: 'ease-out', fill: 'forwards', duration: ms });
  return new Promise(resolve => {
    const timer = setTimeout(resolve, ms + 1500);
    const done = () => { clearTimeout(timer); resolve(); };
    anim.finished.then(done, done);
  });
}

export function createRevealFx({ aura, particles, animate = defaultAnimate, isSkipping = () => false }) {
  async function flashAura(rarity, scale) {
    aura.hidden = false;
    aura.dataset.rarity = rarity;
    await animate(aura,
      [{ transform: 'scale(.2)', opacity: 0.9 }, { transform: `scale(${scale})`, opacity: 0 }],
      isSkipping() ? 1 : 520);
    aura.hidden = true;
  }

  // 雪花粒子(2026-10-01 從圓點改成雪花,呼應冰雪主題)。顏色是稀有度色,UR 每顆隨機一個色相。
  // near = 升階那一小圈;最後爆開飛得比較遠。
  // 每顆動畫結束就自己移除 —— 升階會連續噴好幾次,不能用「幾秒後清空整個容器」,
  // 不然前一次的計時器會把下一次剛噴出來的雪花清掉。
  function spawnParticles(rarity, amount, { near = false } = {}) {
    if (isSkipping()) return;
    const meta = RARITY_META[rarity];
    const frag = document.createDocumentFragment();
    for (let i = 0; i < amount; i++) {
      const flake = document.createElementNS(SVG_NS, 'svg');
      flake.setAttribute('class', 'particle particle--snow');
      flake.setAttribute('viewBox', '0 0 24 24');
      const use = document.createElementNS(SVG_NS, 'use');
      use.setAttribute('href', '#snowflake');
      flake.appendChild(use);
      flake.style.color = rarity === 'UR' ? `hsl(${Math.round(Math.random() * 360)}, 90%, 68%)` : meta.color;
      frag.appendChild(flake);
      const angle = (Math.PI * 2 * i) / amount + Math.random() * 0.4;
      const distance = near ? 100 + Math.random() * 90 : 120 + Math.random() * 220;
      const spin = (Math.random() - 0.5) * 360;
      const dx = Math.cos(angle) * distance;
      const dy = Math.sin(angle) * distance;
      // 前 60% 保持清楚(放大到 1.1 倍、不透明)往外飛,最後才縮小淡出 ——
      // 一開始就縮的話,飛出蛋的範圍時已經小到看不見
      const anim = flake.animate([
        { transform: 'translate(0,0) rotate(0deg) scale(.6)', opacity: 1 },
        { transform: `translate(${dx * .7}px, ${dy * .7}px) rotate(${spin * .6}deg) scale(1.1)`, opacity: 1, offset: .6 },
        { transform: `translate(${dx}px, ${dy}px) rotate(${spin}deg) scale(.3)`, opacity: 0 },
      ], { duration: (near ? 750 : 900) + Math.random() * 400, easing: 'cubic-bezier(.25,.6,.4,1)', fill: 'forwards' });
      anim.finished.then(() => flake.remove(), () => flake.remove());
    }
    particles.appendChild(frag);
  }

  return { flashAura, spawnParticles };
}
