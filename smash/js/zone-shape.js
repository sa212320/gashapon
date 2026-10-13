// 從區域圖描出某幾區的外框,給畫面拉高成立體。純函式,不碰 three.js,Node 測得到。
//
// 做法:沿著格子邊描 —— 區域裡的格子,只要旁邊那格不是同一區,那條邊就是外框;
// 每條邊的方向讓「區域在左手邊」,所以外圈是逆時針、洞是順時針。
// 描出來是 1 單位的階梯:先切角兩次(Chaikin)把階梯磨成曲線,再用 Douglas–Peucker 簡化,
// 頂點數少一個數量級,邊也不會一格一格的。
//
// 每一格用格子中心的 zoneAt 判斷,跟物理完全同一套 —— 看起來是牆的地方就撞得到牆。
import { zoneAt } from './stadium.js';
import { GRID } from './stadium-grid.js';

const SIMPLIFY = 0.9;   // 簡化容許的偏差(單位)
const MIN_AREA = 3;     // 比這小的圈是雜點(單獨一兩格),丟掉

export function polygonArea(pts) {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const q = pts[(i + 1) % pts.length];
    a += p.x * q.y - q.x * p.y;
  }
  return a / 2;
}

function distToSegment(p, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const l2 = dx * dx + dy * dy;
  if (l2 === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2));
  return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy);
}

function simplifyOpen(pts, eps) {
  if (pts.length < 3) return pts;
  let far = 0;
  let idx = 0;
  for (let i = 1; i < pts.length - 1; i++) {
    const d = distToSegment(pts[i], pts[0], pts[pts.length - 1]);
    if (d > far) { far = d; idx = i; }
  }
  if (far <= eps) return [pts[0], pts[pts.length - 1]];
  const left = simplifyOpen(pts.slice(0, idx + 1), eps);
  const right = simplifyOpen(pts.slice(idx), eps);
  return [...left.slice(0, -1), ...right];
}

// 切角:每條邊取 1/4 與 3/4 兩點,階梯就變圓滑
function chaikin(pts) {
  const out = [];
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const q = pts[(i + 1) % pts.length];
    out.push({ x: p.x * 0.75 + q.x * 0.25, y: p.y * 0.75 + q.y * 0.25 });
    out.push({ x: p.x * 0.25 + q.x * 0.75, y: p.y * 0.25 + q.y * 0.75 });
  }
  return out;
}

// 閉合的圈:從離第一點最遠的那一點切成兩段,各自簡化再接回去
function simplifyLoop(pts, eps) {
  let far = 0;
  let idx = 0;
  for (let i = 1; i < pts.length; i++) {
    const d = Math.hypot(pts[i].x - pts[0].x, pts[i].y - pts[0].y);
    if (d > far) { far = d; idx = i; }
  }
  const a = simplifyOpen(pts.slice(0, idx + 1), eps);
  const b = simplifyOpen([...pts.slice(idx), pts[0]], eps);
  return [...a.slice(0, -1), ...b.slice(0, -1)];
}

// zones:要描的區域代號陣列。回傳 [{ points: [{x, y}], hole }](x、y 是物理座標)
export function zoneLoops(zones) {
  const want = new Set(zones);
  const inside = (i, j) => i >= 0 && j >= 0 && i < GRID.w && j < GRID.h
    && want.has(zoneAt(GRID.x0 + i + 0.5, GRID.y0 + j + 0.5));
  const mask = new Uint8Array(GRID.w * GRID.h);
  for (let j = 0; j < GRID.h; j++) for (let i = 0; i < GRID.w; i++) mask[j * GRID.w + i] = inside(i, j) ? 1 : 0;
  const at = (i, j) => i >= 0 && j >= 0 && i < GRID.w && j < GRID.h && mask[j * GRID.w + i] === 1;

  // 邊:起點 → 終點(格子角的座標,整數)
  const out = new Map();
  const key = (i, j) => `${i},${j}`;
  const addEdge = (a, b) => {
    const k = key(...a);
    if (!out.has(k)) out.set(k, []);
    out.get(k).push(b);
  };
  for (let j = 0; j < GRID.h; j++) {
    for (let i = 0; i < GRID.w; i++) {
      if (!at(i, j)) continue;
      if (!at(i, j - 1)) addEdge([i, j], [i + 1, j]);
      if (!at(i + 1, j)) addEdge([i + 1, j], [i + 1, j + 1]);
      if (!at(i, j + 1)) addEdge([i + 1, j + 1], [i, j + 1]);
      if (!at(i - 1, j)) addEdge([i, j + 1], [i, j]);
    }
  }

  const loops = [];
  for (const [start] of out) {
    while (out.get(start)?.length) {
      const pts = [];
      let cur = start.split(',').map(Number);
      let dir = null;
      for (;;) {
        pts.push({ x: GRID.x0 + cur[0], y: GRID.y0 + cur[1] });
        const list = out.get(key(...cur));
        if (!list?.length) break;
        // 兩塊區域只在對角碰到時,這個點會有兩條出去的邊:一律往右轉,
        // 兩塊才會各自描成一圈(不然會串成 8 字形,洞也被併進外圈)
        let pick = list.length - 1;
        if (dir && list.length > 1) {
          let best = Infinity;
          list.forEach((n, i) => {
            const turn = dir[0] * (n[1] - cur[1]) - dir[1] * (n[0] - cur[0]);   // 左轉為正
            if (turn < best) { best = turn; pick = i; }
          });
        }
        const nxt = list.splice(pick, 1)[0];
        if (!list.length) out.delete(key(...cur));
        dir = [nxt[0] - cur[0], nxt[1] - cur[1]];
        cur = nxt;
        if (key(...cur) === start) break;
      }
      if (pts.length < 3) continue;
      const simple = simplifyLoop(chaikin(chaikin(pts)), SIMPLIFY);
      if (simple.length < 3 || Math.abs(polygonArea(simple)) < MIN_AREA) continue;
      loops.push({ points: simple, hole: polygonArea(simple) < 0 });
    }
  }
  return loops;
}
