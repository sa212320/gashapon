// 立體扭蛋機的場景:一桌散開的扭蛋,自己點一顆打開。
//
// 一律平塗、不放光源 —— 打光會讓平塗的美術變灰。立體感靠「深色描邊外殼」
// (背面渲染的放大球)做,跟站上其他模式的粗描邊一致。
//
// 每顆蛋由**上下兩個半球**組成:上半彩色、下半白色,這就是扭蛋殼的長相。
// 同一組幾何同時負責外觀跟「打開」—— 打開就是把兩個半球分開。
import * as THREE from 'three';
import { planarUV } from './skin-math.js';
import { FLOOR_URL } from './tray-art.js';
import { paintWall } from './ice-art.js';
import { trayShake, SHAKE_SECONDS, bowlHeight, bowlSlope, bowlDepth, BOWL_RIM, BOWL_FLAT, BOWL_DEPTH } from './tray-motion.js';

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

// 花紋用正面投影(2026-10-01):蛋轉正後 local +z 朝鏡頭,UV 只看 x、y,跟 2D 平貼一樣。
// 背面會是鏡像,但揭曉時背面永遠朝後,看不到。描邊幾何不貼圖,不用 UV。
for (const g of [TOP_GEO, BOTTOM_GEO]) {
  g.setAttribute('uv', new THREE.BufferAttribute(planarUV(g.attributes.position.array, R), 2));
}

// 邊框是「放大的背面」,它在輪廓處的深度值等於**球的背面**,非常靠後。
// 蛋堆在一起時,旁邊那顆的正面往往比這個深度還近,就把邊框整段吃掉 ——
// 那就是看到的破圖。深度偏移只是把問題換個方向,治不好。
//
// 正解是**不要讓邊框參與深度測試**,改用畫家演算法:整桌由遠到近排序,
// 每一顆依序畫「邊框 → 填色」。
//   · 比較近的蛋,它的邊框畫在比較遠的蛋的填色**之後** → 邊框不會被吃掉
//   · 比較遠的蛋,它的邊框畫在比較近的蛋的填色**之前** → 該被擋住的還是擋得住
// 排序在 render() 每一格重做,因為蛋會滾、深度順序一直在變。
// 上下兩半中間的接縫線(2026-10-02 使用者要求,同 2D 上半殼的 border-bottom):
// 赤道上一圈細的深棕環,掛在上半 —— 裂開時跟著上半飛走,就是上半殼的開口邊。
// 環要做深度測試:背面那半圈被自己的填色擋住,只看得到朝鏡頭的那一條線。
const SEAM_GEO = new THREE.TorusGeometry(R * 1.005, R * 0.05, 8, 64).rotateX(Math.PI / 2);
const SEAM_MAT = new THREE.MeshBasicMaterial({ color: INK });

// 冰雪碗(2026-10-02:使用者「我以為會更像碗」):中間平的冰面,往外沿拋物線翹到碗口
// (bowlHeight,物理用同一條曲線),碗口一圈積雪的厚唇,外壁往下往內收,底下一圈影子。
// 深度直接由蛋高算(BOWL_DEPTH = 蛋高 × 0.3),跟顆數無關 —— 碗只在水平方向跟著顆數縮放。
const EGG_H = R * 2;
// 碗的大小 = √顆數 × BOWL_FILL(越小越滿)
const BOWL_FILL = 0.85;
// 被點開的那顆飛到桌子中央上方這個高度(main.js 的 drop 用 FOCUS_Y)
export const FOCUS_Y = 1.2;
const FLOOR_Y = -R;
const RIM_Y = FLOOR_Y + BOWL_DEPTH;
const WALL_OUT = BOWL_RIM + 0.26;          // 碗唇外緣:一圈蓬鬆的厚雪(像首頁卡片 s2)
const WALL_FOOT = FLOOR_Y - 0.5;           // 碗底(比盤面低一截:外側的冰要看得到,像 s2 的冰盤側面)
const LIP = 0.2;                           // 碗唇圓弧的高度

