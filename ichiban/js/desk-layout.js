// 桌上籤紙的外觀推算與版面計算。全部是純函式。
//
// 外觀(顏色 / 角色 / 歪斜)只看籤的固定號碼 no,不看「剩下的第幾張」——
// 抽走一張,後面的往前補位,但每張的長相不變(2026-10-02 grill 定案)。

// 冷色 7 色(使用者選 C,2026-10-02;原本第 1/4/5 與 3/6 太接近,在冷色範圍內拉開)。
// 顏色的用途是讓相鄰兩張一眼分得出不同張。故意跟 TIER_META 無關 —— 撕開前不能洩漏賞別。
export const DESK_COLORS = Object.freeze([
  '#A9D2F5', // 天空藍
  '#C8B6EE', // 薰衣草
  '#9FE0DA', // 水綠
  '#EEF3FA', // 冰白
  '#B3BCF0', // 長春花藍
  '#C2EBCF', // 薄荷
  '#E8C9EE', // 霜紫粉
]);

export const MIN_CARD_W = 28;
export const MAX_CARD_W = 56;
export const CARD_ASPECT = 34 / 15; // 直放:高 / 寬

// 同一個號碼永遠得到同一個值(sine hash),不用 Math.random()。
function pseudoRandom(seed) {
  const h = Math.sin(seed * 12.9898 + 4.1414) * 43758.5453;
  return h - Math.floor(h);
}

export function faceColorFor(no) {
  return DESK_COLORS[(no - 1) % DESK_COLORS.length];
}

export function critterFor(no) {
  return pseudoRandom(no * 7 + 5) < 0.5 ? 'fox' : 'ermine';
}

// 小幅歪斜:自動縮放後卡片排得很密,歪太多會互疊。
export function tiltFor(no) {
  return Math.round((pseudoRandom(no * 3 + 1) * 8 - 4) * 10) / 10;
}

// 依張數在桌面可見範圍內找「一次放得下全部」的最大卡寬;放不下就停在 MIN_CARD_W 改捲動。
export function layoutDesk({ count, width, height }) {
  const fit = cardW => {
    const cardH = Math.round(cardW * CARD_ASPECT);
    const gap = Math.max(6, Math.round(cardW * 0.22));
    let cols = Math.max(1, Math.floor((width + gap) / (cardW + gap)));
    // 顏色 7 個一輪:欄數是 7 的倍數時同一欄上下同色,相鄰就分不出來了
    if (count > cols && cols > 1 && cols % DESK_COLORS.length === 0) cols -= 1;
    const rows = Math.ceil(count / cols);
    return { cardW, cardH, gap, cols, rows };
  };
  for (let w = MAX_CARD_W; w > MIN_CARD_W; w--) {
    const l = fit(w);
    if (l.rows * l.cardH + Math.max(0, l.rows - 1) * l.gap <= height) return l;
  }
  return fit(MIN_CARD_W);
}
