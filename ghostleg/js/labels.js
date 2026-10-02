// 頭上名牌的排版。名字才是識別(顏色會重複、有人分不出紅綠),所以名牌一定要讀得到。

// 人多的時候車道變窄,名牌會疊成一排 —— 相鄰的一高一低錯開。8 人以內車道寬是固定的,不用錯。
export function tagLift(lane, lanes) {
  return lanes > 8 && lane % 2 === 1 ? 1 : 0;
}

// 名字最多 10 字(設定裡 maxLength = 10),長的縮字,不要撐爆名牌
export function tagFontSize(name) {
  const n = [...name].length;
  return n <= 4 ? 30 : n <= 7 ? 26 : 22;
}

// 立牌與名牌的高度(單位:世界座標;w = 車道寬)。scene-parts.js 照這些數字蓋,track.js 照 tagY 擺名牌。
export const SNOW_H = 0.1;      // 雪路厚度,立牌踩在雪路上
export const BASE_H = 0.12;     // 戰棋底座高(× w)
export const STANDEE_H = 1.2;   // 動物圖高(× w)
export const TAG_H = 0.31;      // 名牌高(× w)

// 動物腳踩在底座上面一點(底座頂 = SNOW_H + BASE_H·w·1.2)
export const standeeFoot = w => SNOW_H + BASE_H * w * 1.2;
export const standeeTop = w => standeeFoot(w) + STANDEE_H * w;

// 名牌浮在頭頂上方,不能擋到棋子(2026-10-02 使用者:「名字擋著旗子了」);lift 是人多時的交錯高度
// 間距 0.15w:鏡頭往下看,垂直距離在畫面上會被壓扁,0.06w 時還是會碰到鹿角、兔耳
export const tagY = (w, lift = 0) => standeeTop(w) + 0.15 * w + (TAG_H * w) / 2 + lift;
