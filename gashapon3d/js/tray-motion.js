// 托盤搖動的曲線(2026-10-02:搖動改成「真的搖托盤」,球怎麼動交給物理算)。
// 不 import three,Node 測得到。
//
// 左右:x = A · e(t) · sin(ωt);上下:y = B · e(t) · sin²(ωt) —— 每甩一邊托盤就往上頂一下。
// e(t) = (1 − t/D)²:幅度一下比一下小,到 D 秒時位移跟速度同時歸零,托盤停回原位不會頓一下。
// 物理在托盤座標系裡算,球感受到的慣性力是 −托盤加速度,所以加速度要給**解析解**,
// 跟畫面上的位移完全一致。

export const SHAKE_SECONDS = 0.8;
export const SHAKE_AMP = 0.28;        // 左右幅度(場景單位;蛋的半徑是 0.5)
export const SHAKE_LIFT = 0.12;       // 上下幅度
const OMEGA = 2 * Math.PI * 3;        // 每秒來回 3 次

export function trayShake(t) {
  if (t <= 0 || t >= SHAKE_SECONDS) return { x: 0, y: 0, ax: 0, ay: 0 };
  const D = SHAKE_SECONDS;
  const u = 1 - t / D;
  const e = u * u;
  const e1 = (-2 * u) / D;
  const e2 = 2 / (D * D);

  const s = Math.sin(OMEGA * t);
  const c = Math.cos(OMEGA * t);
  const x = SHAKE_AMP * e * s;
  const ax = SHAKE_AMP * (e2 * s + 2 * e1 * OMEGA * c - e * OMEGA * OMEGA * s);

  const q = s * s;                                   // sin²(ωt)
  const q1 = OMEGA * Math.sin(2 * OMEGA * t);
  const q2 = 2 * OMEGA * OMEGA * Math.cos(2 * OMEGA * t);
  const y = SHAKE_LIFT * e * q;
  const ay = SHAKE_LIFT * (e2 * q + 2 * e1 * q1 + e * q2);

  return { x, y, ax, ay };
}
