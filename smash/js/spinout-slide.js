// 停轉之後的滑行(純畫面:物理那邊出局就把速度歸零了,畫面接著最後一格的速度演完)。
//
// 跑得快的陀螺多半正貼著碗邊的加速軌道在衝,以前「下一步出了碗就歸零」會讓它當場定住、
// 看起來沒有慣性。現在碰到碗邊只擋掉往外的那一段速度(帶一點反彈),沿著邊繼續滑;
// 已經在平台上的,在平台上滑,滑到平台外(牆、口袋)才停。
import { bowlDistance, bowlNormal, zoneAt, ZONE } from './stadium.js';

const EDGE_BOUNCE = 0.3;

// s = { x, y, vx, vy },回傳下一格的 { x, y, vx, vy }(不含減速,減速由呼叫端乘)
export function slideStep(s, dt, radius) {
  let { x, y, vx, vy } = s;
  const inside = (px, py) => bowlDistance(px, py) < -radius;

  if (bowlDistance(x, y) >= 0) {
    // 在平台上
    const nx = x + vx * dt;
    const ny = y + vy * dt;
    if (zoneAt(nx, ny) === ZONE.PLATEAU) return { x: nx, y: ny, vx, vy };
    return { x, y, vx: 0, vy: 0 };
  }

  if (inside(x + vx * dt, y + vy * dt)) return { x: x + vx * dt, y: y + vy * dt, vx, vy };

  // 碰到碗邊:擋掉往外的分量並反彈一點,沿切線繼續
  const n = bowlNormal(x, y);
  const vn = vx * n.x + vy * n.y;
  if (vn > 0) {
    vx -= (1 + EDGE_BOUNCE) * vn * n.x;
    vy -= (1 + EDGE_BOUNCE) * vn * n.y;
  }
  const nx = x + vx * dt;
  const ny = y + vy * dt;
  if (inside(nx, ny) || bowlDistance(nx, ny) < bowlDistance(x, y)) return { x: nx, y: ny, vx, vy };
  return { x, y, vx, vy };
}
