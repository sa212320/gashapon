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

import { overlayLayout } from '../ghostleg/js/labels.js';

// 開跑前疊在畫面上的大字名牌(2026-10-02:投影到黑板,後排學生要看得到;開跑後學生自己盯自己的棋子)
test('overlayLayout:人少時字高約畫面高度 3%(1080p ≈ 32px),不用錯開', () => {
  const l = overlayLayout({ viewH: 1080, laneSpacingPx: 220, lanes: 6 });
  assert.ok(l.fontPx >= 30 && l.fontPx <= 34, `${l.fontPx}`);
  assert.equal(l.rows, 1);
});

test('overlayLayout:手機上也至少 16px', () => {
  assert.ok(overlayLayout({ viewH: 640, laneSpacingPx: 50, lanes: 6 }).fontPx >= 16);
});

test('overlayLayout:車道太窄就錯開成 2~3 排,每個名字可用寬度 = 排數 × 車道', () => {
  const two = overlayLayout({ viewH: 1080, laneSpacingPx: 80, lanes: 12 });
  assert.equal(two.rows, 2);
  assert.ok(Math.abs(two.maxWidthPx - 80 * 2 * 0.95) < 1e-9);
  const three = overlayLayout({ viewH: 1080, laneSpacingPx: 40, lanes: 40 });
  assert.equal(three.rows, 3);
});

test('overlayLayout:手機 7 人時「玩家7」這種 3 個字的名字放得下(扣掉內距後至少 3 個字寬)', () => {
  const l = overlayLayout({ viewH: 640, laneSpacingPx: 37, lanes: 7 });
  const padding = l.fontPx * 0.7 + 6;   // CSS:左右各 .35em + 框 3px×2
  assert.ok(l.maxWidthPx - padding >= l.fontPx * 3, `${l.maxWidthPx} - ${padding} < ${l.fontPx * 3}`);
});

test('overlayLayout:字不能比可用寬度能放下 2 個字還大(40 人時自動縮字)', () => {
  const l = overlayLayout({ viewH: 1080, laneSpacingPx: 20, lanes: 40 });
  assert.ok(l.fontPx * 2 <= l.maxWidthPx + 1e-9, `${l.fontPx} × 2 > ${l.maxWidthPx}`);
});
