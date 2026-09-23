// 立體扭蛋機的場景:一桌散開的扭蛋,自己點一顆打開。
//
// 一律平塗、不放光源 —— 打光會讓平塗的美術變灰。立體感靠「深色描邊外殼」
// (背面渲染的放大球)做,跟站上其他模式的粗描邊一致。
//
// 每顆蛋由**上下兩個半球**組成:上半彩色、下半白色,這就是扭蛋殼的長相。
// 同一組幾何同時負責外觀跟「打開」—— 打開就是把兩個半球分開。
import * as THREE from 'three';

const R = 0.5;             // 蛋的半徑
const TABLE_BASE = 3.4;    // 桌面幾何的基準半徑(實際大小靠 scale 跟著顆數變)
const INK = 0x574239;
const GRAVITY = -2.4;

const rand = (a, b) => a + Math.random() * (b - a);

// 每格都會用到的暫存,放在模組層避免每格 new 一堆物件
const AXIS = new THREE.Vector3();

// 半球必須是**封閉**的(圓頂 + 底面)。
// 用 SphereGeometry 的 thetaLength 切出來的是一個開口的碗:描邊是背面渲染,
// 碗的內壁會整片露出來,看起來像破圖。LatheGeometry 把弧線加一段收回軸心的直線
// 一起旋轉,出來就是實心的圓頂,底面永遠落在 y = 0。
function dome(radius) {
  const pts = [];
  const N = 22;
  for (let i = 0; i <= N; i++) {
    const a = (i / N) * (Math.PI / 2);
    pts.push(new THREE.Vector2(Math.sin(a) * radius, Math.cos(a) * radius));
  }
  pts.push(new THREE.Vector2(0, 0)); // 收回軸心,把底面封起來
  // 點序決定正反面。由上往下排的話正面會朝內,結果是填色看不見、
  // 只看得到放大的深色描邊 —— 整顆球變成一團咖啡色。
  pts.reverse();
  return new THREE.LatheGeometry(pts, 34);
}

// 描邊用「半徑大一點、但底面仍在赤道」的另一份幾何,**不要用 scale**。
// 整顆放大的話,上半的底面會被往上推、下半的往下推,兩片描邊殼在赤道處
// 就裂開一條縫,填色跟背景會從那條縫透出來 —— 那就是看到的破圖。
const EDGE = 1.1;
const TOP_GEO = dome(R);
const TOP_EDGE = dome(R * EDGE);
// 旋轉幾何而不是旋轉 mesh:rotateX 會連法線一起轉,winding 才不會反過來。
const BOTTOM_GEO = dome(R).rotateX(Math.PI);
const BOTTOM_EDGE = dome(R * EDGE).rotateX(Math.PI);

