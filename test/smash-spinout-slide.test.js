// 停轉後的滑行(畫面):帶著最後的速度滑一段,碰到碗邊沿著邊滑,不會當場定住。
import test from 'node:test';
import assert from 'node:assert/strict';
import { slideStep } from '../smash/js/spinout-slide.js';
import { bowlDistance, railOuter } from '../smash/js/stadium.js';

const R = 8;

test('碗裡面:照速度往前滑', () => {
  const s = slideStep({ x: 0, y: 0, vx: 100, vy: 0 }, 1 / 60, R);
  assert.ok(Math.abs(s.x - 100 / 60) < 1e-6);
});

test('貼著碗邊沿切線跑(軌道上衝刺時停轉):繼續往前滑,不會當場定住', () => {
  const r = railOuter(90) - R - 1;            // 側邊 90° 方向,貼著邊
  let s = { x: 0, y: r, vx: 150, vy: 0 };
  const start = { ...s };
  for (let i = 0; i < 10; i++) s = slideStep(s, 1 / 60, R);
  assert.ok(Math.hypot(s.x - start.x, s.y - start.y) > 15, `只滑了 ${Math.hypot(s.x - start.x, s.y - start.y).toFixed(1)}`);
  assert.ok(bowlDistance(s.x, s.y) < 0, '還在碗裡');
});

test('直直往外撞碗邊:往外的那一段被擋掉(反彈回來),不會穿出去', () => {
  const r = railOuter(90) - R - 1;
  let s = { x: 0, y: r, vx: 0, vy: 200 };
  for (let i = 0; i < 10; i++) s = slideStep(s, 1 / 60, R);
  assert.ok(bowlDistance(s.x, s.y) < -R + 0.5, `${bowlDistance(s.x, s.y)}`);
  assert.ok(s.vy < 0, '彈回來');
});
