// 四種道具。
import test from 'node:test';
import assert from 'node:assert/strict';
import { ITEM_TYPES, spawnItem, spawnBomb, applyPickups, explodeBombs } from '../smash/js/items.js';

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

const at = (fighterId, x, y, vx = 0, vy = 0) => ({
  id: `c_${x}_${y}`, fighterId, x, y, vx, vy,
  radius: 8, mass: 1, alive: true, buffs: { attack: 0, speed: 0, giant: 0 },
});
const world = combatants => ({ arenaRadius: 100, combatants, bombs: [], items: [], time: 0 });

test('四種道具就這四種', () => {
  assert.deepEqual([...ITEM_TYPES], ['attack', 'speed', 'giant', 'bomb']);
});

test('道具掉在場內', () => {
  for (let seed = 0; seed < 60; seed++) {
    const w = spawnItem(world([]), 'attack', seeded(seed));
    const it = w.items[0];
    assert.ok(Math.hypot(it.x, it.y) <= 100, `道具掉到場外:${it.x},${it.y}`);
  }
});

test('撿到就生效,而且道具會消失', () => {
  const w = { ...world([at('red', 0, 0)]), items: [{ id: 'i1', type: 'attack', x: 0, y: 0, radius: 7 }] };
  const out = applyPickups(w);
  assert.equal(out.combatants[0].buffs.attack, 1);
  assert.equal(out.items.length, 0);
});

test('搆不到的道具不會被撿走', () => {
  const w = { ...world([at('red', 0, 0)]), items: [{ id: 'i1', type: 'attack', x: 80, y: 0, radius: 7 }] };
  const out = applyPickups(w);
  assert.equal(out.combatants[0].buffs.attack, 0);
  assert.equal(out.items.length, 1);
});

test('速度道具讓人動得更快', () => {
  const w = { ...world([at('red', 0, 0, 10, 0)]), items: [{ id: 'i1', type: 'speed', x: 0, y: 0, radius: 7 }] };
  const out = applyPickups(w);
  assert.ok(out.combatants[0].vx > 10, '速度沒有變快');
  assert.equal(out.combatants[0].buffs.speed, 1);
});

test('極巨化變大又變重 —— 抗擊飛就是質量大,不是另一條規則', () => {
  const w = { ...world([at('red', 0, 0)]), items: [{ id: 'i1', type: 'giant', x: 0, y: 0, radius: 7 }] };
  const out = applyPickups(w);
  assert.ok(out.combatants[0].radius > 8, '沒有變大');
  assert.ok(out.combatants[0].mass > 1, '沒有變重');
});

test('已經出局的人撿不到道具', () => {
  const dead = at('red', 0, 0);
  dead.alive = false;
  const w = { ...world([dead]), items: [{ id: 'i1', type: 'attack', x: 0, y: 0, radius: 7 }] };
  const out = applyPickups(w);
  assert.equal(out.items.length, 1);
});

test('同一個道具不會被兩個人同時撿走', () => {
  const w = { ...world([at('red', -2, 0), at('blue', 2, 0)]), items: [{ id: 'i1', type: 'attack', x: 0, y: 0, radius: 7 }] };
  const out = applyPickups(w);
  const got = out.combatants.filter(c => c.buffs.attack > 0);
  assert.equal(got.length, 1, `${got.length} 個人同時撿到同一個道具`);
});

test('炸彈引信會倒數,沒到時間不炸', () => {
  const w = spawnBomb(world([at('red', 0, 0)]), seeded(1));
  const out = explodeBombs(w, 0.2);
  assert.equal(out.bombs.length, 1);
  assert.ok(out.bombs[0].fuse < w.bombs[0].fuse);
  assert.equal(out.combatants[0].vx, 0);
});

test('炸開時把附近的人往外推,炸彈消失', () => {
  const w = { ...world([at('red', 10, 0)]), bombs: [{ id: 'b1', x: 0, y: 0, radius: 6, fuse: 0.05 }] };
  const out = explodeBombs(w, 0.1);
  assert.equal(out.bombs.length, 0);
  assert.ok(out.combatants[0].vx > 100, `沒被推開:vx ${out.combatants[0].vx}`);
});

test('離得遠就不受影響', () => {
  const w = { ...world([at('red', 90, 0)]), bombs: [{ id: 'b1', x: 0, y: 0, radius: 6, fuse: 0.05 }] };
  const out = explodeBombs(w, 0.1);
  assert.equal(out.combatants[0].vx, 0);
});

test('極巨化的人被炸得比較輕 —— 跟撞擊用同一套質量規則', () => {
  const big = at('red', 10, 0);
  big.mass = 2.4;
  const small = explodeBombs({ ...world([at('blue', 10, 0)]), bombs: [{ id: 'b', x: 0, y: 0, radius: 6, fuse: 0 }] }, 0.1);
  const heavy = explodeBombs({ ...world([big]), bombs: [{ id: 'b', x: 0, y: 0, radius: 6, fuse: 0 }] }, 0.1);
  assert.ok(heavy.combatants[0].vx < small.combatants[0].vx, '質量沒有減輕被炸飛的程度');
});
