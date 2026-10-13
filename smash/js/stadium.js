// 大亂鬥的對戰盤(照真的 Beyblade X Xtreme 盤)。**物理與畫面共用這一份** ——
// 碗、軌道、平台、外牆、出口只在這裡定義;scene 那邊的網格也是從這些常數與函式產生的。
// 兩邊各自寫一套的話,遲早會出現「看起來還在牆內,其實已經出局」。
//
// 尺寸來源:MakerWorld 上 Nick__Furry 照 Takara Tomy 原版復刻的 Xtreme 盤 3D 檔(CC BY-NC,
// https://makerworld.com/models/1147551)。零件拼回原位後實測:
//   碗底剖面、軌道形狀 → 這支裡的表格
//   軌道外的平台、方槽、凹槽、高牆 → stadium-grid.js 的區域圖(每格 1 單位)
// 1 單位 = 2.2mm(外殼寬 44cm = 200 單位)。原點 = 碗心(碗偏後、前側留給出口)。
//
// 由內往外:
//   碗底:很平,中間淺、Tornado Ridge 一圈台階、外圈平
//   加速軌道(Xtreme Line):立起來的一圈齒輪牆,前窄後寬,正後方往內凹一個梯形台階
//   軌道外:跟軌道頂一樣高的平台,微微往碗裡斜;最外圈是透明外殼(撞到彈回來)
// 出局:
//   兩個前角的長方槽(Over Zone)—— 外圍一圈邊緣,要夠快才飛得進去
//   軌道正前方外側的凹槽(Xtreme Zone)—— 跳過軌道就掉進去;凹槽外是斜坡與高牆
// 陀螺要夠快才跳得過軌道上到平台。
//
// 座標:物理的 (x, y) 對應畫面的 (x, z),+y 是靠鏡頭那一側(前側)。
// 角度一律用「度」,0° = +x、90° = +y(正前方)、270° = 正後方。
import { GRID } from './stadium-grid.js';

const RAD = Math.PI / 180;

/* ---------- 外殼 ---------- */

export const HALF = 100;          // 外殼半寬(左右各 22cm)
// 整台的外框(畫面取景、透明外殼用),拼好的模型實測:前側斜坡比外殼多凸出一截
export const BOUNDS = Object.freeze({ x0: -101, x1: 101, z0: -90, z1: 124, chamfer: 26, top: 51 });

/* ---------- 碗底 ---------- */

// 碗底剖面(半徑 → 比碗心高多少),3D 檔實測。41~45 那一段是 Tornado Ridge 的台階。
const FLOOR = Object.freeze([
  [0, 0], [9.1, 0.31], [18.2, 0.73], [27.3, 1.3], [36.4, 2.07], [40.9, 2.61],
  [43.2, 3.9], [45.5, 4.47], [50, 4.9], [56.8, 5.45], [63.6, 6.06], [70.5, 6.59],
]);
export const DEPTH = 6.6;         // 碗外圈(與平台)比碗心高多少
export const RIDGE = 43;          // Tornado Ridge 台階的半徑(直徑約 19cm)
export const SLOPE_ACCEL = 60;    // 碗外圈的坡度推力(往內)
export const FLAT = 0.25;         // 碗心這麼大的範圍(佔軌道半徑)沒有推力

/* ---------- 加速軌道 ---------- */

// 軌道外緣的半徑,從正前方開始每 5° 一格到正後方(左右對稱),3D 檔實測。
// 前面窄(75)、兩側最寬(91)、後角 86;正後方 170°~180° 是凹口。
const RAIL_OUT = Object.freeze([
  75.0, 75.1, 75.4, 75.8, 76.5, 77.1, 78.0, 78.9, 79.9, 81.2, 82.4, 83.8, 85.4, 86.9, 88.3, 89.4, 90.3, 90.8,
  90.9, 90.8, 90.4, 89.6, 88.8, 87.9, 87.0, 86.4, 86.0, 86.0, 86.3, 86.6, 86.8, 86.7, 85.5, 81.8, 81.2, 66.2, 66.0,
]);
export const RAIL_WIDTH = 4.5;    // 軌道(齒輪牆)的寬度(10mm)
export const RAIL_HEIGHT = 3.6;   // 軌道高出地面多少(8mm)
export const RAIL_ACCEL = 220;    // 在軌道上沿切線的加速度
export const RAIL_MAX = 260;      // 沿切線超過這個速度就不再加速
export const RAIL_FLING = 0.45;   // 離開軌道時,往中央甩的比例(乘上當下速度)
export const RING_HOP = 35;      // 往外的速度超過這個,才跳得過軌道上到平台

