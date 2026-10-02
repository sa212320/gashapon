// 頭上名牌的排版。名字才是識別(顏色會重複、有人分不出紅綠),所以名牌一定要讀得到。

// 人多的時候車道變窄,名牌會疊成一排 —— 相鄰的一前一後錯開。8 人以內車道寬是固定的,不用錯。
export function tagLift(lane, lanes) {
  return lanes > 8 && lane % 2 === 1 ? 1 : 0;
}

// 名字最多 10 字(設定裡 maxLength = 10),長的縮字,不要撐爆名牌
export function tagFontSize(name) {
  const n = [...name].length;
  return n <= 4 ? 30 : n <= 7 ? 26 : 22;
}

// 立牌與名牌的高度(單位:世界座標;w = 車道寬)。scene-parts.js 照這些數字蓋,track.js 照 tagPlace 擺名牌。
export const SNOW_H = 0.1;      // 雪路厚度,立牌踩在雪路上
export const BASE_H = 0.12;     // 戰棋底座高(× w)
export const STANDEE_H = 1.2;   // 動物圖高(× w)
export const TAG_H = 0.31;      // 名牌高(× w)

// 動物腳踩在底座上面一點(底座頂 = SNOW_H + BASE_H·w·1.2)
export const BASE_R = 0.32;     // 戰棋底座半徑(× w);外圈深棕再大 16%
export const standeeFoot = w => SNOW_H + BASE_H * w * 1.2;

// 名牌放在戰棋底座正前方,像公仔底座前面的名條(2026-10-02 使用者:「還是名字直接在下方啊」)。
// 放頭頂會擋到棋子、也會被亂飛的獎品蓋住。人多時(stagger = 1)往前再挪一格錯開 ——
// 不能用一高一低,高了又會擋到棋子。回傳相對於立牌位置的 { y, z }。
export function tagPlace(w, stagger = 0) {
  return {
    y: SNOW_H + (TAG_H * w) / 2 + 0.02,
    z: BASE_R * w * 1.16 + TAG_H * w * 0.55 + stagger * TAG_H * w * 1.1,
  };
}

// 開跑前疊在畫面上的大字名牌(HTML,不受 3D 透視縮小)。2026-10-02:投影到黑板時 3D 名牌只剩 10px,
// 後排學生看不到;開跑前看清楚「誰站哪裡」就好,開跑後學生會自己盯自己的棋子(收回成底座前的小名牌)。
//   字高 = 畫面高度 3%(1080p ≈ 32px),手機至少 16px
//   名字一律全名 —— 截成「王…」看不出是誰(使用者)
//   一律是起跑線的特寫(2026-10-02 使用者:「人少也用掃描的,統一」):
//   只框 frameLanes 條車道(最多一半的人、上限 8),鏡頭左右來回掃(camera-script.js scanX)
//   一條車道放不下全名就相鄰一前一後錯開成兩排
export function namePlan({ viewW, viewH, lanes, longestChars }) {
  const fontPx = Math.max(16, viewH * 0.03);
  const nameW = longestChars * fontPx + fontPx * 0.7 + 6;   // 字 + 左右各 .35em 內距 + 框 3px×2
  const usable = viewW * 0.92;
  // 一排放得下就一排;不然錯開兩排,每個名字可用兩條車道寬
  const oneRow = Math.floor(usable / (nameW / 0.95));
  const twoRows = Math.floor(usable / (nameW / (2 * 0.95)));
  // 特寫一次最多框一半的人、上限 8 條(使用者:「特寫會放大,不應該是停在中間吧」),4 人以上一定會掃
  const zoom = Math.min(8, Math.ceil(lanes / 2));
  const frameLanes = Math.max(2, Math.min(lanes, zoom, oneRow >= zoom ? zoom : twoRows));
  const rows = (usable / frameLanes) * 0.95 >= nameW ? 1 : 2;
  return { fontPx, rows, frameLanes };
}
