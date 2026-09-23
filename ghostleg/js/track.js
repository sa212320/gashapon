// 阿彌陀籤的 3D 跑道。只負責「把一局畫出來」,不知道抽獎規則。
//
// 座標:跑道沿 -Z 往遠方延伸(row 0 在近處),車道沿 X 排開。
// 一律平塗、不放光源 —— 打光會讓平塗的美術變灰,跟站上其他畫面對不起來。
import * as THREE from 'three';
import { pathOf } from './race.js';

export const ROW_D = 1.35;   // 每一列的縱深
const TRAIL_W = 0.3;       // 軌跡帶寬度
const INK = 0x574239;
const LINE = 0xB4A18C;  // 夠深才看得見。開場那一段的目的就是讓小孩看清楚線怎麼連,太淡等於白做

// 車道寬度:8 人以內固定,再多才壓縮。全部等比縮的話 6 個人會顯得空曠,
// 全部固定的話 40 人會寬到鏡頭必須退到什麼都看不清。
export function laneWidth(lanes) {
  return lanes <= 8 ? 1.0 : Math.max(0.34, 8 / lanes);
}

// 用 index 算一個穩定的假隨機(sine hash)。同一局裡獎品的起飛位置不會每格重算,
// 不然它們會在原地抖動。
function pseudoRandom(seed) {
  const h = Math.sin(seed * 12.9898 + 4.1414) * 43758.5453;
  return h - Math.floor(h);
}

const laneX = (lane, lanes, w) => (lane - (lanes - 1) / 2) * w;
const rowZ = row => -row * ROW_D;

/* ---------- 角色與獎項都畫成貼圖,用 Sprite 永遠面向鏡頭 ---------- */

function spriteCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')];
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// 名字畫在角色上方。名字是這個模式真正的識別 —— 顏色超過 20 人就會重複,
// 而且色覺辨異的小孩從一開始就分不出顏色。
function labelled(ctx, text, w, y) {
  ctx.font = '700 30px system-ui, -apple-system, "PingFang TC", "Noto Sans TC", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const tw = ctx.measureText(text).width;
  roundRect(ctx, w / 2 - tw / 2 - 12, y - 21, tw + 24, 42, 21);
  ctx.fillStyle = '#FFF7EC';
  ctx.fill();
  ctx.lineWidth = 5;
  ctx.strokeStyle = '#574239';
  ctx.stroke();
  ctx.fillStyle = '#574239';
  ctx.fillText(text, w / 2, y + 1);
}

function playerTexture(player) {
  const [c, ctx] = spriteCanvas(180, 260);
  ctx.lineWidth = 9;
  ctx.strokeStyle = '#574239';
  ctx.fillStyle = player.color;
  // 身體:一個上寬下窄的圓角塊,跟 gachago 那種圓頭小人同型
  ctx.beginPath();
  ctx.moveTo(52, 232);
  ctx.quadraticCurveTo(90, 120, 128, 232);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(90, 150, 40, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  // 眼睛
  ctx.fillStyle = '#574239';
  ctx.beginPath();
  ctx.arc(78, 146, 6, 0, Math.PI * 2);
  ctx.arc(102, 146, 6, 0, Math.PI * 2);
  ctx.fill();
  labelled(ctx, player.name, 180, 42);
  return new THREE.CanvasTexture(c);
}

function slotTexture(slot) {
  const [c, ctx] = spriteCanvas(200, 200);
  const empty = slot.prizeId === null;
  ctx.lineWidth = 9;
  ctx.strokeStyle = '#574239';
  ctx.fillStyle = empty ? '#DCD2C4' : '#F0B94A';
  roundRect(ctx, 46, 96, 108, 84, 12);
  ctx.fill();
  ctx.stroke();
  if (!empty) {
    ctx.fillStyle = '#E4572E';
    ctx.fillRect(92, 96, 16, 84);
    ctx.strokeRect(92, 96, 16, 84);
  }
  labelled(ctx, slot.name, 200, 48);
  return new THREE.CanvasTexture(c);
}

function sprite(tex, w, h) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
  s.scale.set(w, h, 1);
  return s;
}

/* ---------- 軌跡帶:沿折線鋪一條貼地的帶子 ---------- */

// 把折線換成世界座標,並算好每段的長度與累積長度。
// 用「沿折線走了多遠」當進度,而不是「走到第幾列」—— 水平段的 row 不變,
// 只用 row 當進度的話,角色在橫移的時候會整個卡住不動。
function toWorld(points, lanes, w) {
  const pts = points.map(p => ({ x: laneX(p.lane, lanes, w), z: rowZ(p.row) }));
  const lens = [];
  let total = 0;
  for (let i = 1; i < pts.length; i++) {
    const d = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z);
    lens.push(d);
    total += d;
  }
  return { pts, lens, total };
}

