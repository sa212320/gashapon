// 逐格特效(撞擊火花、飛彈爆炸)是一列 frames 格的橫條:演出進度 k(0~1)→ 播第幾格。
export function fxFrame(k, frames) {
  return Math.min(frames - 1, Math.max(0, Math.floor(k * frames)));
}
