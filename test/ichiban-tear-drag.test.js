// 一番賞手指撕籤的規則(2026-10-02 grill 定案)。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createTearDrag, COMMIT_AT, AUTO_AT, RIP_STEP } from '../ichiban/js/tear-drag.js';

const read = p => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

test('常數是定案的值', () => {
  assert.deepEqual([COMMIT_AT, AUTO_AT, RIP_STEP], [0.03, 0.7, 0.08]);
});

test('單點(沒拉動)不算撕', () => {
  const d = createTearDrag();
  d.down(0.5); d.up();
  assert.equal(d.progress, 0);
  assert.equal(d.committed, false);
});

test('往右拉的距離 / 籤寬 = 進度;超過 3% 才 commit,只 commit 一次', () => {
  const d = createTearDrag();
  d.down(0.2);
  assert.deepEqual(d.move(0.22).events, []);
  const r = d.move(0.24);
  assert.ok(Math.abs(r.progress - 0.04) < 1e-9);
  assert.deepEqual(r.events, ['commit']);
  assert.ok(!d.move(0.25).events.includes('commit'));
});

test('放開停在原地,下一次從目前進度接著拉', () => {
  const d = createTearDrag();
  d.down(0.1); d.move(0.4); d.up();
  assert.ok(Math.abs(d.progress - 0.3) < 1e-9);
  d.down(0.6); d.move(0.7);
  assert.ok(Math.abs(d.progress - 0.4) < 1e-9);
});

test('可以往回拉,進度會減少,但 committed 不會變回 false(模型錯誤 #2)', () => {
  const d = createTearDrag();
  d.down(0); d.move(0.3); d.move(-0.5);
  assert.equal(d.progress, 0);
  assert.equal(d.committed, true);
});

test('撕紙聲:往前每 8% 一聲,往回不出聲,再往前又會響', () => {
  const d = createTearDrag();
  d.down(0);
  const rips = x => d.move(x).events.filter(e => e === 'rip').length;
  assert.equal(rips(0.05), 0);
  assert.equal(rips(0.09), 1);
  assert.equal(rips(0.30), 1, '一次跨過好幾段也只響一聲');
  assert.equal(rips(0.10), 0, '往回不出聲');
  assert.equal(rips(0.20), 1);
});

test('到 70% 自動撕完;之後拖曳無效', () => {
  const d = createTearDrag();
  d.down(0);
  const r = d.move(0.71);
  assert.ok(r.events.includes('auto') && r.events.includes('commit'));
  assert.equal(d.auto, true);
  assert.deepEqual(d.move(0.1).events, []);
  assert.ok(Math.abs(d.progress - 0.71) < 1e-9);
});

test('按「撕開」:任何進度都直接 auto(還沒 commit 的也一起 commit);只算一次', () => {
  const d = createTearDrag();
  assert.deepEqual(d.button().events, ['commit', 'auto']);
  assert.deepEqual(d.button().events, []);
  const e = createTearDrag();
  e.down(0); e.move(0.3);
  assert.deepEqual(e.button().events, ['auto']);
  assert.ok(Math.abs(e.button().progress - 0.3) < 1e-9);
});

test('沒有 down 的 move 不算數(手指從籤外面滑進來)', () => {
  const d = createTearDrag();
  assert.deepEqual(d.move(0.5).events, []);
  assert.equal(d.progress, 0);
});
