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
