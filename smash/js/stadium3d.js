// 對戰盤的畫面。網格是真的 Xtreme 盤(Nick__Furry 復刻 3D 檔,MakerWorld 1147551,CC BY-NC)
// 拼回原位、減面之後的檔案(smash/models/stadium.bin,tools/smash-stadium 產生);
// 物理那邊的形狀(stadium.js、stadium-grid.js)也是從同一份拼好的模型量出來的。
//
// 這支只負責「怎麼畫」:每個面在檔案裡帶一個顏色編號,這裡換成站上的冰雪配色;
// 平塗不打光,描邊沿著平滑法線往外推一點、只畫背面(跟其他零件同一套做法)。
// 最外圈再立一道半透明的冰牆 —— 真盤子的透明外殼。
import * as THREE from 'three';
import { INK } from './outline3d.js';
import { BOUNDS, DEPTH } from './stadium.js';

const MODEL_URL = new URL('../models/stadium.bin?v=88612e92', import.meta.url).href;

// 檔案裡的顏色編號 → 顏色
//   0 碗底(依頂點高度,碗心 FLOOR_LOW → 外圈 FLOOR_HIGH) 4 軌道頂 5 軌道側面 6 外圈頂面 7 外圈立面 8 出口內側
const FLOOR_LOW = 0xEEF8FE;
const FLOOR_HIGH = 0xC9E6F7;
export const COLORS = Object.freeze([
  FLOOR_LOW, null, null, null,
  0xFFFFFF, 0xD6E9F5,
  0xA9D3EE, 0x7DB8E0,
  0x3E5A73,
]);
const ICE_WALL = 0xBFE4FA;
const LINE = 0.35;          // 描邊寬
const WALL_HEIGHT = 30;     // 透明外殼比碗心高多少

// 解析 stadium.bin:'SMST' | 版本 | 三角形數 | 縮放 | int16 頂點 | uint8 顏色編號
export function parseStadium(buffer) {
  const view = new DataView(buffer);
  const magic = String.fromCharCode(...new Uint8Array(buffer, 0, 4));
  if (magic !== 'SMST') throw new Error('stadium.bin 格式不對');
  const count = view.getUint32(8, true);
  const scale = view.getFloat32(12, true);
  const raw = new Int16Array(buffer, 16, count * 9);
  const colors = new Uint8Array(buffer, 16 + count * 18, count);
  const positions = new Float32Array(count * 9);
  for (let i = 0; i < raw.length; i++) positions[i] = raw[i] * scale;
  return { count, positions, colors };
}

// 描邊殼:同一個位置的頂點共用一條平滑法線,往外推 amount。
// (每個面各自往外推的話,轉角會裂開,描邊斷成一截一截。)
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
    n.subVectors(b, a).cross(c.clone().sub(a));
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

function buildMesh(group, { count, positions, colors }) {
  const col = new Float32Array(count * 9);
  const c = new THREE.Color();
  const low = new THREE.Color(FLOOR_LOW);
  const high = new THREE.Color(FLOOR_HIGH);
  // 碗底照頂點高度漸層 —— 平塗不打光,碗的深淺只能靠顏色
  for (let t = 0; t < count; t++) {
    for (let k = 0; k < 3; k++) {
      const i = t * 9 + k * 3;
      if (colors[t] === 0) c.copy(low).lerp(high, Math.min(1, Math.max(0, positions[i + 1] / DEPTH)));
      else c.set(COLORS[colors[t]] ?? FLOOR_LOW);
      col.set([c.r, c.g, c.b], i);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const body = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide }));

  // 描邊殼只畫背面,露出來的就只有輪廓那一圈。碗底不描:它是一片開放的曲面,
  // 描邊殼會從地板底下透出來變成一段段的黑線;碗的輪廓由軌道負責。
  const solid = [];
  for (let t = 0; t < count; t++) if (colors[t] !== 0) solid.push(...positions.subarray(t * 9, t * 9 + 9));
  const edgeGeo = new THREE.BufferGeometry();
  edgeGeo.setAttribute('position', new THREE.BufferAttribute(inflate(new Float32Array(solid), LINE), 3));
  const edge = new THREE.Mesh(edgeGeo, new THREE.MeshBasicMaterial({ color: INK, side: THREE.BackSide }));

  group.add(edge, body);
}

// 透明外殼:沿著盤子外框立一圈半透明的冰牆,上緣描一條線。
function iceWall(group) {
  const { x0, x1, z0, z1, chamfer } = BOUNDS;
  const outline = [
    [x1, z0 + chamfer], [x1, z1 - chamfer], [x1 - chamfer, z1], [x0 + chamfer, z1],
    [x0, z1 - chamfer], [x0, z0 + chamfer], [x0 + chamfer, z0], [x1 - chamfer, z0],
  ];
  const pos = [];
  for (let i = 0; i < outline.length; i++) {
    const [ax, az] = outline[i];
    const [bx, bz] = outline[(i + 1) % outline.length];
    pos.push(ax, 0, az, bx, 0, bz, bx, WALL_HEIGHT, bz, ax, 0, az, bx, WALL_HEIGHT, bz, ax, WALL_HEIGHT, az);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  const wall = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
    color: ICE_WALL, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false,
  }));
  wall.renderOrder = 10;   // 透明的最後畫,陀螺透得過去
  const rim = outline.map(([x, z]) => new THREE.Vector3(x, WALL_HEIGHT, z));
  rim.push(rim[0].clone());
  const top = new THREE.Line(new THREE.BufferGeometry().setFromPoints(rim), new THREE.LineBasicMaterial({ color: INK }));
  top.renderOrder = 10;
  group.add(wall, top);
}

// 先回傳一個空的 group,模型下載完再補進去 —— 場景不用等網路。
export function createStadium(ground, { load = url => fetch(url).then(r => r.arrayBuffer()) } = {}) {
  const g = new THREE.Group();
  g.position.y = ground;
  g.userData.ready = load(MODEL_URL).then(buffer => {
    buildMesh(g, parseStadium(buffer));
    iceWall(g);
    g.traverse(o => { if (o.renderOrder === 0) o.renderOrder = -1; });   // 盤子最先畫,陀螺疊在上面
    return g;
  });
  return g;
}
