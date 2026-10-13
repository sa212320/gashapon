// 畫面上每一格陀螺轉多少。轉太快會出現「車輪效應」:攻擊型 8 片刃一片相隔 0.785 rad,
// 60 fps 下每格剛好轉這麼多時看起來像停住、再快一點像倒轉。
import test from 'node:test';
import assert from 'node:assert/strict';
import { visibleTurn, MAX_TURN } from '../smash/js/spin-look.js';

test('慢的時候照實際轉速', () => {
  assert.equal(visibleTurn(6, 1 / 60), 6 / 60);
});

test('再快每格也不超過刃間距的一半,看起來永遠往同一個方向轉', () => {
  for (const fps of [30, 60, 120]) {
    for (let rate = 0; rate <= 60; rate += 0.5) {
      const turn = visibleTurn(rate, 1 / fps);
      assert.ok(turn <= MAX_TURN && turn < (Math.PI * 2 / 8) / 2, `${rate} rad/s @${fps}fps → ${turn}`);
    }
  }
});

test('轉速愈高轉愈多(不會倒過來變慢)', () => {
  let prev = -1;
  for (let rate = 0; rate <= 60; rate += 1) {
    const t = visibleTurn(rate, 1 / 60);
    assert.ok(t >= prev);
    prev = t;
  }
});
