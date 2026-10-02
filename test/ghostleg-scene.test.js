// 阿彌陀籤場景的純計算:緞帶折線、名牌、亂飛、鏡頭。three 物件在瀏覽器驗。
import test from 'node:test';
import assert from 'node:assert/strict';
import { snowWidth, ribbonWidth, offsetRoute, roundCorners, cutAt, pathLength, stripData } from '../ghostleg/js/ribbon.js';

const close = (a, b, eps = 1e-6) => Math.abs(a - b) < eps;

test('雪路 / 緞帶寬度跟著車道寬縮放(40 人時 0.34)', () => {
  assert.ok(close(snowWidth(1), 0.3));
  assert.ok(close(snowWidth(0.34), 0.102));
  assert.ok(ribbonWidth(0.34) < snowWidth(0.34));
});

test('offsetRoute:往右走的橫段偏前(+z),往左走的偏後(−z),直段 x 不變', () => {
  const right = offsetRoute([{ x: 0, z: 0 }, { x: 0, z: -2 }, { x: 1, z: -2 }, { x: 1, z: -4 }], 0.1);
  assert.deepEqual(right.map(p => [p.x, +p.z.toFixed(3)]), [[0, 0], [0, -1.9], [1, -1.9], [1, -4]]);
  const left = offsetRoute([{ x: 1, z: 0 }, { x: 1, z: -2 }, { x: 0, z: -2 }, { x: 0, z: -4 }], 0.1);
  assert.deepEqual(left.map(p => [p.x, +p.z.toFixed(3)]), [[1, 0], [1, -2.1], [0, -2.1], [0, -4]]);
});

test('同一根橫槓上兩個人的緞帶分在兩側,不重疊', () => {
  const a = offsetRoute([{ x: 0, z: 0 }, { x: 0, z: -2 }, { x: 1, z: -2 }, { x: 1, z: -4 }], 0.1);
  const b = offsetRoute([{ x: 1, z: 0 }, { x: 1, z: -2 }, { x: 0, z: -2 }, { x: 0, z: -4 }], 0.1);
  assert.ok(Math.abs(a[1].z - b[1].z) >= 0.2 - 1e-9);
});

test('roundCorners:起終點不動,相鄰兩段方向變化每步 < 25°', () => {
  const pts = roundCorners([{ x: 0, z: 0 }, { x: 0, z: -2 }, { x: 1, z: -2 }, { x: 1, z: -4 }], 0.2, 6);
  assert.deepEqual(pts[0], { x: 0, z: 0 });
  assert.deepEqual(pts.at(-1), { x: 1, z: -4 });
  for (let i = 1; i < pts.length - 1; i++) {
    const a = Math.atan2(pts[i].z - pts[i - 1].z, pts[i].x - pts[i - 1].x);
    const b = Math.atan2(pts[i + 1].z - pts[i].z, pts[i + 1].x - pts[i].x);
    let d = Math.abs(b - a); if (d > Math.PI) d = 2 * Math.PI - d;
    assert.ok(d < (25 * Math.PI) / 180, `第 ${i} 點轉了 ${(d * 180 / Math.PI).toFixed(1)}°`);
  }
});

test('roundCorners:半徑不超過相鄰兩段的一半(短橫段不會被圓弧吃穿)', () => {
  const pts = roundCorners([{ x: 0, z: 0 }, { x: 0, z: -1 }, { x: 0.2, z: -1 }, { x: 0.2, z: -2 }], 5, 6);
  for (const p of pts) assert.ok(p.x >= -1e-9 && p.x <= 0.2 + 1e-9);
});

test('cutAt:只取到 dist;dist 0 只剩起點;超過全長就是整條', () => {
  const pts = [{ x: 0, z: 0 }, { x: 0, z: -2 }, { x: 1, z: -2 }];
  assert.ok(close(pathLength(cutAt(pts, 2.5)), 2.5));
  assert.equal(cutAt(pts, 0).length, 1);
  assert.ok(close(pathLength(cutAt(pts, 99)), 3));
});

