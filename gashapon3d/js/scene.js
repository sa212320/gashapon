// 立體扭蛋機的場景:一桌散開的扭蛋,自己點一顆打開。
//
// 一律平塗、不放光源 —— 打光會讓平塗的美術變灰。立體感靠「深色描邊外殼」
// (背面渲染的放大球)做,跟站上其他模式的粗描邊一致。
//
// 每顆蛋由**上下兩個半球**組成:上半彩色、下半白色,這就是扭蛋殼的長相。
// 同一組幾何同時負責外觀跟「打開」—— 打開就是把兩個半球分開。
import * as THREE from 'three';

const R = 0.5;             // 蛋的半徑
const TABLE = 3.4;         // 桌面半徑
const INK = 0x574239;
const GRAVITY = -2.4;

const rand = (a, b) => a + Math.random() * (b - a);

function half(top) {
  return new THREE.SphereGeometry(R, 28, 16, 0, Math.PI * 2, top ? 0 : Math.PI / 2, Math.PI / 2);
}

const TOP_GEO = half(true);
const BOTTOM_GEO = half(false);

// 描邊:同一個半球放大一點、只畫背面、塗深色。沒有光源也看得出形狀。
function shell(geo, color) {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color })));
  const edge = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: INK, side: THREE.BackSide }));
  edge.scale.setScalar(1.09);
  g.add(edge);
  return g;
}

export function createScene(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(44, 1, 0.1, 100);
  const root = new THREE.Group();
  scene.add(root);

  // 桌面:一塊淡色圓盤,讓蛋有地方待著、影子有地方落。
  const table = new THREE.Mesh(
    new THREE.CircleGeometry(TABLE, 48),
    new THREE.MeshBasicMaterial({ color: 0xF2E6D4 }));
  table.rotation.x = -Math.PI / 2;
  table.position.y = -R;
  root.add(table);

  const raycaster = new THREE.Raycaster();
  let eggs = [];

  function clear() {
    for (const e of eggs) root.remove(e.group);
    eggs = [];
  }

  // capsules:要擺上桌的那一批(已經抽樣過)。每一顆帶著自己在池子裡的 index,
  // 點下去才知道抽到的是哪一顆。
  function setEggs(capsules) {
    clear();
    capsules.forEach((c, i) => {
      const group = new THREE.Group();
      const top = shell(TOP_GEO, new THREE.Color(c.color));
      const bottom = shell(BOTTOM_GEO, 0xFFFFFF);
      group.add(top, bottom);

      // 影子:桌面上的一片深色圓盤。沒有光源,所以影子是畫出來的。
      const shadow = new THREE.Mesh(
        new THREE.CircleGeometry(R * 0.95, 20),
        new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.08 }));
      shadow.rotation.x = -Math.PI / 2;
      root.add(shadow);

      // 散在桌上,不要疊在正中央
      const angle = (i / capsules.length) * Math.PI * 2 + rand(-0.35, 0.35);
      const dist = Math.sqrt(rand(0.05, 1)) * TABLE * 0.62;
      group.position.set(Math.cos(angle) * dist, 0, Math.sin(angle) * dist);
      group.rotation.y = rand(0, Math.PI * 2);
      root.add(group);

      eggs.push({
        group, top, bottom, shadow, capsule: c,
        v: new THREE.Vector3(rand(-0.6, 0.6), 0, rand(-0.6, 0.6)),
      });
    });
    layout();
  }

  // 便宜的物理:桌面上的推擠 + 邊界。沒有重力上的高低,蛋一律貼著桌面滾。
  function step(dt, stir = 0) {
    for (const e of eggs) {
      if (stir > 0) {
        e.v.x += rand(-1, 1) * stir * dt * 22;
        e.v.z += rand(-1, 1) * stir * dt * 22;
      }
      e.v.multiplyScalar(0.94);
      e.group.position.x += e.v.x * dt;
      e.group.position.z += e.v.z * dt;

      const d = Math.hypot(e.group.position.x, e.group.position.z);
      const max = TABLE - R;
      if (d > max) {
        const k = max / d;
        e.group.position.x *= k;
        e.group.position.z *= k;
        e.v.multiplyScalar(-0.5);
      }
    }
    for (let i = 0; i < eggs.length; i++) {
      for (let j = i + 1; j < eggs.length; j++) {
        const a = eggs[i].group.position;
        const b = eggs[j].group.position;
        const dx = b.x - a.x;
        const dz = b.z - a.z;
        const dist = Math.hypot(dx, dz) || 1e-4;
        const overlap = R * 2 - dist;
        if (overlap > 0) {
          const k = (overlap / dist) * 0.5;
          a.x -= dx * k; a.z -= dz * k;
          b.x += dx * k; b.z += dz * k;
        }
      }
    }
    layout();
  }

  function layout() {
    for (const e of eggs) {
      e.shadow.position.set(e.group.position.x, -R + 0.01, e.group.position.z);
    }
  }

  // 點下去命中哪一顆。回傳 { capsule, egg } 或 null。
  function pick(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    for (const e of eggs) {
      const hits = raycaster.intersectObject(e.group, true);
      if (hits.length > 0) return e;
    }
    return null;
  }

  function resize() {
    const w = canvas.clientWidth || 1;
    const h = canvas.clientHeight || 1;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  function look(dist, height, targetY = 0) {
    camera.position.set(0, height, dist);
    camera.lookAt(0, targetY, 0);
  }

  look(5.6, 6.2);

  return {
    camera,
    get eggs() { return eggs; },
    setEggs,
    step,
    pick,
    look,
    resize,
    render: () => renderer.render(scene, camera),
    dispose() { clear(); renderer.dispose(); },
  };
}
