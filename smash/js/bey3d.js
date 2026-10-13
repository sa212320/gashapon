// 戰鬥陀螺的造型。照 Beyblade X 的三件式:戰刃(Blade)/ 固鎖(Ratchet)/ 軸心(Bit),
// 參考真品的輪廓特徵(外刃 + 塑膠芯 + 中央圓形徽章),不照抄任何一款。
// **造型就是類型** —— 小孩看形狀就知道「那顆尖的很會撞」:
//
//   攻擊型(參考 Dran Sword):外圈一整圈往同一個方向勾的鋸齒刃
//   防禦型(參考 Knight Shield):厚實的圓金屬框,三根往中心收的爪子
//   耐久型(參考 Wizard Arrow):最寬最圓滑的外圈,兩道隊伍色的大弧
//
// 整顆都是隊伍的色系:外刃淡、塑膠芯正色、軸心與爪子深;中央的徽章就是動物圓片。
// 單位空間:軸尖踩 y=0,佔地半徑 1,整體再乘物理的 radius。
// 外層 group 負責位置與傾斜,內層 spin 只負責繞 Y 轉;動物圓片掛在外層,**不跟著轉**。
import * as THREE from 'three';
import { part, outlinable } from './outline3d.js';
import { ANIMAL_URLS } from '../../ghostleg/js/art.js';
import { chipCrop } from './chip.js';

function shade(color, k) {
  return new THREE.Color(color).multiplyScalar(k);
}

// 「金屬」的部分也用隊伍的色系:刃是隊伍色調淡,軸心與爪子是隊伍色加深 ——
// 整顆都是同一個顏色家族,小孩一眼就分得出是哪一隊
function pale(color, k) {
  return new THREE.Color(color).lerp(new THREE.Color(0xFFFFFF), k);
}

// 平面形狀 → 往上擠出 depth 的厚片(躺平,形狀的 y 對到 -z)
function slab(shape, depth) {
  return new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 24 }).rotateX(-Math.PI / 2);
}

function circlePath(r, n = 40, cw = false) {
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = ((cw ? -i : i) / n) * Math.PI * 2;
    pts.push(new THREE.Vector2(Math.cos(a) * r, Math.sin(a) * r));
  }
  return pts;
}

// 攻擊型:8 片鋸齒刃,每一片從內圈慢慢爬到外緣、再陡陡地切回來 —— 全部往同一個方向勾
function attackRing() {
  const pts = [];
  const teeth = 8;
  for (let k = 0; k < teeth; k++) {
    const a0 = (k / teeth) * Math.PI * 2;
    const step = (Math.PI * 2) / teeth;
    for (const [t, r] of [[0, 0.84], [0.55, 0.95], [0.82, 1.05], [0.86, 0.84]]) {
      const a = a0 + t * step;
      pts.push(new THREE.Vector2(Math.cos(a) * r, Math.sin(a) * r));
    }
  }
  const s = new THREE.Shape(pts);
  s.holes.push(new THREE.Path(circlePath(0.72, 40, true)));
  return s;
}

// 防禦型:圓金屬框,外緣 12 個淺凸起;中間挖出三格窗,露出底下的塑膠芯
function defenseRing() {
  const pts = [];
  for (let i = 0; i < 48; i++) {
    const a = (i / 48) * Math.PI * 2;
    const r = 0.94 + (i % 4 === 0 ? 0.05 : 0);
    pts.push(new THREE.Vector2(Math.cos(a) * r, Math.sin(a) * r));
  }
  const s = new THREE.Shape(pts);
  s.holes.push(new THREE.Path(circlePath(0.72, 40, true)));
  return s;
}

// 防禦型的爪子:從外框往中心收的三角
function claw() {
  const s = new THREE.Shape([
    new THREE.Vector2(0.9, -0.14), new THREE.Vector2(0.9, 0.14), new THREE.Vector2(0.5, 0),
  ]);
  return s;
}

// 耐久型:寬大的圓滑外圈,兩處微微鼓起
function staminaRing() {
  const pts = [];
  for (let i = 0; i < 60; i++) {
    const a = (i / 60) * Math.PI * 2;
    const r = 1.06 + 0.04 * Math.cos(a * 2);
    pts.push(new THREE.Vector2(Math.cos(a) * r, Math.sin(a) * r));
  }
  const s = new THREE.Shape(pts);
  s.holes.push(new THREE.Path(circlePath(0.74, 40, true)));
  return s;
}

// 耐久型的大弧:貼在外圈上的一段彎月
function staminaArc() {
  const s = new THREE.Shape();
  s.absarc(0, 0, 1.0, -0.75, 0.75, false);
  s.absarc(0, 0, 0.78, 0.75, -0.75, true);
  return s;
}

