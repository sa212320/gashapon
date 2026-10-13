// 四種道具:劍、盾、補包、飛彈。
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ITEM_TYPES, BUFF_TIME, MAX_LAYERS, MISSILE_FUSE, BLAST_RADIUS,
  spawnItem, addLayer, tickBuffs, applyPickups, explodeMissiles,
} from '../smash/js/items.js';
import { bowlDistance } from '../smash/js/stadium.js';

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

const at = (fighterId, x, y, vx = 0, vy = 0, extra = {}) => ({
  id: `c_${fighterId}_${x}_${y}`, fighterId, x, y, vx, vy,
  radius: 8, mass: 1, alive: true, spin: 1, outBy: null, pocket: null, railing: false,
  buffs: { attack: [], shield: [] }, healedAt: -Infinity, ...extra,
});
const world = combatants => ({ combatants, items: [], strikes: [], time: 3 });
const item = (type, x = 0, y = 0) => ({ id: `i_${type}`, type, x, y, radius: 7 });
const never = () => 0.999;

test('四種道具就這四種', () => {
  assert.deepEqual([...ITEM_TYPES], ['attack', 'shield', 'spin', 'missile']);
});

test('道具掉在盤內,不會掉在牆邊或口袋上', () => {
  for (let seed = 0; seed < 80; seed++) {
    const it = spawnItem(world([]), 'attack', seeded(seed)).items[0];
    assert.ok(bowlDistance(it.x, it.y) < -it.radius);
  }
});

test('劍與盾:吃一個多一層,每層 8 秒', () => {
  let w = { ...world([at('red', 0, 0)]), items: [item('attack')] };
  w = applyPickups(w);
  assert.deepEqual(w.combatants[0].buffs.attack, [BUFF_TIME]);
  w = applyPickups({ ...w, items: [item('shield')] });
  assert.deepEqual(w.combatants[0].buffs.shield, [BUFF_TIME]);
});

test('最多疊 3 層,再吃就刷新最舊那層', () => {
  assert.deepEqual(addLayer([]), [BUFF_TIME]);
  assert.deepEqual(addLayer([2, 5, 7]), [BUFF_TIME, 5, 7]);
  assert.equal(addLayer([1, 2, 3]).length, MAX_LAYERS);
});

test('每層各自倒數,時間到就掉一層', () => {
  const w = world([at('red', 0, 0, 0, 0, { buffs: { attack: [0.5, 6], shield: [1] } })]);
  const out = tickBuffs(w, 0.6);
  assert.deepEqual(out.combatants[0].buffs.attack.map(t => +t.toFixed(2)), [5.4]);
  assert.deepEqual(out.combatants[0].buffs.shield.map(t => +t.toFixed(2)), [0.4]);
});

test('補包把轉速補滿,而且記下補的時間(畫面閃綠用)', () => {
  const w = { ...world([at('red', 0, 0, 0, 0, { spin: 0.2 })]), items: [item('spin')] };
  const out = applyPickups(w);
  assert.equal(out.combatants[0].spin, 1);
  assert.equal(out.combatants[0].healedAt, 3);
});

test('搆不到的道具不會被撿走;出局的人撿不到', () => {
  const far = applyPickups({ ...world([at('red', 0, 0)]), items: [item('attack', 80, 0)] });
  assert.equal(far.items.length, 1);
  const dead = applyPickups({ ...world([at('red', 0, 0, 0, 0, { alive: false })]), items: [item('attack')] });
  assert.equal(dead.items.length, 1);
});

test('同一個道具不會被兩個人同時撿走', () => {
  const out = applyPickups({ ...world([at('red', -2, 0), at('blue', 2, 0)]), items: [item('attack')] });
  assert.equal(out.combatants.filter(c => c.buffs.attack.length > 0).length, 1);
});

/* ---------- 飛彈 ---------- */

