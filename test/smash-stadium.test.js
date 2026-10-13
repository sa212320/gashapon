// 大亂鬥的對戰盤。物理與畫面都從同一份形狀來 ——
// 兩邊各自定義的話,遲早會出現「看起來在牆內,其實已經出局」。
//
// 形狀照真的 Xtreme 盤(Nick__Furry 復刻 3D 檔拼回原位後實測):
// 碗 → 碗緣立起來的一圈加速軌道(前窄後寬,正後方凹口)→ 軌道外的平台 → 外圈。
// 出局:兩個前角的長方槽(要飛過邊緣)、軌道正前方外側的凹槽(跳過軌道就掉進去)。
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  HALF, DEPTH, RIDGE, RAIL_WIDTH, RAIL_HEIGHT, ZONE, POCKETS,
  railOuter, railRadius, bowlDistance, bowlNormal, zoneAt, pocketAt, heightAt, slopeAccel,
  onRail, railAccel, randomSpot,
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

const polar = (deg, r) => [Math.cos((deg * Math.PI) / 180) * r, Math.sin((deg * Math.PI) / 180) * r];
const MM = 100 / 220;   // 1mm 是幾單位

/* ---------- 碗與軌道(3D 檔實測) ---------- */

test('軌道照實測:前面窄、兩側最寬、左右對稱', () => {
  assert.ok(Math.abs(railOuter(90) - 165 * MM) < 0.5, `正前方 ${railOuter(90)}`);
  assert.ok(Math.abs(railOuter(0) - 200 * MM) < 0.5, `側面 ${railOuter(0)}`);
  assert.ok(railOuter(90) < railOuter(45) && railOuter(45) < railOuter(0));
  for (const a of [10, 30, 60, 80, 120, 150]) assert.ok(Math.abs(railOuter(90 - a) - railOuter(90 + a)) < 1e-9);
});

test('軌道 10mm 寬、立起來 8mm', () => {
  assert.ok(Math.abs(RAIL_WIDTH - 10 * MM) < 0.1);
  assert.ok(Math.abs(RAIL_HEIGHT - 8 * MM) < 0.1);
});

test('軌道正後方有往內凹的台階(真盤子的「愛心」凹口)', () => {
  assert.ok(railOuter(270) < railOuter(250) - 15, `凹口 ${railOuter(270)} / 旁邊 ${railOuter(250)}`);
  assert.equal(onRail(...polar(270, railOuter(250) - 1)), false, '凹口那裡貼著外圈跑的陀螺不在軌道上');
  assert.equal(onRail(...polar(270, railRadius(270))), true);
});

test('碗緣:碗內是負的、軌道外緣上是 0,法線朝外', () => {
  assert.ok(bowlDistance(0, 0) < 0);
  for (const a of [0, 45, 90, 135, 200, 270]) {
    const [x, y] = polar(a, railOuter(a));
    assert.ok(Math.abs(bowlDistance(x, y)) < 1e-9);
    const n = bowlNormal(...polar(a, railOuter(a) - 5));
    assert.ok(n.x * x + n.y * y > 0, `${a}° 法線朝內`);
  }
});

test('碗底剖面:碗心最低、Tornado Ridge 那一圈有台階、外圈平', () => {
  assert.equal(heightAt(0, 0), 0);
  assert.ok(heightAt(RIDGE + 2, 0) - heightAt(RIDGE - 2, 0) > 1, '台階不見了');
  assert.ok(Math.abs(heightAt(75, 0) - DEPTH) < 1e-9);
});

test('加速軌道整圈連續(出口前面也有),場中央不是軌道', () => {
  for (const a of [0, 45, 90, 135, 200]) assert.equal(onRail(...polar(a, railRadius(a))), true, `${a}° 沒有軌道`);
  assert.equal(onRail(30, 0), false);
});

test('軌道看的是陀螺的外緣,不是中心', () => {
  const r = railOuter(0) - RAIL_WIDTH - 8;
  assert.equal(onRail(r, 0), false);
  assert.equal(onRail(r, 0, 8), true);
});

test('軌道推力沿著切線,順著原本的方向;夠快就不推', () => {
  const [x, y] = polar(0, railRadius(0));
  assert.ok(railAccel(x, y, 0, 50).y > 0);
  assert.ok(railAccel(x, y, 0, -50).y < 0);
  assert.deepEqual(railAccel(x, y, 0, 1000), { x: 0, y: 0 });
});

/* ---------- 軌道外(區域圖) ---------- */

test('外殼寬 44cm', () => {
  assert.ok(Math.abs(HALF * 2 - 440 * MM) < 1);
  assert.equal(zoneAt(95, 0), ZONE.PLATEAU);
  assert.equal(zoneAt(103, 0), ZONE.OUT);
});

test('軌道外是平台,比碗外圈高一個軌道', () => {
  assert.equal(zoneAt(0, -85), ZONE.PLATEAU);
  assert.equal(zoneAt(95, 0), ZONE.PLATEAU);
  assert.ok(Math.abs(heightAt(95, 0) - (DEPTH + RAIL_HEIGHT)) < 0.5);
});

test('碗裡就是碗,不看區域圖', () => {
  assert.equal(zoneAt(0, 0), ZONE.BOWL);
  assert.equal(zoneAt(...polar(200, railOuter(200) - 1)), ZONE.BOWL);
});

test('兩個前角是長方槽,左右各一', () => {
  assert.equal(zoneAt(-80, 70), ZONE.OVER_LEFT);
  assert.equal(zoneAt(80, 70), ZONE.OVER_RIGHT);
  assert.equal(pocketAt(-80, 70)?.id, 'left');
  assert.equal(pocketAt(80, 70)?.id, 'right');
});

test('方槽外圍有一圈邊緣:要飛過去才掉得進去', () => {
  // 從碗緣沿著 x 往左走到方槽,中間一定會經過邊緣
  let sawLip = false;
  for (let x = -60; x > -80; x -= 0.5) if (zoneAt(x, 70) === ZONE.LIP) sawLip = true;
  assert.ok(sawLip);
});

test('軌道正前方外側是中間凹槽,再外面是高牆', () => {
  assert.equal(zoneAt(0, 76), ZONE.XTREME);
  assert.equal(pocketAt(0, 76)?.id, 'center');
  assert.equal(zoneAt(0, 96), ZONE.WALL);
});

test('後面沒有出口', () => {
  for (let x = -90; x <= 90; x += 5) {
    for (let y = -95; y <= -40; y += 5) assert.equal(pocketAt(x, y), null, `(${x},${y})`);
  }
});

test('出口只有三個', () => {
  assert.deepEqual(POCKETS.map(p => p.id).sort(), ['center', 'left', 'right']);
});

test('坡度推力永遠朝內(碗裡與平台上都是),碗心沒有推力', () => {
  assert.deepEqual(slopeAccel(0, 0), { x: 0, y: 0 });
  for (const [x, y] of [[75, 0], [0, -75], [-50, 50], [0, -85], [95, 0]]) {
    const a = slopeAccel(x, y);
    assert.ok(a.x * x + a.y * y < 0, `(${x},${y}) 的坡度往外推`);
  }
});

test('隨機位置一定在碗內,離碗緣至少 margin', () => {
  const rng = seeded(7);
  for (let i = 0; i < 500; i++) {
    const s = randomSpot(rng, 25);
    assert.ok(bowlDistance(s.x, s.y) <= -25, `(${s.x},${s.y}) 太靠邊`);
  }
});
