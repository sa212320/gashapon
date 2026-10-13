// 平塗 + 深色描邊殼的共用零件。場景(scene3d.js)與對戰盤(stadium3d.js)都用這一份,
// 描邊的粗細與排序規則才會一致。
import * as THREE from 'three';

export const INK = 0x574239;

// 一個可描邊的群組:userData.edges / userData.fills 收集所有零件,
// 排序時整組一起給 renderOrder,零件才不會互相穿插。
export function outlinable() {
  const g = new THREE.Group();
  g.userData.edges = [];
  g.userData.fills = [];
  return g;
}

// 把一塊幾何加進群組,順便長出它自己的描邊殼。
// 描邊是放大的背面殼,所以每個零件都要有一份 —— 只描外框會讓零件黏成一團。
//
// depth:true 留給場地那種「只有一個、不會被誰擠到」的東西 —— 讓它照常做深度測試,
// 背面殼就只露出邊緣那一圈。關掉深度測試的話,它會整片蓋在自己的正面上。
export function part(group, geo, color, opts = {}) {
  const {
    pos = [0, 0, 0], scale = [1, 1, 1], rotX = 0,
    outline = 0.14, depth = false, into = group,
  } = opts;

  const fill = new THREE.Mesh(geo, Array.isArray(color)
    ? color.map(c => new THREE.MeshBasicMaterial({ color: c }))
    : new THREE.MeshBasicMaterial({ color }));
  fill.position.set(...pos);
  fill.scale.set(...scale);
  fill.rotation.x = rotX;
  into.add(fill);
  group.userData.fills.push(fill);

  const edge = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
    color: INK, side: THREE.BackSide, depthTest: depth, depthWrite: depth,
  }));
  edge.position.set(...pos);
  edge.rotation.x = rotX;
  // 描邊要「加厚一段固定距離」,不是整體放大 —— 直接乘 1.16 的話,
  // 小零件的邊會細到看不見,大零件的邊又粗得像穿盔甲。
  edge.scale.set(scale[0] + outline, scale[1] + outline, scale[2] + outline);
  edge.userData.base = edge.scale.clone();
  into.add(edge);
  group.userData.edges.push(edge);
  return fill;
}
