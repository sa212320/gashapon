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

// 開場的陀螺與影子:倒數時陀螺還掛在畫面外的上方,什麼都不畫(只畫影子的話,盤面上會是一堆灰點);
// Go Shoot! 落下時影子跟著變大變深(shadow 0~1),落地就是正常的影子。
export function landing(drop) {
  if (drop <= 0) return { visible: false, shadow: 0 };
  return { visible: true, shadow: Math.min(1, drop) };
}
