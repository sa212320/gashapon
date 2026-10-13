// 對戰盤的畫面,全部用程式畫 —— 形狀跟物理用同一份資料:
//   碗底:stadium.js 的實測剖面(heightAt)
//   軌道:stadium.js 的實測半徑表(railOuter),立起來的一圈,內緣做成齒
//   軌道外:stadium-grid.js 的區域圖,每一區描外框(zone-shape.js)再拉到那一區的高度
// 資料是照 Nick__Furry 復刻的 Xtreme 盤 3D 檔(MakerWorld 1147551,CC BY-NC)量出來的;
// 這裡只拿形狀,網格自己畫,面數只有原檔的零頭。
//
// 平塗不打光:碗的深淺靠頂點色,每一區頂面與側面差一階顏色;描邊沿平滑法線往外推一點、只畫背面。
// 最外圈再立一道半透明的冰牆 —— 真盤子的透明外殼。
import * as THREE from 'three';
import { INK } from './outline3d.js';
import {
  DEPTH, RAIL_WIDTH, RAIL_HEIGHT, ZONE, ZONE_HEIGHT, railOuter, heightAt,
} from './stadium.js';
import { zoneLoops } from './zone-shape.js';

export const COLORS = Object.freeze({
  floorLow: 0xEEF8FE,       // 碗心
  floorHigh: 0xC9E6F7,      // 碗外圈
  rail: 0xFFFFFF,
  railSide: 0xD6E9F5,
  plateau: 0xA9D3EE,
  lip: 0xBEE0F4,
  wall: 0x8EC5E8,
  side: 0x7DB8E0,           // 各區的側面
  pocket: 0x3E5A73,         // 出口(方槽、凹槽)的底
  pocketSide: 0x56758E,
  ice: 0xBFE4FA,
});
const LINE = 0.35;          // 描邊寬
const BASE = -4;            // 各區從這個高度往上拉(藏在碗底下)
const ICE_HEIGHT = 30;      // 透明外殼比碗心高多少
const TEETH = 0.5;          // 軌道內緣的齒有多深

const RAD = Math.PI / 180;

/* ---------- 描邊 ---------- */

// 描邊殼:同一個位置的頂點共用一條平滑法線,往外推。轉角才不會裂開。
function inflate(positions, amount) {
  const key = i => `${Math.round(positions[i] * 20)},${Math.round(positions[i + 1] * 20)},${Math.round(positions[i + 2] * 20)}`;
  const normals = new Map();
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const n = new THREE.Vector3();
  for (let i = 0; i < positions.length; i += 9) {
    a.fromArray(positions, i);
    b.fromArray(positions, i + 3);
    c.fromArray(positions, i + 6);
    n.subVectors(b, a).cross(c.sub(a));
    for (let k = 0; k < 9; k += 3) {
      const id = key(i + k);
      const acc = normals.get(id) ?? new THREE.Vector3();
      acc.add(n);
      normals.set(id, acc);
    }
  }
  for (const v of normals.values()) v.normalize();
  const out = new Float32Array(positions.length);
  for (let i = 0; i < positions.length; i += 3) {
    const v = normals.get(key(i));
    out[i] = positions[i] + v.x * amount;
    out[i + 1] = positions[i + 1] + v.y * amount;
    out[i + 2] = positions[i + 2] + v.z * amount;
  }
  return out;
}

function outlined(group, geometry, materials) {
  const geo = geometry.index ? geometry.toNonIndexed() : geometry;
  const body = new THREE.Mesh(geo, materials);
  const edgeGeo = new THREE.BufferGeometry();
  edgeGeo.setAttribute('position', new THREE.BufferAttribute(inflate(geo.attributes.position.array, LINE), 3));
  const edge = new THREE.Mesh(edgeGeo, new THREE.MeshBasicMaterial({ color: INK, side: THREE.BackSide }));
  group.add(edge, body);
  return body;
}

const flat = color => new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide });

/* ---------- 碗底 ---------- */

// 極座標網格:每個角度從碗心一路到軌道外緣。半徑取實測剖面的轉折點,台階才不會被抹平。
const FLOOR_RADII = [0, 9, 18, 27, 36, 40.9, 43.2, 45.5, 50, 56.8, 63.6, 70.5];
const FLOOR_SEGMENTS = 120;

