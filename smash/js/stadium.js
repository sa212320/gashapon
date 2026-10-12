// 大亂鬥的對戰盤(Beyblade X 式)。**物理與畫面共用這一份** ——
// 牆、口袋、坡度、軌道只在這裡定義;scene 那邊的網格也是從這些函式產生的。
// 兩邊各自寫一套的話,遲早會出現「看起來還在牆內,其實已經出局」。
//
// 座標:物理的 (x, y) 對應畫面的 (x, z),+y 是靠鏡頭那一側 —— 口袋都在這邊,
// 鏡頭從斜前方看下來,陀螺是朝著觀眾被撞進口袋的。

export const HALF = 100;          // 盤子半寬
export const CORNER = 30;         // 圓角半徑
const STRAIGHT = HALF - CORNER;   // 每一邊直線段的半長(70)

export const DEPTH = 14;          // 牆邊比中央高多少(碗的深度)
export const FLAT = 0.35;         // 中央平坦區佔多少(以「離牆距離 / HALF」計)
export const SLOPE_ACCEL = 140;   // 牆邊的坡度推力(往內)
export const WALL_BOUNCE = 0.7;   // 撞牆的反彈係數

export const RAIL_WIDTH = 10;     // 加速軌道的寬度(貼著外牆)
export const RAIL_ACCEL = 220;    // 在軌道上沿切線的加速度
export const RAIL_MAX = 260;      // 沿切線超過這個速度就不再加速
export const RAIL_FLING = 0.45;   // 離開軌道時,往中央甩的比例(乘上當下速度)
const RAIL_GAP = 4;               // 口袋兩側再多斷開多少,免得軌道直接把人送進口袋

export const POCKET_DEPTH = 16;   // 口袋往前牆外側凹多深

// 三個口袋都在前牆的直線段上(|x| ≤ 70)。寬度比例照真盤子:
// Over Zone 12cm(角落)/ Xtreme Zone 19cm(中間)。
export const POCKETS = Object.freeze([
  Object.freeze({ id: 'left', x0: -70, x1: -46 }),
  Object.freeze({ id: 'center', x0: -19, x1: 19 }),
  Object.freeze({ id: 'right', x0: 46, x1: 70 }),
]);

// 圓角方形的距離場:盤內為負,牆上為 0,牆外為正。
export function wallDistance(x, y) {
  const qx = Math.abs(x) - STRAIGHT;
  const qy = Math.abs(y) - STRAIGHT;
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - CORNER;
}

// 離這個點最近的那段牆,朝外的法線。
export function wallNormal(x, y) {
  const qx = Math.abs(x) - STRAIGHT;
  const qy = Math.abs(y) - STRAIGHT;
  const sx = x < 0 ? -1 : 1;
  const sy = y < 0 ? -1 : 1;
  if (qx > 0 && qy > 0) {
    const l = Math.hypot(qx, qy);
    return { x: (sx * qx) / l, y: (sy * qy) / l };
  }
  return qx > qy ? { x: sx, y: 0 } : { x: 0, y: sy };
}

// 這個位置正對著哪一個口袋。只看前牆的直線段 ——
// 圓角那一截是牆,角落的陀螺要被擋回來,不能算掉進口袋。
export function pocketAt(x, y) {
  if (y <= 0 || Math.abs(x) > STRAIGHT) return null;
  if (Math.abs(y) < Math.abs(x)) return null;   // 最近的牆是側牆,不是前牆
  return POCKETS.find(p => x >= p.x0 && x <= p.x1) ?? null;
}

// 0 = 還在平坦區,1 = 牆邊。坡度推力與高度都用這一條。
function slope01(x, y) {
  const s = 1 + wallDistance(x, y) / HALF;
  return Math.min(1, Math.max(0, (s - FLAT) / (1 - FLAT)));
}

// 陀螺站的高度(中央 0)。畫面的盤底網格也用它 —— 推力與凹陷必須是同一條曲線。
export function heightAt(x, y) {
  const t = slope01(x, y);
  return DEPTH * t * t;
}

// 高度是 t² 的碗,斜率跟 t 成正比,所以推力也跟 t 成正比。
export function slopeAccel(x, y) {
  const t = slope01(x, y);
  if (t === 0) return { x: 0, y: 0 };
  const n = wallNormal(x, y);
  return { x: -n.x * SLOPE_ACCEL * t, y: -n.y * SLOPE_ACCEL * t };
}

// 軌道:貼著外牆一圈,口袋前面(含兩側 RAIL_GAP)斷開。
export function onRail(x, y) {
  const d = wallDistance(x, y);
  if (d < -RAIL_WIDTH || d > 0) return false;
  if (y > 0 && Math.abs(y) >= Math.abs(x)) {
    if (POCKETS.some(p => x >= p.x0 - RAIL_GAP && x <= p.x1 + RAIL_GAP)) return false;
  }
  return true;
}

// 順著陀螺原本沿牆移動的方向推;沿切線已經夠快就不推。
export function railAccel(x, y, vx, vy) {
  if (!onRail(x, y)) return { x: 0, y: 0 };
  const n = wallNormal(x, y);
  const tx = -n.y;
  const ty = n.x;
  const along = vx * tx + vy * ty;
  if (Math.abs(along) >= RAIL_MAX) return { x: 0, y: 0 };
  const dir = along >= 0 ? 1 : -1;
  return { x: tx * dir * RAIL_ACCEL, y: ty * dir * RAIL_ACCEL };
}

// 掉進口袋後停在哪裡:口袋範圍內、前牆線外側的中間。
export function pocketRest(pocket, x) {
  return {
    x: Math.min(pocket.x1 - 4, Math.max(pocket.x0 + 4, x)),
    y: HALF + POCKET_DEPTH / 2,
  };
}

// 盤內隨機一點,離牆至少 margin(拒絕取樣;盤子幾乎填滿外接正方形,很快就中)。
export function randomSpot(rng, margin) {
  for (;;) {
    const x = (rng() * 2 - 1) * HALF;
    const y = (rng() * 2 - 1) * HALF;
    if (wallDistance(x, y) <= -margin) return { x, y };
  }
}

// 沿外牆一圈的點(逆時針,從右牆中點開始)。n = 每個圓角切幾段。
export function wallPath(n = 16) {
  const pts = [];
  const corners = [[1, 1], [-1, 1], [-1, -1], [1, -1]];
  for (let k = 0; k < 4; k++) {
    const [sx, sy] = corners[k];
    const start = (k * Math.PI) / 2;
    for (let i = 0; i <= n; i++) {
      const a = start + (i / n) * (Math.PI / 2);
      pts.push({ x: sx * STRAIGHT + Math.cos(a) * CORNER, y: sy * STRAIGHT + Math.sin(a) * CORNER });
    }
  }
  return pts;
}
