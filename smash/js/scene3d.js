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
import { visibleTurn, drawnRate, blurAlpha, DRAW_MAX } from './spin-look.js';
import { HIT_POWER, HIT_FULL } from './physics.js';
import { INK, outlinable, part } from './outline3d.js';
import { createStadium } from './stadium3d.js';
import { createBey, setChipTexture, loadChipTextures } from './bey3d.js';
import { HEAL_FLASH, METEOR_FUSE, BLAST_RADIUS, FROST_FLIGHT, WHIRL_RADIUS, WHIRL_TIME } from './items.js';
import * as ART from './art.js';
import { fxFrame } from './fx-frame.js';
import { landing } from './opening.js';
import { slideStep } from './spinout-slide.js';
import { BOUNDS, heightAt } from './stadium.js';

const GROUND = -4;        // 場地上表面的高度,角色站在這裡
const SPARK_TIME = 0.4;   // 撞擊火花幾秒(逐格動畫 17 格)
const SPARK_MAX = 5;      // 同時最多幾個火花,再多就是一團糊
// 生成的圖裡衝擊波只佔格子中間一部分:整格要放大幾倍,畫出來才剛好是爆炸範圍的直徑
const FX_CLOUD_SPAN = 3.4;  // 蘑菇雲的高度(格子)約是爆炸範圍半徑的幾倍
const FX_SHOCK_SPAN = 2.5;   // 衝擊波的圈在圖裡大約佔 80%,再隨時間從 35% 擴散到 100%
const BLAST_TIME = 1.6;   // 爆炸演出幾秒(蘑菇雲逐格動畫 17 格)

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
  const SHADOW = new THREE.CircleGeometry(1, 18);
  const RING = new THREE.RingGeometry(0.78, 1, 32);
  const RING_FAT = new THREE.RingGeometry(0.9, 1, 48);
  const STAR = starGeo(11, 0.52);
  const STAR2 = starGeo(9, 0.62);

  // 道具:生成的彩色圖示(劍、盾、補包、飛彈),正對鏡頭浮在場上。
  // 場景一建立就開始載(首頁也預先載過,通常是快取命中),不等第一個道具掉下來。
  const itemTex = new Map();
  const texLoader = new THREE.TextureLoader();
  for (const [type, url] of Object.entries(ART.ITEM_URLS)) {
    texLoader.load(url, t => { t.colorSpace = THREE.SRGBColorSpace; itemTex.set(type, t); });
  }

  // 逐格特效(ComfyUI 生成,黑底轉透明的橫條):每一格先備好一張共用同一份圖的貼圖,
  // 換格只是換貼圖,不用每格重新上傳。圖還沒載好就先用程式畫的星星頂著。
  const fxTex = new Map();   // name -> [每一格的貼圖]
  for (const [name, { url, frames }] of Object.entries(ART.FX_URLS ?? {})) {
    texLoader.load(url, t => {
      t.colorSpace = THREE.SRGBColorSpace;
      fxTex.set(name, Array.from({ length: frames }, (_, i) => {
        const f = t.clone();
        f.repeat.set(1 / frames, 1);
        f.offset.set(i / frames, 0);
        return f;
      }));
    });
  }

  // anchorY:圖的哪個高度對準 (x, y)。0.5 = 正中間;蘑菇雲要從地面冒上來,對準雲的底部
  function fxSprite(name, k, x, y, lift, size, { anchorY = 0.5, opacity = 1 } = {}) {
    const frames = fxTex.get(name);
    if (!frames) return null;
    const m = new THREE.Sprite(new THREE.SpriteMaterial({
      map: frames[fxFrame(k, frames.length)], transparent: true, opacity, depthTest: false, depthWrite: false,
    }));
    m.center.set(0.5, anchorY);
    m.position.set(x, GROUND + heightAt(x, y) + lift, y);
    m.scale.setScalar(size);
    return m;
  }

  // 平貼在盤面上的逐格特效(大圓火球、衝擊波):大小 = 在盤面上佔多寬。
  // 盤面是碗形,平面會插進碗壁,所以不做深度測試,直接疊在上面。
  const FLAT = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  function fxFlat(name, k, x, y, size, opacity = 1) {
    const frames = fxTex.get(name);
    if (!frames || k < 0 || k >= 1) return null;
    const m = new THREE.Mesh(FLAT, new THREE.MeshBasicMaterial({
      map: frames[fxFrame(k, frames.length)], transparent: true, opacity, depthTest: false, depthWrite: false,
    }));
    m.position.set(x, GROUND + heightAt(x, y) + 0.5, y);
    m.scale.setScalar(size);
    return m;
  }

  function itemVisual(item) {
    const icon = new THREE.Sprite(new THREE.SpriteMaterial({
      map: itemTex.get(item.type) ?? null, transparent: true, depthTest: false,
    }));
    icon.scale.setScalar(16);
    icon.renderOrder = 9000;
    return icon;
  }


  let actors = new Map();   // combatant.id -> { group, spin, phase, shadow }
  let props = [];           // 道具、炸彈、爆炸,每格重建(數量少)
  let seenStrikes = new Map(); // 上一格看到的空襲,用來認出「剛剛炸開的那顆」
  let blasts = [];            // 進行中的爆炸 { x, y, at }
  let sparks = [];            // 進行中的撞擊火花 { x, y, k, at, spin }
  let lastTime = 0;           // 上一格的 world.time(算這一格的 dt)
  let bursts = [];            // 進行中的爆裂演出 { x, y, at }
  let shakeUntil = -1;        // 鏡頭震到什麼時候

  // 動物圓片的貼圖:載完之前先建立的陀螺,載完再補上
  const chipTextures = new Map();
  loadChipTextures().then(m => {
    for (const [k, v] of m) chipTextures.set(k, v);
    for (const a of actors.values()) a.applyChip();
  }).catch(() => {});   // 圖載不到就只是沒有動物,不影響比賽

  // 外框:剛補完轉速(冰旋渦)那一下閃綠
  const HEAL_GREEN = 0x4CC38A;
  function setOutline(group, c, time) {
    const healing = time - (c.healedAt ?? -Infinity) < HEAL_FLASH;
    const color = healing ? HEAL_GREEN : INK;
    const grow = healing ? 1.2 : 1;
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
    for (const p of props) {
      root.remove(p);
      if (p.userData.ownGeometry) p.geometry.dispose();   // 每格重建的網格(冰旋渦)要放掉,不然 GPU 記憶體一直漲
    }
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
    const k = 1 - Math.max(0, strike.fuse) / METEOR_FUSE;   // 0 → 1
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

  // 衝刺(劍)的預告:從陀螺拉一條隊伍色虛線箭頭指向目標,目標腳下一個小準星圈。
  // 跟飛彈同一種語言 —— 先讓大家看到「它要衝那顆了」,再衝。
  const ARROW_HEAD = new THREE.ShapeGeometry(new THREE.Shape([
    new THREE.Vector2(0, 1), new THREE.Vector2(-0.8, -0.6), new THREE.Vector2(0.8, -0.6),
  ]));
  function dashAimVisual(c, target, color, time) {
    const g = new THREE.Group();
    const mat = new THREE.MeshBasicMaterial({
      color, transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false, depthTest: false,
    });
    const dx = target.x - c.x;
    const dy = target.y - c.y;
    const len = Math.hypot(dx, dy) || 1e-4;
    const ux = dx / len;
    const uy = dy / len;
    const from = c.radius * 1.4;
    const to = len - target.radius * 1.6;
    const DASHLEN = 5;
    const crawl = (time * 40) % (DASHLEN * 2);   // 虛線往目標爬,看得出方向
    for (let d = from + crawl; d + DASHLEN < to; d += DASHLEN * 2) {
      const m = new THREE.Mesh(BAR, mat);
      m.scale.set(2.2, DASHLEN, 1);
      m.rotation.z = Math.atan2(uy, ux) - Math.PI / 2;
      m.position.set(c.x + ux * (d + DASHLEN / 2), c.y + uy * (d + DASHLEN / 2), 0);
      g.add(m);
    }
    const head = new THREE.Mesh(ARROW_HEAD, mat);
    head.scale.setScalar(4.5);
    head.rotation.z = Math.atan2(uy, ux) - Math.PI / 2;
    head.position.set(c.x + ux * to, c.y + uy * to, 0);
    const ring = new THREE.Mesh(RING_FAT, mat);
    ring.scale.setScalar(target.radius * 1.7);
    ring.position.set(target.x, target.y, 0);
    g.add(head, ring);
    for (const m of g.children) m.renderOrder = 9000;
    // 平面座標 (x, y) 躺到盤面上:轉 -90° 後平面的 y 對到 -z,所以 y 先取負
    for (const m of g.children) m.position.y = -m.position.y;
    g.rotation.x = -Math.PI / 2;
    g.position.y = GROUND + heightAt(c.x, c.y) + 1;
    return g;
  }

  // 丟冰塊:吃到冰塊道具,把小冰塊(道具那張圖)拋向目標現在的位置,邊飛邊轉、邊變大,
  // 落到目標身上剛好是罩住它的冰塊大小 —— 「吃到冰塊 → 丟過去 → 對手被凍住」前後連得起來。
  function frostVisual(f, target) {
    const k = Math.min(1, f.t / FROST_FLIGHT);
    const tex = itemTex.get('freeze');
    const out = [];
    const at = q => {
      const x = f.fromX + (target.x - f.fromX) * q;
      const y = f.fromY + (target.y - f.fromY) * q;
      return new THREE.Vector3(x, GROUND + heightAt(x, y) + Math.sin(q * Math.PI) * 22, y);   // 拋物線
    };
    const full = ICE_SIZE * target.radius;
    const size = full * (0.35 + 0.65 * k);
    const cube = new THREE.Sprite(new THREE.SpriteMaterial({
      map: tex ?? null, transparent: true, depthTest: false, rotation: (1 - k) * 5,
    }));
    cube.center.set(0.5, 0.3);
    cube.position.copy(at(k));
    cube.scale.set(size * (tex ? tex.image.width / tex.image.height : 1), size, 1);
    cube.renderOrder = 9000;
    out.push(cube);
    // 後面拖幾顆小冰屑
    for (const [q, s2] of [[k - 0.15, 3], [k - 0.3, 2.2], [k - 0.45, 1.5]]) {
      if (q < 0) continue;
      const m = new THREE.Mesh(STAR2, new THREE.MeshBasicMaterial({ color: 0xE6F7FF, transparent: true, depthTest: false, depthWrite: false }));
      m.position.copy(at(q)).add(new THREE.Vector3(0, full * 0.2, 0));
      m.quaternion.copy(camera.quaternion);
      m.scale.setScalar(s2);
      m.renderOrder = 9000;
      out.push(m);
    }
    return out;
  }

  // 冰旋渦:把漩渦圖(道具圖示那張)貼在盤面上(跟著碗的弧度彎),大小 = 捲入範圍。
  // 像漩渦而不是轉盤:**愈靠中心轉得愈快**,紋路一直被扭進中心;再加幾片雪花沿螺旋捲進中心。
  const VORTEX_RINGS = 8;
  const VORTEX_SEGS = 48;
  function vortexGeometry(cx, cy, radius, t) {
    const pos = [];
    const uv = [];
    const vert = (i, j) => {
      const r = j / VORTEX_RINGS;
      const a = (i / VORTEX_SEGS) * Math.PI * 2;
      const x = cx + Math.cos(a) * r * radius;
      const y = cy + Math.sin(a) * r * radius;
      pos.push(x, GROUND + heightAt(x, y) + 0.5, y);
      const twist = a + t * (3 + 9 * (1 - r) ** 2);   // 中心轉得快、外圈慢
      uv.push(0.5 + 0.5 * r * Math.cos(twist), 0.5 + 0.5 * r * Math.sin(twist));
    };
    for (let j = 0; j < VORTEX_RINGS; j++) {
      for (let i = 0; i < VORTEX_SEGS; i++) {
        vert(i, j); vert(i + 1, j); vert(i + 1, j + 1);
        vert(i, j); vert(i + 1, j + 1); vert(i, j + 1);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    return g;
  }

  function whirlVisual(c, time) {
    const out = [];
    const tex = itemTex.get('vortex');
    const age = WHIRL_TIME - c.whirl;
    const fade = Math.min(1, c.whirl / 0.3);
    const grow = Math.min(1, age / 0.25);
    const radius = WHIRL_RADIUS * (0.3 + 0.7 * grow);
    if (tex) {
      const m = new THREE.Mesh(vortexGeometry(c.x, c.y, radius, age), new THREE.MeshBasicMaterial({
        map: tex, transparent: true, opacity: 0.75 * fade, depthWrite: false, side: THREE.DoubleSide,
      }));
      m.renderOrder = -0.5;   // 疊在盤面上、陀螺下面
      m.userData.ownGeometry = true;
      out.push(m);
    }
    // 雪花沿螺旋從外圈捲進中心,到中心消失、再從外圈出現
    const ground = GROUND + heightAt(c.x, c.y);
    for (let i = 0; i < 12; i++) {
      const p = (age * 0.9 + i / 12) % 1;
      const r = radius * (1 - p);
      const a = i * 2.4 + p * 7;
      const m = new THREE.Mesh(STAR2, new THREE.MeshBasicMaterial({
        color: 0xFFFFFF, transparent: true, opacity: fade * Math.sin(p * Math.PI), depthTest: false, depthWrite: false,
      }));
      m.position.set(c.x + Math.cos(a) * r, ground + 2 + 4 * (1 - p), c.y + Math.sin(a) * r);
      m.quaternion.copy(camera.quaternion);
      m.rotateZ(age * 6 + i);
      m.scale.setScalar(1.4 + 1.6 * (1 - p));
      m.renderOrder = 8600;
      out.push(m);
    }
    return out;
  }

  // 衝刺的殘影:最近幾格的位置各留一個淡淡的隊伍色圓盤,愈舊愈淡
  function dashTrailVisual(trail, color, radius) {
    return trail.map((p, i) => {
      const m = new THREE.Mesh(SHADOW, new THREE.MeshBasicMaterial({
        color: new THREE.Color(color).lerp(new THREE.Color(0xBFE8FF), 0.45),
        transparent: true, opacity: 0.5 * ((i + 1) / trail.length), depthWrite: false,
      }));
      m.rotation.x = -Math.PI / 2;
      m.position.set(p.x, GROUND + heightAt(p.x, p.y) + 3, p.y);
      m.scale.setScalar(radius * (0.7 + 0.3 * (i + 1) / trail.length));
      return m;
    });
  }

  // 飛彈從左上方斜斜落到準星。不追蹤 —— 落點就是準星。
  const MISSILE_FROM = new THREE.Vector3(-70, 130, -40);   // 不能太遠,不然大半段倒數都在畫面外
  // 落下的飛彈就是吃到的那個道具圖示(彈頭朝上的圖),轉成彈頭朝著落點:
  // 把這一格的位置與落點投影到螢幕上,算出畫面上的飛行方向。
  const MISSILE_SIZE = 26;
  const P0 = new THREE.Vector3();
  const P1 = new THREE.Vector3();
  function missileVisual(strike) {
    const k = 1 - Math.max(0, strike.fuse) / METEOR_FUSE;
    const ease = k * k;                          // 先慢後快,像在加速落下
    const target = new THREE.Vector3(strike.x, GROUND + heightAt(strike.x, strike.y), strike.y);
    const from = target.clone().add(MISSILE_FROM);
    const tex = itemTex.get('meteor');
    const m = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex ?? null, transparent: true, depthTest: false }));
    m.renderOrder = 9000;
    m.position.copy(from.lerp(target, ease));
    P0.copy(m.position).project(camera);
    P1.copy(target).project(camera);
    const angle = Math.atan2(P1.y - P0.y, (P1.x - P0.x) * camera.aspect);
    m.material.rotation = angle - Math.PI / 2;   // 圖裡彈頭朝上(+90°)
    const w = tex?.image ? tex.image.width / tex.image.height : 0.53;
    m.scale.set(MISSILE_SIZE * w, MISSILE_SIZE, 1);
    m.center.set(0.5, 0.8);   // 對準彈頭附近,落地那一刻是彈頭碰到準星
    return m;
  }

  // 撞擊火花。物理那邊已經把「靠在一起互推」濾掉了,這裡收到的都是真的重擊,
  // 但同時好幾下還是會疊成一團,所以再壓一個同時存在的上限。
  // 星星小、命都很短(0.22 秒)—— 撞擊是一瞬間的事,拖長了會變成黏在場上的貼紙。
  function sparkVisual(spark, k) {
    const anim = fxSprite('impact', k, spark.x, spark.y, 7, 16 + spark.k * 14);
    if (anim) return [anim];
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

    // 兩層:盤面上往外擴散到爆炸範圍邊緣的衝擊波(圈裡的都會被炸)、從中心冒上來的蘑菇雲。
    //生成的圖最後幾格還沒完全散掉,最後 30% 再淡出。
    const shockK = (k - 0.05) / 0.6;
    const layers = [
      fxFlat('shock', shockK, blast.x, blast.y,
        BLAST_RADIUS * FX_SHOCK_SPAN * (0.35 + 0.65 * (1 - (1 - Math.min(1, Math.max(0, shockK) / 0.6)) ** 2))),
      k > 0.03 ? fxSprite('cloud', (k - 0.03) / 0.97, blast.x, blast.y, 0, BLAST_RADIUS * FX_CLOUD_SPAN, { anchorY: 0.2, opacity: fade }) : null,
    ].filter(Boolean);
    layers.forEach((m, i) => { m.renderOrder = 8100 + i; });   // 衝擊波在下、蘑菇雲在上
    if (fxTex.has('cloud')) {
      out.push(...layers);
      return out;
    }
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

  const BLUR_RING = new THREE.RingGeometry(0.5, 1.08, 40);
  // 冰凍(盾):生成的冰塊圖(就是道具圖示那張)半透明罩在陀螺前面,看起來像凍在冰裡
  const ICE_SIZE = 3;      // 冰塊圖的高度(陀螺單位,陀螺直徑 2)

  function actorFor(c, color) {
    let a = actors.get(c.id);
    if (a) return a;
    const group = createBey(c.beyType, color);
    const shadow = shadowDisc();
    // 高速旋轉的殘影:刃轉太快時,一格一格畫會出現車輪錯覺(看起來變慢、甚至倒轉),
    // 疊一層半透明的隊伍色圓盤,看得出「轉很快」,也蓋掉錯覺。轉速掉了就淡掉,刃的形狀露出來。
    const blur = new THREE.Mesh(BLUR_RING, new THREE.MeshBasicMaterial({
      color: new THREE.Color(color).lerp(new THREE.Color(0xFFFFFF), 0.15), transparent: true, opacity: 0,
      side: THREE.DoubleSide, depthWrite: false,
    }));
    blur.rotation.x = -Math.PI / 2;
    blur.position.y = 0.79;
    group.add(blur);
    const ice = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, opacity: 0.8, depthTest: false }));
    ice.center.set(0.5, 0.3);   // 冰塊底部大約對齊軸尖
    ice.renderOrder = 8500;
    ice.visible = false;
    group.add(ice);
    root.add(group, shadow);
    // 每顆給一個固定的起始角,不然全場的刃會整齊劃一地同步轉,像同一個物件複製出來的
    a = {
      group, shadow, blur, ice,
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

  const SPIN_SLIDE = 2.5;   // 停轉:滑行時速度每秒剩下 e^-2.5(慣性)
  const SPIN_STOP = 1.1;    //        刃幾秒轉停
  const SPIN_FALL_AT = 0.7; //        幾秒後開始倒
  const SPIN_FALL = 0.6;    //        倒下花幾秒
  const SPIN_FADE = 0.8;    //        倒下後幾秒淡出
  const BURST_TIME = 1.4;   // 爆裂:零件飛幾秒
  const FLY_TIME = 1.1;     // 場外(正前方):飛出去幾秒
  const POCKET_STAY = 0.8;  // 場外:掉進出口後停幾秒
  const POCKET_FADE = 0.8;  //        再幾秒淡出
  const GRAVITY = 260;
  const WOBBLE_FROM = 0.35; // 轉速低於這個開始晃

  // 爆裂:整顆炸開 —— 戰刃、固鎖、軸心、動物圓片各自飛出去,外加一把隊伍色的碎片;
  // 地上一圈衝擊波、一顆大爆炸星、「BURST!」大字往上飄,鏡頭震一下。
  // 爆裂比場外、停轉少見得多,值得演大一點。
  const SHARD = new THREE.TetrahedronGeometry(1, 0);
  function burstApart(a, c, color) {
    const chip = a.group.userData.chip;
    const pieces = [a.parts.blade, a.parts.ratchet, a.parts.bit, chip];
    for (let i = 0; i < 8; i++) {
      const m = new THREE.Mesh(SHARD, new THREE.MeshBasicMaterial({ color: i % 2 ? color : 0xFFFFFF }));
      m.scale.setScalar(c.radius * (0.18 + Math.random() * 0.14));
      m.position.set(c.x, a.group.position.y + c.radius * 0.6, c.y);
      root.add(m);
      pieces.push(m);
    }
    // 飛出去的零件會飛到牆後面:描邊照深度畫,不然整圈描邊會蓋在牆上
    for (const e of a.group.userData.edges) { e.material.depthTest = true; e.material.depthWrite = true; }
    const base = Math.random() * Math.PI * 2;
    a.debris = pieces.map((obj, i) => {
      if (obj.parent !== root) root.attach(obj);
      const dir = base + (i * Math.PI * 2) / pieces.length + (Math.random() - 0.5) * 0.4;
      const speed = 55 + Math.random() * 45;
      return {
        obj,
        floor: GROUND + heightAt(c.x, c.y),
        v: new THREE.Vector3(Math.cos(dir) * speed, 90 + Math.random() * 50, Math.sin(dir) * speed),
        w: new THREE.Vector3((Math.random() - 0.5) * 22, (Math.random() - 0.5) * 22, (Math.random() - 0.5) * 22),
      };
    });
    a.group.visible = false;
    a.shadow.visible = false;
    sparks.push({ x: c.x, y: c.y, k: 1, at: lastTime, spin: Math.random() * Math.PI });
    bursts.push({ x: c.x, y: c.y, at: lastTime });
    shakeUntil = lastTime + 0.35;
  }

  // 「BURST!」字樣:畫一次,大家共用
  const BURST_TEXT = (() => {
    const cv = document.createElement('canvas');
    cv.width = 512;
    cv.height = 160;
    const ctx = cv.getContext('2d');
    ctx.font = '900 112px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 22;
    ctx.strokeStyle = '#574239';
    ctx.strokeText('BURST!', 256, 84);
    ctx.fillStyle = '#FFD84A';
    ctx.fillText('BURST!', 256, 84);
    const t = new THREE.CanvasTexture(cv);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  })();
  const SHOCK = new THREE.RingGeometry(0.8, 1, 48);

  function burstVisual(b, k) {
    const out = [];
    const y = GROUND + heightAt(b.x, b.y);
    // 衝擊波:平貼地面往外擴、愈擴愈淡
    const ring = new THREE.Mesh(SHOCK, new THREE.MeshBasicMaterial({
      color: 0xFFFFFF, transparent: true, opacity: 0.9 * (1 - k), side: THREE.DoubleSide, depthWrite: false, depthTest: false,
    }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(b.x, y + 0.6, b.y);
    ring.scale.setScalar(6 + 40 * Math.sqrt(k));
    ring.renderOrder = 8000;
    out.push(ring);
    // 大字:先彈大再縮回,往上飄、最後淡掉
    const pop = k < 0.15 ? 0.6 + (k / 0.15) * 0.7 : 1.3 - Math.min(0.3, (k - 0.15) * 0.6);
    const label = new THREE.Sprite(new THREE.SpriteMaterial({
      map: BURST_TEXT, transparent: true, opacity: k < 0.7 ? 1 : 1 - (k - 0.7) / 0.3, depthTest: false,
    }));
    label.scale.set(36 * pop, 11.25 * pop, 1);
    label.position.set(b.x, y + 22 + 18 * k, b.y);
    label.renderOrder = 9500;
    out.push(label);
    return out;
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
    if (lastTime < shakeUntil) {
      // 爆裂時震一下:愈接近結束震得愈小
      const amp = 2.2 * (shakeUntil - lastTime) / 0.35;
      camera.position.x += (Math.random() - 0.5) * amp;
      camera.position.y += (Math.random() - 0.5) * amp;
    }
  }

  // drop:開場的落下進度(0 = 還在上方,1 = 落地)
  // dt:開場時物理還沒跑、world.time 不動,由呼叫端給這一格的秒數,陀螺在空中才會轉
  function draw(world, teams, { drop = 1, dt: openingDt = null } = {}) {
    const fall = drop < 1 ? (1 - easeOutBounce(Math.max(0, drop))) * 120 : 0;
    frameCamera();

    const dt = openingDt ?? Math.max(0, Math.min(0.1, world.time - lastTime));
    lastTime = world.time;
    clearProps();   // 這一格的特效(衝刺箭頭、殘影…)從這裡開始重建
    const live = [];
    for (const c of world.combatants) {
      const team = teams.get(c.fighterId);
      const a = actorFor(c, team?.color ?? '#CCCCCC');
      const ground = GROUND + heightAt(c.x, c.y);
      if (c.alive) {
        const land = landing(drop);
        a.group.visible = land.visible;
        a.shadow.visible = land.visible;
        a.shadow.material.opacity = 0.22 * land.shadow;
        a.group.position.set(c.x, ground + fall, c.y);
        a.group.scale.setScalar(c.radius);
        // 轉速就是命:轉得愈慢,刃轉得愈慢
        // 剛射出去轉最快(約每秒 9 圈),轉速掉下來就慢慢慢下來
        // 冰塊:刃凍住不轉、沒有殘影;解凍前 0.4 秒冰塊閃一閃
        const iced = c.frozen > 0;
        a.ice.visible = iced && !(c.frozen < 0.4 && Math.floor(c.frozen * 14) % 2 === 0);
        if (iced && !a.ice.material.map && itemTex.get('freeze')) {
          const t = itemTex.get('freeze');
          a.ice.material.map = t;
          a.ice.material.needsUpdate = true;
          a.ice.scale.set(ICE_SIZE * t.image.width / t.image.height, ICE_SIZE, 1);
        }
        a.spinRate = iced ? 0 : drawnRate(c.spin);
        a.spin.rotation.y += visibleTurn(a.spinRate, dt);
        a.blur.material.opacity = iced ? 0 : blurAlpha(c.spin);
        a.blur.visible = a.blur.material.opacity > 0.01;
        // 記下這一格的速度與位置:出局時畫面要接著這股慣性演
        a.vx = c.vx;
        a.vy = c.vy;
        a.px = c.x;
        a.py = c.y;
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
        a.shadow.scale.setScalar(c.radius * 0.95 * (0.4 + 0.6 * land.shadow));
        setOutline(a.group, c, world.time);
        // 衝刺:蓄力時原地發抖 + 箭頭預告;衝的時候拖殘影
        const teamColor = team?.color ?? '#CCCCCC';
        if (c.dash && c.dash.wind > 0) {
          a.group.position.x += Math.sin(world.time * 90) * 0.9;
          a.group.position.z += Math.cos(world.time * 77) * 0.9;
          const target = world.combatants.find(o => o.id === c.dash.targetId && o.alive);
          if (target) addProp(dashAimVisual(c, target, teamColor, world.time));
        }
        if (c.dash && c.dash.wind <= 0) {
          a.trail = [...(a.trail ?? []), { x: c.x, y: c.y }].slice(-7);
        } else if (a.trail?.length) {
          a.trail = a.trail.slice(1);   // 衝完殘影一格一格收掉
        }
        if (a.trail?.length) for (const m of dashTrailVisual(a.trail, teamColor, c.radius)) addProp(m);
        if (c.whirl > 0) for (const m of whirlVisual(c, world.time)) addProp(m);
        live.push(a.group);
        continue;
      }

      // 出局
      if (a.outAt === null) {
        a.outAt = world.time;
        a.blur.visible = false;
        a.ice.visible = false;
        setOutline(a.group, {}, world.time);
        if (c.outBy === 'burst') burstApart(a, c, team?.color ?? '#CCCCCC');
        // 掉進出口的會被牆擋住一部分:描邊也要照深度畫,不然整圈描邊會蓋在牆上
        if (c.outBy === 'ringout') {
          for (const e of a.group.userData.edges) { e.material.depthTest = true; e.material.depthWrite = true; }
        }
      }
      const t = world.time - a.outAt;
      if (c.outBy === 'burst') {
        for (const d of a.debris ?? []) {
          d.v.y -= GRAVITY * dt;
          d.obj.position.addScaledVector(d.v, dt);
          if (d.obj.position.y < d.floor && d.v.y < 0) {
            // 落地彈一下,水平方向也慢下來
            d.obj.position.y = d.floor;
            d.v.y *= -0.35;
            d.v.x *= 0.6;
            d.v.z *= 0.6;
          }
          d.obj.rotation.x += d.w.x * dt;
          d.obj.rotation.y += d.w.y * dt;
          d.obj.rotation.z += d.w.z * dt;
          d.obj.visible = t < BURST_TIME;
        }
      } else if (c.outBy === 'spinout') {
        // 停轉不是當場定住:帶著原本的速度繼續滑、刃慢慢轉停、晃得愈來愈大,滑得差不多才倒下,最後淡出
        if (a.px === undefined) { a.px = c.x; a.py = c.y; a.vx = 0; a.vy = 0; a.spinRate = 6; }
        const k = Math.exp(-SPIN_SLIDE * dt);
        a.vx *= k;
        a.vy *= k;
        // 碰到碗邊沿著邊滑,不會當場定住(見 spinout-slide.js)
        ({ x: a.px, y: a.py, vx: a.vx, vy: a.vy } = slideStep({ x: a.px, y: a.py, vx: a.vx, vy: a.vy }, dt, c.radius));
        a.group.position.set(a.px, GROUND + heightAt(a.px, a.py), a.py);
        a.spin.rotation.y += visibleTurn(a.spinRate * Math.max(0, 1 - t / SPIN_STOP), dt);
        const fall = Math.min(1, Math.max(0, (t - SPIN_FALL_AT) / SPIN_FALL));
        const wob = 0.3 * Math.min(1, t / SPIN_FALL_AT) * (1 - fall);
        const lean = (Math.PI / 2) * 0.9 * fall * fall;   // 先慢後快地倒下
        a.group.rotation.z = Math.sin(t * 10) * wob + lean;
        a.group.rotation.x = Math.cos(t * 10) * wob;
        a.shadow.visible = fall < 0.5;
        a.shadow.position.set(a.px, GROUND + heightAt(a.px, a.py) + 0.25, a.py);
        const fadeAt = SPIN_FALL_AT + SPIN_FALL;
        if (t > fadeAt) setOpacity(a.group, Math.max(0, 1 - (t - fadeAt) / SPIN_FADE));
        a.group.visible = t < fadeAt + SPIN_FADE;
        if (a.group.visible) live.push(a.group);
      } else {
        if (c.pocket === 'center') {
          // 正前方(Xtreme Zone):整顆往前飛出去,劃一道弧線越過前牆,邊飛邊轉,最後淡掉
          if (!a.fly) {
            a.fly = {
              x: c.x, y: ground, z: c.y,
              vx: (a.vx ?? 0) * 0.3, vy: 70, vz: Math.max(90, (a.vy ?? 0) * 0.8),
            };
          }
          const f = a.fly;
          f.vy -= GRAVITY * dt;
          f.x += f.vx * dt;
          f.y += f.vy * dt;
          f.z += f.vz * dt;
          a.group.position.set(f.x, f.y, f.z);
          a.group.rotation.x += dt * 7;
          a.spin.rotation.y += visibleTurn(DRAW_MAX, dt);
          a.shadow.visible = false;
          if (t > FLY_TIME * 0.6) setOpacity(a.group, Math.max(0, 1 - (t - FLY_TIME * 0.6) / (FLY_TIME * 0.4)));
          a.group.visible = t < FLY_TIME;
          if (a.group.visible) live.push(a.group);
          continue;
        }
        // 前角方槽(Over Zone):掉進槽裡停一下、慢慢轉停,再淡出消失
        a.group.position.set(c.x, ground, c.y);
        a.group.rotation.set(0, 0, 0.35);
        a.spin.rotation.y += dt * 6 * Math.max(0, 1 - t / 0.8);
        a.shadow.visible = false;
        if (t > POCKET_STAY) setOpacity(a.group, Math.max(0, 1 - (t - POCKET_STAY) / POCKET_FADE));
        a.group.visible = t < POCKET_STAY + POCKET_FADE;
        if (a.group.visible) live.push(a.group);
      }
    }

    // 道具與炸彈都浮在空中,而且要浮得比陀螺高 —— 同高度會直接插在陀螺身上。
    // 浮著就一定要配地上的影子,不然看不出它落點在哪。
    for (const it of world.items) {
      const m = itemVisual(it);
      // 上下輕輕浮動,讓它跟場上的陀螺區分開來
      m.position.set(it.x, GROUND + heightAt(it.x, it.y) + 17 + Math.sin(world.time * 2.4) * 1.6, it.y);
      addProp(m);
      addProp(groundDisc(shadowDisc(0.16), it.x, it.y, 6));
    }

    for (const f of world.frosts ?? []) {
      const target = world.combatants.find(c => c.id === f.targetId);
      if (target) for (const m of frostVisual(f, target)) addProp(m);
    }
    for (const st of world.meteors ?? []) {
      const color = teams.get(st.fighterId)?.color ?? '#574239';
      addProp(crosshairVisual(st, color));
      addProp(missileVisual(st));
    }
    // 爆炸:上一格還在、這一格不見了的空襲,就是剛炸開的那一顆。
    // 這樣物理那邊不必為了演出多回傳一個欄位 —— 爆炸純粹是畫面的事。
    for (const st of world.meteors ?? []) seenStrikes.set(st.id, st);
    for (const [id, st] of seenStrikes) {
      if (!(world.meteors ?? []).some(x => x.id === id)) {
        blasts.push({ x: st.x, y: st.y, at: world.time, spin: Math.random() * Math.PI });
        seenStrikes.delete(id);
      }
    }
    // 撞擊火花:新的收進來,舊的淘汰,同時最多 SPARK_MAX 個
    for (const im of world.impacts ?? []) {
      // 超重擊(衝刺撞上的那種)鏡頭震一下
      if (im.power >= HIT_FULL * 1.3) shakeUntil = Math.max(shakeUntil, lastTime + 0.25);
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

    for (let i = bursts.length - 1; i >= 0; i--) {
      const age = (world.time - bursts[i].at) / BURST_TIME;
      if (age >= 1 || age < 0) { bursts.splice(i, 1); continue; }
      for (const m of burstVisual(bursts[i], age)) addProp(m);
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
    reset() { clearActors(); seenStrikes.clear(); blasts = []; sparks = []; bursts = []; shakeUntil = -1; lastTime = 0; },
    dispose() { clearProps(); clearActors(); renderer.dispose(); },
  };
}