const GEO = {
  attack: slab(attackRing(), 1),
  defense: slab(defenseRing(), 1),
  claw: slab(claw(), 1),
  stamina: slab(staminaRing(), 1),
  arc: slab(staminaArc(), 1),
  core: new THREE.CylinderGeometry(1, 1, 1, 32),
  ratchet: new THREE.CylinderGeometry(1, 1, 1, 10),      // 10 角 = 固鎖的凸齒
  tip: new THREE.ConeGeometry(1, 1, 12),
  chip: new THREE.CircleGeometry(1, 32),
};

export function createBey(beyType, color) {
  const g = outlinable();
  const spin = new THREE.Group();
  g.add(spin);
  const blade = new THREE.Group();
  const ratchet = new THREE.Group();
  const bit = new THREE.Group();
  spin.add(blade, ratchet, bit);
  const c = new THREE.Color(color);
  const METAL = pale(c, 0.38);
  const METAL_DARK = shade(c, 0.55);

  // 軸心:金屬灰軸尖 + 一圈齒輪(加速軌道咬的就是它)
  part(g, GEO.tip, METAL_DARK, { pos: [0, 0.14, 0], scale: [0.18, 0.28, 0.18], rotX: Math.PI, outline: 0.07, into: bit });
  part(g, GEO.ratchet, METAL_DARK, { pos: [0, 0.32, 0], scale: [0.3, 0.1, 0.3], outline: 0.07, into: bit });

  // 固鎖:隊伍色深一階
  part(g, GEO.ratchet, shade(c, 0.7), { pos: [0, 0.46, 0], scale: [0.6, 0.16, 0.6], outline: 0.08, into: ratchet });

  // 塑膠芯:隊伍色,從金屬刃中間露出來
  part(g, GEO.core, c, { pos: [0, 0.66, 0], scale: [0.76, 0.2, 0.76], outline: 0.08, into: blade });

  // 金屬外刃
  if (beyType === 'attack') {
    part(g, GEO.attack, METAL, { pos: [0, 0.58, 0], scale: [1, 0.16, 1], outline: 0.08, into: blade });
  } else if (beyType === 'defense') {
    part(g, GEO.defense, METAL, { pos: [0, 0.56, 0], scale: [1, 0.26, 1], outline: 0.08, into: blade });
    for (let k = 0; k < 3; k++) {
      const m = part(g, GEO.claw, METAL_DARK, { pos: [0, 0.83, 0], scale: [1, 0.1, 1], outline: 0.06, into: blade });
      m.rotation.y = (k * Math.PI * 2) / 3 + Math.PI / 2;
      g.userData.edges[g.userData.edges.length - 1].rotation.y = m.rotation.y;
    }
  } else {
    part(g, GEO.stamina, METAL, { pos: [0, 0.6, 0], scale: [1, 0.1, 1], outline: 0.07, into: blade });
    for (let k = 0; k < 2; k++) {
      const m = part(g, GEO.arc, shade(c, 0.72), { pos: [0, 0.7, 0], scale: [1, 0.05, 1], outline: 0.05, into: blade });
      m.rotation.y = k * Math.PI;
      g.userData.edges[g.userData.edges.length - 1].rotation.y = m.rotation.y;
    }
  }

  // 中央徽章(動物圓片):掛在外層 g,不跟著轉;白邊像真品的徽章框
  part(g, GEO.core, 0xFFFFFF, { pos: [0, 0.8, 0], scale: [0.52, 0.06, 0.52], outline: 0.06 });
  const chip = part(g, GEO.chip, 0xFFFFFF, { pos: [0, 0.84, 0], scale: [0.46, 0.46, 0.46], rotX: -Math.PI / 2, outline: 0 });

  g.userData.spin = spin;
  g.userData.chip = chip;
  g.userData.parts = { blade, ratchet, bit };
  return g;
}

export function setChipTexture(group, texture) {
  const m = group.userData.chip.material;
  m.map = texture;
  m.needsUpdate = true;
}

// 每種動物只裁一次。網址沿用爬格子帶 ?v= 的那一份 —— 首頁已經預先載入過,是快取命中。
export async function loadChipTextures() {
  const out = new Map();
  await Promise.all(Object.entries(ANIMAL_URLS).map(async ([animal, url]) => {
    const img = new Image();
    img.src = url;
    await img.decode();
    const { sx, sy, size } = chipCrop(animal, img.naturalWidth, img.naturalHeight);
    const cv = document.createElement('canvas');
    cv.width = cv.height = 128;
    const ctx = cv.getContext('2d');
    ctx.fillStyle = '#EAF6FD';
    ctx.beginPath();
    ctx.arc(64, 64, 64, 0, Math.PI * 2);
    ctx.fill();
    ctx.save();
    ctx.clip();
    ctx.drawImage(img, sx, sy, size, size, 0, 0, 128, 128);
    ctx.restore();
    const t = new THREE.CanvasTexture(cv);
    t.colorSpace = THREE.SRGBColorSpace;
    out.set(animal, t);
  }));
  return out;
}