// 碗唇 + 外壁的剖面:唇內緣 → 圓弧唇 → 唇外緣 → 外壁往下往內收 → 碗底
function wallProfile(grow = 0) {
  const pts = [];
  const cx = (BOWL_RIM + WALL_OUT) / 2;
  const rx = (WALL_OUT - BOWL_RIM) / 2 + grow;
  for (let i = 0; i <= 10; i++) {
    const a = Math.PI - (i / 10) * Math.PI;
    pts.push(new THREE.Vector2(cx + Math.cos(a) * rx, RIM_Y + Math.sin(a) * (LIP + grow)));
  }
  // 外壁:直的(使用者:「冰牆要直的,不要有弧度」),唇下面先是一圈滴雪,接著是冰,直直到碗底
  const x = WALL_OUT + grow;
  pts.push(new THREE.Vector2(x, RIM_Y - 0.06));
  pts.push(new THREE.Vector2(x, FLOOR_Y + BOWL_DEPTH * 0.2));
  pts.push(new THREE.Vector2(x, FLOOR_Y - 0.2));
  pts.push(new THREE.Vector2(x, WALL_FOOT - grow));
  return pts;
}

// 牆帶貼圖(上雪、中間一條波浪滴雪線、下面冰)依剖面上的位置挑段落貼:碗唇只用白雪那段
// (鏡頭看到的大多是唇,貼到外框線或滴雪線會排成一圈灰色鍊條),外壁從滴雪線一路到冰。
// 明暗是畫出來的(頂點色,不打光):唇朝內最亮、朝外暗一階,外壁往下越暗;右半邊整圈再暗一點
// (光從左上來,同 2D 扭蛋殼右側的月牙暗面)。
const N_LIP = 11;
function wallLook(j, n) {
  if (j < N_LIP) {
    // 碗口是一圈厚雪(貼圖最上面的白);朝內最亮、朝外暗一階
    const t = j / (N_LIP - 1);                // 唇:朝內 0 → 朝外 1
    return { v: 0.95, shade: 1 - 0.12 * t };
  }
  // 外壁只用貼圖的下半段(冰),不放滴雪的波浪線(使用者 2026-10-02);
  // 最底下那條雪跟外框線也不用
  const k = j - N_LIP;                                 // 0 唇下、1 冰上段、2 冰下段、3 碗底
  // 外壁(ice-art.js 畫的):最上面是雪,往下滴到 SNOW_EDGE_V 附近,下面是冰
  return [
    { v: 0.80, shade: 0.95 },
    { v: 0.50, shade: 0.92 },
    { v: 0.28, shade: 0.86 },
    { v: 0.04, shade: 0.78 },
  ][k];
}

function shadeColor(col, i, k) {
  col[i * 3] = k * 0.96;
  col[i * 3 + 1] = k * 0.98;
  col[i * 3 + 2] = k;                          // 暗面偏冷,不要變成髒灰
}

