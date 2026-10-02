// 阿彌陀籤的 3D 跑道。只負責「把一局畫出來」,不知道抽獎規則。
//
// 座標:跑道沿 -Z 往遠方延伸(row 0 在近處),車道沿 X 排開。
// 一律平塗、不放光源 —— 打光會讓平塗的美術變灰,跟站上其他畫面對不起來。
//
// 2026-10-02 改版:冰板 + 雪路 + 緞帶軌跡、染色動物立牌 + 名牌、3 級獎品圖在上空亂飛。
// three 物件在 scene-parts.js,計算在 ribbon.js / labels.js / prize-motion.js。
import * as THREE from 'three';
import { pathOf } from './race.js';
import { getArt } from './art.js';
import { buildBoard, buildSnowPaths, ribbonGeometry, buildStandee, buildNameTag, buildPrizeSprite, SNOW_H } from './scene-parts.js';
import { wanderOffset } from './prize-motion.js';
import { tagPlace, BASE_R } from './labels.js';

export const ROW_D = 1.35;   // 每一列的縱深

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
    const art = getArt();

    // 冰板 + 雪路(直線與橫槓)
    const segments = [];
    for (let i = 0; i < lanes; i++) {
      const x = laneX(i, lanes, w);
      segments.push([x, 0, x, far]);
    }
    for (const rung of ladder.rungs) {
      const z = rowZ(rung.row);
      segments.push([laneX(rung.left, lanes, w), z, laneX(rung.left + 1, lanes, w), z]);
    }
    world.add(buildBoard({ lanes, laneWidth: w, rows: ladder.rows, rowDepth: ROW_D, image: art.board }));
    world.add(buildSnowPaths(segments, w));

    // 每個人的路線 + 各自的速度。快慢純粹是演出 —— 誰拿到什麼在起跑前就定了。
    //
    // rate 讓每個人**在不同時間抵達**:跑最快的大約在整段的七成就到了,最慢的剛好壓線。
    // lag 只管加減速的形狀,不影響抵達時間。
    r.routes = players.map((_, lane) => toWorld(pathOf(ladder, lane), lanes, w));
    r.lag = players.map((_, i) => 0.55 + pseudoRandom(i * 3 + 11) * 0.8);
    r.rate = players.map((_, i) => 1 + pseudoRandom(i * 3 + 23) * 0.42);

    r.trails = players.map(p => {
      const mesh = new THREE.Mesh(
        new THREE.BufferGeometry(),
        // DoubleSide:緞帶是一張平面帶子,轉彎時繞向會反過來,單面的話那幾段會被剃掉
        new THREE.MeshBasicMaterial({ color: new THREE.Color(p.color), side: THREE.DoubleSide }));
      world.add(mesh);
      return mesh;
    });

    // 立牌的落地影子。沒有影子的話立牌像浮在半空,整條跑道會變得很平。
    r.shadows = players.map(() => {
      const sh = new THREE.Mesh(
        new THREE.CircleGeometry(w * 0.34, 18),
        new THREE.MeshBasicMaterial({ color: 0x5E7E99, transparent: true, opacity: 0.22 }));
      sh.rotation.x = -Math.PI / 2;
      sh.position.y = SNOW_H + 0.005;
      world.add(sh);
      return sh;
    });

    r.runners = players.map((p, lane) => {
      const s = buildStandee(p, w, art.animals[p.animal] ?? null);
      s.position.set(laneX(lane, lanes, w), 0, 0);
      world.add(s);
      return s;
    });
    r.tags = players.map((p, lane) => {
      const t = buildNameTag(p, w, lane, lanes);
      world.add(t);
      return t;
    });

    // 獎品:開跑前在起跑線上空亂飛(看清楚有什麼),按開始才飛到終點的格子
    //(才知道落在哪一格 —— 終點的排列是每局隨機的,這一飛就是把它演出來)。
    r.prizes = slots.map(slot => {
      const s = buildPrizeSprite(slot, w, art.prizes);
      world.add(s);
      return s;
    });
    r.prizeTo = slots.map((_, i) => new THREE.Vector3(laneX(i, lanes, w), w * 0.55, far - ROW_D * 0.6));
    // 起飛位置:散在起跑線上方,高度各不相同,看起來才不像排隊。
    // 開跑前鏡頭是由上往下看(idleFrame),太低的話獎品會疊在立牌上 —— 拉到冰板上方的天空裡飛。
    r.prizeFrom = slots.map((_, i) => new THREE.Vector3(
      laneX(i, lanes, w) + (pseudoRandom(i * 7 + 1) - 0.5) * w * 0.7,
      w * (3.4 + pseudoRandom(i * 7 + 2) * 1.4),
      // z 在起跑線後方(冰板上空):放在前面的話,人多時開跑前鏡頭拉近掃描,雪球會大到蓋住畫面
      -ROW_D * (0.6 + pseudoRandom(i * 7 + 3) * 1.1)));
    setPrizeFly(0, 0);
  }

  // 獎品從「上空亂飛」飛到「終點的格子」。k: 0 → 1;tSec 驅動亂飛。
  // 每個獎品錯開一點時間出發,不然會像一整排平移過去;亂飛的幅度隨著飛向終點收到 0。
  function setPrizeFly(k, tSec = 0) {
    if (!round?.prizes) return;
    const n = round.prizes.length;
    const stagger = 0.35;
    const span = round.ladder.lanes * laneWidth(round.ladder.lanes) * 0.45;
    round.prizes.forEach((sprite, i) => {
      const start = n > 1 ? (i / (n - 1)) * stagger : 0;
      const p = Math.min(1, Math.max(0, (k - start) / (1 - stagger)));
      const e = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
      const a = round.prizeFrom[i];
      const b = round.prizeTo[i];
      sprite.position.lerpVectors(a, b, e);
      // 飛行途中拉一個弧線,不然是一條直線滑過去,不像「飛」。
      sprite.position.y += Math.sin(e * Math.PI) * 1.4;
      const amp = 1 - e;
      const o = wanderOffset(i, tSec, span);
      sprite.position.x += o.x * amp;
      sprite.position.y += o.y * amp;
      sprite.position.z += o.z * amp;
      sprite.material.rotation = o.rot * amp;
    });
  }

  // t: 0~1。回傳每個人此刻的世界座標,鏡頭腳本要靠它決定跟誰。
  function setProgress(t) {
    if (!round) return [];
    const w = laneWidth(round.ladder.lanes);
    return round.routes.map((route, i) => {
      // 先乘上各自的 rate 再夾住:跑得快的人提早抵達終點之後就停在那裡,
      // 不會被硬拖到最後一刻才到。
      const k = Math.min(1, Math.max(0, t) * round.rate[i]);
      const eased = Math.pow(k, round.lag[i]);
      const p = pointAt(route, eased * route.total);
      round.trails[i].geometry.dispose();
      round.trails[i].geometry = ribbonGeometry(route, eased * route.total, w);
      round.runners[i].position.x = p.x;
      round.runners[i].position.z = p.z;
      round.shadows[i].position.x = p.x;
      round.shadows[i].position.z = p.z;
      const tp = tagPlace(w, round.tags[i].userData.stagger);
      round.tags[i].position.set(p.x, tp.y, p.z + tp.z);
      return p;
    });
  }

  // 每個立牌底座正前方在畫面上的位置(canvas 的 CSS px)—— 開跑前的大字名牌(HTML)貼在這裡
  const v = new THREE.Vector3();
  function nameAnchors() {
    if (!round) return [];
    const w = laneWidth(round.ladder.lanes);
    const cw = canvas.clientWidth || 1;
    const ch = canvas.clientHeight || 1;
    camera.updateMatrixWorld();
    return round.runners.map(r => {
      v.set(r.position.x, SNOW_H, r.position.z + BASE_R * w * 1.16).project(camera);
      return { x: (v.x + 1) / 2 * cw, y: (1 - v.y) / 2 * ch };
    });
  }

  // 開跑前用大字名牌時,3D 的小名牌先收起來(不然同一個名字出現兩次)
  function setTagsVisible(on) {
    for (const t of round?.tags ?? []) t.visible = on;
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
    nameAnchors,
    setTagsVisible,
    resize,
    render,
    dispose() {
      clear();
      renderer.dispose();
    },
  };
}
