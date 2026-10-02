// 開場動畫(2026-10-02):抽獎箱搖一搖,籤從洞口一波 1~3 張飛出來排到桌上。全部是純函式。
//
// 只是演出,不存任何東西:桌面的最終排列(按鈕位置)在動畫開始前就算好了,
// 這裡只回答「第幾毫秒、這張籤畫在哪裡」。

export const FLIGHT_MS = 450;   // 每張飛多久
export const INTRO_MS = 900;    // 抽獎箱彈出 + 搖一搖,搖完才開始飛(CSS 的 deal-box-in 動畫要對得上)
// 搖完、開始飛的同時,箱子往下滑到桌面底部,不擋在籤要飛過去的路上(使用者 2026-10-02)。
// CSS 的 deal-box-down 動畫要對得上(ichiban.css)。
export const SLIDE_MS = 400;
const GAP_MS = 350;             // 張數少時,一發接一發的間隔(拉炮:每一發都要有「砰」的停頓)
const LAST_START_MS = 2500;     // 張數多時,最後一發最晚在搖完後這麼久出發
const SPIN = 540;               // 飛行途中轉的角度(一圈半)

// 像拉炮:每一發 5~8 張同時從洞口噴出來(使用者 2026-10-02,原本一次 1~3 張),整體照號碼。
// 張數多就縮短發與發的間隔,不讓小孩等十幾秒。rng 給測試固定用。
export function dealPlan(slots, rng = Math.random) {
  const sorted = [...slots].sort((a, b) => a.no - b.no);
  const waves = [];
  for (let i = 0; i < sorted.length;) {
    const size = 5 + Math.min(3, Math.floor(rng() * 4));
    waves.push(sorted.slice(i, i + size));
    i += size;
  }
  const gap = waves.length > 1 ? Math.min(GAP_MS, LAST_START_MS / (waves.length - 1)) : 0;
  return waves.flatMap((wave, w) =>
    wave.map(s => ({ ...s, start: Math.round(INTRO_MS + w * gap), duration: FLIGHT_MS })));
}

export function dealLength(plan) {
  return plan.length ? plan.at(-1).start + plan.at(-1).duration : 0;
}

const easeOut = t => 1 - (1 - t) ** 3;

// t = 0 在箱子的洞口(很小),t = 1 落在格子裡(全尺寸、停在自己的歪斜角度)。
// 位置走拋物線:先往上彈再落下,彈多高跟飛多遠有關。
export function flightAt(t, from, to, tilt) {
  const p = Math.min(1, Math.max(0, t));
  const e = easeOut(p);
  const dist = Math.hypot(to.x - from.x, to.y - from.y);
  // 彈太高的話,第一排的籤會先飛出畫面上緣再掉回來(實機看到的),所以只多彈一點
  const lift = Math.max(40, dist * 0.15) * 4 * p * (1 - p);
  return {
    x: from.x + (to.x - from.x) * e,
    y: from.y + (to.y - from.y) * e - lift,
    scale: 0.25 + 0.75 * e,
    rot: tilt + (1 - e) * SPIN,
  };
}

// 箱子(洞口)在第 ms 毫秒的 y:搖的時候在 midY,開始飛之後 SLIDE_MS 內滑到 bottomY。
// 籤從「出發那一刻」箱子洞口的位置飛出去。
export function boxYAt(ms, midY, bottomY) {
  const p = Math.min(1, Math.max(0, (ms - INTRO_MS) / SLIDE_MS));
  const e = 1 - (1 - p) ** 2;
  return midY + (bottomY - midY) * e;
}