// part:'lip' 只要唇、'outer' 只要外壁、'all' 整條(描邊用)。
// 唇跟外壁分成兩個 mesh:同一個 mesh 的話,唇最後一點(雪)跟外壁第一點(冰)之間的貼圖會內插過
// 滴雪那段,外壁頂端就多一條波浪線(2026-10-02 使用者要外壁只用冰)。
function wallGeometry(phiStart, grow = 0, part = 'all') {
  const all = wallProfile(grow);
  const from = part === 'outer' ? N_LIP - 1 : 0;
  const to = part === 'lip' ? N_LIP : all.length;
  const pts = all.slice(from, to);
  const g = new THREE.LatheGeometry(pts, 96, phiStart, Math.PI);
  const uv = g.attributes.uv;
  const pos = g.attributes.position;
  const col = new Float32Array(uv.count * 3);
  for (let i = 0; i < uv.count; i++) {
    const j = from + (i % pts.length);
    // 外壁的第一點跟唇的最後一點是同一個位置:在外壁那個 mesh 裡它要用冰的段落
    const look = part === 'outer' && j === N_LIP - 1 ? wallLook(N_LIP, all.length) : wallLook(j, all.length);
    uv.setY(i, look.v);
    const side = Math.max(0, pos.getX(i) / WALL_OUT);   // 右半邊 0 → 1
    shadeColor(col, i, look.shade * (1 - 0.1 * side));
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

// 碗裡的冰面:平的盤底加上翹起來的碗壁,同一張冰面貼圖從正上方投影上去(碗壁跟盤底接得起來)。
// 明暗:中間最亮,越往碗邊越暗 —— 看起來是凹下去的。
function basinGeometry() {
  const pts = [];
  const N = 24;
  for (let i = 0; i <= N; i++) {
    const r = (i / N) * BOWL_RIM;
    pts.push(new THREE.Vector2(r, FLOOR_Y + bowlHeight(r)));
  }
  // 點序由內往外:正面朝上(跟 dome() 的坑同一件事,反了的話從上面看是空的)
  const g = new THREE.LatheGeometry(pts.reverse(), 96);
  const pos = g.attributes.position;
  const uv = g.attributes.uv;
  const col = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    uv.setXY(i, x / (2 * BOWL_RIM) + 0.5, 0.5 - z / (2 * BOWL_RIM));
    const r = Math.hypot(x, z) / BOWL_RIM;
    const side = Math.max(0, x / BOWL_RIM);
    // 碗壁越外越暗;遠側的碗壁斜面正對鏡頭,亮一點、近側背著鏡頭,暗一點 —— 凹面才看得出來
    const facing = -z / BOWL_RIM * r;       // 遠側 +、近側 −
    shadeColor(col, i, (1 - 0.34 * r * r) * (1 + 0.14 * facing) * (1 - 0.06 * side));
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

function shell(geo, edgeGeo, color, seam = false) {
  const g = new THREE.Group();
  const fill = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color }));
  const edge = new THREE.Mesh(edgeGeo, new THREE.MeshBasicMaterial({
    color: INK,
    side: THREE.BackSide,
    depthTest: false,
    depthWrite: false,
  }));
  g.add(edge, fill);
  g.userData.edge = edge;
  g.userData.fill = fill;
  if (seam) {
    const ring = new THREE.Mesh(SEAM_GEO, SEAM_MAT);
    g.add(ring);
    g.userData.seam = ring;
  }
  return g;
}

