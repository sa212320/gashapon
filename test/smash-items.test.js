// 四種道具:劍、盾、補包、飛彈。
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ITEM_TYPES, ITEM_WEIGHTS, pickItem, METEOR_FUSE, BLAST_RADIUS,
  spawnItem, applyPickups, explodeMeteors,
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
  healedAt: -Infinity, ...extra,
});
const world = combatants => ({ combatants, items: [], meteors: [], time: 3 });
const item = (type, x = 0, y = 0) => ({ id: `i_${type}`, type, x, y, radius: 7 });
const never = () => 0.999;

test('四種道具:衝刺、冰塊、冰旋渦、冰隕石', () => {
  assert.deepEqual([...ITEM_TYPES], ['dash', 'freeze', 'vortex', 'meteor']);
});

test('出現機率四種各 25%', () => {
  assert.deepEqual({ ...ITEM_WEIGHTS }, { dash: 25, freeze: 25, vortex: 25, meteor: 25 });
  const rng = seeded(11);
  const n = { dash: 0, freeze: 0, vortex: 0, meteor: 0 };
  for (let i = 0; i < 20000; i++) n[pickItem(ITEM_TYPES, rng)]++;
  for (const t of ITEM_TYPES) assert.ok(Math.abs(n[t] / 20000 - 0.25) < 0.015, `${t} ${n[t]}`);
});

test('四個都關:pickItem 回 undefined,不報錯', () => {
  assert.equal(pickItem([], seeded(1)), undefined);
});

test('關掉的道具不會出現,比例照剩下的重算', () => {
  const rng = seeded(5);
  const n = { dash: 0, meteor: 0 };
  for (let i = 0; i < 10000; i++) n[pickItem(['dash', 'meteor'], rng)]++;
  assert.ok(Math.abs(n.meteor / 10000 - 0.5) < 0.02, `${n.meteor}`);
});

test('道具掉在盤內,不會掉在牆邊或口袋上', () => {
  for (let seed = 0; seed < 80; seed++) {
    const it = spawnItem(world([]), 'dash', seeded(seed)).items[0];
    assert.ok(bowlDistance(it.x, it.y) < -it.radius);
  }
});

test('補包把轉速補滿,而且記下補的時間(畫面閃綠用)', () => {
  const w = { ...world([at('red', 0, 0, 0, 0, { spin: 0.2 })]), items: [item('vortex')] };
  const out = applyPickups(w);
  assert.equal(out.combatants[0].spin, 1);
  assert.equal(out.combatants[0].healedAt, 3);
});

test('搆不到的道具不會被撿走;出局的人撿不到', () => {
  const far = applyPickups({ ...world([at('red', 0, 0)]), items: [item('dash', 80, 0)] });
  assert.equal(far.items.length, 1);
  const dead = applyPickups({ ...world([at('red', 0, 0, 0, 0, { alive: false })]), items: [item('dash')] });
  assert.equal(dead.items.length, 1);
});

test('同一個道具不會被兩個人同時撿走', () => {
  const out = applyPickups({ ...world([at('red', -2, 0, 0, 0, { spin: 0.2 }), at('blue', 2, 0, 0, 0, { spin: 0.2 })]), items: [item('vortex')] });
  assert.equal(out.combatants.filter(c => c.spin === 1).length, 1);
});

/* ---------- 飛彈 ---------- */

test('吃到飛彈:鎖定最近敵人「當下」的位置,準星用發射隊伍', () => {
  const w = { ...world([at('red', 0, 0), at('blue', 30, 0), at('green', 60, 0)]), items: [item('meteor')] };
  const out = applyPickups(w);
  assert.equal(out.meteors.length, 1);
  const s = out.meteors[0];
  assert.equal(s.fighterId, 'red');
  assert.deepEqual([s.x, s.y], [30, 0]);
  assert.equal(s.fuse, METEOR_FUSE);
});

test('不追蹤:目標之後移開,準星還在原地', () => {
  let w = applyPickups({ ...world([at('red', 0, 0), at('blue', 30, 0)]), items: [item('meteor')] });
  w = { ...w, combatants: w.combatants.map(c => (c.fighterId === 'blue' ? { ...c, x: -50 } : c)) };
  w = explodeMeteors(w, 0.5, never);
  assert.deepEqual([w.meteors[0].x, w.meteors[0].y], [30, 0]);
});

test('場上沒有敵人就不發射', () => {
  const out = applyPickups({ ...world([at('red', 0, 0), at('red', 30, 0)]), items: [item('meteor')] });
  assert.equal(out.meteors.length, 0);
  assert.equal(out.items.length, 0, '道具還是被吃掉了');
});

test('倒數沒到不炸', () => {
  const w = { ...world([at('blue', 0, 0)]), meteors: [{ id: 's', fighterId: 'red', x: 0, y: 0, fuse: 1 }] };
  const out = explodeMeteors(w, 0.2, never);
  assert.equal(out.meteors.length, 1);
  assert.equal(out.combatants[0].vx, 0);
});

test('炸開:圈內不分敵我都被推開,飛彈消失', () => {
  const w = {
    ...world([at('red', 10, 0), at('blue', -10, 0)]),
    meteors: [{ id: 's', fighterId: 'red', x: 0, y: 0, fuse: 0.05 }],
  };
  const out = explodeMeteors(w, 0.1, never);
  assert.equal(out.meteors.length, 0);
  assert.ok(out.combatants[0].vx > 100, '發射隊伍自己人也要被炸開');
  assert.ok(out.combatants[1].vx < -100);
});

test('目標在落下前就出局,照樣在準星炸開', () => {
  const w = {
    ...world([at('blue', 0, 0, 0, 0, { alive: false, outBy: 'spinout' }), at('green', 20, 0)]),
    meteors: [{ id: 's', fighterId: 'red', x: 0, y: 0, fuse: 0.01 }],
  };
  const out = explodeMeteors(w, 0.1, never);
  assert.equal(out.meteors.length, 0);
  assert.ok(out.combatants[1].vx > 0);
  assert.equal(out.combatants[0].vx, 0, '已出局的不會被炸飛');
});

test('圈外不受影響', () => {
  const w = { ...world([at('blue', BLAST_RADIUS + 5, 0)]), meteors: [{ id: 's', fighterId: 'red', x: 0, y: 0, fuse: 0 }] };
  assert.equal(explodeMeteors(w, 0.1, never).combatants[0].vx, 0);
});

test('重的被砸得比較輕', () => {
  const blast = c => explodeMeteors({ ...world([c]), meteors: [{ id: 's', fighterId: 'red', x: 0, y: 0, fuse: 0 }] }, 0.1, never).combatants[0].vx;
  const base = blast(at('blue', 10, 0));
  assert.ok(blast(at('blue', 10, 0, 0, 0, { mass: 1.8 })) < base);
});

test('爆炸也可能炸出爆裂', () => {
  const w = { ...world([at('blue', 5, 0)]), meteors: [{ id: 's', fighterId: 'red', x: 0, y: 0, fuse: 0 }] };
  const out = explodeMeteors(w, 0.1, () => 0);
  assert.equal(out.combatants[0].outBy, 'burst');
});
