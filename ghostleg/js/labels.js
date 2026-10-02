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
//   一次只框 2 個人,從左掃到右一趟(camera-script.js scanPass),點一下可跳過
//   一條車道放不下全名就相鄰一前一後錯開成兩排
export function namePlan({ viewW, viewH, lanes, longestChars }) {
  // 橫向螢幕的特寫當成正方形構圖(camera-script.js idleFrame),2 條車道只佔畫面中間 ≈ 高度那麼寬
  const usable = Math.min(viewW, viewH) * 0.92;
  const frameLanes = Math.min(lanes, 2);
  // 2 人特寫時動物很大,名字跟著放大(一條車道寬的 16%),上限畫面高 6%、下限 3%(手機至少 16px)
  // —— 固定 3% 時動物跟名字比例很怪(使用者)
  const fontPx = Math.max(16, viewH * 0.03, Math.min((usable / frameLanes) * 0.16, viewH * 0.06));
  const nameW = longestChars * fontPx + fontPx * 0.7 + 6;   // 字 + 左右各 .35em 內距 + 框 3px×2
  // 特寫一次只框 2 個人(使用者:「我以為最多框 2 人,掃描久一點沒關係」),3 人以上一定會掃
  const rows = (usable / frameLanes) * 0.95 >= nameW ? 1 : 2;
  return { fontPx, rows, frameLanes };
}

// 名牌跟著棋子走,滑到邊緣就讓畫面(.name-layer 的 overflow: hidden)切掉;整塊離開畫面才回 null 藏起來。
// 不夾回畫面、也不提早藏:往內夾會撞到隔壁的名牌,整塊放不下就藏則是「碰到邊界突然消失」(使用者)。
// 名字一律縮到一條車道放得下(fitFont),所以照棋子位置擺,同一排不會互相疊。
export function clampTagX(x, tagW, layerW) {
  const half = tagW / 2;
  return x + half > 0 && x - half < layerW ? x : null;
}

// 特寫的安全範圍(畫面高度的比例,給 camera-script.js idleFrame 的 safe):
// 動物頭頂在角落按鈕下面(64px),名牌(含錯開的每一排)在開始鈕上面(畫面底留 110px)
export function closeUpSafe({ viewH, fontPx, rows }) {
  return { top: 64 / viewH, bottom: Math.max(0.3, (viewH - 110 - rows * rowStep(fontPx)) / viewH) };
}

// 全景的安全範圍:最前排名牌的底在開始鈕上面(畫面底留 110px),冰板最遠端在角落按鈕下面(64px)
export function overviewSafe({ viewH }) {
  return { top: 64 / viewH, bottom: (viewH - 110) / viewH };
}

// 照畫面上實際的車道間距縮字:鏡頭為了塞進安全範圍退遠時,車道比 namePlan 估的窄,長名字會疊住。
// 一律全名,只縮字不截短;最小 12px。
// 標準是「一條車道放得下」:名牌要整塊在畫面裡才顯示,2 人特寫時兩隻動物在畫面 1/4、3/4,
// 比一條車道寬的名字兩個都會被藏起來(實測手機上一個名字都沒有)。
export function fitFont({ fontPx, laneSpacingPx, longestChars }) {
  const room = (laneSpacingPx * 0.95 - 6) * 0.9;   // 留 10%:粗體中文實際比 1em 估的寬一點
  return Math.max(12, Math.min(fontPx, room / (longestChars + 0.7)));
}

// 錯開的上下兩排間距 = 名牌實際高度(行高 1.2em + 上下內距 .24em + 框 6px)+ 4px。
// 寫成字高 × 1.7 的話,字縮小時框跟內距沒等比縮,兩排會上下疊住(手機橫拿)
export const rowStep = fontPx => fontPx * 1.44 + 6 + 4;