test('stripData:每點左右各一個頂點,寬度正確', () => {
  const { position, index } = stripData([{ x: 0, z: 0 }, { x: 0, z: -2 }], 0.2, 0.1);
  assert.equal(position.length, 4 * 3);
  assert.equal(index.length, 6);
  assert.ok(close(Math.abs(position[0] - position[3]), 0.2));
  assert.ok(close(position[1], 0.1));
});

import { tagLift, tagFontSize } from '../ghostleg/js/labels.js';
import { wanderOffset, createIdleLoop } from '../ghostleg/js/prize-motion.js';

test('tagLift:8 人以內不錯開;超過 8 人相鄰一高一低', () => {
  assert.deepEqual([0, 1, 2, 3].map(l => tagLift(l, 8)), [0, 0, 0, 0]);
  assert.deepEqual([0, 1, 2, 3].map(l => tagLift(l, 9)), [0, 1, 0, 1]);
});

test('tagFontSize:名字越長字越小(最多 10 字)', () => {
  assert.equal(tagFontSize('小紅'), 30);
  assert.equal(tagFontSize('五個字名字'), 26);
  assert.equal(tagFontSize('十個字的名字一二三四'), 22);
});

test('wanderOffset:有在動、而且每個獎品不一樣、幅度有上限', () => {
  const a0 = wanderOffset(0, 0, 3), a1 = wanderOffset(0, 1.3, 3), b0 = wanderOffset(1, 0, 3);
  assert.notDeepEqual(a0, a1);
  assert.notDeepEqual(a0, b0);
  for (let t = 0; t < 30; t += 0.37) for (let i = 0; i < 12; i++) {
    const o = wanderOffset(i, t, 3);
    assert.ok(Math.abs(o.x) <= 1.8 + 1e-9 && Math.abs(o.y) <= 0.6 + 1e-9 && Math.abs(o.z) <= 0.9 + 1e-9 && Math.abs(o.rot) <= 0.35 + 1e-9);
  }
});

test('createIdleLoop:start 之後每格呼叫 step;stop 之後不再呼叫(按開始時一定要停)', () => {
  const queue = [];
  const calls = [];
  const loop = createIdleLoop(t => calls.push(t), cb => { queue.push(cb); return queue.length; }, () => { queue.length = 0; });
  loop.start();
  queue.shift()(1000);
  queue.shift()(1100);
  assert.deepEqual(calls, [1, 1.1]);
  loop.stop();
  assert.equal(loop.running, false);
  assert.equal(queue.length, 0);
  loop.start();
  loop.start();   // 重複 start 不會排兩條
  assert.equal(queue.length, 1);
});

import { idleFrame, boardWidth } from '../ghostleg/js/camera-script.js';

// 冰板中心那條橫線在畫面上的寬度比例(透視投影,水平視角由垂直 fov 與 aspect 算)
function widthRatio(f, { lanes, laneWidth, aspect, fov = 48 }) {
  const [px, py, pz] = f.pos, [lx, ly, lz] = f.look;
  const d = Math.hypot(lx - px, ly - py, lz - pz);
  const hfov = 2 * Math.atan(Math.tan((fov * Math.PI) / 360) * aspect);
  return boardWidth(lanes, laneWidth) / (2 * d * Math.tan(hfov / 2));
}

