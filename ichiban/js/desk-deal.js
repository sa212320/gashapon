// 開場動畫(2026-10-02):籤從盒子裡一張一張飛出來排到桌上。全部是純函式。
//
// 只是演出,不存任何東西:桌面的最終排列(按鈕位置)在動畫開始前就算好了,
// 這裡只回答「第幾毫秒、這張籤畫在哪裡」。

export const FLIGHT_MS = 450;   // 每張飛多久
const GAP_MS = 80;              // 張數少時,一張接一張的間隔
const LAST_START_MS = 2500;     // 張數多時,最後一張最晚在這時候出發
const SPIN = 540;               // 飛行途中轉的角度(一圈半)

// 照號碼排出發時間。張數多就縮短間隔,不讓小孩等十幾秒。
export function dealPlan(slots) {
  const sorted = [...slots].sort((a, b) => a.no - b.no);
  const n = sorted.length;
  const gap = n > 1 ? Math.min(GAP_MS, LAST_START_MS / (n - 1)) : 0;
  return sorted.map((s, i) => ({ ...s, start: Math.round(i * gap), duration: FLIGHT_MS }));
}

export function dealLength(plan) {
  return plan.length ? plan.at(-1).start + plan.at(-1).duration : 0;
}

const easeOut = t => 1 - (1 - t) ** 3;

// t = 0 在盒口(很小),t = 1 落在格子裡(全尺寸、停在自己的歪斜角度)。
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
