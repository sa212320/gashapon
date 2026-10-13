// 畫面上每一格陀螺轉多少。物理的轉速最高約 58 rad/s,照實畫會出現「車輪效應」:
// 攻擊型 8 片刃一片相隔 0.785 rad,60 fps 下每格剛好轉這麼多時刃看起來停住,再快一點像倒轉。
// 每格最多轉 MAX_TURN(遠小於半個刃間距),更快的感覺交給模糊圈。
export const MAX_TURN = 0.3;

export function visibleTurn(rate, dt) {
  return Math.min(rate * dt, MAX_TURN);
}
