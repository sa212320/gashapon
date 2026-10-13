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
import { INK, outlinable, part } from './outline3d.js';
import { createStadium } from './stadium3d.js';
import { createBey, setChipTexture, loadChipTextures } from './bey3d.js';
import { HEAL_FLASH, MISSILE_FUSE, BLAST_RADIUS } from './items.js';
import { BOUNDS, heightAt } from './stadium.js';

const GROUND = -4;        // 場地上表面的高度,角色站在這裡
const SPARK_TIME = 0.22;  // 撞擊火花幾秒
const SPARK_MAX = 5;      // 同時最多幾個火花,再多就是一團糊
const BLAST_TIME = 0.5;   // 爆炸演出幾秒

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

// 落地時彈一下,像真的陀螺被射進盤裡
function easeOutBounce(x) {
  const n = 7.5625;
  const d = 2.75;
  if (x < 1 / d) return n * x * x;
  if (x < 2 / d) return n * (x -= 1.5 / d) * x + 0.75;
  if (x < 2.5 / d) return n * (x -= 2.25 / d) * x + 0.9375;
  return n * (x -= 2.625 / d) * x + 0.984375;
}

function shade(color, k) {
  return new THREE.Color(color).multiplyScalar(k);
}

export function createScene(canvas, { pitch = 55 } = {}) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(42, 1, 1, 2000);
  const root = new THREE.Group();
  scene.add(root);

  /* ---------- 場地 ---------- */
  // 對戰盤的形狀全部在 stadium.js;這裡只是把它放進場景
  const stadium = createStadium(GROUND);
  root.add(stadium);

  /* ---------- 共用幾何 ---------- */
  const BALL = new THREE.SphereGeometry(1, 16, 12);
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
    shield: { color: 0x5AA9F2, label: '盾' },
    spin: { color: 0x5CCB7A, label: '轉' },
    missile: { color: 0xA970F2, label: '彈' },
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
  let seenStrikes = new Map(); // 上一格看到的空襲,用來認出「剛剛炸開的那顆」
  let blasts = [];            // 進行中的爆炸 { x, y, at }
  let sparks = [];            // 進行中的撞擊火花 { x, y, k, at, spin }
  let lastTime = 0;           // 上一格的 world.time(算這一格的 dt)

  // 動物圓片的貼圖:載完之前先建立的陀螺,載完再補上
  const chipTextures = new Map();
  loadChipTextures().then(m => {
    for (const [k, v] of m) chipTextures.set(k, v);
    for (const a of actors.values()) a.applyChip();
  }).catch(() => {});   // 圖載不到就只是沒有動物,不影響比賽

  // 狀態長在陀螺身上,一看就知道是「這顆陀螺的」:
  //   劍:外框變紅、愈多層愈粗    補包:剛補完那一下外框閃綠(優先於劍)
  // 盾另外是一圈半透明的冰環(見 actor.shield)。
  const HEAL_GREEN = 0x4CC38A;
  function setOutline(group, c, time) {
    const swords = c.buffs?.attack?.length ?? 0;
    const healing = time - (c.healedAt ?? -Infinity) < HEAL_FLASH;
    const color = healing ? HEAL_GREEN : swords > 0 ? ITEM_LOOK.attack.color : INK;
    const grow = healing ? 1.2 : 1 + 0.12 * swords;
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
    m.position.set(x, GROUND + heightAt(x, y) + 0.2, y);
    m.scale.setScalar(scale);
    return m;
  }

  // 準星:發射隊伍色的雙圈 + 十字,邊倒數邊縮、最後 0.4 秒閃。
  // 圈的大小 = BLAST_RADIUS —— 看到的圈就是真的會被炸到的範圍。
  const BAR = new THREE.PlaneGeometry(1, 1);
  function crosshairVisual(strike, color) {
    const k = 1 - Math.max(0, strike.fuse) / MISSILE_FUSE;   // 0 → 1
    const blink = strike.fuse < 0.4 && Math.floor(strike.fuse * 16) % 2 === 0;
    const g = new THREE.Group();
    // 碗底往外翹,平平一圈放在中間的高度會被碗底吃掉 —— 不做深度測試,直接畫在最上層
    const mat = new THREE.MeshBasicMaterial({
      color: blink ? 0xFFFFFF : color, transparent: true, opacity: 0.6, side: THREE.DoubleSide,
      depthWrite: false, depthTest: false,
    });
    const outer = new THREE.Mesh(RING_FAT, mat);
    outer.scale.setScalar(BLAST_RADIUS * (1.15 - 0.15 * k));
    const inner = new THREE.Mesh(RING, mat);
    inner.scale.setScalar(BLAST_RADIUS * 0.35);
    const h = new THREE.Mesh(BAR, mat);
    h.scale.set(BLAST_RADIUS * 0.5, 2, 1);
    const v = new THREE.Mesh(BAR, mat);
    v.scale.set(2, BLAST_RADIUS * 0.5, 1);
    g.add(outer, inner, h, v);
    for (const m of g.children) m.renderOrder = 9000;
    g.rotation.x = -Math.PI / 2;
    g.position.set(strike.x, GROUND + heightAt(strike.x, strike.y) + 0.5, strike.y);
    return g;
  }

  // 卡通飛彈:白色彈身 + 紅色彈頭 + 冰藍尾翼,從左上方斜斜落到準星。不追蹤 —— 落點就是準星。
  const MISSILE_FROM = new THREE.Vector3(-70, 130, -40);   // 不能太遠,不然大半段倒數都在畫面外
  const NOSE = new THREE.ConeGeometry(1, 1, 12);
  const FIN = new THREE.BoxGeometry(1, 1, 1);
  function missileVisual(strike) {
    const k = 1 - Math.max(0, strike.fuse) / MISSILE_FUSE;
    const ease = k * k;                          // 先慢後快,像在加速落下
    const target = new THREE.Vector3(strike.x, GROUND + heightAt(strike.x, strike.y), strike.y);
    const from = target.clone().add(MISSILE_FROM);
    const g = outlinable();
    part(g, ROD, 0xFFFFFF, { pos: [0, 0, 0], scale: [3, 12, 3], outline: 0.5 });
    part(g, NOSE, 0xE4572E, { pos: [0, -8.5, 0], scale: [3, 5, 3], rotX: Math.PI, outline: 0.5 });
    for (let i = 0; i < 3; i++) {
      const a = (i * Math.PI * 2) / 3;
      part(g, FIN, 0x8EC5E8, { pos: [Math.cos(a) * 2.6, 5, Math.sin(a) * 2.6], scale: [2.4, 4, 0.6], outline: 0.4 });
    }
    g.position.copy(from.lerp(target, ease));
    g.lookAt(target);
    g.rotateX(Math.PI / 2);   // 讓彈頭(-y)朝向落點
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
      m.position.set(spark.x, GROUND + heightAt(spark.x, spark.y) + 7, spark.y);
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
      m.position.set(blast.x, GROUND + heightAt(blast.x, blast.y) + 16, blast.y);
      m.quaternion.copy(camera.quaternion);
      m.rotateZ(spin);
      m.scale.setScalar(scale);
      out.push(m);
    };

    const size = BLAST_RADIUS * (0.35 + 0.65 * ease);
    star(STAR, INK, size * 1.1, fade);
    star(STAR2, new THREE.Color(0xFFE9A8).lerp(new THREE.Color(0xFF6A2B), ease), size, fade);

    const shock = new THREE.Mesh(RING, new THREE.MeshBasicMaterial({
      color: 0xFF8A4C, transparent: true, opacity: fade * 0.65,
      side: THREE.DoubleSide, depthWrite: false,
    }));
    shock.rotation.x = -Math.PI / 2;
    shock.position.set(blast.x, GROUND + heightAt(blast.x, blast.y) + 0.4, blast.y);
    shock.scale.setScalar(BLAST_RADIUS * ease);
    out.push(shock);

    return out;
  }

  const SHIELD_RING = new THREE.RingGeometry(1.15, 1.35, 40);

  function actorFor(c, color) {
    let a = actors.get(c.id);
    if (a) return a;
    const group = createBey(c.beyType, color);
    const shadow = shadowDisc();
    // 盾:平躺在陀螺腰上的一圈冰環,層數愈多愈不透明
    const shield = new THREE.Mesh(SHIELD_RING, new THREE.MeshBasicMaterial({
      color: 0x9FD8F7, transparent: true, opacity: 0.4, side: THREE.DoubleSide, depthWrite: false,
    }));
    shield.rotation.x = -Math.PI / 2;
    shield.position.y = 0.6;
    shield.visible = false;
    group.add(shield);
    root.add(group, shadow);
    // 每顆給一個固定的起始角,不然全場的刃會整齊劃一地同步轉,像同一個物件複製出來的
    a = {
      group, shadow, shield,
      spin: group.userData.spin,
      parts: group.userData.parts,
      outAt: null, debris: null, faded: false,
      applyChip() { const t = chipTextures.get(c.animal); if (t) setChipTexture(group, t); },
    };
    a.spin.rotation.y = Math.random() * Math.PI * 2;
    a.applyChip();
    actors.set(c.id, a);
    return a;
  }

  function clearActors() {
    for (const a of actors.values()) {
      root.remove(a.group);
      root.remove(a.shadow);
      for (const d of a.debris ?? []) root.remove(d.obj);
    }
    actors.clear();
  }

  // 整顆陀螺(含零件)的材質一起淡出
  function setOpacity(obj, k) {
    obj.traverse(o => {
      if (!o.material) return;
      for (const m of [].concat(o.material)) { m.transparent = true; m.opacity = k; }
    });
  }

  const SPIN_FALL = 1;      // 停轉:幾秒倒下
  const SPIN_FADE = 1;      //        倒下後幾秒淡出
  const BURST_TIME = 0.9;   // 爆裂:零件飛幾秒
  const WOBBLE_FROM = 0.35; // 轉速低於這個開始晃

  // 爆裂:三件(戰刃連圓片、固鎖、軸心)從陀螺上拆下來,各往一個方向飛,邊飛邊翻
  function burstApart(a, c) {
    const pieces = [a.parts.blade, a.parts.ratchet, a.parts.bit];
    const chip = a.group.userData.chip;
    a.parts.blade.attach(chip);
    const base = Math.random() * Math.PI * 2;
    a.debris = pieces.map((obj, i) => {
      root.attach(obj);
      const dir = base + (i * Math.PI * 2) / 3;
      const speed = 40 + Math.random() * 20;
      return {
        obj,
        v: new THREE.Vector3(Math.cos(dir) * speed, 55 + Math.random() * 20, Math.sin(dir) * speed),
        w: new THREE.Vector3((Math.random() - 0.5) * 14, (Math.random() - 0.5) * 14, (Math.random() - 0.5) * 14),
      };
    });
    a.group.visible = false;
    a.shadow.visible = false;
    sparks.push({ x: c.x, y: c.y, k: 1, at: lastTime, spin: Math.random() * Math.PI });
  }

  const CAM = new THREE.Vector3();
  // 鏡頭固定從這個方向斜上方俯視(pitch = 俯角):太正上方就退化成 2D,太低則看不到場地後半。
  // 只有「距離」是算出來的。
  const CAM_LOOK = new THREE.Vector3(0, GROUND, 0);
  const CAM_DIR = new THREE.Vector3(0, Math.sin((pitch * Math.PI) / 180), Math.cos((pitch * Math.PI) / 180));
  const CAM_MARGIN = 0.9;            // 盤子最多佔畫面寬高的這麼多

  // 要框進畫面的東西:整台盤子(含透明外殼的高度)。
  const FIT = [];
  for (const x of [BOUNDS.x0, BOUNDS.x1]) {
    for (const z of [BOUNDS.z0, BOUNDS.z1]) {
      for (const y of [GROUND, GROUND + 30]) FIT.push(new THREE.Vector3(x, y, z));
    }
  }
  const probe = new THREE.Vector3();

  // 盤子的投影範圍(NDC):{ x: 最寬的那一側, top, bottom }
  function extent(dist) {
    camera.position.copy(CAM_DIR).multiplyScalar(dist).add(CAM_LOOK);
    camera.lookAt(CAM_LOOK);
    camera.updateMatrixWorld();
    let x = 0;
    let top = -Infinity;
    let bottom = Infinity;
    for (const p of FIT) {
      probe.copy(p).project(camera);
      x = Math.max(x, Math.abs(probe.x));
      top = Math.max(top, probe.y);
      bottom = Math.min(bottom, probe.y);
    }
    return { x, top, bottom };
  }

  function fits(dist) {
    const e = extent(dist);
    return e.x <= CAM_MARGIN && e.top <= CAM_MARGIN && e.bottom >= -CAM_MARGIN;
  }

  // 距離只跟長寬比有關:盤子不縮、陀螺也不會變大,取景**不看任何人站在哪裡** ——
  // 第一版拿「最遠那個人到中心的距離」去算,結果整場畫面一直在呼吸。
  // 用投影去試而不是公式:靠鏡頭那側(口袋)透視會放大,公式算的會把口袋切掉。
  let fitAspect = 0;
  let camDist = 0;

  function frameCamera() {
    if (camera.aspect !== fitAspect) {
      // 先找距離,再把盤子上下置中(透視讓靠鏡頭那側比較大,看的點要往前挪),來回幾次就收斂
      CAM_LOOK.z = 0;
      for (let pass = 0; pass < 4; pass++) {
        let lo = 50;
        let hi = 3000;
        for (let i = 0; i < 30; i++) {
          const mid = (lo + hi) / 2;
          if (fits(mid)) hi = mid; else lo = mid;
        }
        camDist = hi;
        const e = extent(camDist);
        const off = (e.top + e.bottom) / 2;
        const vHalf = (camera.fov * Math.PI) / 360;
        CAM_LOOK.z -= (off * camDist * Math.tan(vHalf)) / CAM_DIR.y;
      }
      fitAspect = camera.aspect;
    }
    camera.position.copy(CAM_DIR).multiplyScalar(camDist).add(CAM_LOOK);
    camera.lookAt(CAM_LOOK);
  }

  // drop:開場的落下進度(0 = 還在上方,1 = 落地)
  function draw(world, teams, { drop = 1 } = {}) {
    const fall = drop < 1 ? (1 - easeOutBounce(Math.max(0, drop))) * 120 : 0;
    frameCamera();

    const dt = Math.max(0, Math.min(0.1, world.time - lastTime));
    lastTime = world.time;
    const live = [];
    const pocketCount = new Map();   // 同一個出口裡已經有幾顆(錯開放)
    for (const c of world.combatants) {
      const team = teams.get(c.fighterId);
      const a = actorFor(c, team?.color ?? '#CCCCCC');
      const ground = GROUND + heightAt(c.x, c.y);
      if (c.alive) {
        a.group.visible = true;
        a.shadow.visible = true;
        a.group.position.set(c.x, ground + fall, c.y);
        a.group.scale.setScalar(c.radius);
        // 轉速就是命:轉得愈慢,刃轉得愈慢
        a.spin.rotation.y += dt * (6 + 22 * c.spin);
        if (c.spin < WOBBLE_FROM) {
          // 快停了:整顆繞著軸尖畫圈地晃,愈慢晃愈大
          const w = (WOBBLE_FROM - c.spin) / WOBBLE_FROM;
          a.group.rotation.z = Math.sin(world.time * 9) * 0.32 * w;
          a.group.rotation.x = Math.cos(world.time * 9) * 0.32 * w;
        } else {
          // 往行進方向傾:陀螺是靠傾斜在跑的,直挺挺平移看起來像貼紙
          a.group.rotation.z = -c.vx * 0.0016;
          a.group.rotation.x = c.vy * 0.0016;
        }
        a.shadow.position.set(c.x, ground + 0.25, c.y);
        a.shadow.scale.setScalar(c.radius * 0.95 * (drop < 1 ? 0.4 + 0.6 * easeOutBounce(Math.max(0, drop)) : 1));
        const shields = c.buffs?.shield?.length ?? 0;
        a.shield.visible = shields > 0;
        a.shield.material.opacity = 0.25 + 0.2 * shields;
        setOutline(a.group, c, world.time);
        live.push(a.group);
        continue;
      }

      // 出局
      if (a.outAt === null) {
        a.outAt = world.time;
        a.shield.visible = false;
        setOutline(a.group, { buffs: {} }, world.time);
        if (c.outBy === 'burst') burstApart(a, c);
        // 掉進出口的會被牆擋住一部分:描邊也要照深度畫,不然整圈描邊會蓋在牆上
        if (c.outBy === 'ringout') {
          for (const e of a.group.userData.edges) { e.material.depthTest = true; e.material.depthWrite = true; }
        }
      }
      const t = world.time - a.outAt;
      if (c.outBy === 'burst') {
        for (const d of a.debris ?? []) {
          d.v.y -= 140 * dt;
          d.obj.position.addScaledVector(d.v, dt);
          d.obj.rotation.x += d.w.x * dt;
          d.obj.rotation.y += d.w.y * dt;
          d.obj.rotation.z += d.w.z * dt;
          d.obj.visible = t < BURST_TIME;
        }
      } else if (c.outBy === 'spinout') {
        // 停轉:慢慢倒下,倒好之後淡出
        a.group.rotation.x = 0;
        a.group.rotation.z = (Math.PI / 2) * 0.9 * Math.min(1, t / SPIN_FALL);
        a.shadow.visible = false;
        if (t > SPIN_FALL) setOpacity(a.group, Math.max(0, 1 - (t - SPIN_FALL) / SPIN_FADE));
        a.group.visible = t < SPIN_FALL + SPIN_FADE;
        if (a.group.visible) live.push(a.group);
      } else {
        // 場外:停在出口裡(物理已經放好位置),慢慢轉停;同一個出口依出局順序錯開
        const n = pocketCount.get(c.pocket) ?? 0;
        pocketCount.set(c.pocket, n + 1);
        const off = n * c.radius * 0.6;
        a.group.position.set(c.x + off, ground, c.y);
        a.group.rotation.set(0, 0, 0.35);
        a.spin.rotation.y += dt * 6 * Math.max(0, 1 - t / 1.5);
        a.shadow.visible = false;
        live.push(a.group);
      }
    }

    clearProps();

    // 道具與炸彈都浮在空中,而且要浮得比陀螺高 —— 同高度會直接插在陀螺身上。
    // 浮著就一定要配地上的影子,不然看不出它落點在哪。
    for (const it of world.items) {
      const m = itemVisual(it);
      // 上下輕輕浮動,讓它跟場上的陀螺區分開來
      m.position.set(it.x, GROUND + heightAt(it.x, it.y) + 17 + Math.sin(world.time * 2.4) * 1.6, it.y);
      addProp(m);
      addProp(groundDisc(shadowDisc(0.16), it.x, it.y, 6));
    }

    for (const st of world.strikes ?? []) {
      const color = teams.get(st.fighterId)?.color ?? '#574239';
      addProp(crosshairVisual(st, color));
      addProp(missileVisual(st));
    }
    // 爆炸:上一格還在、這一格不見了的空襲,就是剛炸開的那一顆。
    // 這樣物理那邊不必為了演出多回傳一個欄位 —— 爆炸純粹是畫面的事。
    for (const st of world.strikes ?? []) seenStrikes.set(st.id, st);
    for (const [id, st] of seenStrikes) {
      if (!(world.strikes ?? []).some(x => x.id === id)) {
        blasts.push({ x: st.x, y: st.y, at: world.time, spin: Math.random() * Math.PI });
        seenStrikes.delete(id);
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
    ready: stadium.userData.ready,   // 盤子的模型下載完
    reset() { clearActors(); seenStrikes.clear(); blasts = []; sparks = []; lastTime = 0; },
    dispose() { clearProps(); clearActors(); renderer.dispose(); },
  };
}
