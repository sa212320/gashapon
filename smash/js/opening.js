// 開場倒數。純函式:給經過的秒數,回傳該顯示什麼、陀螺落下到哪。
// 「3、2、1,Go Shoot!」是戰鬥陀螺最經典的口號,看過動畫的小孩會跟著喊。
const STEP = 0.5;
const LABELS = ['3', '2', '1', 'Go Shoot!'];
export const OPENING_TIME = STEP * LABELS.length;

export function openingAt(t) {
  if (t >= OPENING_TIME) return { label: null, index: -1, drop: 1, done: true };
  const index = Math.min(LABELS.length - 1, Math.floor(Math.max(0, t) / STEP));
  const drop = index < LABELS.length - 1 ? 0 : (t - STEP * (LABELS.length - 1)) / STEP;
  return { label: LABELS[index], index, drop, done: false };
}