/* ---------- 軌道外 ---------- */

export const PLATEAU_SLOPE = 20;  // 平台微微往碗裡斜的推力
export const LIP_HOP = 60;        // 方槽邊緣:速度超過這個才飛得過去
export const WALL_BOUNCE = 0.7;   // 撞牆的反彈係數

// 區域圖的代號(跟 stadium-grid.js 一致)
export const ZONE = Object.freeze({
  OUT: 0, BOWL: 1, PLATEAU: 2, LIP: 3, WALL: 4, OVER_LEFT: 5, OVER_RIGHT: 6, XTREME: 7, PILLAR: 8,
});

// 各區域的高度(碗心 = 0),實測取整。畫面照這個把每一區拉高
export const ZONE_HEIGHT = Object.freeze({ 2: 10.2, 3: 15, 4: 30, 5: 3.6, 6: 3.6, 7: 3.4, 8: 48, 0: 0 });

export const POCKETS = Object.freeze([
  Object.freeze({ id: 'left', zone: ZONE.OVER_LEFT }),
  Object.freeze({ id: 'center', zone: ZONE.XTREME }),
  Object.freeze({ id: 'right', zone: ZONE.OVER_RIGHT }),
]);

// 區域圖解壓一次:每段是「代號 + 長度(36 進位)+ .」
const CELLS = (() => {
  const cells = new Uint8Array(GRID.w * GRID.h);
  let k = 0;
  for (const m of GRID.rle.matchAll(/(\d)([0-9a-z]+)\./g)) {
    const n = parseInt(m[2], 36);
    cells.fill(Number(m[1]), k, k + n);
    k += n;
  }
  return cells;
})();

/* ---------- 函式 ---------- */

// 0..360
function angleOf(x, y) {
  const a = Math.atan2(y, x) / RAD;
  return a < 0 ? a + 360 : a;
}

// 離正前方幾度(0..180,左右對稱)
function fromFront(deg) {
  return Math.abs((((deg - 90) % 360) + 540) % 360 - 180);
}

function lerpTable(table, deg) {
  const d = fromFront(deg) / 5;
  const i = Math.min(table.length - 2, Math.floor(d));
  const t = Math.min(1, d - i);
  return table[i] * (1 - t) + table[i + 1] * t;
}

// 軌道外緣(碗緣)在這個角度的半徑
export function railOuter(deg) {
  return lerpTable(RAIL_OUT, deg);
}

// 軌道中線的半徑(畫面與軌道判定用)
export function railRadius(deg) {
  return railOuter(deg) - RAIL_WIDTH / 2;
}

// 碗緣(軌道外緣)的距離:碗內為負。軌道不是正圓,所以是「沿半徑」量的近似值。
export function bowlDistance(x, y) {
  return Math.hypot(x, y) - railOuter(angleOf(x, y));
}

// 碗緣朝外的法線:對 bowlDistance 取梯度(軌道前窄後寬,不能直接用半徑方向)。
export function bowlNormal(x, y) {
  const h = 0.25;
  const gx = bowlDistance(x + h, y) - bowlDistance(x - h, y);
  const gy = bowlDistance(x, y + h) - bowlDistance(x, y - h);
  const l = Math.hypot(gx, gy);
  if (l < 1e-9) return { x: 0, y: 1 };
  return { x: gx / l, y: gy / l };
}

