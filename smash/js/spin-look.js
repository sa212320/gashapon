// 陀螺在畫面上怎麼轉。
//
// 車輪效應:刃一格一格畫,每格轉的角度接近刃的間距時看起來像停住、超過半個間距像倒轉。
// 最密的是防禦型外框的 12 個凸起(間距 0.52 rad),所以 60 fps 時每格要小於 0.26 rad。
// 物理的轉速照實畫(最高約每秒 58 rad)一定會撞上,所以畫面另外對應一個慢很多的轉速:
// 剩餘轉速 0 → 1 對應每秒 DRAW_MIN → DRAW_MAX rad,整段都看得出快慢(轉速就是命);
// 「轉很快」的感覺交給隊伍色的模糊圈。
export const DRAW_MIN = 4;
export const DRAW_MAX = 14;
export const MAX_TURN = 0.25;   // 保險:掉格(30 fps)時每格也不超過這麼多

export function drawnRate(spin) {
  const s = Math.min(1, Math.max(0, spin));
  return DRAW_MIN + (DRAW_MAX - DRAW_MIN) * s ** 1.5;
}

export function visibleTurn(rate, dt) {
  return Math.min(rate * dt, MAX_TURN);
}

// 模糊圈的透明度:剛射出去最明顯,剩一半以下就淡掉,刃的形狀露出來
export function blurAlpha(spin) {
  return 0.45 * Math.min(1, Math.max(0, (spin - 0.4) / 0.45));
}
