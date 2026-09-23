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

// 半球必須是**封閉**的(圓頂 + 底面)。
// 用 SphereGeometry 的 thetaLength 切出來的是一個開口的碗:描邊是「放大的背面渲染」,
// 碗的內壁會整片露出來,畫面上就是一塊深色缺口加一道白色月牙 —— 看起來像破圖。
// LatheGeometry 把弧線加一段收回軸心的直線一起旋轉,出來就是實心的圓頂。
function dome() {
  const pts = [];
  const N = 22;
  for (let i = 0; i <= N; i++) {
    const a = (i / N) * (Math.PI / 2);
    pts.push(new THREE.Vector2(Math.sin(a) * R, Math.cos(a) * R));
  }
  pts.push(new THREE.Vector2(0, 0)); // 收回軸心,把底面封起來
  // 點序決定 LatheGeometry 的正反面。由上往下排的話正面會朝內,
  // 結果是填色看不見、只看得到放大的深色描邊 —— 整顆球變成一團咖啡色。
  pts.reverse();
  return new THREE.LatheGeometry(pts, 34);
}

const TOP_GEO = dome();
// 旋轉幾何而不是旋轉 mesh:rotateX 會連法線一起轉,winding 才不會反過來,
// 背面渲染的描邊才不會變成蓋住正面的實心球。
const BOTTOM_GEO = dome().rotateX(Math.PI);

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
    // 影子跟球是分開加進場景的,所以也要分開移除 ——
    // 只移除球的話,每重發一次牌就會在桌上留下一層對不到任何東西的舊影子。
    for (const e of eggs) {
      root.remove(e.group);
      root.remove(e.shadow);
      e.shadow.geometry.dispose();
      e.shadow.material.dispose();
    }
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

      // 影子是畫出來的(場上沒有光源)。用暖色而不是純黑 —— 純黑在米色桌面上
      // 會是一團灰,跟站上其他畫面的暖色調對不起來。
      const shadow = new THREE.Mesh(
        new THREE.CircleGeometry(R * 0.92, 24),
        new THREE.MeshBasicMaterial({ color: 0x9C7B52, transparent: true, opacity: 0.2 }));
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
        v: new THREE.Vector3(rand(-1.6, 1.6), 0, rand(-1.6, 1.6)),
      });
    });
    layout();
  }

  // 桌面上的物理。阻尼要夠輕,蛋才滾得動 —— 太重的話一撞就停,看起來像沒有碰撞。
  const DAMPING = 0.988;
  const BOUNCE = 0.92;

  function step(dt) {
    for (const e of eggs) {
      e.v.multiplyScalar(DAMPING);
      e.group.position.x += e.v.x * dt;
      e.group.position.z += e.v.z * dt;
      // 只繞垂直軸自轉,不做真正的翻滾。
      // 真的滾起來上下兩色會被滾亂,接縫變成隨機角度,那顆球就不像扭蛋殼了 ——
      // 參考圖裡接縫永遠是水平的。轉 Y 軸一樣看得出它在動,而且殼的長相保得住。
      const speed = Math.hypot(e.v.x, e.v.z);
      if (speed > 0.01) e.group.rotation.y += (speed / R) * dt * 0.6;

      const d = Math.hypot(e.group.position.x, e.group.position.z);
      const max = TABLE - R * 1.45;  // 留出描邊跟影子的寬度,球才不會半個掛在桌外
      if (d > max) {
        const nx = e.group.position.x / d;
        const nz = e.group.position.z / d;
        e.group.position.x = nx * max;
        e.group.position.z = nz * max;
        const along = e.v.x * nx + e.v.z * nz;
        if (along > 0) {
          e.v.x -= (1 + BOUNCE) * along * nx;
          e.v.z -= (1 + BOUNCE) * along * nz;
        }
      }
    }

    // 兩兩碰撞:先分離,再沿著法線交換速度。
    // 只分離不交換速度的話,球會擠在一起慢慢推開,不會互相彈飛 ——
    // 那不是碰撞,是重疊修正。
    for (let i = 0; i < eggs.length; i++) {
      for (let j = i + 1; j < eggs.length; j++) {
        const a = eggs[i];
        const b = eggs[j];
        const dx = b.group.position.x - a.group.position.x;
        const dz = b.group.position.z - a.group.position.z;
        const dist = Math.hypot(dx, dz) || 1e-4;
        const overlap = R * 2 - dist;
        if (overlap <= 0) continue;

        const nx = dx / dist;
        const nz = dz / dist;
        const push = overlap / 2;
        a.group.position.x -= nx * push;
        a.group.position.z -= nz * push;
        b.group.position.x += nx * push;
        b.group.position.z += nz * push;

        const along = (b.v.x - a.v.x) * nx + (b.v.z - a.v.z) * nz;
        if (along > 0) continue; // 已經在分開了
        const impulse = -(1 + BOUNCE) * along / 2;
        a.v.x -= impulse * nx;
        a.v.z -= impulse * nz;
        b.v.x += impulse * nx;
        b.v.z += impulse * nz;
      }
    }
    layout();
  }

  // 搖動:一次給每顆蛋一個**大**的隨機速度,然後讓阻尼慢慢收。
  // 之前是每格加一點點小力、0.4 秒就衰減完,幾乎看不出來。
  function shake(power = 1) {
    for (const e of eggs) {
      const angle = rand(0, Math.PI * 2);
      const speed = rand(3.5, 7.5) * power;
      e.v.set(Math.cos(angle) * speed, 0, Math.sin(angle) * speed);
    }
  }

  // 影子每一格都要跟著走 —— 包括被選中、正在飛起來的那一顆。
  // 演出期間 step() 不跑,所以 layout 必須由呼叫端每格單獨叫一次,
  // 不然被抽中的蛋會把影子留在原地。
  function layout() {
    for (const e of eggs) {
      const lift = Math.max(0, e.group.position.y);
      e.shadow.position.set(e.group.position.x, -R + 0.012, e.group.position.z);
      // 飛越高,影子越大越淡 —— 這是唯一能看出「它離開桌面了」的線索。
      e.shadow.scale.setScalar(1 + lift * 0.5);
      e.shadow.material.opacity = 0.2 / (1 + lift * 1.6);
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
    shake,
    layout,
    pick,
    look,
    resize,
    render: () => renderer.render(scene, camera),
    dispose() { clear(); renderer.dispose(); },
  };
}
