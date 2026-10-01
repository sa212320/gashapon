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
