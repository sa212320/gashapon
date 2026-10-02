// 緞帶軌跡的折線計算(2026-10-02 改版)。不碰 three,node 測得到。
//
// 路線來自 race.js pathOf → track.js toWorld:每段都跟座標軸平行,
// 而且水平段只有一格、不會兩段水平相連(同一列不會有相鄰橫槓)。
// 一根橫槓會被兩個人走過(一個往左、一個往右)—— 依前進方向偏到兩側,緞帶才會並排、不互相蓋掉。

export const snowWidth = laneW => laneW * 0.3;
export const ribbonWidth = laneW => laneW * 0.17;

export function offsetRoute(pts, off) {
  const out = pts.map(p => ({ ...p }));
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    if (a.z !== b.z || a.x === b.x) continue;
    const dz = b.x > a.x ? off : -off;   // 往右偏前(+z,靠鏡頭)、往左偏後
    out[i - 1].z = a.z + dz;
    out[i].z = b.z + dz;
  }
  return out;
}

export function pathLength(pts) {
  let total = 0;
  for (let i = 1; i < pts.length; i++) total += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z);
  return total;
}

export function roundCorners(pts, radius, steps = 6) {
  if (pts.length < 3) return pts.map(p => ({ ...p }));
  const out = [{ ...pts[0] }];
  for (let i = 1; i < pts.length - 1; i++) {
    const p = pts[i - 1];
    const c = pts[i];
    const n = pts[i + 1];
    const l1 = Math.hypot(c.x - p.x, c.z - p.z);
    const l2 = Math.hypot(n.x - c.x, n.z - c.z);
    const r = Math.min(radius, l1 / 2, l2 / 2);
    if (r <= 1e-9) { out.push({ ...c }); continue; }
    const a = { x: c.x + ((p.x - c.x) / l1) * r, z: c.z + ((p.z - c.z) / l1) * r };
    const b = { x: c.x + ((n.x - c.x) / l2) * r, z: c.z + ((n.z - c.z) / l2) * r };
    // 二次貝茲(控制點 = 轉角):直角時就是很接近圓弧的弧線
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      const u = 1 - t;
      out.push({ x: u * u * a.x + 2 * u * t * c.x + t * t * b.x, z: u * u * a.z + 2 * u * t * c.z + t * t * b.z });
    }
  }
  out.push({ ...pts.at(-1) });
  return out;
}

export function cutAt(pts, dist) {
  const out = [{ ...pts[0] }];
  let left = Math.max(0, dist);
  for (let i = 1; i < pts.length && left > 0; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    const len = Math.hypot(b.x - a.x, b.z - a.z);
    if (len <= left) { out.push({ ...b }); left -= len; continue; }
    const k = left / len;
    out.push({ x: a.x + (b.x - a.x) * k, z: a.z + (b.z - a.z) * k });
    left = 0;
  }
  return out;
}

export function stripData(pts, width, y) {
  const position = [];
  const index = [];
  const half = width / 2;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[Math.max(0, i - 1)];
    const b = pts[Math.min(pts.length - 1, i + 1)];
    let dx = b.x - a.x;
    let dz = b.z - a.z;
    const len = Math.hypot(dx, dz) || 1;
    dx /= len; dz /= len;
    // 法線 = 方向轉 90°
    position.push(pts[i].x - dz * half, y, pts[i].z + dx * half, pts[i].x + dz * half, y, pts[i].z - dx * half);
    if (i > 0) {
      const k = (i - 1) * 2;
      index.push(k, k + 1, k + 2, k + 1, k + 3, k + 2);
    }
  }
  return { position, index };
}
