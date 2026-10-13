// 開場倒數:3 → 2 → 1 → Go Shoot!,各 0.5 秒;Go Shoot! 時陀螺落下。
import test from 'node:test';
import assert from 'node:assert/strict';
import { openingAt, OPENING_TIME, landing } from '../smash/js/opening.js';

test('依序是 3、2、1、Go Shoot!', () => {
  assert.deepEqual([0, 0.6, 1.1, 1.6].map(t => openingAt(t).label), ['3', '2', '1', 'Go Shoot!']);
});

test('倒數時陀螺停在上方,Go Shoot! 那半秒落下', () => {
  assert.equal(openingAt(1.2).drop, 0);
  assert.ok(openingAt(1.75).drop > 0 && openingAt(1.75).drop < 1);
  assert.equal(openingAt(OPENING_TIME).drop, 1);
});

test('時間到就結束,之後一直是結束', () => {
  assert.equal(openingAt(1.99).done, false);
  assert.equal(openingAt(OPENING_TIME).done, true);
  assert.equal(openingAt(99).label, null);
});

test('倒數時陀螺還在上面:不畫陀螺也不畫影子(不然盤面上一堆灰點)', () => {
  assert.equal(landing(0).visible, false);
});

test('Go Shoot! 落下時影子跟著變大變深,落地時是正常的影子', () => {
  const mid = landing(0.3);
  assert.ok(mid.visible);
  assert.ok(mid.shadow > 0 && mid.shadow < 1);
  assert.deepEqual(landing(1), { visible: true, shadow: 1 });
});
