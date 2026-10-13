// 逐格特效:演出進度 k(0~1)→ 第幾格
import test from 'node:test';
import assert from 'node:assert/strict';
import { fxFrame } from '../smash/js/fx-frame.js';

test('從第 0 格開始,到最後一格結束', () => {
  assert.equal(fxFrame(0, 17), 0);
  assert.equal(fxFrame(0.999, 17), 16);
});

test('超出範圍也不會拿到不存在的格', () => {
  assert.equal(fxFrame(1, 17), 16);
  assert.equal(fxFrame(-0.1, 17), 0);
});

test('每一格分到差不多的時間', () => {
  assert.equal(fxFrame(0.5, 10), 5);
});