// 直向(手機):冰板佔畫面寬約八成。橫向(桌機):冰板是直長條,硬塞滿寬度的話鏡頭會貼上去、
// 動物大到塞滿畫面(2026-10-02 桌機截圖)—— 橫向時當成正方形構圖,冰板寬 ≈ 畫面「高度」的八成。
for (const [lanes, lw, aspect] of [[6, 1, 390 / 640], [6, 1, 1440 / 700], [40, 0.34, 390 / 640], [40, 0.34, 1440 / 700]]) {
  test(`idleFrame:${lanes} 人、aspect ${aspect.toFixed(2)} 時冰板佔畫面寬約八成(橫向時佔高度的八成)`, () => {
    const opts = { lanes, laneWidth: lw, rows: 12, rowDepth: 1.35, aspect };
    const r = widthRatio(idleFrame(opts), opts) * Math.max(1, aspect);
    assert.ok(r > 0.74 && r < 0.86, `佔 ${(r * 100).toFixed(0)}%`);
  });
}

test('idleFrame:鏡頭在起跑線後上方,往前下方看', () => {
  const f = idleFrame({ lanes: 6, laneWidth: 1, rows: 12, rowDepth: 1.35, aspect: 0.6 });
  assert.ok(f.pos[1] > f.look[1]);
  assert.ok(f.pos[2] > f.look[2]);
});

import { snowRim } from '../ghostleg/js/ribbon.js';

test('雪路外框也跟著車道寬縮放:40 人時不會比雪路本身還粗', () => {
  assert.ok(close(snowRim(1), 0.07));
  assert.ok(snowRim(0.34) * 2 < snowWidth(0.34));
});

import { tagPlace, TAG_H, BASE_H, BASE_R, standeeFoot } from '../ghostleg/js/labels.js';

// 2026-10-02 使用者:「還是名字直接在下方啊」—— 名牌放在戰棋底座正前方,像公仔底座前面的名條。
test('名牌在底座正前方:高度跟底座差不多,而且在底座外緣的前面', () => {
  for (const w of [1, 0.34]) {
    const t = tagPlace(w, 0);
    assert.ok(t.y - (TAG_H * w) / 2 <= standeeFoot(w), '名牌頂不能高過動物的腳太多(不然又擋到棋子)');
    assert.ok(t.y + (TAG_H * w) / 2 <= standeeFoot(w) + TAG_H * w, '名牌整塊在腳的高度附近');
    assert.ok(t.z >= BASE_R * w * 1.16, '名牌在底座外緣的前面');
  }
});

test('人多時名牌一前一後錯開(不是一高一低,高了會擋到棋子)', () => {
  const w = 0.34;
  assert.ok(tagPlace(w, 1).z > tagPlace(w, 0).z + TAG_H * w * 0.9);
  assert.equal(tagPlace(w, 1).y, tagPlace(w, 0).y);
});

import { namePlan } from '../ghostleg/js/labels.js';
import { scanPass, scanDuration } from '../ghostleg/js/camera-script.js';

// 開跑前的大字名牌(2026-10-02):投影到黑板,後排學生要看得到;名字一律全名 ——
// 「王…」看不出是誰(使用者)。全名在 3 排以內放得下就整塊冰板一起看;放不下就拉近、左右來回掃。
const nameW = (chars, f) => chars * f + f * 0.7 + 6;

// 2026-10-02 使用者:「人少也用掃描的,統一」—— 開跑前一律是起跑線的特寫;框得下就不動,框不下才左右掃。
test('namePlan:名字至少畫面高 3%(1080p ≥ 32px),手機至少 16px', () => {
  const p = namePlan({ viewW: 1920, viewH: 1080, lanes: 6, longestChars: 3 });
  assert.ok(p.fontPx >= 1080 * 0.03);
  assert.ok(namePlan({ viewW: 390, viewH: 640, lanes: 6, longestChars: 3 }).fontPx >= 16);
});

// 使用者:「特寫會放大,不應該是停在中間吧」—— 特寫一次最多框一半的人(上限 8 條),4 人以上一定會掃
// 使用者:「我以為最多框 2 人,掃描久一點沒關係,可以點一下跳過」
test('namePlan:特寫一次最多框 2 個人', () => {
  for (const lanes of [2, 6, 40]) assert.equal(namePlan({ viewW: 1920, viewH: 1080, lanes, longestChars: 3 }).frameLanes, 2);
  assert.equal(namePlan({ viewW: 390, viewH: 640, lanes: 24, longestChars: 10 }).frameLanes, 2);
});

