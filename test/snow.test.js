// 飄雪。兩件事要釘住:
//   1. prefers-reduced-motion 時**不產生節點**,不是產生後隱藏 —— 會動的節點
//      就算看不到,合成器還是要處理它。
//   2. 每片的參數都要在範圍內。亂數注入進來,才驗得到而不是碰運氣。
import test from 'node:test';
import assert from 'node:assert/strict';

import { FLAKES, flakeSpecs, mountSnow } from '../shared/js/snow.js';

// 固定序列的假亂數:第一次回 0、第二次回 0.999,用來打範圍的兩端
function seq(values) {
  let i = 0;
  return () => values[i++ % values.length];
}

test('雪花數量等於常數', () => {
  assert.equal(flakeSpecs().length, FLAKES);
  assert.equal(flakeSpecs(7).length, 7);
});

test('rng 回 0 時,每個參數都落在範圍下緣', () => {
  const [f] = flakeSpecs(1, seq([0]));
  assert.equal(f.size, 2);
  assert.equal(f.duration, 8);
  assert.equal(f.left, 0);
  assert.equal(f.delay, -18);
  assert.equal(f.drift, -24);
});

test('rng 接近 1 時,每個參數都落在範圍上緣', () => {
  const [f] = flakeSpecs(1, seq([0.999999]));
  assert.ok(f.size > 5.99 && f.size <= 6, `size=${f.size}`);
  assert.ok(f.duration > 17.9 && f.duration <= 18, `duration=${f.duration}`);
  assert.ok(f.left > 99.9 && f.left <= 100, `left=${f.left}`);
  assert.ok(f.drift > 23.9 && f.drift <= 24, `drift=${f.drift}`);
});

test('delay 一律是負的 —— 一載入就該滿天都是雪,不是等十八秒才飄第一片', () => {
  for (const f of flakeSpecs(FLAKES, seq([0.3, 0.7, 0.1, 0.9]))) {
    assert.ok(f.delay <= 0, `delay=${f.delay}`);
  }
});

test('prefers-reduced-motion 時產生 0 個節點', () => {
  const made = mountSnow({ reduceMotion: true });
  assert.equal(made, 0);
});
