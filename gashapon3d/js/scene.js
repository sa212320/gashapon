// 立體扭蛋機的 three.js 場景:透明球體、裡面一堆隨機殼色的蛋、把手、出口托盤。
//
// 一律平塗、不放光源 —— 打光會讓平塗的美術變灰,跟站上其他畫面對不起來。
// 立體感改用「深色描邊外殼」做(背面渲染的放大球),跟其他模式的粗描邊一致。
import * as THREE from 'three';

const R = 1.0;          // 球體內半徑
const CR = 0.115;       // 蛋的半徑
const GRAVITY = -3.2;
const FLOOR = -R * 0.34 + CR;   // 蛋堆在圓盤上,就跟真的扭蛋機一樣
const INK = 0x574239;

const rand = (a, b) => a + Math.random() * (b - a);

// 描邊:同一顆球放大一點、只畫背面、塗成深色 —— 沒有光源也看得出形狀。
function outlined(geo, color, scale = 1.14) {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color })));
  const edge = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: INK, side: THREE.BackSide }));
  edge.scale.setScalar(scale);
  g.add(edge);
  return g;
}

export function createScene(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
  const root = new THREE.Group();
  scene.add(root);

  /* ---------- 機台 ---------- */

  const glass = new THREE.Mesh(
    new THREE.SphereGeometry(R * 1.06, 40, 28),
    new THREE.MeshBasicMaterial({ color: 0xCFE9F5, transparent: true, opacity: 0.3, depthWrite: false }));
  root.add(glass);

  const rim = new THREE.Mesh(
    new THREE.TorusGeometry(R * 1.02, 0.045, 10, 48),
    new THREE.MeshBasicMaterial({ color: INK }));
  rim.rotation.x = Math.PI / 2;
  rim.position.y = -R * 0.34;
  root.add(rim);

  const base = outlined(new THREE.CylinderGeometry(R * 0.92, R * 1.02, R * 0.85, 30), 0xF06E50, 1.03);
  base.position.y = -R * 1.28;
  root.add(base);

  // 把手要繞**自己的軸**轉。圓柱的軸是 Y,轉正面向人之後軸指向 Z;
  // 直接改 rotation.z 的話 Euler 會先 Z 再 X,變成翻滾而不是自轉。
  // 包一層 group 擺角度、內層只管自轉,就不會打架。
  const knobPivot = new THREE.Group();
  knobPivot.rotation.x = Math.PI / 2;
  knobPivot.position.set(0, -R * 1.2, R * 0.95);
  const knob = outlined(new THREE.CylinderGeometry(R * 0.2, R * 0.2, R * 0.12, 20), 0xFFD479, 1.1);
  knobPivot.add(knob);
  root.add(knobPivot);

  const tray = outlined(new THREE.BoxGeometry(R * 0.72, R * 0.1, R * 0.5), 0xF7E9D6, 1.03);
  tray.position.set(0, -R * 1.66, R * 0.62);
  root.add(tray);

  /* ---------- 球裡的蛋 ---------- */

  const capGeo = new THREE.SphereGeometry(CR, 16, 12);
  let balls = [];

  function clearBalls() {
    for (const b of balls) root.remove(b.mesh);
    balls = [];
  }

  // 球數上限:池子有幾百顆的時候,一顆一顆畫會拖垮手機,而且球裡本來就塞不下。
  // 只畫得下的那些,剩餘顆數由畫面上的文字負責講清楚。
  const MAX_BALLS = 60;

  function fill(pool) {
    clearBalls();
    const left = pool.filter(c => !c.drawn).slice(0, MAX_BALLS);
    for (const c of left) {
      const mesh = outlined(capGeo, new THREE.Color(c.color), 1.22);
      const p = new THREE.Vector3(rand(-0.6, 0.6), rand(-0.2, 0.7), rand(-0.6, 0.6));
      mesh.position.copy(p);
      root.add(mesh);
      balls.push({ mesh, v: new THREE.Vector3(rand(-0.4, 0.4), 0, rand(-0.4, 0.4)) });
    }
  }

  // 便宜的物理:重力 + 球壁約束 + 兩兩分離。60 顆的 O(n²) 是 1770 組,手機也吃得下。
  function step(dt, stir = 0) {
    for (const b of balls) {
      b.v.y += GRAVITY * dt;
      if (stir > 0) {
        b.v.x += rand(-1, 1) * stir * dt * 26;
        b.v.y += rand(-0.2, 1) * stir * dt * 26;
        b.v.z += rand(-1, 1) * stir * dt * 26;
      }
      b.v.multiplyScalar(0.985);
      b.mesh.position.addScaledVector(b.v, dt);

      // 圓盤是地板。少了這一條,蛋會沉到玻璃球最底下、被底座擋住看不見。
      if (b.mesh.position.y < FLOOR) {
        b.mesh.position.y = FLOOR;
        if (b.v.y < 0) b.v.y *= -0.35;
      }

      const d = b.mesh.position.length();
      const max = R - CR;
      if (d > max) {
        const n = b.mesh.position.clone().divideScalar(d);
        b.mesh.position.copy(n).multiplyScalar(max);
        b.v.addScaledVector(n, -1.5 * b.v.dot(n)); // 反彈,略帶損耗
        b.v.multiplyScalar(0.72);
      }
    }
    for (let i = 0; i < balls.length; i++) {
      for (let j = i + 1; j < balls.length; j++) {
        const a = balls[i].mesh.position;
        const c = balls[j].mesh.position;
        const dx = c.x - a.x, dy = c.y - a.y, dz = c.z - a.z;
        const dist = Math.hypot(dx, dy, dz) || 1e-4;
        const overlap = CR * 2 - dist;
        if (overlap > 0) {
          const k = (overlap / dist) * 0.5;
          a.x -= dx * k; a.y -= dy * k; a.z -= dz * k;
          c.x += dx * k; c.y += dy * k; c.z += dz * k;
        }
      }
    }
  }

  /* ---------- 抽出來的那一顆 ---------- */

  const prizeBall = outlined(capGeo, new THREE.Color('#FFFFFF'), 1.22);
  prizeBall.visible = false;
  prizeBall.scale.setScalar(1);
  root.add(prizeBall);

  // 升階光暈。蛋殼是隨機色,所以升階不能靠改殼色表示 —— 那會跟「殼色隨機」打架。
  const aura = new THREE.Mesh(
    new THREE.SphereGeometry(CR * 1.6, 20, 14),
    new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false }));
  prizeBall.add(aura);

  function setCapsuleColor(hex) {
    prizeBall.children[0].material.color.set(hex);
  }
  function setAura(hex, strength) {
    aura.material.color.set(hex);
    aura.material.opacity = strength;
  }

  function resize() {
    const w = canvas.clientWidth || 1;
    const h = canvas.clientHeight || 1;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  function look(dist, y, targetY) {
    camera.position.set(0, y, dist);
    camera.lookAt(0, targetY, 0);
  }

  look(4.6, 0.1, -0.15);

  return {
    camera, root, knob, prizeBall,
    fill,
    step,
    setCapsuleColor,
    setAura,
    look,
    resize,
    render: () => renderer.render(scene, camera),
    dispose() {
      clearBalls();
      renderer.dispose();
    },
  };
}