test('namePlan:框 2 個人時,10 個字的全名在手機上也放得下(必要時兩排錯開)', () => {
  const p = namePlan({ viewW: 390, viewH: 640, lanes: 24, longestChars: 10 });
  assert.ok(((390 * 0.92) / p.frameLanes) * p.rows * 0.95 >= nameW(10, p.fontPx) - 1e-9);
});

test('namePlan:名字一律全名,不截短(沒有 maxWidth 這種東西)', () => {
  assert.ok(!('maxWidthPx' in namePlan({ viewW: 390, viewH: 640, lanes: 40, longestChars: 10 })));
});

test('scanPass:從最左邊開始,掃一趟到最右邊就結束;兩端各停一下;人越多掃越久', () => {
  const opts = { lanes: 24, frameLanes: 2, laneWidth: 0.34 };
  const travel = ((24 - 2) * 0.34) / 2;
  const a = scanPass(0, opts);
  assert.ok(Math.abs(a.x + travel) < 1e-9 && !a.done);
  assert.equal(scanPass(0.3, opts).x, a.x, '起點先停一下');
  const end = scanPass(scanDuration(opts) + 0.01, opts);
  assert.ok(Math.abs(end.x - travel) < 1e-9 && end.done);
  let last = -Infinity;
  for (let t = 0; t <= scanDuration(opts); t += 0.05) { const x = scanPass(t, opts).x; assert.ok(x >= last - 1e-9, '一直往右,不回頭'); last = x; }
  assert.ok(scanDuration({ lanes: 40, frameLanes: 2, laneWidth: 0.34 }) > scanDuration({ lanes: 6, frameLanes: 2, laneWidth: 1 }));
});


test('idleFrame 掃描模式:鏡頭看著起跑線(z = 0),跟著 centerX 左右移', () => {
  const f = idleFrame({ lanes: 24, laneWidth: 0.34, rows: 12, rowDepth: 1.35, aspect: 0.5, frameLanes: 6, centerX: 1.2 });
  assert.equal(f.look[2], 0);
  assert.equal(f.look[0], 1.2);
  assert.equal(f.pos[0], 1.2);
});

import { prizeSize } from '../ghostleg/js/prize-motion.js';

test('獎品大小依等級:雪球最小(盒子一半)、寶箱比盒子大、頭獎最大(2026-10-02 使用者)', () => {
  const near = (a, b) => Math.abs(a - b) < 1e-9;
  // 使用者:「寶箱還是不放大,變成一般箱子變小?」—— 寶箱維持原大小,一般盒子縮小;頭獎不超過車道太多,終點不會疊
  assert.ok(near(prizeSize(1, null), 1.05 * 0.45), '雪球 = 銘謝惠顧(沒有 tier)');
  assert.ok(near(prizeSize(1, 'plain'), 1.05 * 0.7));
  assert.ok(near(prizeSize(1, 'chest'), 1.05));
  assert.ok(near(prizeSize(1, 'deluxe'), 1.05 * 1.2));
  assert.ok(near(prizeSize(0.34, 'deluxe'), 0.34 * 1.05 * 1.2), '跟著車道寬縮放');
});

// 使用者:「動物跟名字比例是不是怪怪」—— 2 人特寫時動物很大,名字還是 3% 畫面高就顯得很小
test('namePlan:特寫時名字跟著放大(約一條車道寬的 16%),但不超過畫面高 6%', () => {
  const phone = namePlan({ viewW: 390, viewH: 760, lanes: 7, longestChars: 3 });
  assert.ok(phone.fontPx >= 26 && phone.fontPx <= 760 * 0.06, `${phone.fontPx}`);
  const desk = namePlan({ viewW: 1500, viewH: 784, lanes: 7, longestChars: 3 });
  assert.ok(Math.abs(desk.fontPx - 784 * 0.06) < 1e-9, `${desk.fontPx}`);
});

