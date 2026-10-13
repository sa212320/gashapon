// 盾 = 冰凍(原型):寒氣射向最近的 FROST_TARGETS 顆敵人,打中的變冰塊 FREEZE_TIME 秒 ——
// 不會自己動、轉速不掉、滑很遠、被撞飛得遠,但不會爆裂。
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyPickups, tickFrosts, tickBuffs, FROST_FLIGHT, FREEZE_TIME, FROST_TARGETS,
} from '../smash/js/items.js';
import { step, think } from '../smash/js/physics.js';

const at = (fighterId, x, y, extra = {}) => ({
  id: `c_${fighterId}_${x}_${y}`, fighterId, x, y, vx: 0, vy: 0,
  radius: 8, mass: 1, alive: true, spin: 0.5, outBy: null, pocket: null, railing: false,
  beyType: 'attack', buffs: { attack: [], shield: [] }, healedAt: -Infinity, ...extra,
});
const world = (combatants, extra = {}) => ({ combatants, items: [], strikes: [], frosts: [], time: 10, ...extra });
const item = { id: 'i', type: 'shield', x: 0, y: 0, radius: 7 };
const frozen = { frozen: FREEZE_TIME };

test('吃到盾:寒氣射向最近的兩顆敵人(不打隊友),不再是加一層盾', () => {
  const w = applyPickups(world([
    at('red', 0, 0), at('red', 5, 0), at('blue', 30, 0), at('blue', -40, 0), at('blue', 70, 0),
  ], { items: [item] }));
  assert.equal(FROST_TARGETS, 2);
  assert.deepEqual(w.frosts.map(f => f.targetId).sort(), ['c_blue_-40_0', 'c_blue_30_0']);
  assert.ok(w.frosts.every(f => f.fighterId === 'red' && f.fromX === 0 && f.fromY === 0));
  assert.deepEqual(w.combatants[0].buffs.shield, []);
});

test('寒氣飛 FROST_FLIGHT 秒打中:目標變冰塊 FREEZE_TIME 秒;飛行中目標出局就作廢', () => {
  const frost = { id: 'f', fighterId: 'red', fromX: 0, fromY: 0, targetId: 'c_blue_30_0', t: 0 };
  let w = world([at('blue', 30, 0)], { frosts: [frost] });
  w = tickFrosts(w, FROST_FLIGHT / 2);
  assert.equal(w.combatants[0].frozen ?? 0, 0);
  w = tickFrosts(w, FROST_FLIGHT);
  assert.equal(w.combatants[0].frozen, FREEZE_TIME);
  assert.equal(w.frosts.length, 0);

  const gone = tickFrosts(world([at('blue', 30, 0, { alive: false })], { frosts: [frost] }), FROST_FLIGHT * 2);
  assert.equal(gone.frosts.length, 0);
  assert.equal(gone.combatants[0].frozen ?? 0, 0);
});

test('冰塊時間到就解凍', () => {
  let w = world([at('blue', 0, 0, frozen)]);
  w = tickBuffs(w, FREEZE_TIME / 2);
  assert.ok(w.combatants[0].frozen > 0);
  w = tickBuffs(w, FREEZE_TIME);
  assert.equal(w.combatants[0].frozen, 0);
});

test('冰塊不會自己動:think 不推它', () => {
  const w = think(world([at('blue', 0, 0, frozen), at('red', 40, 0)]), 1 / 60);
  assert.equal(w.combatants[0].vx, 0);
  assert.equal(w.combatants[0].vy, 0);
});

test('冰塊轉速不掉', () => {
  const w = step(world([at('blue', 0, 0, frozen)]), 1);
  assert.equal(w.combatants[0].spin, 0.5);
});

test('冰塊被撞飛得比平常遠,而且不會爆裂(爆裂骰必中也一樣)', () => {
  const hit = blue => step(world([at('red', -15.5, 0, { vx: 150 }), blue]), 1 / 60, () => 0).combatants[1];
  const plain = step(world([at('red', -15.5, 0, { vx: 150 }), at('blue', 0, 0)]), 1 / 60, () => 0.999).combatants[1];
  const ice = hit(at('blue', 0, 0, frozen));
  assert.equal(ice.alive, true);
  assert.ok(ice.vx > plain.vx * 1.5, `冰塊 ${ice.vx.toFixed(0)} vs 平常 ${plain.vx.toFixed(0)}`);
});

test('冰塊滑得比較遠(摩擦小)', () => {
  const slide = extra => {
    let w = world([at('blue', 0, 0, { vx: 80, ...extra })]);
    for (let i = 0; i < 60; i++) w = step(w, 1 / 60);
    return w.combatants[0].vx;
  };
  assert.ok(slide(frozen) > slide({}) * 1.1);
});

test('正在衝刺被凍住:衝刺取消', () => {
  const frost = { id: 'f', fighterId: 'red', fromX: 0, fromY: 0, targetId: 'c_blue_30_0', t: 0 };
  const w = tickFrosts(world([at('blue', 30, 0, { dash: { targetId: 'x', wind: 0, left: 0.3 } })], { frosts: [frost] }), FROST_FLIGHT * 2);
  assert.equal(w.combatants[0].dash, null);
});
