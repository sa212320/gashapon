// 真的搖托盤(2026-10-02 使用者:「我以為是真的搖動托盤,然後算出上面球要怎麼動」)。
// trayShake(t) 給托盤在搖動開始後 t 秒的位移與加速度;球的運動由物理在托盤座標系裡用
// 「−托盤加速度」的慣性力算出來。這裡釘死曲線本身:從原位開始、幅度遞減、最後停在原位,
// 而且加速度真的是位移的二階導數(不然球的反應會跟畫面上托盤的動作對不起來)。
import test from 'node:test';
import assert from 'node:assert/strict';
import { trayShake, SHAKE_SECONDS, SHAKE_AMP } from '../gashapon3d/js/tray-motion.js';

test('trayShake:從原位開始', () => {
  const s = trayShake(0);
  assert.ok(Math.abs(s.x) < 1e-9 && Math.abs(s.y) < 1e-9);
});

test('trayShake:搖完停在原位、加速度歸零', () => {
  for (const t of [SHAKE_SECONDS, SHAKE_SECONDS + 0.5, 10]) {
    assert.deepEqual(trayShake(t), { x: 0, y: 0, ax: 0, ay: 0 });
  }
});

test('trayShake:幅度不超過 SHAKE_AMP,而且一下比一下小', () => {
  const peaks = [];
  let prev = 0;
  let rising = true;
  for (let t = 0; t < SHAKE_SECONDS; t += 0.001) {
    const x = Math.abs(trayShake(t).x);
    assert.ok(x <= SHAKE_AMP + 1e-9);
    if (rising && x < prev) { peaks.push(prev); rising = false; }
    if (!rising && x > prev) rising = true;
    prev = x;
  }
  assert.ok(peaks.length >= 3, `至少來回三下,實際 ${peaks.length}`);
  for (let i = 1; i < peaks.length; i++) assert.ok(peaks[i] < peaks[i - 1], peaks.join(','));
});

test('trayShake:加速度 = 位移的二階導數', () => {
  const h = 1e-4;
  for (const t of [0.05, 0.13, 0.27, 0.41]) {
    const num = (trayShake(t + h).x - 2 * trayShake(t).x + trayShake(t - h).x) / (h * h);
    assert.ok(Math.abs(num - trayShake(t).ax) < Math.max(0.5, Math.abs(num) * 0.01), `t=${t}: ${num} vs ${trayShake(t).ax}`);
    const numY = (trayShake(t + h).y - 2 * trayShake(t).y + trayShake(t - h).y) / (h * h);
    assert.ok(Math.abs(numY - trayShake(t).ay) < Math.max(0.5, Math.abs(numY) * 0.01), `t=${t}: ${numY} vs ${trayShake(t).ay}`);
  }
});

import { bowlHeight, bowlSlope, BOWL_FLAT, BOWL_RIM, BOWL_DEPTH } from '../gashapon3d/js/tray-motion.js';

// 托盤改成碗(2026-10-02 使用者:「我以為會更像碗」):中間平、往外沿弧線翹起到碗口。
// 物理用同一條曲線:蛋滾到碗邊會沿著斜面滑回中間(取代原本的「內凹回中力」假力)。
test('bowlHeight:中心最低,碗口最高', () => {
  assert.equal(bowlHeight(0), 0);
  assert.equal(bowlHeight(BOWL_FLAT), 0);
  assert.ok(Math.abs(bowlHeight(BOWL_RIM) - BOWL_DEPTH) < 1e-9);
  assert.equal(bowlHeight(BOWL_RIM + 1), BOWL_DEPTH);
});

test('bowlHeight:一路往外只升不降', () => {
  let prev = -1;
  for (let r = 0; r <= BOWL_RIM; r += 0.01) {
    const h = bowlHeight(r);
    assert.ok(h >= prev - 1e-12, `r=${r}`);
    prev = h;
  }
});

test('bowlSlope:碗底正中央是 0,越往外越陡,跟高度的導數一致', () => {
  assert.equal(bowlSlope(BOWL_FLAT * 0.5), 0);
  const a = bowlSlope(BOWL_FLAT + (BOWL_RIM - BOWL_FLAT) * 0.3);
  const b = bowlSlope(BOWL_FLAT + (BOWL_RIM - BOWL_FLAT) * 0.8);
  assert.ok(a > 0 && b > a);
  const r = BOWL_FLAT + (BOWL_RIM - BOWL_FLAT) * 0.5;
  const num = (bowlHeight(r + 1e-5) - bowlHeight(r - 1e-5)) / 2e-5;
  assert.ok(Math.abs(num - bowlSlope(r)) < 1e-4);
});

import { bowlDepth } from '../gashapon3d/js/tray-motion.js';

// 碗的深度跟著碗的大小走(2026-10-02 使用者選 A):蛋多、碗大的時候也要看起來像碗,
// 不是一片盤子;但再小也至少有蛋高的 0.3 倍。
// 2026-10-02:0.15(碗太大時像盤子)→ 使用者要高一點 0.22 → 碗縮小之後又嫌太高 → 0.16
test('bowlDepth:半徑 × 0.16,最少蛋高 × 0.3', () => {
  assert.equal(bowlDepth(1), 0.3);
  assert.ok(Math.abs(bowlDepth(6) - 0.96) < 1e-9);
  assert.ok(bowlDepth(7) > bowlDepth(6));
});
