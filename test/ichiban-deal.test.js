import test from 'node:test';
import assert from 'node:assert/strict';
import { dealPlan, flightAt, dealLength, FLIGHT_MS } from '../ichiban/js/desk-deal.js';

const slots = n => Array.from({ length: n }, (_, i) => ({ no: n - i }));   // 故意倒著給

test('dealPlan:照號碼一張一張出發,張數少時間隔 80ms', () => {
  const plan = dealPlan(slots(5));
  assert.deepEqual(plan.map(p => p.no), [1, 2, 3, 4, 5]);
  assert.deepEqual(plan.map(p => p.start), [0, 80, 160, 240, 320]);
  assert.ok(plan.every(p => p.duration === FLIGHT_MS));
});

test('dealPlan:張數多就縮短間隔,最後一張 2.5 秒內出發', () => {
  const plan = dealPlan(slots(150));
  assert.ok(plan.at(-1).start <= 2500);
  assert.ok(plan[1].start < 80);
  assert.ok(dealLength(plan) <= 2500 + FLIGHT_MS);
});

test('dealPlan:0 張、1 張都不會爆', () => {
  assert.deepEqual(dealPlan([]), []);
  assert.equal(dealPlan(slots(1))[0].start, 0);
  assert.equal(dealLength([]), 0);
});

test('flightAt:起點在盒口、很小;終點在格子、全尺寸、停在自己的歪斜角度', () => {
  const from = { x: 200, y: 600 }, to = { x: 50, y: 100 };
  const a = flightAt(0, from, to, 3);
  assert.deepEqual([a.x, a.y], [200, 600]);
  assert.ok(a.scale < 0.4);
  const b = flightAt(1, from, to, 3);
  assert.deepEqual([b.x, b.y, b.scale, b.rot], [50, 100, 1, 3]);
});

test('flightAt:中途往上彈(比直線高),而且在轉', () => {
  const from = { x: 0, y: 500 }, to = { x: 100, y: 300 };
  const m = flightAt(0.5, from, to, 0);
  assert.ok(m.y < 400, `中點 y=${m.y} 應該高於直線中點 400`);
  assert.ok(Math.abs(m.rot) > 30);
});

test('flightAt:t 超出 0~1 會夾住', () => {
  const from = { x: 0, y: 0 }, to = { x: 10, y: 10 };
  assert.deepEqual(flightAt(2, from, to, 1), flightAt(1, from, to, 1));
});
