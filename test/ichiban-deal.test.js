import test from 'node:test';
import assert from 'node:assert/strict';
import { dealPlan, flightAt, dealLength, boxYAt, FLIGHT_MS, INTRO_MS, SLIDE_MS } from '../ichiban/js/desk-deal.js';

const slots = n => Array.from({ length: n }, (_, i) => ({ no: n - i }));   // 故意倒著給

// 依序回傳給定的值,讓「每波幾張」可以預測
const fixed = (...vals) => { let i = 0; return () => vals[i++ % vals.length]; };

test('dealPlan:先搖箱子,再一波一波飛;每波 1~3 張同時出發,照號碼', () => {
  // rng 0 → 1 張、0.5 → 2 張、0.99 → 3 張
  const plan = dealPlan(slots(6), fixed(0, 0.5, 0.99));
  assert.deepEqual(plan.map(p => p.no), [1, 2, 3, 4, 5, 6]);
  const starts = plan.map(p => p.start);
  assert.equal(starts[0], INTRO_MS, '搖完箱子才開始飛');
  assert.equal(starts[1], starts[2], '第二波 2 張同時');
  assert.ok(starts[1] > starts[0]);
  assert.ok(starts[3] === starts[4] && starts[4] === starts[5], '第三波 3 張同時');
  assert.ok(plan.every(p => p.duration === FLIGHT_MS));
});

test('dealPlan:每波一定是 1~3 張', () => {
  const plan = dealPlan(slots(60), Math.random);
  const sizes = Object.values(plan.reduce((m, p) => ({ ...m, [p.start]: (m[p.start] ?? 0) + 1 }), {}));
  assert.ok(sizes.every(n => n >= 1 && n <= 3), sizes.join());
});

test('dealPlan:張數多就縮短間隔,最後一波在搖完後 2.5 秒內出發', () => {
  const plan = dealPlan(slots(150), fixed(0));
  assert.ok(plan.at(-1).start <= INTRO_MS + 2500);
  assert.ok(dealLength(plan) <= INTRO_MS + 2500 + FLIGHT_MS);
});

test('dealPlan:0 張、1 張都不會爆', () => {
  assert.deepEqual(dealPlan([]), []);
  assert.equal(dealPlan(slots(1))[0].start, INTRO_MS);
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

test('boxYAt:搖箱子時在中間,開始飛就往下滑到底部,不擋籤的路', () => {
  const mid = 300, bottom = 600;
  assert.equal(boxYAt(0, mid, bottom), mid);
  assert.equal(boxYAt(INTRO_MS, mid, bottom), mid);
  const half = boxYAt(INTRO_MS + SLIDE_MS / 2, mid, bottom);
  assert.ok(half > mid && half < bottom);
  assert.equal(boxYAt(INTRO_MS + SLIDE_MS, mid, bottom), bottom);
  assert.equal(boxYAt(99999, mid, bottom), bottom);
});