// 這個位置是哪一區。軌道外緣以內一律是碗(碗的形狀用上面的實測函式,比格子細)。
export function zoneAt(x, y) {
  if (bowlDistance(x, y) < 0) return ZONE.BOWL;
  const i = Math.floor(x) - GRID.x0;
  const j = Math.floor(y) - GRID.y0;
  if (i < 0 || j < 0 || i >= GRID.w || j >= GRID.h) return ZONE.OUT;
  const z = CELLS[j * GRID.w + i];
  return z === ZONE.BOWL ? ZONE.PLATEAU : z;   // 格子比碗緣粗一點,碗緣外那一圈當平台
}

// 這個位置算不算在出口裡
export function pocketAt(x, y) {
  const z = zoneAt(x, y);
  return POCKETS.find(p => p.zone === z) ?? null;
}

// 0 = 還在碗心平坦區,1 = 碗外圈。坡度推力用。
function slope01(x, y) {
  const s = Math.hypot(x, y) / railOuter(angleOf(x, y));
  return Math.min(1, Math.max(0, (s - FLAT) / (0.85 - FLAT)));
}

// 陀螺站的高度(碗心 0)。碗裡照實測剖面;軌道外照區域。
export function heightAt(x, y) {
  const z = zoneAt(x, y);
  if (z !== ZONE.BOWL) return ZONE_HEIGHT[z];
  const r = Math.hypot(x, y);
  for (let i = 1; i < FLOOR.length; i++) {
    const [r1, h1] = FLOOR[i];
    if (r <= r1) {
      const [r0, h0] = FLOOR[i - 1];
      return h0 + ((h1 - h0) * (r - r0)) / (r1 - r0);
    }
  }
  return DEPTH;
}

// 碗裡:愈外圈推力愈大(朝碗心);平台上:固定往碗裡的推力。
export function slopeAccel(x, y) {
  const r = Math.hypot(x, y);
  if (r < 1e-9) return { x: 0, y: 0 };
  const n = { x: x / r, y: y / r };
  if (bowlDistance(x, y) > 0) return { x: -n.x * PLATEAU_SLOPE, y: -n.y * PLATEAU_SLOPE };
  const t = slope01(x, y);
  if (t === 0) return { x: 0, y: 0 };
  return { x: -n.x * SLOPE_ACCEL * t, y: -n.y * SLOPE_ACCEL * t };
}

// 陀螺在不在軌道上。看的是陀螺的**外緣**(中心再往外 radius)——
// 陀螺中心永遠離軌道至少一個半徑,只看中心的話幾乎踩不到軌道。整圈連續。
export function onRail(x, y, radius = 0) {
  const a = angleOf(x, y);
  const edge = Math.hypot(x, y) + radius;
  return edge >= railOuter(a) - RAIL_WIDTH - 1 && edge <= railOuter(a) + 0.5;
}

// 順著陀螺原本沿軌道移動的方向推;沿切線已經夠快就不推。
// 切線取軌道曲線本身的方向 —— 到了後方凹口,推力會跟著往內拐。
export function railAccel(x, y, vx, vy, radius = 0) {
  if (!onRail(x, y, radius)) return { x: 0, y: 0 };
  const a = angleOf(x, y);
  const h = 0.5;
  const p0 = { x: Math.cos((a - h) * RAD) * railRadius(a - h), y: Math.sin((a - h) * RAD) * railRadius(a - h) };
  const p1 = { x: Math.cos((a + h) * RAD) * railRadius(a + h), y: Math.sin((a + h) * RAD) * railRadius(a + h) };
  const l = Math.hypot(p1.x - p0.x, p1.y - p0.y);
  const tx = (p1.x - p0.x) / l;
  const ty = (p1.y - p0.y) / l;
  const along = vx * tx + vy * ty;
  if (Math.abs(along) >= RAIL_MAX) return { x: 0, y: 0 };
  const dir = along >= 0 ? 1 : -1;
  return { x: tx * dir * RAIL_ACCEL, y: ty * dir * RAIL_ACCEL };
}

// 碗內隨機一點,離碗緣至少 margin(面積均勻;拒絕取樣)。
export function randomSpot(rng, margin) {
  for (;;) {
    const r = Math.sqrt(rng()) * HALF;
    const a = rng() * Math.PI * 2;
    const x = Math.cos(a) * r;
    const y = Math.sin(a) * r;
    if (bowlDistance(x, y) <= -margin) return { x, y };
  }
}
