// 阿彌陀籤場景裡的 three 物件(2026-10-02 改版)。一律平塗、不打光。
// 計算都在 ribbon.js / labels.js / prize-motion.js / camera-script.js(node 測得到),這裡只負責變成網格。
import * as THREE from 'three';
import { snowWidth, snowRim, ribbonWidth, offsetRoute, roundCorners, cutAt, stripData } from './ribbon.js';
import { tagLift, tagFontSize } from './labels.js';
import { tintedAnimal, textColorFor } from './tint.js';
import { boardWidth } from './camera-script.js';

const INK = 0x574239;
export const SNOW_H = 0.1;

function canvasTexture(c) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function imageTexture(img) {
  const t = new THREE.Texture(img);
  t.colorSpace = THREE.SRGBColorSpace;
  t.needsUpdate = true;
  return t;
}

function sprite(tex, w, h) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
  s.scale.set(w, h, 1);
  return s;
}

export function buildBoard({ lanes, laneWidth, rows, rowDepth, image }) {
  const far = -rows * rowDepth;
  const w = boardWidth(lanes, laneWidth);
  const d = -far + 3.2 + rowDepth;
  const mat = image
    ? new THREE.MeshBasicMaterial({ map: imageTexture(image), transparent: true, alphaTest: 0.02 })
    : new THREE.MeshBasicMaterial({ color: 0xBFE1F7 });   // 貼圖載不到:平塗冰藍
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat);
  m.rotation.x = -Math.PI / 2;
  m.position.set(0, -0.02, far / 2 - rowDepth * 0.2);
  m.renderOrder = -2;
  return m;
}

// 雪路:每段梯線兩層 —— 底下深棕外框(寬一圈、矮一點),上面白雪頂(側面淡藍)
export function buildSnowPaths(segments, laneWidth) {
  const g = new THREE.Group();
  const sw = snowWidth(laneWidth);
  const RIM = snowRim(laneWidth);
  const rim = new THREE.MeshBasicMaterial({ color: INK });
  const top = new THREE.MeshBasicMaterial({ color: 0xFFFFFF });
  const side = new THREE.MeshBasicMaterial({ color: 0xDCEBF7 });
  for (const [x0, z0, x1, z1] of segments) {
    const cx = (x0 + x1) / 2;
    const cz = (z0 + z1) / 2;
    const lx = Math.abs(x1 - x0);
    const lz = Math.abs(z1 - z0);
    const o = new THREE.Mesh(new THREE.BoxGeometry(lx + sw + RIM * 2, SNOW_H * 0.6, lz + sw + RIM * 2), rim);
    o.position.set(cx, SNOW_H * 0.3, cz);
    const t = new THREE.Mesh(new THREE.BoxGeometry(lx + sw, SNOW_H, lz + sw), [side, side, top, side, side, side]);
    t.position.set(cx, SNOW_H / 2, cz);
    g.add(o, t);
  }
  return g;
}

export function ribbonGeometry(route, dist, laneWidth) {
  const rw = ribbonWidth(laneWidth);
  const pts = cutAt(roundCorners(offsetRoute(route.pts, rw * 0.55), laneWidth * 0.15), dist);
  const geo = new THREE.BufferGeometry();
  if (pts.length < 2) return geo;
  const { position, index } = stripData(pts, rw, SNOW_H + 0.02);
  geo.setAttribute('position', new THREE.Float32BufferAttribute(position, 3));
  geo.setIndex(index);
  return geo;
}

// 桌遊立牌:染色動物(billboard)+ 玩家色小圓座(外圈深棕)
export function buildStandee(player, laneWidth, image) {
  const g = new THREE.Group();
  const c = tintedAnimal(image, player.color, 256);
  const h = laneWidth * 1.2;
  const s = sprite(canvasTexture(c), h * (c.width / c.height), h);
  s.center.set(0.5, 0);           // 腳踩在底座上
  s.position.y = SNOW_H + 0.06;
  const r = laneWidth * 0.3;
  const rimDisk = new THREE.Mesh(new THREE.CylinderGeometry(r * 1.12, r * 1.12, 0.05, 28), new THREE.MeshBasicMaterial({ color: INK }));
  rimDisk.position.y = SNOW_H + 0.025;
  const disk = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.06, 28), new THREE.MeshBasicMaterial({ color: new THREE.Color(player.color) }));
  disk.position.y = SNOW_H + 0.04;
  g.add(rimDisk, disk, s);
  g.userData.sprite = s;
  return g;
}

// 名牌:玩家色底、字色依對比挑;人多時相鄰一高一低(tagLift)
export function buildNameTag(player, laneWidth, lane, lanes) {
  const c = document.createElement('canvas');
  c.width = 300;
  c.height = 72;
  const ctx = c.getContext('2d');
  ctx.font = `700 ${tagFontSize(player.name)}px system-ui, -apple-system, "PingFang TC", "Noto Sans TC", sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const tw = Math.min(260, ctx.measureText(player.name).width);
  ctx.beginPath();
  ctx.roundRect(150 - tw / 2 - 14, 8, tw + 28, 56, 28);
  ctx.fillStyle = player.color;
  ctx.fill();
  ctx.lineWidth = 6;
  ctx.strokeStyle = '#574239';
  ctx.stroke();
  ctx.fillStyle = textColorFor(player.color);
  ctx.fillText(player.name, 150, 37, 260);
  const s = sprite(canvasTexture(c), laneWidth * 1.3, laneWidth * 0.31);
  s.userData.lift = tagLift(lane, lanes) * laneWidth * 0.34;
  return s;
}

export function buildPrizeSprite(slot, laneWidth, prizes) {
  const empty = slot.prizeId === null;
  const img = empty ? prizes.snow : prizes[slot.tier ?? 'plain'];
  const size = laneWidth * 1.05 * (empty ? 0.7 : 1);
  if (!img) return sprite(new THREE.Texture(), size, size);   // 圖載不到:透明,不丟例外
  return sprite(imageTexture(img), size * (img.width / img.height), size);
}