export function createScene(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(44, 1, 0.1, 400);
  const root = new THREE.Group();
  scene.add(root);

  // 托盤跟蛋都放在 stage 裡:搖動就是搖 stage,物理在 stage 的座標系裡算
  // (球感受到的是「−托盤加速度」的慣性力,見 step())。
  const stage = new THREE.Group();
  root.add(stage);

  // 托盤大小跟著顆數走:全部的蛋都要擺得下,標題寫幾顆桌上就有幾顆。
  let TABLE = TABLE_BASE;
  const loader = new THREE.TextureLoader();
  const floorTex = loader.load(FLOOR_URL);
  floorTex.colorSpace = THREE.SRGBColorSpace;
  const wallTex = new THREE.CanvasTexture(paintWall());
  wallTex.colorSpace = THREE.SRGBColorSpace;
  wallTex.wrapS = THREE.RepeatWrapping;
  wallTex.repeat.set(5, 1);    // 每半圈 5 段;太多段的話波浪的深棕線會擠成一圈灰色鍊條

  const tray = new THREE.Group();
  stage.add(tray);
  // 托盤落在雪地上的影子:不然整個托盤像浮在半空
  const groundShadow = new THREE.Mesh(
    new THREE.CircleGeometry(WALL_OUT * 1.1, 64),
    new THREE.MeshBasicMaterial({ color: 0x5A7FA8, transparent: true, opacity: 0.22, depthWrite: false }));
  groundShadow.rotation.x = -Math.PI / 2;
  groundShadow.position.set(0.25, WALL_FOOT - 0.02, 0.35);
  groundShadow.renderOrder = -40;
  tray.add(groundShadow);

  const floor = new THREE.Mesh(basinGeometry(),
    new THREE.MeshBasicMaterial({ color: 0xffffff, map: floorTex, vertexColors: true, side: THREE.DoubleSide }));
  floor.renderOrder = -30;
  tray.add(floor);

  // 牆分前後兩半:後半在所有蛋之前畫、前半在所有蛋之後畫 ——
  // 蛋的描邊不做深度測試(見 shell() 的說明),前半牆要是先畫,蛋的描邊會穿過牆畫在牆上。
  // LatheGeometry 的 phi = 0 在 +z(朝鏡頭)那側:前半 = [-π/2, π/2],後半 = [π/2, 3π/2]。
  function wallHalf(phiStart, order) {
    const mat = new THREE.MeshBasicMaterial({ map: wallTex, side: THREE.DoubleSide, vertexColors: true });
    const lip = new THREE.Mesh(wallGeometry(phiStart, 0, 'lip'), mat);
    const outer = new THREE.Mesh(wallGeometry(phiStart, 0, 'outer'), mat);
    lip.renderOrder = order + 1;
    outer.renderOrder = order + 1;
    tray.add(lip, outer);
    // 描邊用 FrontSide:剖面的點序讓這圈牆的正面朝內,BackSide 會把整圈牆蓋成一片深棕
    // (跟 dome() 的點序是同一個坑)
    const edge = new THREE.Mesh(wallGeometry(phiStart, 0.05),
      new THREE.MeshBasicMaterial({ color: INK, side: THREE.FrontSide }));
    edge.renderOrder = order;
    tray.add(edge);
  }
  wallHalf(Math.PI / 2, -20);
  wallHalf(-Math.PI / 2, 100000);

  // 牆內壁(實際半徑):蛋的活動範圍、散開的範圍都以它為準
  const scaleK = () => TABLE / TABLE_BASE;
  const inner = () => BOWL_RIM * scaleK();
  // 碗的深度跟著碗的大小走(bowlDepth):幾何是用 BOWL_DEPTH 建的,垂直方向再縮放 depthK
  let depthK = 1;
  // 蛋在水平位置 (x, z) 時,蛋心最低能到多高(貼著碗面)
  const ground = (x, z) => bowlHeight(Math.hypot(x, z) / scaleK()) * depthK;

  const raycaster = new THREE.Raycaster();
  let eggs = [];

  function clear() {
    // 影子跟球是分開加進場景的,所以也要分開移除 ——
    // 只移除球的話,每重發一次牌就會在桌上留下一層對不到任何東西的舊影子。
    for (const e of eggs) {
      stage.remove(e.group);
      stage.remove(e.shadow);
      e.shadow.geometry.dispose();
      e.shadow.material.dispose();
    }
    eggs = [];
    pinned = null;
  }

  function makeEgg(c, x, y, z) {
    const group = new THREE.Group();
    const top = shell(TOP_GEO, TOP_EDGE, new THREE.Color(c.color), true);
    const bottom = shell(BOTTOM_GEO, BOTTOM_EDGE, 0xFFFFFF);
    group.add(top, bottom);

    // 影子是畫出來的(場上沒有光源)。用冷色調的藍灰配冰面 —— 純黑會是一團髒灰。
    const shadow = new THREE.Mesh(
      new THREE.CircleGeometry(R * 0.92, 24),
      new THREE.MeshBasicMaterial({ color: 0x5A7FA8, transparent: true, opacity: 0.2 }));
    shadow.rotation.x = -Math.PI / 2;
    stage.add(shadow);

    group.position.set(x, y, z);
    group.rotation.y = rand(0, Math.PI * 2);
    stage.add(group);
    const egg = { group, top, bottom, shadow, capsule: c, v: new THREE.Vector3() };
    eggs.push(egg);
    return egg;
  }

  // 抽完的那顆拿下桌(2026-10-02:不再整桌重排,其他蛋留在原位)
  function removeEgg(egg) {
    if (pinned === egg) pinned = null;
    eggs = eggs.filter(e => e !== egg);
    stage.remove(egg.group);
    stage.remove(egg.shadow);
    egg.shadow.geometry.dispose();
    egg.shadow.material.dispose();
  }

  // 補一顆:從桌子上方隨機一點掉進來,落地會彈幾下(物理照常算)
  function dropEgg(capsule) {
    const angle = rand(0, Math.PI * 2);
    const dist = Math.sqrt(rand(0, 1)) * BOWL_RIM * 0.5 * scaleK();
    const e = makeEgg(capsule, Math.cos(angle) * dist, 3.2, Math.sin(angle) * dist);
    e.v.set(rand(-0.6, 0.6), -1, rand(-0.6, 0.6));
    layout();
    return e;
  }

  // capsules:要擺上桌的那一批(已經抽樣過)。每一顆帶著自己在池子裡的 index,
  // 點下去才知道抽到的是哪一顆。
  function setEggs(capsules) {
    clear();
    // 面積要夠放下所有的蛋(再留一半的空隙),不然它們會擠成一坨互相卡住。
    // 2026-10-02 使用者:「希望球感覺比較滿一點」→ 係數 1.15 → 0.85。平的盤底剛好裝滿,
    // 多出來的蛋會靠在碗壁的斜坡上,看起來是一碗滿滿的蛋。
    TABLE = Math.max(2.2, Math.min(6, Math.sqrt(capsules.length) * BOWL_FILL));
    // 水平跟著顆數縮放;深度另外算(碗口半徑 × 0.15,最少蛋高 × 0.3)。
    // 垂直縮放以盤面為基準(盤面高度不動,蛋才剛好貼著盤底)
    depthK = bowlDepth(BOWL_RIM * scaleK()) / BOWL_DEPTH;
    tray.scale.set(scaleK(), depthK, scaleK());
    tray.position.y = FLOOR_Y * (1 - depthK);
    capsules.forEach((c, i) => {
      // 散在桌上,不要疊在正中央
      const angle = (i / capsules.length) * Math.PI * 2 + rand(-0.35, 0.35);
      const dist = Math.sqrt(rand(0.05, 1)) * (inner() - R * 1.6);
      const e = makeEgg(c, Math.cos(angle) * dist, 0, Math.sin(angle) * dist);
      e.v.set(rand(-1.6, 1.6), rand(0, 2.2), rand(-1.6, 1.6));
    });
    layout();
  }

  // 桌面上的物理。阻尼要夠輕,蛋才滾得動 —— 太重的話一撞就停,看起來像沒有碰撞。
  const DAMPING = 0.988;      // 水平阻尼(桌面摩擦)
  const BOUNCE = 0.92;        // 互撞與撞牆的彈性
  const GRAVITY = -14;
  const FLOOR_BOUNCE = 0.52;  // 落地會彈,但每次都矮一截,最後會停下來
  const REST = 0.35;          // 彈到這個速度以下就當它停在桌上了
  // 托盤內凹的回中力。太強的話放著不動時所有蛋會擠成中間一團,被點開的那顆飛到中央時
  // 下半部會被前面的蛋擋住(2026-10-02);太弱的話搖完會排成一圈貼著牆。
  const CENTER_PULL = 0.04;   // 碗壁的斜坡已經會把蛋拉回中間,這裡只留一點點
  // 冰面很滑:托盤加速時,貼在盤底的蛋只被帶走一小部分,大部分是「留在原地、被牆撞回來」
  const GRIP = 0.2;
  // 被點開的那顆飛到中央時,周圍這個半徑內的蛋會被推開
  const CLEAR = R * 4.6;

  let shakeT = -1;            // 搖動開始後經過的秒數;< 0 = 沒在搖
  let pinned = null;          // 演出中的那顆:不參與物理,其他蛋要讓開

  function step(dt) {
    // 托盤的動作。物理在托盤(stage)的座標系裡算:球感受到的是「−托盤加速度」的慣性力,
    // 牆跟盤底在這個座標系裡是不動的,碰撞照原本的算法。
    let ax = 0;
    let ay = 0;
    if (shakeT >= 0) {
      shakeT += dt;
      const m = trayShake(shakeT);
      stage.position.set(m.x, m.y, 0);
      ax = m.ax;
      ay = m.ay;
      if (shakeT >= SHAKE_SECONDS) shakeT = -1;
    }

    for (const e of eggs) {
      if (e === pinned) continue;
      // 水平摩擦只在貼著碗面時才有 —— 在空中被「摩擦」減速看起來很怪。
      const px0 = e.group.position.x;
      const pz0 = e.group.position.z;
      const onTable = e.group.position.y <= ground(px0, pz0) + 0.001;
      if (onTable) {
        e.v.x *= DAMPING;
        e.v.z *= DAMPING;
        // 碗壁的斜坡:重力沿著斜面的分量把蛋拉回中間(碗壁翹起來的地方才有;盤底是平的)。
        // 這取代了原本「托盤微微內凹」的假回中力 —— 沒有它的話撞牆反彈會把蛋全推到外圈。
        const d0 = Math.hypot(px0, pz0);
        if (d0 > 1e-4) {
          const slope = (bowlSlope(d0 / scaleK()) * depthK) / scaleK();
          const a = (GRAVITY * slope) / (1 + slope * slope);   // GRAVITY < 0 → 往內
          e.v.x += (px0 / d0) * a * dt;
          e.v.z += (pz0 / d0) * a * dt;
        }
        e.v.x -= px0 * CENTER_PULL * dt;
        e.v.z -= pz0 * CENTER_PULL * dt;
      }
      // 慣性力:在空中完全不受托盤影響;貼著盤底時被摩擦帶走 GRIP 那一份
      e.v.x -= ax * (onTable ? 1 - GRIP : 1) * dt;
      // 托盤往上加速 = 盤底把蛋往上頂(等效重力變大);往下加速超過重力,蛋就離開盤底
      e.v.y += (GRAVITY - ay) * dt;
      if (pinned) {
        // 讓開:被點開的那顆在桌子中央上方,下面跟前面的蛋往外推
        const px = e.group.position.x - pinned.group.position.x;
        const pz = e.group.position.z - pinned.group.position.z;
        const d = Math.hypot(px, pz) || 1e-4;
        if (d < CLEAR) {
          const k = (CLEAR - d) * 14 * dt;
          e.v.x += (px / d) * k;
          e.v.z += (pz / d) * k;
        }
      }

      e.group.position.x += e.v.x * dt;
      e.group.position.y += e.v.y * dt;
      e.group.position.z += e.v.z * dt;

      // 碗面。蛋心在 ground() 時剛好貼著碗面(盤底在 -R,所以平的地方是 y = 0)。
      const floorY = ground(e.group.position.x, e.group.position.z);
      if (e.group.position.y < floorY) {
        e.group.position.y = floorY;
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
        const spin = e.group.position.y > floorY + 0.02 ? 2.2 : speed / R;
        e.group.rotateOnWorldAxis(AXIS, spin * dt);
      }

      const d = Math.hypot(e.group.position.x, e.group.position.z);
      const max = inner() - R * 0.9;    // 碗口內緣再留將近一顆蛋的半徑
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
        if (a === pinned || b === pinned) continue;
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
        a.group.position.y = Math.max(ground(a.group.position.x, a.group.position.z), a.group.position.y - ny * push);
        a.group.position.z -= nz * push;
        b.group.position.x += nx * push;
        b.group.position.y = Math.max(ground(b.group.position.x, b.group.position.z), b.group.position.y + ny * push);
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

  // 搖動 = 真的搖托盤(2026-10-02 使用者:「我以為是真的搖動托盤,然後算出上面球要怎麼動」)。
  // 托盤左右來回、每甩一下往上頂一下(tray-motion.js),球怎麼動全部由 step() 的物理算。
  function shake() {
    shakeT = 0;
  }

  // 演出中的那顆:釘住不參與物理,其他蛋從它下面讓開
  function pin(egg) {
    pinned = egg;
  }

  // 影子每一格都要跟著走 —— 包括被選中、正在飛起來的那一顆。
  // 演出期間 step() 不跑,所以 layout 必須由呼叫端每格單獨叫一次,
  // 不然被抽中的蛋會把影子留在原地。
  function layout() {
    for (const e of eggs) {
      const g = ground(e.group.position.x, e.group.position.z);
      const lift = Math.max(0, e.group.position.y - g);
      e.shadow.position.set(e.group.position.x, -R + g + 0.012, e.group.position.z);
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

  // 由遠到近排序,再依序給 renderOrder:每顆兩個號碼(邊框、填色)。
  // 蛋會滾動、彈跳,深度順序一直在變,所以每一格都要重排。
  const CAM = new THREE.Vector3();
  function sortForPainting() {
    camera.getWorldPosition(CAM);
    const order = eggs
      .map(e => ({ e, d: CAM.distanceToSquared(e.group.position) }))
      .sort((a, b) => b.d - a.d);
    order.forEach(({ e }, i) => {
      for (const part of [e.top, e.bottom]) {
        part.userData.edge.renderOrder = i * 2;
        part.userData.fill.renderOrder = i * 2 + 1;
        if (part.userData.seam) part.userData.seam.renderOrder = i * 2 + 1;
      }
    });
  }

  // 畫面整個往下平移(比例 = 畫面高度):canvas 是透明的,後面是 2D 的雪景,
  // 碗擺在正中間會疊在天空跟遠山上,看起來像浮在半空(2026-10-02 使用者)。往下移才會
  // 落在背景的雪地上。用 setViewOffset 平移投影,不動鏡頭 —— 點擊判定跟粒子對位都跟著走。
  const VIEW_SHIFT = 0.12;
  let viewShift = VIEW_SHIFT;
  function applyViewShift() {
    const w = canvas.clientWidth || 1;
    const h = canvas.clientHeight || 1;
    camera.setViewOffset(w, h, 0, -h * viewShift, w, h);
    camera.updateProjectionMatrix();
  }

  function resize() {
    const w = canvas.clientWidth || 1;
    const h = canvas.clientHeight || 1;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    applyViewShift();
    // 長寬比變了,取景就要重算 —— 不重下一次 look 之前整桌都是切掉的。
    // 演出中(推到近景)也要照當下的推近程度重算,不然轉手機會一下跳回整碗(2026-10-02 審查發現)
    if (focusK > 0) focusView(focusK);
    else look(...lastView);
  }

  // 目前的取景參數,resize 之後要拿它重算一次
  let lastView = [TABLE_BASE * 1.62, TABLE_BASE * 1.82, 0];

  // 鏡頭距離會在視窗變窄時自動往後退。
  // PerspectiveCamera 的 fov 是**垂直**的,水平視角是 atan(tan(fov/2) × aspect),
  // 所以畫面一窄水平視角就跟著縮,原本的距離會把整桌切掉兩邊。
  // 桌面是平的,垂直方向有透視壓縮,所以高度只算 sin(俯角) —— 用包住整桌的
  // 「球」去算會退太遠,整桌縮成中間一小塊。
  function look(dist, height, targetY = 0) {
    lastView = [dist, height, targetY];
    const base = Math.hypot(dist, height) || 1;
    const need = WALL_OUT * (TABLE / TABLE_BASE) * 1.08;   // 牆外緣 + 描邊
    // 垂直方向要放得下:蛋(約 1.1)+ 碗口高過盤面的那段 + 碗外壁往盤面下延伸的那段
    const tall = 1.1 + (RIM_Y - FLOOR_Y + LIP + (FLOOR_Y - WALL_FOOT)) * depthK;
    const vHalf = (camera.fov * Math.PI) / 360;
    const hHalf = Math.atan(Math.tan(vHalf) * camera.aspect);
    const want = Math.max(
      need / Math.tan(hHalf),
      (need * (height / base) + tall * (dist / base)) / Math.tan(vHalf),
    ) * 1.06 * (1 + 3 * viewShift);   // 往下平移之後下緣要多留的空間(內容只剩 0.5 − shift 的半高可用)
    const k = Math.max(1, want / base);   // 只退不進,寬螢幕維持原本的取景
    camera.position.set(0, height * k, dist * k);
    camera.lookAt(0, targetY, 0);
  }

  // 平常看整桌。
  // 平常看整碗。仰角壓低到約 36 度(原本約 48 度):從太高的地方往下看,只看得到碗口一圈,
  // 看不出碗的形狀跟厚度。
  let focusK = 0;   // 目前推近到哪(0 = 整碗、1 = 那顆蛋的近景),resize 時要照著重算
  function homeFraming() {
    viewShift = VIEW_SHIFT;
    applyViewShift();
    look(TABLE * 1.95, TABLE * 1.42);
  }
  function homeView() {
    focusK = 0;
    homeFraming();
  }

  // 點開一顆時推近。k: 0(整桌)→ 1(看那一顆)。
  // 推近幅度刻意留得很保守 —— 推太近的話那顆會脹滿畫面、旁邊沒被選到的蛋
  // 也會擠爆邊緣,看起來像壞掉。
  // 2026-10-02:原本只是把整桌的取景縮一點點,蛋多時桌子很大、鏡頭很遠,飛到中央的那顆
  // 在畫面上還是一小顆、還被前面的蛋擋住。改成從整桌取景平滑移到「對著那顆蛋的近景」:
  // 近景的距離固定(跟桌子大小無關),窄螢幕再依長寬比往後退,蛋加粒子才放得下。
  const HOME = new THREE.Vector3();
  const CLOSE = new THREE.Vector3();
  function focusView(k) {
    focusK = k;
    homeFraming();
    HOME.copy(camera.position);
    const vHalf = (camera.fov * Math.PI) / 360;
    const hHalf = Math.atan(Math.tan(vHalf) * camera.aspect);
    const fit = Math.max(1, Math.tan(vHalf) / Math.tan(hHalf) * 0.8);   // 窄螢幕退一點
    CLOSE.set(0, FOCUS_Y + 2.4 * fit, 3.9 * fit);
    camera.position.lerpVectors(HOME, CLOSE, k);
    camera.lookAt(0, FOCUS_Y * k, 0);
    // 推到近景時平移歸零:被點開的那顆要在畫面正中間(卡片、粒子都對著中間)
    viewShift = VIEW_SHIFT * (1 - k);
    applyViewShift();
  }

  const AIM = new THREE.Object3D();
  const SPIN_Q = new THREE.Quaternion();
  const Z = new THREE.Vector3(0, 0, 1);
  const P = new THREE.Vector3();

  // 轉正:上半朝上、正面(local +z)朝鏡頭 —— Object3D.lookAt 讓 +z 指向目標、+y 保持朝上,
  // 所以接縫在畫面上是水平的。鏡頭在推近,目標每格依鏡頭當下位置重算。
  function upright(egg, k, from) {
    egg.group.getWorldPosition(AIM.position);
    AIM.lookAt(camera.position);
    egg.group.quaternion.slerpQuaternions(from, AIM.quaternion, k);
  }

  // 轉正之後的搖晃要在「畫面平面」裡轉(繞 local z),直接改 rotation.z 會把轉正弄歪
  function wobble(egg, angle, base) {
    SPIN_Q.setFromAxisAngle(Z, angle);
    egg.group.quaternion.copy(base).multiply(SPIN_Q);
  }

  // 蛋投影到螢幕上的位置(client 座標),DOM 特效層對準這一點
  function screenPos(egg) {
    egg.group.getWorldPosition(P).project(camera);
    const rect = canvas.getBoundingClientRect();
    return { x: rect.left + ((P.x + 1) / 2) * rect.width, y: rect.top + ((1 - P.y) / 2) * rect.height };
  }

  homeView();

  return {
    camera,
    get eggs() { return eggs; },
    setEggs,
    removeEgg,
    dropEgg,
    step,
    shake,
    pin,
    layout,
    homeView,
    focusView,
    pick,
    upright,
    wobble,
    screenPos,
    look,
    resize,
    render() {
      sortForPainting();
      renderer.render(scene, camera);
    },
    dispose() { clear(); renderer.dispose(); },
  };
}