function shell(geo, edgeGeo, color) {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color })));
  g.add(new THREE.Mesh(edgeGeo, new THREE.MeshBasicMaterial({ color: INK, side: THREE.BackSide })));
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
  // 桌面大小跟著顆數走:全部的蛋都要擺得下,標題寫幾顆桌上就有幾顆。
  let TABLE = TABLE_BASE;
  const table = new THREE.Mesh(
    new THREE.CircleGeometry(TABLE_BASE, 48),
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
    // 面積要夠放下所有的蛋(再留一半的空隙),不然它們會擠成一坨互相卡住。
    TABLE = Math.max(2.6, Math.min(7.2, Math.sqrt(capsules.length) * 1.15));
    table.scale.setScalar(TABLE / TABLE_BASE);
    capsules.forEach((c, i) => {
      const group = new THREE.Group();
      const top = shell(TOP_GEO, TOP_EDGE, new THREE.Color(c.color));
      const bottom = shell(BOTTOM_GEO, BOTTOM_EDGE, 0xFFFFFF);
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
      const dist = Math.sqrt(rand(0.05, 1)) * (TABLE - R * 1.6);
      group.position.set(Math.cos(angle) * dist, 0, Math.sin(angle) * dist);
      group.rotation.y = rand(0, Math.PI * 2);
      root.add(group);

      eggs.push({
        group, top, bottom, shadow, capsule: c,
        v: new THREE.Vector3(rand(-1.6, 1.6), rand(0, 2.2), rand(-1.6, 1.6)),
      });
    });
    layout();
  }

  // 桌面上的物理。阻尼要夠輕,蛋才滾得動 —— 太重的話一撞就停,看起來像沒有碰撞。
  const DAMPING = 0.988;      // 水平阻尼(桌面摩擦)
  const BOUNCE = 0.92;        // 互撞與撞牆的彈性
  const GRAVITY = -14;
  const FLOOR_BOUNCE = 0.52;  // 落地會彈,但每次都矮一截,最後會停下來
  const REST = 0.35;          // 彈到這個速度以下就當它停在桌上了

  function step(dt) {
    for (const e of eggs) {
      // 水平摩擦只在貼著桌面時才有 —— 在空中被「摩擦」減速看起來很怪。
      const onTable = e.group.position.y <= 0.001;
      if (onTable) {
        e.v.x *= DAMPING;
        e.v.z *= DAMPING;
        // 桌面當成微微內凹的托盤。沒有這一點的話,撞牆反彈會把所有蛋推到外圈,
        // 搖完會排成一個圓環貼著桌緣 —— 那不像一盤蛋,像跑道。
        e.v.x -= e.group.position.x * 0.55 * dt;
        e.v.z -= e.group.position.z * 0.55 * dt;
      }
      e.v.y += GRAVITY * dt;

      e.group.position.x += e.v.x * dt;
      e.group.position.y += e.v.y * dt;
      e.group.position.z += e.v.z * dt;

      // 地板。蛋的中心在 y=0 時剛好貼著桌面(桌面在 -R)。
      if (e.group.position.y < 0) {
        e.group.position.y = 0;
        if (e.v.y < -REST) {
          e.v.y = -e.v.y * FLOOR_BOUNCE;
        } else {
          e.v.y = 0;
        }
      }
      // 真的滾:繞著「垂直於行進方向的水平軸」轉,角速度 = 速度 / 半徑。
      // 停在哪個角度就是哪個角度 —— 球滾完不會自己翻正,加了那個修正就會看起來很假。
      // 代價是接縫會停在隨機角度,但那本來就是一顆滾過的蛋該有的樣子。
      const speed = Math.hypot(e.v.x, e.v.z);
      if (speed > 0.02) {
        AXIS.set(e.v.z, 0, -e.v.x).normalize();
        // 在空中不是「滾」,是翻 —— 所以離地時角速度不再跟半徑綁在一起,
        // 讓它保持一個比較慢的翻轉,落地才回到真正的滾動。
        const spin = e.group.position.y > 0.02 ? 2.2 : speed / R;
        e.group.rotateOnWorldAxis(AXIS, spin * dt);
      }

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
        // 三維的碰撞:蛋會彈起來,所以高度差也要算進去 ——
        // 只算水平距離的話,一顆在空中、一顆在桌上也會被判定成相撞。
        const dx = b.group.position.x - a.group.position.x;
        const dy = b.group.position.y - a.group.position.y;
        const dz = b.group.position.z - a.group.position.z;
        const dist = Math.hypot(dx, dy, dz) || 1e-4;
        const overlap = R * 2 - dist;
        if (overlap <= 0) continue;

        const nx = dx / dist;
        const ny = dy / dist;
        const nz = dz / dist;
        const push = overlap / 2;
        a.group.position.x -= nx * push;
        a.group.position.y = Math.max(0, a.group.position.y - ny * push);
        a.group.position.z -= nz * push;
        b.group.position.x += nx * push;
        b.group.position.y = Math.max(0, b.group.position.y + ny * push);
        b.group.position.z += nz * push;

        const along = (b.v.x - a.v.x) * nx + (b.v.y - a.v.y) * ny + (b.v.z - a.v.z) * nz;
        if (along > 0) continue; // 已經在分開了
        const impulse = -(1 + BOUNCE) * along / 2;
        a.v.x -= impulse * nx;
        a.v.y -= impulse * ny;
        a.v.z -= impulse * nz;
        b.v.x += impulse * nx;
        b.v.y += impulse * ny;
        b.v.z += impulse * nz;
      }
    }
    layout();
  }

  // 搖動:一次給每顆蛋一個**大**的三軸隨機速度,然後讓重力跟阻尼收。
  // 向上那一下是重點 —— 蛋會跳起來、落下、再彈幾下,那才像在搖一盒扭蛋。
  // (之前是每格加一點點小力、0.4 秒就衰減完,而且只有水平,幾乎看不出來。)
  function shake(power = 1) {
    for (const e of eggs) {
      const angle = rand(0, Math.PI * 2);
      const speed = rand(2.6, 6.2) * power;
      e.v.set(Math.cos(angle) * speed, rand(3.4, 7.2) * power, Math.sin(angle) * speed);
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

  // 平常看整桌。
  function homeView() {
    look(TABLE * 1.62, TABLE * 1.82);
  }

  // 點開一顆時推近。k: 0(整桌)→ 1(看那一顆)。
  // 推近幅度刻意留得很保守 —— 推太近的話那顆會脹滿畫面、旁邊沒被選到的蛋
  // 也會擠爆邊緣,看起來像壞掉。
  function focusView(k) {
    look(TABLE * 1.62 - k * TABLE * 0.34, TABLE * 1.82 - k * TABLE * 0.62, k * 0.75);
  }

  homeView();

  return {
    camera,
    get eggs() { return eggs; },
    setEggs,
    step,
    shake,
    layout,
    homeView,
    focusView,
    pick,
    look,
    resize,
    render: () => renderer.render(scene, camera),
    dispose() { clear(); renderer.dispose(); },
  };
}
