// 3D 殼的外觀:每個稀有度合成一張「整顆球」的貼圖,上下兩半共用、靠 planar UV 各取一半
// (同 2D 的 ::before 200% 高)。底色從 tokens.css 讀,花紋是 gashapon/img 的白色 RGBA 圖。
import * as THREE from 'three';
import {
  UR_FRAMES, SHIMMER_MS, hueRotateMatrix, saturateMatrix, mulMatrix, applyColorMatrix,
  parseGradient, gradientLine,
} from './skin-math.js';

const SIZE = 256;
// ?v= 跟 gashapon/css/style.css 一字不差,兩台共用快取;重產花紋時 build-patterns 會一起改寫。
// N 不升級,用不到。
const PATTERN = {
  R: '../../gashapon/img/pattern-R.webp?v=c59a5357',
  SR: '../../gashapon/img/pattern-SR.webp?v=f681b021',
  SSR: '../../gashapon/img/pattern-SSR.webp?v=59738a23',
  UR: '../../gashapon/img/pattern-UR.webp?v=565edd30',
};


const materials = {};   // rarity → MeshBasicMaterial(所有蛋共用;UR 的 map 會輪播)
let urFrames = [];

function loadImage(url) {
  const img = new Image();
  img.src = new URL(url, import.meta.url).href;
  return img.decode().then(() => img);
}

function fillGradient(ctx, css, y, h) {
  const g = parseGradient(css);
  const [x0, y0, x1, y1] = gradientLine(g.angle, SIZE, h);
  const grad = ctx.createLinearGradient(x0, y + y0, x1, y + y1);
  for (const s of g.stops) grad.addColorStop(s.pos, s.color);
  ctx.fillStyle = grad;
  ctx.fillRect(0, y, SIZE, h);
}

// perHalf:漸層在上下兩半各畫一次(2D 的 UR 是每個半球各自鋪一條彩虹);
// 否則整顆球一條(2D 的 SSR 金是 background-size 100% 200%,上下接起來)
function paintBase(ctx, css, a, b, perHalf = false) {
  if (css && perHalf) {
    fillGradient(ctx, css, 0, SIZE / 2);
    fillGradient(ctx, css, SIZE / 2, SIZE / 2);
  } else if (css) {
    fillGradient(ctx, css, 0, SIZE);
  } else {
    ctx.fillStyle = a;
    ctx.fillRect(0, 0, SIZE, SIZE / 2);
    ctx.fillStyle = b;
    ctx.fillRect(0, SIZE / 2, SIZE, SIZE / 2);
  }
}

function newCanvas() {
  const c = document.createElement('canvas');
  c.width = c.height = SIZE;
  return c;
}

function canvasFor(css, a, b, pattern, perHalf = false) {
  const c = newCanvas();
  const ctx = c.getContext('2d');
  paintBase(ctx, css, a, b, perHalf);
  if (pattern) ctx.drawImage(pattern, 0, 0, SIZE, SIZE);
  return c;
}

function texture(canvas) {
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// UR:2D 的 shimmer 是 hue-rotate 0→360、saturate 1→1.15,3.2s 一圈,而且**只轉彩虹底色**
// (2026-10-02 使用者選 A:水晶藍雪花不跟著變色)。預算 UR_FRAMES 格輪播,
// 用的是 CSS 規格裡同一組色彩矩陣;花紋每一格都原樣疊在轉過色的底色上。
function urFrameCanvases(rainbow, pattern) {
  const base = canvasFor(rainbow, null, null, null, true);
  const src = base.getContext('2d').getImageData(0, 0, SIZE, SIZE);
  return Array.from({ length: UR_FRAMES }, (_, i) => {
    const k = i / UR_FRAMES;
    const c = newCanvas();
    const ctx = c.getContext('2d');
    const data = new ImageData(new Uint8ClampedArray(src.data), SIZE, SIZE);
    applyColorMatrix(data.data, mulMatrix(saturateMatrix(1 + 0.15 * k), hueRotateMatrix(360 * k)));
    ctx.putImageData(data, 0, 0);
    if (pattern) ctx.drawImage(pattern, 0, 0, SIZE, SIZE);
    return c;
  });
}

// 讀 CSS 變數 + 花紋,建好每個稀有度的材質。花紋載不到也照樣建(只有底色),回傳 false。
export async function loadSkins(root = document.documentElement) {
  const cs = getComputedStyle(root);
  const v = name => cs.getPropertyValue(name).trim();
  const entries = await Promise.all(Object.entries(PATTERN).map(([r, url]) =>
    loadImage(url).then(img => [r, img], () => [r, null])));
  const patterns = Object.fromEntries(entries);
  const base = {
    R: [null, v('--r-R-a'), v('--r-R-b')],
    SR: [null, v('--r-SR-a'), v('--r-SR-b')],
    SSR: [v('--gold'), null, null],
  };
  for (const r of ['R', 'SR', 'SSR']) {
    materials[r] = new THREE.MeshBasicMaterial({ map: texture(canvasFor(...base[r], patterns[r])) });
  }
  urFrames = urFrameCanvases(v('--rainbow'), patterns.UR).map(texture);
  materials.UR = new THREE.MeshBasicMaterial({ map: urFrames[0] });
  return Object.values(patterns).every(Boolean);
}

// 換殼。材質是共用的:蛋重建時 shell() 會 new 自己的純色材質,不會被污染;
// scene 收蛋時不可 dispose 這些共用材質。
export function applySkin(egg, rarity) {
  const m = materials[rarity];
  if (!m) return;   // 還沒載好:維持原本的純色,演出照走
  for (const half of [egg.top, egg.bottom]) half.userData.fill.material = m;
}

export function tickSkins(now) {
  if (!materials.UR || urFrames.length === 0) return;
  const i = Math.floor(((now % SHIMMER_MS) / SHIMMER_MS) * UR_FRAMES);
  if (materials.UR.map !== urFrames[i]) materials.UR.map = urFrames[i];
}
