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