test('吃到飛彈:鎖定最近敵人「當下」的位置,準星用發射隊伍', () => {
  const w = { ...world([at('red', 0, 0), at('blue', 30, 0), at('green', 60, 0)]), items: [item('missile')] };
  const out = applyPickups(w);
  assert.equal(out.strikes.length, 1);
  const s = out.strikes[0];
  assert.equal(s.fighterId, 'red');
  assert.deepEqual([s.x, s.y], [30, 0]);
  assert.equal(s.fuse, MISSILE_FUSE);
});

test('不追蹤:目標之後移開,準星還在原地', () => {
  let w = applyPickups({ ...world([at('red', 0, 0), at('blue', 30, 0)]), items: [item('missile')] });
  w = { ...w, combatants: w.combatants.map(c => (c.fighterId === 'blue' ? { ...c, x: -50 } : c)) };
  w = explodeMissiles(w, 0.5, never);
  assert.deepEqual([w.strikes[0].x, w.strikes[0].y], [30, 0]);
});

test('場上沒有敵人就不發射', () => {
  const out = applyPickups({ ...world([at('red', 0, 0), at('red', 30, 0)]), items: [item('missile')] });
  assert.equal(out.strikes.length, 0);
  assert.equal(out.items.length, 0, '道具還是被吃掉了');
});

test('倒數沒到不炸', () => {
  const w = { ...world([at('blue', 0, 0)]), strikes: [{ id: 's', fighterId: 'red', x: 0, y: 0, fuse: 1 }] };
  const out = explodeMissiles(w, 0.2, never);
  assert.equal(out.strikes.length, 1);
  assert.equal(out.combatants[0].vx, 0);
});

test('炸開:圈內不分敵我都被推開,飛彈消失', () => {
  const w = {
    ...world([at('red', 10, 0), at('blue', -10, 0)]),
    strikes: [{ id: 's', fighterId: 'red', x: 0, y: 0, fuse: 0.05 }],
  };
  const out = explodeMissiles(w, 0.1, never);
  assert.equal(out.strikes.length, 0);
  assert.ok(out.combatants[0].vx > 100, '發射隊伍自己人也要被炸開');
  assert.ok(out.combatants[1].vx < -100);
});

test('目標在落下前就出局,照樣在準星炸開', () => {
  const w = {
    ...world([at('blue', 0, 0, 0, 0, { alive: false, outBy: 'spinout' }), at('green', 20, 0)]),
    strikes: [{ id: 's', fighterId: 'red', x: 0, y: 0, fuse: 0.01 }],
  };
  const out = explodeMissiles(w, 0.1, never);
  assert.equal(out.strikes.length, 0);
  assert.ok(out.combatants[1].vx > 0);
  assert.equal(out.combatants[0].vx, 0, '已出局的不會被炸飛');
});

test('圈外不受影響', () => {
  const w = { ...world([at('blue', BLAST_RADIUS + 5, 0)]), strikes: [{ id: 's', fighterId: 'red', x: 0, y: 0, fuse: 0 }] };
  assert.equal(explodeMissiles(w, 0.1, never).combatants[0].vx, 0);
});

test('重的、有盾的被炸得比較輕', () => {
  const blast = c => explodeMissiles({ ...world([c]), strikes: [{ id: 's', fighterId: 'red', x: 0, y: 0, fuse: 0 }] }, 0.1, never).combatants[0].vx;
  const base = blast(at('blue', 10, 0));
  assert.ok(blast(at('blue', 10, 0, 0, 0, { mass: 1.8 })) < base);
  assert.ok(blast(at('blue', 10, 0, 0, 0, { buffs: { attack: [], shield: [8] } })) < base);
});

test('爆炸也可能炸出爆裂', () => {
  const w = { ...world([at('blue', 5, 0)]), strikes: [{ id: 's', fighterId: 'red', x: 0, y: 0, fuse: 0 }] };
  const out = explodeMissiles(w, 0.1, () => 0);
  assert.equal(out.combatants[0].outBy, 'burst');
});
