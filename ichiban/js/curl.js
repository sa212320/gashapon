// 開籤演出的捲曲:兩張疊起來的紙,上面那張沿著一條會移動的摺線捲起來走,
// 底下的獎項露出來。
//
// 用 three.js 而不是 DOM,是因為 DOM 沒辦法真的彎曲一個平面 —— 只能切成很多直條
// 各自旋轉去逼近,那條路要一直補破綻(條與條之間的縫、轉過 90 度翻面、
// 投影縮短要補償),而且捲起來的那一捲永遠沒有厚度。這裡是一片 160 段的網格,
// 每個頂點繞一個圓柱捲,捲痕是連續的。
//
// 刻意不放任何光源:打光會讓平塗的美術變得灰灰的,跟站上其他畫面對不起來。
// 正反面改用兩塊平塗材質區分 —— 正面是票卡的印刷,背面是同色系加深的紙背。
import * as THREE from 'three';
import { CARD_W, CARD_H, makeCardCanvas, drawFace, drawPrize } from './card-art.js';

const W = 3.4;              // 世界單位下的卡片寬(對應 34:15)
const H = 1.5;
const SEG = 160;            // 沿著捲曲方向的分段數,決定捲痕夠不夠圓滑
const R = 0.17;             // 捲起來那一捲的半徑
const MAX_WRAP = Math.PI * 1.25;

// 把賞別色壓深一點當紙背。平塗,不是陰影。
function darken(hex, amount = 0.38) {
  const n = parseInt(hex.replace('#', ''), 16);
  const mix = v => Math.round(v * (1 - amount));
  return `rgb(${mix((n >> 16) & 255)}, ${mix((n >> 8) & 255)}, ${mix(n & 255)})`;
}

export function createCurlStage(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100);
  camera.position.z = 6;

  const faceCanvas = makeCardCanvas();
  const prizeCanvas = makeCardCanvas();
  const faceCtx = faceCanvas.getContext('2d');
  const prizeCtx = prizeCanvas.getContext('2d');
  const faceTex = new THREE.CanvasTexture(faceCanvas);
  const prizeTex = new THREE.CanvasTexture(prizeCanvas);
  for (const t of [faceTex, prizeTex]) t.colorSpace = THREE.SRGBColorSpace;

  const prize = new THREE.Mesh(
    new THREE.PlaneGeometry(W, H),
    new THREE.MeshBasicMaterial({ map: prizeTex, transparent: true }));
  prize.position.z = -0.01;
  scene.add(prize);

  // 同一個 geometry 餵給兩個 mesh:一個只畫正面、一個只畫背面。
  // 捲起來之後看得到的那半是背面,用平塗的深色跟正面分開。
  const geo = new THREE.PlaneGeometry(W, H, SEG, 1);
  const flat = geo.attributes.position.array.slice();
  const frontMat = new THREE.MeshBasicMaterial({ map: faceTex, transparent: true, side: THREE.FrontSide });
  const backMat = new THREE.MeshBasicMaterial({ color: 0x888888, transparent: true, side: THREE.BackSide });
  const front = new THREE.Mesh(geo, frontMat);
  const back = new THREE.Mesh(geo, backMat);
  scene.add(back, front);

  function resize() {
    const w = canvas.clientWidth || 1;
    const h = canvas.clientHeight || 1;
    renderer.setSize(w, h, false);
    // 讓卡片剛好填滿寬度;捲起來的那一捲會凸出一點,所以上下多留一些。
    const fit = w / W;
    camera.left = -w / (2 * fit);
    camera.right = w / (2 * fit);
    camera.top = h / (2 * fit);
    camera.bottom = -h / (2 * fit);
    camera.updateProjectionMatrix();
  }

  // 摺線在 x = X。x 比 X 小的那半(左邊)已經捲上圓柱,
  // 它離摺線多遠,就繞了多長的弧。
  function shape(X) {
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x0 = flat[i * 3];
      const s = X - x0;
      if (s <= 0) {
        pos.setX(i, x0);
        pos.setZ(i, 0);
      } else {
        const th = Math.min(s / R, MAX_WRAP);
        pos.setX(i, X - R * Math.sin(th));
        pos.setZ(i, R * (1 - Math.cos(th)));
      }
    }
    pos.needsUpdate = true;
    geo.computeBoundingSphere();
  }

  const START = -W / 2;
  const END = W / 2 + R * MAX_WRAP;

  function setProgress(p) {
    const e = p < .5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2; // ease-in-out
    shape(START + e * (END - START));
    const fade = p > .84 ? Math.max(0, 1 - (p - .84) / .16) : 1;
    frontMat.opacity = fade;
    backMat.opacity = fade;
    renderer.render(scene, camera);
  }

  return {
    // faceColor 是蓋著那一面的顏色,跟 color(賞別色)是兩回事 ——
    // 蓋著的那面用賞別色的話,撕開之前就知道中了什麼。
    setCard({ faceColor, color, badge, name, bonus }) {
      drawFace(faceCtx, { color: faceColor });
      drawPrize(prizeCtx, { color, badge, name, bonus });
      faceTex.needsUpdate = true;
      prizeTex.needsUpdate = true;
      backMat.color.set(darken(faceColor));
    },
    reset() {
      resize();
      setProgress(0);
    },
    // 回傳跟 ui.js 的 animate() 一樣的契約:一個 promise,外加一個能立刻結束的 finish()。
    play(ms) {
      resize();
      let raf = 0;
      let done = null;
      const t0 = performance.now();
      const finished = new Promise(resolve => { done = resolve; });
      const finish = () => {
        if (!done) return;
        cancelAnimationFrame(raf);
        setProgress(1);
        const r = done; done = null; r();
      };
      const step = now => {
        const p = Math.min(1, (now - t0) / ms);
        setProgress(p);
        if (p >= 1) finish();
        else raf = requestAnimationFrame(step);
      };
      raf = requestAnimationFrame(step);
      return { finished, finish };
    },
    dispose() {
      geo.dispose();
      prize.geometry.dispose();
      [frontMat, backMat, prize.material].forEach(m => m.dispose());
      [faceTex, prizeTex].forEach(t => t.dispose());
      renderer.dispose();
    },
  };
}