function pointAt(route, dist) {
  const { pts, lens } = route;
  let left = Math.max(0, dist);
  for (let i = 0; i < lens.length; i++) {
    if (left <= lens[i] || i === lens.length - 1) {
      const k = lens[i] === 0 ? 0 : Math.min(1, left / lens[i]);
      return {
        x: pts[i].x + (pts[i + 1].x - pts[i].x) * k,
        z: pts[i].z + (pts[i + 1].z - pts[i].z) * k,
      };
    }
    left -= lens[i];
  }
  return pts.at(-1);
}

const TRAIL_H = 0.14;   // 軌跡帶的厚度

// 折線的每一段都與座標軸平行,所以帶子可以直接用長方體拼,不用算轉角的斜接。
//
// 兩件事以前是錯的:
//  1. 頂點是照 a.x → b.x 的順序放的,往左走的段落繞向會反過來、被背面剔除整片剃掉 ——
//     畫面上就是「有些橫線沒有顏色」,而且剛好都是往左的那幾段。
//     現在一律先正規化成 min/max,繞向就固定了。
//  2. 帶子是貼在地上的一張紙,沒有厚度。改成有高度的長方體(上面 + 四個側面),
//     從斜上方看才有立體感。
//
// dist 是「已經走了多遠」—— 只鋪到那裡為止,所以開場時梯子是空的、
// 答案不會在起跑前就被畫出來。
function trailGeometry(route, dist) {
  const { pts, lens } = route;
  const pos = [];
  const idx = [];
  const half = TRAIL_W / 2;
  let left = Math.max(0, dist);

  const quad = (a, b, c, d) => {
    const base = pos.length / 3;
    for (const p of [a, b, c, d]) pos.push(p[0], p[1], p[2]);
    idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  };

  for (let i = 0; i < lens.length && left > 0; i++) {
    const a = pts[i];
    const k = lens[i] === 0 ? 1 : Math.min(1, left / lens[i]);
    const bx = a.x + (pts[i + 1].x - a.x) * k;
    const bz = a.z + (pts[i + 1].z - a.z) * k;
    left -= lens[i];

    const horizontal = Math.abs(bz - a.z) < 1e-9;
    // 轉角補一個 half 的重疊,不然直角接縫會露出缺口
    const x0 = Math.min(a.x, bx) - (horizontal ? 0 : half);
    const x1 = Math.max(a.x, bx) + (horizontal ? 0 : half);
    const z0 = Math.min(a.z, bz) - (horizontal ? half : 0);
    const z1 = Math.max(a.z, bz) + (horizontal ? half : 0);
    const h = TRAIL_H;

    quad([x0, h, z0], [x1, h, z0], [x1, h, z1], [x0, h, z1]);        // 上面
    quad([x0, 0, z0], [x1, 0, z0], [x1, h, z0], [x0, h, z0]);        // 四個側面
    quad([x1, 0, z1], [x0, 0, z1], [x0, h, z1], [x1, h, z1]);
    quad([x0, 0, z1], [x0, 0, z0], [x0, h, z0], [x0, h, z1]);
    quad([x1, 0, z0], [x1, 0, z1], [x1, h, z1], [x1, h, z0]);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  return geo;
}

export function createTrack(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(48, 1, 0.1, 400);
  const world = new THREE.Group();
  scene.add(world);

  let round = null;

  function clear() {
    world.clear();
  }

  function build(r) {
    clear();
    round = r;
    const { players, slots, ladder } = r;
    const lanes = ladder.lanes;
    const w = laneWidth(lanes);
    const far = rowZ(ladder.rows);

    // 直線與橫槓
    const pts = [];
    for (let i = 0; i < lanes; i++) {
      const x = laneX(i, lanes, w);
      pts.push(x, 0, 0, x, 0, far);
    }
    for (const rung of ladder.rungs) {
      const z = rowZ(rung.row);
      pts.push(laneX(rung.left, lanes, w), 0, z, laneX(rung.left + 1, lanes, w), 0, z);
    }
    const lineGeo = new THREE.BufferGeometry();
    lineGeo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    world.add(new THREE.LineSegments(lineGeo, new THREE.LineBasicMaterial({ color: LINE })));

    // 每個人的路線 + 各自的速度。快慢純粹是演出 —— 誰拿到什麼在起跑前就定了。
    //
    // rate 讓每個人**在不同時間抵達**:跑最快的大約在整段的七成就到了,最慢的剛好壓線。
    // (原本所有人的曲線都在同一點結束,中間拉開距離、最後同時抵達 ——
    //  那等於把「有快有慢」的結果抹掉,看起來像大家講好一起衝線。)
    // lag 只管加減速的形狀,不影響抵達時間。
    r.routes = players.map((_, lane) => toWorld(pathOf(ladder, lane), lanes, w));
    r.lag = players.map((_, i) => 0.55 + pseudoRandom(i * 3 + 11) * 0.8);
    r.rate = players.map((_, i) => 1 + pseudoRandom(i * 3 + 23) * 0.42);

    r.trails = players.map(p => {
      const mesh = new THREE.Mesh(
        new THREE.BufferGeometry(),
        // DoubleSide 是保險:繞向已經正規化了,但軌跡帶一旦再有一段被剃掉,
        // 症狀是「某幾條橫線沒有顏色」,很難聯想到繞向。
        new THREE.MeshBasicMaterial({ color: new THREE.Color(p.color), side: THREE.DoubleSide }));
      world.add(mesh);
      return mesh;
    });

    // 角色的落地影子。沒有影子的話角色像浮在半空,整條跑道會變得很平。
    r.shadows = players.map(() => {
      const sh = new THREE.Mesh(
        new THREE.CircleGeometry(w * 0.3, 18),
        new THREE.MeshBasicMaterial({ color: 0x8A7355, transparent: true, opacity: 0.22 }));
      sh.rotation.x = -Math.PI / 2;
      sh.position.y = 0.02;
      world.add(sh);
      return sh;
    });

    // 角色與獎項
    r.runners = players.map((p, lane) => {
      const s = sprite(playerTexture(p), w * 0.95, w * 1.37);
      s.position.set(laneX(lane, lanes, w), w * 0.6, 0);
      world.add(s);
      return s;
    });
    // 獎品:開跑前浮在角色頭上(看清楚有什麼),按開始才飛到終點的格子
    //(才知道落在哪一格 —— 終點的排列是每局隨機的,這一飛就是把它演出來)。
    r.prizes = slots.map((slot, i) => {
      const s = sprite(slotTexture(slot), w * 1.05, w * 1.05);
      world.add(s);
      return s;
    });
    r.prizeTo = slots.map((_, i) => new THREE.Vector3(laneX(i, lanes, w), w * 0.55, far - ROW_D * 0.6));
    // 起飛位置:散在起跑線上方,高度各不相同,看起來才不像排隊。
    r.prizeFrom = slots.map((_, i) => new THREE.Vector3(
      laneX(i, lanes, w) + (pseudoRandom(i * 7 + 1) - 0.5) * w * 0.7,
      w * (2.0 + pseudoRandom(i * 7 + 2) * 1.5),
      ROW_D * (0.4 + pseudoRandom(i * 7 + 3) * 1.1)));
    setPrizeFly(0);
  }

  // 獎品從「浮在角色頭上」飛到「終點的格子」。k: 0 → 1。
  // 每個獎品錯開一點時間出發,不然會像一整排平移過去。
  function setPrizeFly(k) {
    if (!round?.prizes) return;
    const n = round.prizes.length;
    const stagger = 0.35;
    round.prizes.forEach((sprite, i) => {
      const start = n > 1 ? (i / (n - 1)) * stagger : 0;
      const p = Math.min(1, Math.max(0, (k - start) / (1 - stagger)));
      const e = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
      const a = round.prizeFrom[i];
      const b = round.prizeTo[i];
      sprite.position.lerpVectors(a, b, e);
      // 飛行途中拉一個弧線,不然是一條直線滑過去,不像「飛」。
      sprite.position.y += Math.sin(e * Math.PI) * 1.4;
    });
  }

  // t: 0~1。回傳每個人此刻的世界座標,鏡頭腳本要靠它決定跟誰。
  function setProgress(t) {
    if (!round) return [];
    const here = round.routes.map((route, i) => {
      // 先乘上各自的 rate 再夾住:跑得快的人提早抵達終點之後就停在那裡,
      // 不會被硬拖到最後一刻才到。
      const k = Math.min(1, Math.max(0, t) * round.rate[i]);
      const eased = Math.pow(k, round.lag[i]);
      const p = pointAt(route, eased * route.total);
      round.trails[i].geometry.dispose();
      round.trails[i].geometry = trailGeometry(route, eased * route.total);
      round.runners[i].position.x = p.x;
      round.runners[i].position.z = p.z;
      round.shadows[i].position.x = p.x;
      round.shadows[i].position.z = p.z;
      return p;
    });
    return here;
  }

  function resize() {
    const w = canvas.clientWidth || 1;
    const h = canvas.clientHeight || 1;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  function render() {
    renderer.render(scene, camera);
  }

  return {
    camera,
    get round() { return round; },
    build,
    setProgress,
    setPrizeFly,
    resize,
    render,
    dispose() {
      clear();
      renderer.dispose();
    },
  };
}
