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
