// 大亂鬥的 3D 場景。單位直接沿用物理的(場地半徑 100、角色半徑 8),
// 不另外換算 —— 兩套單位並存遲早會對不上。
//
// 一律平塗、不放光源;立體感靠「深色描邊外殼」(背面渲染的放大體)做,
// 跟站上其他模式一致。
//
// 描邊**不參與深度測試**,改用畫家演算法:每一格由遠到近排序,
// 一個角色先畫完自己所有的描邊,再畫自己所有的本體。否則角色擠在一起時,
// 旁邊那顆的正面會比這顆的背面還近,把描邊整段吃掉(扭蛋機踩過這個坑)。
import * as THREE from 'three';
import { HIT_POWER, HIT_FULL } from './physics.js';

const INK = 0x574239;
const GROUND = -4;        // 場地上表面的高度,角色站在這裡
const SPARK_TIME = 0.22;  // 撞擊火花幾秒
const SPARK_MAX = 5;      // 同時最多幾個火花,再多就是一團糊
const BLAST_TIME = 0.5;   // 爆炸演出幾秒
const BLAST_R = 46;       // 跟 items.js 的 BLAST_RADIUS 對齊:看到的圈就是真的會被炸到的範圍

// 一個可描邊的群組:userData.edges / userData.fills 收集所有零件,
// 排序時整組一起給 renderOrder,零件才不會互相穿插。
function outlinable() {
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
function part(group, geo, color, opts = {}) {
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

// 一顆鋸齒星(半徑 1,躺在 XY 平面朝 +Z)。爆炸畫成球體會變成一團半透明的糊,
// 星形才是小孩認得的「爆炸」。
function starGeo(points, innerRatio) {
  const shape = new THREE.Shape();
  const n = points * 2;
  for (let i = 0; i < n; i++) {
    const r = i % 2 ? innerRatio : 1;
    const a = (i / n) * Math.PI * 2 - Math.PI / 2;
    const x = Math.cos(a) * r;
    const y = Math.sin(a) * r;
    if (i === 0) shape.moveTo(x, y); else shape.lineTo(x, y);
  }
  shape.closePath();
  return new THREE.ShapeGeometry(shape);
}

function shade(color, k) {
  return new THREE.Color(color).multiplyScalar(k);
}

export function createScene(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(42, 1, 1, 2000);
  const root = new THREE.Group();
  scene.add(root);

  /* ---------- 場地 ---------- */
  // 側面要比上表面暗,而且上表面的邊緣要再畫一圈深色 ——
  // 只靠輪廓線的話,畫面下半看到的那條線其實是圓盤**底部**的輪廓,
  // 真正會掉下去的上表面邊界比它高一截,小孩會以為還站得住。
  const arena = outlinable();
  part(arena, new THREE.CylinderGeometry(100, 100, 10, 64),
    [0xE3CDAE, 0xF7E9D6, 0xCDB491], { pos: [0, GROUND - 5, 0], outline: 0.03, depth: true });
  root.add(arena);

  const rim = new THREE.Mesh(
    new THREE.RingGeometry(0.94, 1, 64),
    new THREE.MeshBasicMaterial({ color: INK }));
  rim.rotation.x = -Math.PI / 2;
  root.add(rim);

  const inner = new THREE.Mesh(
    new THREE.CircleGeometry(0.55, 48),
    new THREE.MeshBasicMaterial({ color: 0xFFFFFF, transparent: true, opacity: 0.4 }));
  inner.rotation.x = -Math.PI / 2;
  root.add(inner);

  /* ---------- 共用幾何 ---------- */
  const TIP = new THREE.ConeGeometry(1, 1, 10);
  const DISC = new THREE.CylinderGeometry(1, 1, 1, 8);      // 八角 = 看得出是有刃的陀螺
  const PLATE = new THREE.CylinderGeometry(1, 1, 1, 8);
  const BOLT = new THREE.CylinderGeometry(1, 1, 1, 12);
  const BALL = new THREE.SphereGeometry(1, 16, 12);
  const SPIKE = new THREE.OctahedronGeometry(1, 0);
  const ROD = new THREE.CylinderGeometry(1, 1, 1, 6);
  const SHADOW = new THREE.CircleGeometry(1, 18);
  const RING = new THREE.RingGeometry(0.78, 1, 32);
  const RING_FAT = new THREE.RingGeometry(0.9, 1, 48);
  const STAR = starGeo(11, 0.52);
  const STAR2 = starGeo(9, 0.62);

  // 三種道具:同一顆球,靠顏色跟球面上那個字分辨。
  // 試過用抽象形狀(尖刺/飛鏢/箭頭),實測只有「變大」猜得出來 ——
  // 小孩要在半秒內決定「那個值不值得搶」,寫字是唯一不用猜的做法。
  const ITEM_LOOK = {
    attack: { color: 0xFF6B4A, label: '攻' },
    speed: { color: 0xFFC44A, label: '速' },
    giant: { color: 0xA970F2, label: '大' },
  };
  const ICONS = new Map();

  function iconTexture(label) {
    let t = ICONS.get(label);
    if (t) return t;
    const c = document.createElement('canvas');
    c.width = 128;
    c.height = 128;
    const ctx = c.getContext('2d');
    ctx.font = '700 86px ui-rounded, "Hiragino Maru Gothic ProN", "PingFang TC", "Noto Sans TC", system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    // 白字配深色外框:黃色道具上的純白字會糊掉
    ctx.lineWidth = 10;
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#574239';
    ctx.strokeText(label, 64, 68);
    ctx.fillStyle = '#FFFFFF';
    ctx.fillText(label, 64, 68);
    t = new THREE.CanvasTexture(c);
    ICONS.set(label, t);
    return t;
  }

  // 一顆寫著字的道具球。字用 Sprite,永遠正對鏡頭 ——
  // 貼在球面上的話,球一轉字就看不見了。
  function itemVisual(item) {
    const look = ITEM_LOOK[item.type] ?? ITEM_LOOK.attack;
    const g = outlinable();
    part(g, BALL, look.color, { scale: [8, 8, 8], outline: 1 });
    const icon = new THREE.Sprite(new THREE.SpriteMaterial({
      map: iconTexture(look.label), transparent: true, depthTest: false,
    }));
    icon.scale.setScalar(11);
    g.add(icon);
    g.userData.fills.push(icon);
    return g;
  }

  let actors = new Map();   // combatant.id -> { group, spin, phase, shadow }
  let props = [];           // 道具、炸彈、爆炸,每格重建(數量少)
  let seenBombs = new Map();  // 上一格看到的炸彈,用來認出「剛剛炸掉的那顆」
  let blasts = [];            // 進行中的爆炸 { x, y, at }
  let sparks = [];            // 進行中的撞擊火花 { x, y, k, at, spin }

  // 一顆戰鬥陀螺。單位空間:尖端踩 y=0,佔地半徑 1,整體再乘上物理的 radius。
  // 外層 group 負責位置與傾斜,內層 spin 只負責繞 Y 轉 —— 兩個混在同一個
  // Object3D 上,旋轉軸會跟著傾斜一起歪掉,看起來就不是在原地轉了。
  function beyblade(color) {
    const g = outlinable();
    const spin = new THREE.Group();
    g.add(spin);

    const metal = shade(color, 0.55);
    // 軸尖:圓錐預設尖端朝上,轉 180° 讓它戳地
    part(g, TIP, metal, { pos: [0, 0.17, 0], scale: [0.22, 0.36, 0.22], rotX: Math.PI, outline: 0.1, into: spin });
    part(g, DISC, color, { pos: [0, 0.56, 0], scale: [0.95, 0.56, 0.95], outline: 0.11, into: spin });
    part(g, PLATE, shade(color, 1.2), { pos: [0, 0.94, 0], scale: [0.66, 0.24, 0.66], outline: 0.11, into: spin });
    part(g, BOLT, metal, { pos: [0, 1.14, 0], scale: [0.25, 0.16, 0.25], outline: 0.09, into: spin });

    g.userData.spin = spin;
    return g;
  }

  // 吃到道具就把整顆陀螺的描邊換成那個道具的顏色、順便撐粗一點。
  // 這比在頭上掛一個字好:字會被誤認成掉在地上的道具球,而外框長在陀螺身上,
  // 一看就知道是「這顆陀螺的狀態」。攻擊力優先佔用外框 ——
  // 速度本來就看得出來(轉得比較快),攻擊力沒有外框就完全沒有線索。
  function setOutline(group, buffs) {
    const type = buffs?.attack > 0 ? 'attack' : (buffs?.speed > 0 ? 'speed' : null);
    const color = type ? ITEM_LOOK[type].color : INK;
    const grow = type ? 1.15 : 1;
    for (const e of group.userData.edges) {
      e.material.color.set(color);
      e.scale.copy(e.userData.base).multiplyScalar(grow);
    }
  }

  function prop(geo, color, outline) {
    const g = outlinable();
    part(g, geo, color, { outline });
    return g;
  }

  function shadowDisc(opacity = 0.22) {
    const m = new THREE.Mesh(SHADOW,
      new THREE.MeshBasicMaterial({ color: 0x8A7355, transparent: true, opacity }));
    m.rotation.x = -Math.PI / 2;
    return m;
  }

  function clearProps() {
    for (const p of props) root.remove(p);
    props = [];
  }

  function addProp(m) {
    root.add(m);
    props.push(m);
    return m;
  }

  function groundDisc(m, x, y, scale) {
    m.position.set(x, GROUND + 0.2, y);
    m.scale.setScalar(scale);
    return m;
  }

  // 一顆卡通炸彈:黑球 + 頭上的管子 + 一截引信 + 燒著的火花。
  // 引信愈短,火花閃得愈快、球本身也脹得愈大 —— 光靠變色小孩看不出「快炸了」。
  function bombVisual(bomb) {
    const urgency = Math.max(0, 1 - bomb.fuse / 1.6);          // 0 → 1
    const blinkRate = 6 + urgency * 22;
    const flash = Math.floor(bomb.fuse * blinkRate) % 2 === 0;
    const pulse = 1 + urgency * 0.18 + (flash ? 0.07 : 0);

    const g = outlinable();
    part(g, BALL, flash && urgency > 0.55 ? 0x8C4A3F : 0x3E3330,
      { pos: [0, 0, 0], scale: [7, 7, 7], outline: 0.9 });
    part(g, ROD, 0x6B5A4F, { pos: [0, 6.6, 0], scale: [2, 2.6, 2], outline: 0.5 });
    // 引信往斜後方翹,不然從上面看只是一個點
    part(g, ROD, 0xE8D3B0, { pos: [0, 9.6, -1.6], scale: [0.8, 4, 0.8], rotX: 0.5, outline: 0.35 });
    part(g, SPIKE, flash ? 0xFFF1B8 : 0xFF9A3C,
      { pos: [0, 12, -3], scale: flash ? [3.2, 3.2, 3.2] : [2.4, 2.4, 2.4], outline: 0.4 });

    g.position.set(bomb.x, GROUND + 15, bomb.y);
    g.scale.setScalar(pulse);
    return g;
  }

  // 撞擊火花。物理那邊已經把「靠在一起互推」濾掉了,這裡收到的都是真的重擊,
  // 但同時好幾下還是會疊成一團,所以再壓一個同時存在的上限。
  // 星星小、命都很短(0.22 秒)—— 撞擊是一瞬間的事,拖長了會變成黏在場上的貼紙。
  function sparkVisual(spark, k) {
    // 大部分時間維持不透明,最後才淡出 —— 從頭淡到尾的話,
    // 淺色星星疊在米色地板上會糊成一團看不出是什麼的灰影。
    const fade = k < 0.6 ? 1 : (1 - k) / 0.4;
    const size = (9 + spark.k * 15) * (0.5 + k * 0.9);
    const out = [];
    for (const [geo, color, scale] of [
      [STAR, INK, size * 1.22],
      // 顏色要夠飽和。白色在米色地板上等於沒有對比,看起來像地板髒了
      [STAR2, new THREE.Color(0xFFF3B0).lerp(new THREE.Color(0xFF8A2B), k), size],
    ]) {
      const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
        color, transparent: true, opacity: fade, depthTest: false, depthWrite: false,
      }));
      m.position.set(spark.x, GROUND + 7, spark.y);
      m.quaternion.copy(camera.quaternion);
      m.rotateZ(spark.spin);
      m.scale.setScalar(scale);
      out.push(m);
    }
    return out;
  }

  // 爆炸:一顆面向鏡頭的鋸齒星(深色描邊星 + 亮色星),外加一圈貼地擴散的衝擊波。
  // 星星邊長大邊淡出;地上那圈的最大半徑就是 items.js 真正會炸到的範圍,
  // 看到的圈跟吃到的力必須是同一個數字。
  function blastVisual(blast, k) {
    const ease = 1 - (1 - k) * (1 - k);
    const fade = k < 0.7 ? 1 : (1 - k) / 0.3;
    const spin = blast.spin + k * 0.7;
    const out = [];

    const star = (geo, color, scale, opacity) => {
      const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
        color, transparent: true, opacity, depthTest: false, depthWrite: false,
      }));
      m.position.set(blast.x, GROUND + 16, blast.y);
      m.quaternion.copy(camera.quaternion);
      m.rotateZ(spin);
      m.scale.setScalar(scale);
      out.push(m);
    };

    const size = BLAST_R * (0.35 + 0.65 * ease);
    star(STAR, INK, size * 1.1, fade);
    star(STAR2, new THREE.Color(0xFFE9A8).lerp(new THREE.Color(0xFF6A2B), ease), size, fade);

    const shock = new THREE.Mesh(RING, new THREE.MeshBasicMaterial({
      color: 0xFF8A4C, transparent: true, opacity: fade * 0.65,
      side: THREE.DoubleSide, depthWrite: false,
    }));
    shock.rotation.x = -Math.PI / 2;
    shock.position.set(blast.x, GROUND + 0.4, blast.y);
    shock.scale.setScalar(BLAST_R * ease);
    out.push(shock);

    return out;
  }

  function actorFor(c, color) {
    let a = actors.get(c.id);
    if (a) return a;
    const group = beyblade(new THREE.Color(color));
    const shadow = shadowDisc();
    root.add(group, shadow);
    // 每顆給一個固定的起始角,不然全場的刃會整齊劃一地同步轉,像同一個物件複製出來的
    a = { group, spin: group.userData.spin, phase: Math.random() * Math.PI * 2, shadow };
    actors.set(c.id, a);
    return a;
  }

  function clearActors() {
    for (const a of actors.values()) {
      root.remove(a.group);
      root.remove(a.shadow);
    }
    actors.clear();
  }

  const CAM = new THREE.Vector3();
  // 鏡頭固定從這個方向斜上方俯視:太正上方就退化成 2D,太低則看不到場地後半。
  // 只有「距離」是算出來的。
  const CAM_LOOK = new THREE.Vector3(0, 0, 8);
  const CAM_DIR = new THREE.Vector3(0, 152, 238).normalize();
  const CAM_DIST = 282;              // 原本手調出來的距離,當成寬螢幕的下限
  const CAM_SIN = CAM_DIR.y;         // 俯角的 sin / cos,拿來算平面場地的投影高度
  const CAM_COS = Math.hypot(CAM_DIR.x, CAM_DIR.z);
  const CAM_MARGIN = 1.06;

  // 鏡頭距離每一格重算,讓「場地 + 所有人」一定進得了畫面。
  //
  // 兩件事會讓內容撐破畫面,而且**都不是**把鏡頭釘在固定位置能解決的:
  //   1. 極巨化沒有上限,疊到 5 層身體半徑有 89,比整個場地還大
  //   2. 視窗變窄時水平視角跟著縮 —— PerspectiveCamera 的 fov 是**垂直**的,
  //      水平視角是 atan(tan(fov/2) × aspect),aspect 小於 1 就比垂直還窄
  // 用包住內容的球去算距離,兩個軸取比較窄的那個,就不會有哪一邊被切掉。
  let camDist = 0;

  function frameCamera(world) {
    // 取景**不看任何人站在哪裡**。第一版拿「最遠那個人到中心的距離」去算,
    // 結果人一直在動,鏡頭就一直在呼吸 —— 整場畫面不停放大縮小。
    //
    // 真正需要多留空間的是「身體變大」(極巨化疊到 5 層半徑有 89),那是
    // 撿到道具才會變、而且一整場大多不變的量。場地半徑也用開場的值:
    // 場地會一路縮小,跟著縮就等於一路推近,也是一種持續變焦。
    const home = world.arenaRadius0 ?? world.arenaRadius;
    let fat = 0;
    for (const c of world.combatants) {
      if (c.alive) fat = Math.max(fat, c.radius);
    }
    const need = home + fat;
    const tall = fat * 1.3;

    const vHalf = (camera.fov * Math.PI) / 360;
    const hHalf = Math.atan(Math.tan(vHalf) * camera.aspect);
    // 場地是**平**的,垂直方向會透視壓縮:高度只佔 sin(俯角),
    // 用包住內容的「球」去算會退太遠,畫面整個縮成一小塊。
    const wide = need / Math.tan(hHalf);
    const high = (need * CAM_SIN + tall * CAM_COS) / Math.tan(vHalf);
    const target = Math.max(CAM_DIST * (need / 100), Math.max(wide, high) * CAM_MARGIN);

    // 撿到極巨化、或巨人出局時距離才會變,這時候用補間滑過去,不要用跳的
    camDist = camDist ? camDist + (target - camDist) * 0.06 : target;
    camera.position.copy(CAM_DIR).multiplyScalar(camDist).add(CAM_LOOK);
    camera.lookAt(CAM_LOOK);
  }

  function draw(world, teams) {
    frameCamera(world);
    const r = world.arenaRadius;
    arena.scale.set(r / 100, 1, r / 100);
    rim.scale.setScalar(r);
    rim.position.y = GROUND + 0.15;
    inner.scale.setScalar(r);
    inner.position.y = GROUND + 0.1;

    const live = [];
    for (const c of world.combatants) {
      const team = teams.get(c.fighterId);
      const a = actorFor(c, team?.color ?? '#CCCCCC');
      if (c.alive) {
        a.group.visible = true;
        a.shadow.visible = true;
        a.group.position.set(c.x, GROUND, c.y);
        a.group.scale.setScalar(c.radius);
        // 轉速跟著移動速度加一點,衝過去的時候看起來比較兇
        const speed = Math.hypot(c.vx, c.vy);
        // 吃了速度就轉得明顯更快 —— 數值變快但畫面沒變,玩的人是感覺不到的
        a.spin.rotation.y = a.phase + world.time * (13 + speed * 0.05 + (c.buffs?.speed ?? 0) * 14);
        // 往行進方向傾:陀螺是靠傾斜在跑的,直挺挺平移看起來像貼紙
        a.group.rotation.z = -c.vx * 0.0016;
        a.group.rotation.x = c.vy * 0.0016;
        a.shadow.position.set(c.x, GROUND + 0.25, c.y);
        a.shadow.scale.setScalar(c.radius * 0.95);
        live.push(a.group);
        setOutline(a.group, c.buffs);
      } else {
        // 出局的往下掉出畫面 —— 直接消失看起來像被吃掉,掉下去才看得懂發生什麼事
        a.group.position.y -= 9;
        a.spin.rotation.y += 0.4;
        a.shadow.visible = false;
        if (a.group.position.y < -260) a.group.visible = false;
      }
    }

    clearProps();

    // 道具與炸彈都浮在空中,而且要浮得比陀螺高 —— 同高度會直接插在陀螺身上。
    // 浮著就一定要配地上的影子,不然看不出它落點在哪。
    for (const it of world.items) {
      const m = itemVisual(it);
      // 上下輕輕浮動,讓它跟場上的陀螺區分開來
      m.position.set(it.x, GROUND + 17 + Math.sin(world.time * 2.4) * 1.6, it.y);
      addProp(m);
      addProp(groundDisc(shadowDisc(0.16), it.x, it.y, 6));
    }

    for (const bomb of world.bombs) {
      addProp(bombVisual(bomb));
      addProp(groundDisc(shadowDisc(0.2), bomb.x, bomb.y, 7));
    }

    // 爆炸:上一格還在、這一格不見了的炸彈,就是剛炸掉的那顆。
    // 這樣物理那邊不必為了演出多回傳一個欄位 —— 爆炸純粹是畫面的事。
    for (const b of world.bombs) seenBombs.set(b.id, b);
    for (const [id, b] of seenBombs) {
      if (!world.bombs.some(x => x.id === id)) {
        blasts.push({ x: b.x, y: b.y, at: world.time, spin: Math.random() * Math.PI });
        seenBombs.delete(id);
      }
    }
    // 撞擊火花:新的收進來,舊的淘汰,同時最多 SPARK_MAX 個
    for (const im of world.impacts ?? []) {
      sparks.push({
        x: im.x,
        y: im.y,
        k: Math.min(1, (im.power - HIT_POWER) / (HIT_FULL - HIT_POWER)),
        at: world.time,
        spin: Math.random() * Math.PI,
      });
    }
    if (sparks.length > SPARK_MAX) sparks = sparks.slice(-SPARK_MAX);
    for (let i = sparks.length - 1; i >= 0; i--) {
      const age = (world.time - sparks[i].at) / SPARK_TIME;
      if (age >= 1 || age < 0) { sparks.splice(i, 1); continue; }
      for (const m of sparkVisual(sparks[i], age)) addProp(m);
    }

    for (let i = blasts.length - 1; i >= 0; i--) {
      const age = (world.time - blasts[i].at) / BLAST_TIME;
      if (age >= 1) { blasts.splice(i, 1); continue; }
      for (const m of blastVisual(blasts[i], age)) addProp(m);
    }

    // 由遠到近排序:一整組的描邊先畫完,再畫這組的本體。
    // 影子沒有描邊(userData 是空的),排進來也只是拿個 renderOrder,不影響。
    camera.getWorldPosition(CAM);
    const order = [...live, ...props]
      .sort((a, b) => CAM.distanceToSquared(b.position) - CAM.distanceToSquared(a.position));
    let n = 0;
    for (const g of order) {
      for (const e of g.userData.edges ?? []) e.renderOrder = n;
      n += 1;
      for (const f of g.userData.fills ?? []) f.renderOrder = n;
      n += 1;
    }

    renderer.render(scene, camera);
  }

  function resize() {
    const w = canvas.clientWidth || 1;
    const h = canvas.clientHeight || 1;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    // 鏡頭的位置每一格由 frameCamera 決定,這裡只管畫布大小與長寬比
  }

  return {
    draw,
    resize,
    camera,
    reset() { clearActors(); seenBombs.clear(); blasts = []; sparks = []; camDist = 0; },
    dispose() { clearProps(); clearActors(); renderer.dispose(); },
  };
}