/* ---------- 最終 review 的修正(2026-10-02) ---------- */

// 簡易透視投影:世界座標 → NDC(-1~1),跟 three.js PerspectiveCamera + lookAt 一樣(上方向 +y)
function project(p, f, aspect, fov = 48) {
  const sub = (a, b) => a.map((v, i) => v - b[i]);
  const dot = (a, b) => a.reduce((s, v, i) => s + v * b[i], 0);
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const norm = a => { const l = Math.hypot(...a); return a.map(v => v / l); };
  const fwd = norm(sub(f.look, f.pos));
  const right = norm(cross(fwd, [0, 1, 0]));
  const up = cross(right, fwd);
  const d = sub(p, f.pos);
  const z = dot(d, fwd);
  const t = Math.tan((fov * Math.PI) / 360);
  return { x: dot(d, right) / (z * t * aspect), y: dot(d, up) / (z * t) };
}

// review Critical:橫向(投影 16:9)時 2 人特寫拉太近,底座前的名牌掉到畫面下面、整段掃描看不到名字
for (const [W, H] of [[1280, 720], [1024, 768], [1694, 695], [390, 700], [1920, 1080]]) {
  test(`特寫時底座前的名牌在畫面裡(${W}×${H}),而且下面留得下 namePlan 排出來的每一排`, () => {
    const aspect = W / H;
    const w = 1;
    const f = idleFrame({ lanes: 7, laneWidth: w, rows: 12, rowDepth: 1.35, aspect, frameLanes: 2, centerX: 0 });
    const a = project([0, 0.1, BASE_R * w * 1.16], f, aspect);
    const plan = namePlan({ viewW: W, viewH: H, lanes: 7, longestChars: 4 });
    const roomPx = ((a.y + 1) / 2) * H;   // 名牌頂到畫面底的距離
    assert.ok(a.y < 1 && a.y > -1, `名牌錨點 y=${a.y.toFixed(2)} 在畫面外`);
    assert.ok(roomPx >= plan.fontPx * 1.7 * plan.rows, `只剩 ${roomPx.toFixed(0)}px,放不下 ${plan.rows} 排 ${plan.fontPx.toFixed(0)}px 的名牌`);
  });
}

// review Important:剛好 2 個人時 scanDuration = 0,第一格就結束、大字名牌從來沒出現
test('scanPass:兩個人時鏡頭不用移動,但還是停 2.4 秒讓大家看清楚名字', () => {
  const opts = { lanes: 2, frameLanes: 2, laneWidth: 1 };
  assert.ok(Math.abs(scanDuration(opts) - 2.4) < 1e-9);
  assert.deepEqual(scanPass(1, opts), { x: 0, done: false });
  assert.equal(scanPass(2.5, opts).done, true);
});

// review Important:錯開兩排時名牌可以比車道寬,最左 / 最右的會凸出畫面被切掉
import { clampTagX } from '../ghostleg/js/labels.js';
test('clampTagX:名牌整塊留在畫面裡(左右各留 6px);放得下就不動', () => {
  assert.equal(clampTagX(10, 200, 390), 106);
  assert.equal(clampTagX(380, 200, 390), 284);
  assert.equal(clampTagX(195, 100, 390), 195);
});

test('clampTagX:掃到畫面外的名牌不夾回來(回 null 隱藏),不然會全部疊在邊緣', () => {
  assert.equal(clampTagX(-120, 200, 390), null);
  assert.equal(clampTagX(390 + 120, 200, 390), null);
  assert.equal(clampTagX(-60, 200, 390), null, '棋子中心已經在畫面外(只露出一半)也隱藏,不然會跟隔壁的名牌黏在一起');
});
