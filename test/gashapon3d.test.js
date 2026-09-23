// 3D 扭蛋機的資料層。
//
// 這裡最要釘死的一句是:**蛋殼顏色跟稀有度無關**。
// 每顆蛋自己隨機挑一個殼色,稀有度只決定翻開時的演出等級。
// 把兩者綁在一起的話,小孩看一眼球裡的顏色就知道哪顆是大獎。
import test from 'node:test';
import assert from 'node:assert/strict';

import { createPrize } from '../gashapon/js/state.js';
import { CAPSULE_COLORS, buildPool3d, createSetup3d, draw3d } from '../gashapon3d/js/model.js';

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

test('池子照 count 展開,每顆蛋都有一個殼色', () => {
  const prizes = [createPrize({ name: '甲', count: 3 }), createPrize({ name: '乙', count: 2 })];
  const pool = buildPool3d(prizes, seeded(1));
  assert.equal(pool.length, 5);
  assert.ok(pool.every(c => CAPSULE_COLORS.includes(c.color)));
  assert.ok(pool.every(c => c.drawn === false));
});

test('殼色跟稀有度無關 —— 同一個稀有度的蛋會有各種顏色', () => {
  // 全部都是 UR。如果殼色是由稀有度決定的,這裡只會出現一種顏色。
  const prizes = [createPrize({ name: '大獎', count: 200, rarity: 'UR' })];
  const colors = new Set(buildPool3d(prizes, seeded(7)).map(c => c.color));
  assert.ok(colors.size > 4, `200 顆 UR 只出現 ${colors.size} 種殼色,顏色被稀有度綁死了`);
});

test('殼色跟獎項也無關 —— 同一個獎項的蛋不會統一成一色', () => {
  const prizes = [createPrize({ name: '甲', count: 60, rarity: 'N' })];
  const colors = new Set(buildPool3d(prizes, seeded(11)).map(c => c.color));
  assert.ok(colors.size > 4, `同一個獎項的 60 顆蛋只有 ${colors.size} 種殼色`);
});

test('count 不可信時當成 0,不要讓展開的迴圈跑不完', () => {
  assert.equal(buildPool3d([createPrize({ name: '壞的', count: Infinity })], seeded(1)).length, 0);
  assert.equal(buildPool3d([createPrize({ name: '壞的', count: NaN })], seeded(1)).length, 0);
});

test('抽獎機率只看 count,稀有度完全不參與', () => {
  // 甲 1 顆 N、乙 3 顆 UR。如果稀有度會影響機率,乙不會剛好是三倍。
  const prizes = [
    createPrize({ name: '甲', count: 1, rarity: 'N' }),
    createPrize({ name: '乙', count: 3, rarity: 'UR' }),
  ];
  const tally = { 甲: 0, 乙: 0 };
  for (let seed = 0; seed < 8000; seed++) {
    const setup = createSetup3d({ name: 't', prizes, removeOnDraw: false });
    tally[draw3d(setup, seeded(seed)).prize.name]++;
  }
  const ratio = tally.乙 / tally.甲;
  assert.ok(Math.abs(ratio - 3) < 0.25, `乙:甲 = ${ratio.toFixed(2)},不是 3:1`);
});

test('抽走之後 prize.count 不動,只有 pool 的 drawn 會變', () => {
  const prizes = [createPrize({ name: '甲', count: 2 })];
  const setup = createSetup3d({ name: 't', prizes });
  const out = draw3d(setup, seeded(5));
  assert.equal(setup.prizes[0].count, 2);
  assert.equal(out.pool.filter(c => c.drawn).length, 1);
  assert.equal(out.capsule.drawn, true);
});

test('removeOnDraw 關掉時池子永遠不會空', () => {
  const setup = createSetup3d({ name: 't', prizes: [createPrize({ name: '甲', count: 1 })], removeOnDraw: false });
  let s = setup;
  for (let i = 0; i < 20; i++) {
    const out = draw3d(s, seeded(i));
    assert.ok(out, `第 ${i} 次就抽不到了`);
    assert.equal(out.pool.filter(c => c.drawn).length, 0);
    s = { ...s, pool: out.pool };
  }
});

test('抽光之後回 null', () => {
  let s = createSetup3d({ name: 't', prizes: [createPrize({ name: '甲', count: 1 })] });
  s = { ...s, pool: draw3d(s, seeded(1)).pool };
  assert.equal(draw3d(s, seeded(2)), null);
});

test('演出腳本沿用 2D 的那一套', () => {
  const s = createSetup3d({ name: 't', prizes: [createPrize({ name: '甲', count: 1, rarity: 'SR' })] });
  const steps = draw3d(s, seeded(1)).revealSteps;
  assert.equal(steps.filter(x => x.type === 'upgrade').length, 2); // N→R→SR
  assert.equal(steps.at(-1).type, 'show');
});
