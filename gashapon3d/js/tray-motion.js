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

// ---------- 碗的形狀(2026-10-02:托盤改成碗) ----------
// 半徑都是托盤的「基準」單位(scene.js 的 TABLE_BASE = 3.4,實際大小再依顆數水平縮放)。
// 從中心開始整個碗底就是一道圓弧(拋物線)往上翹到碗口 BOWL_RIM、高 BOWL_DEPTH ——
// 2026-10-02 使用者:「中間看起來不像碗,要圓弧凹進去」,原本中間 1.8 以內是平的。
// BOWL_FLAT 留著當「平底半徑」的參數,現在是 0。
// 用拋物線不用四分之一圓:圓弧在碗口是垂直的,斜率無限大,物理會一下把蛋彈飛。
export const BOWL_RIM = 3.28;
export const BOWL_FLAT = 0;
export const BOWL_DEPTH = 0.3;        // = 蛋高(1.0)× 0.3,使用者先選 0.3 看看

export function bowlHeight(r) {
  if (r <= BOWL_FLAT) return 0;
  const u = Math.min(1, (r - BOWL_FLAT) / (BOWL_RIM - BOWL_FLAT));
  return BOWL_DEPTH * u * u;
}

export function bowlSlope(r) {
  if (r <= BOWL_FLAT || r >= BOWL_RIM) return r >= BOWL_RIM ? (2 * BOWL_DEPTH) / (BOWL_RIM - BOWL_FLAT) : 0;
  const w = BOWL_RIM - BOWL_FLAT;
  return (2 * BOWL_DEPTH * (r - BOWL_FLAT)) / (w * w);
}

// 碗實際的深度(場景單位):碗口半徑 × 0.16,最少蛋高(1.0)× 0.3(0.15 → 0.22 → 0.16,使用者看過實機調的)。
// 只看蛋高的話,30 顆蛋時碗寬 12 顆蛋、深 0.3 顆,從遠處看是一片盤子(2026-10-02)。
export function bowlDepth(rimRadius) {
  return Math.max(0.3, rimRadius * 0.16);
}
