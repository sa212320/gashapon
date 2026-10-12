// 大亂鬥的對戰盤。物理與畫面都從 stadium.js 拿形狀 ——
// 兩邊各自定義的話,遲早會出現「看起來在牆內,其實已經出局」。
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  HALF, CORNER, DEPTH, POCKETS,
  wallDistance, wallNormal, pocketAt, heightAt, slopeAccel,
  onRail, railAccel, pocketRest, randomSpot, wallPath,
} from '../smash/js/stadium.js';

function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

test('牆的距離:中央最深、四邊的牆上是 0、牆外是正的', () => {
  assert.equal(wallDistance(0, 0), -HALF);
  assert.ok(Math.abs(wallDistance(HALF, 0)) < 1e-9);
  assert.ok(Math.abs(wallDistance(0, -HALF)) < 1e-9);
  assert.ok(wallDistance(HALF + 5, 0) > 0);
});

test('圓角:正方形的角落其實在牆外', () => {
  assert.ok(wallDistance(HALF - 1, HALF - 1) > 0, '角落沒有修圓');
  // 圓角的圓心在 (70, 70),半徑 30
  const c = HALF - CORNER;
  const d = wallDistance(c + CORNER * Math.SQRT1_2, c + CORNER * Math.SQRT1_2);
  assert.ok(Math.abs(d) < 1e-9);
});

test('法線一律朝外', () => {
  for (const [x, y] of [[90, 0], [-90, 0], [0, 90], [0, -90], [85, 85], [-85, -85]]) {
    const n = wallNormal(x, y);
    assert.ok(Math.abs(Math.hypot(n.x, n.y) - 1) < 1e-9);
    assert.ok(n.x * x + n.y * y > 0, `(${x},${y}) 的法線朝內`);
  }
});

test('口袋只在靠鏡頭那一側(+y),而且只在三段範圍內', () => {
  assert.equal(pocketAt(0, 98)?.id, 'center');
  assert.equal(pocketAt(-60, 98)?.id, 'left');
  assert.equal(pocketAt(60, 98)?.id, 'right');
  assert.equal(pocketAt(0, -98), null, '後牆不該有口袋');
  assert.equal(pocketAt(30, 98), null, '口袋之間是牆');
  assert.equal(pocketAt(98, 0), null, '側牆不該有口袋');
});

test('前側的圓角不是口袋 —— 角落要把陀螺擋回來', () => {
  assert.equal(pocketAt(85, 85), null);
  assert.equal(pocketAt(-85, 85), null);
});

test('口袋寬度照真盤子的比例:中間大、角落小', () => {
  const w = id => { const p = POCKETS.find(q => q.id === id); return p.x1 - p.x0; };
  assert.ok(w('center') > w('left') * 1.4);
  assert.equal(w('left'), w('right'));
});

test('坡度:中央是平的,往外愈來愈高,牆邊是 DEPTH', () => {
  assert.equal(heightAt(0, 0), 0);
  assert.equal(heightAt(20, 0), 0, '中央 35% 應該是平的');
  assert.ok(heightAt(60, 0) > 0);
  assert.ok(heightAt(80, 0) > heightAt(60, 0));
  assert.ok(Math.abs(heightAt(HALF, 0) - DEPTH) < 1e-9);
});

test('坡度推力永遠朝內,中央沒有推力', () => {
  assert.deepEqual(slopeAccel(0, 0), { x: 0, y: 0 });
  for (const [x, y] of [[80, 0], [0, -80], [-70, 60], [85, 85]]) {
    const a = slopeAccel(x, y);
    assert.ok(a.x * x + a.y * y < 0, `(${x},${y}) 的坡度往外推`);
  }
});

test('加速軌道:貼著外牆的一圈,口袋前面斷開', () => {
  assert.equal(onRail(95, 0), true);
  assert.equal(onRail(0, -95), true);
  assert.equal(onRail(50, 0), false, '場中央不是軌道');
  assert.equal(onRail(0, 95), false, '中間口袋前面要斷開');
  assert.equal(onRail(30, 95), true, '口袋之間的前牆有軌道');
});

test('軌道推力沿著牆的切線,順著原本的方向', () => {
  // 右牆,往 +y 走 → 推力也往 +y
  const a = railAccel(95, 0, 0, 50);
  assert.ok(Math.abs(a.x) < 1e-9);
  assert.ok(a.y > 0);
  // 反方向走 → 推力反過來
  assert.ok(railAccel(95, 0, 0, -50).y < 0);
});

test('沿牆已經夠快時不再加速', () => {
  const a = railAccel(95, 0, 0, 1000);
  assert.deepEqual(a, { x: 0, y: 0 });
});

test('掉進口袋的陀螺停在口袋裡面(牆線外側)', () => {
  const p = POCKETS.find(q => q.id === 'center');
  const r = pocketRest(p, 100);
  assert.ok(r.x >= p.x0 && r.x <= p.x1, '跑出口袋範圍');
  assert.ok(r.y > HALF, '要在前牆線的外側');
});

test('隨機位置一定在盤內,離牆至少 margin', () => {
  const rng = seeded(7);
  for (let i = 0; i < 500; i++) {
    const s = randomSpot(rng, 25);
    assert.ok(wallDistance(s.x, s.y) <= -25, `(${s.x},${s.y}) 太靠牆`);
  }
});

test('wallPath 沿著外牆繞一圈,每個點都在牆上', () => {
  const pts = wallPath(64);
  assert.ok(pts.length >= 64);
  for (const p of pts) assert.ok(Math.abs(wallDistance(p.x, p.y)) < 1e-6);
});