function floorGeometry() {
  const pos = [];
  const col = [];
  const low = new THREE.Color(COLORS.floorLow);
  const high = new THREE.Color(COLORS.floorHigh);
  const ring = deg => {
    const edge = railOuter(deg) + 0.5;   // 鋪到軌道外緣下面,不留縫
    return [...FLOOR_RADII.filter(r => r < edge - 1), edge];
  };
  const vert = (deg, r) => {
    const x = Math.cos(deg * RAD) * r;
    const y = Math.sin(deg * RAD) * r;
    const h = heightAt(x, y);
    pos.push(x, h, y);
    const c = low.clone().lerp(high, Math.min(1, h / DEPTH));
    col.push(c.r, c.g, c.b);
  };
  for (let s = 0; s < FLOOR_SEGMENTS; s++) {
    const a0 = (s * 360) / FLOOR_SEGMENTS;
    const a1 = ((s + 1) * 360) / FLOOR_SEGMENTS;
    const r0 = ring(a0);
    const r1 = ring(a1);
    const n = Math.max(r0.length, r1.length);
    const at = (rs, i) => rs[Math.min(i, rs.length - 1)];
    for (let i = 0; i < n - 1; i++) {
      vert(a0, at(r0, i)); vert(a1, at(r1, i + 1)); vert(a1, at(r1, i));
      vert(a0, at(r0, i)); vert(a0, at(r0, i + 1)); vert(a1, at(r1, i + 1));
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return g;
}

/* ---------- 擠出:形狀 → 立體 ---------- */

function pointInPolygon(p, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if ((a.y > p.y) !== (b.y > p.y) && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

// 一組外框(外圈 + 洞)→ 從 BASE 拉到 top 的立體;頂面一個顏色、側面一個顏色
function extrudeLoops(loops, top) {
  const outers = loops.filter(l => !l.hole);
  const holes = loops.filter(l => l.hole);
  const shapes = outers.map(o => {
    const s = new THREE.Shape(o.points.map(p => new THREE.Vector2(p.x, p.y)));
    for (const h of holes) {
      if (pointInPolygon(h.points[0], o.points)) s.holes.push(new THREE.Path(h.points.map(p => new THREE.Vector2(p.x, p.y))));
    }
    return s;
  });
  const g = new THREE.ExtrudeGeometry(shapes, { depth: top - BASE, bevelEnabled: false, curveSegments: 1 });
  g.rotateX(Math.PI / 2);   // 形狀的 y → three.js 的 z(= 物理的 y);擠出方向朝下
  g.translate(0, top, 0);
  return g;
}

/* ---------- 軌道 ---------- */

// 外圈照實測半徑(多 1 單位壓在平台下面,不留縫),內圈一凸一凹做成齒
function railGeometry() {
  const outer = [];
  const inner = [];
  const n = 480;
  for (let i = 0; i < n; i++) {
    const deg = (i * 360) / n;
    const r = railOuter(deg);
    outer.push(new THREE.Vector2(Math.cos(deg * RAD) * (r + 1), Math.sin(deg * RAD) * (r + 1)));
    const ri = r - RAIL_WIDTH + (i % 2 ? TEETH : 0);
    inner.push(new THREE.Vector2(Math.cos(deg * RAD) * ri, Math.sin(deg * RAD) * ri));
  }
  const shape = new THREE.Shape(outer);
  shape.holes.push(new THREE.Path(inner.reverse()));
  const top = DEPTH + RAIL_HEIGHT + 0.05;   // 跟平台一樣高,略高一點才不會閃
  const g = new THREE.ExtrudeGeometry(shape, { depth: top - (DEPTH - 2), bevelEnabled: false, curveSegments: 1 });
  g.rotateX(Math.PI / 2);
  g.translate(0, top, 0);
  return g;
}

/* ---------- 透明外殼 ---------- */

function iceWall(group) {
  const all = zoneLoops([ZONE.PLATEAU, ZONE.LIP, ZONE.WALL, ZONE.PILLAR, ZONE.OVER_LEFT, ZONE.OVER_RIGHT, ZONE.XTREME, ZONE.BOWL]);
  const outline = all.filter(l => !l.hole).sort((a, b) => b.points.length - a.points.length)[0].points;
  const pos = [];
  for (let i = 0; i < outline.length; i++) {
    const a = outline[i];
    const b = outline[(i + 1) % outline.length];
    pos.push(a.x, BASE, a.y, b.x, BASE, b.y, b.x, ICE_HEIGHT, b.y, a.x, BASE, a.y, b.x, ICE_HEIGHT, b.y, a.x, ICE_HEIGHT, a.y);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  const wall = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
    color: COLORS.ice, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false,
  }));
  const rim = outline.map(p => new THREE.Vector3(p.x, ICE_HEIGHT, p.y));
  rim.push(rim[0].clone());
  const top = new THREE.Line(new THREE.BufferGeometry().setFromPoints(rim), new THREE.LineBasicMaterial({ color: INK }));
  wall.renderOrder = 10;   // 透明的最後畫,陀螺透得過去
  top.renderOrder = 10;
  group.add(wall, top);
}

/* ---------- 組起來 ---------- */

export function createStadium(ground) {
  const g = new THREE.Group();
  g.position.y = ground;

  g.add(new THREE.Mesh(floorGeometry(), new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide })));
  outlined(g, railGeometry(), [flat(COLORS.rail), flat(COLORS.railSide)]);

  const zones = [
    [[ZONE.PLATEAU], COLORS.plateau, COLORS.side],
    [[ZONE.LIP], COLORS.lip, COLORS.side],
    [[ZONE.WALL], COLORS.wall, COLORS.side],
    [[ZONE.PILLAR], COLORS.wall, COLORS.side],
    [[ZONE.OVER_LEFT, ZONE.OVER_RIGHT], COLORS.pocket, COLORS.pocketSide],
    [[ZONE.XTREME], COLORS.pocket, COLORS.pocketSide],
  ];
  for (const [zs, topColor, sideColor] of zones) {
    const loops = zoneLoops(zs);
    if (!loops.length) continue;
    outlined(g, extrudeLoops(loops, ZONE_HEIGHT[zs[0]]), [flat(topColor), flat(sideColor)]);
  }

  iceWall(g);
  g.traverse(o => { if (o.renderOrder === 0) o.renderOrder = -1; });   // 盤子最先畫,陀螺疊在上面
  g.userData.ready = Promise.resolve(g);
  return g;
}
