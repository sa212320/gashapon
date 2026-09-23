// 大亂鬥的物理與勝負判定。
//
// 最要釘死的兩句:
//   1. **Fighter 就是隊伍**,沒有獨立的 Team;count 就是隊伍人數。
//   2. **同隊不互相擊飛** —— 會分離避免穿透,但不施加任何衝量。
// 這也是整個站上唯一「結果不預先決定」的模式,所以物理必須真的算對。
import test from 'node:test';
import assert from 'node:assert/strict';

import { createFighter, pickColor, PALETTE } from '../smash/js/fighters.js';
import { createWorld, step, aliveOf, winnerTeam } from '../smash/js/physics.js';

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

const arena = { arenaRadius: 100, bombs: [], items: [], time: 0 };
const at = (fighterId, x, y, vx = 0, vy = 0) => ({
  id: `c_${fighterId}_${x}_${y}`, fighterId, x, y, vx, vy,
  radius: 8, mass: 1, alive: true, buffs: { attack: 0, speed: 0, giant: 0 },
});

/* ---------- 隊伍就是 Fighter ---------- */

test('count 就是隊伍人數 —— 一筆 Fighter 展開成好幾個 Combatant', () => {
  const fighters = [createFighter({ name: '紅隊', count: 3 }), createFighter({ name: '藍隊', count: 2 })];
  const world = createWorld({ fighters, arenaRadius: 100, rng: seeded(1) });
  assert.equal(world.combatants.length, 5);
  assert.equal(world.combatants.filter(c => c.fighterId === fighters[0].id).length, 3);
  assert.ok(world.combatants.every(c => c.alive));
});

test('count 不可信時當成 0', () => {
  assert.equal(createFighter({ count: Infinity }).count, 0);
  assert.equal(createFighter({ count: NaN }).count, 0);
  assert.equal(createFighter({ count: -2 }).count, 0);
});

test('pickColor 在調色盤用完之前不重複', () => {
  const chosen = [];
  for (let i = 0; i < PALETTE.length; i++) chosen.push({ color: pickColor(chosen) });
  assert.equal(new Set(chosen.map(c => c.color)).size, PALETTE.length);
});

/* ---------- 同隊不互相擊飛 ---------- */

test('同隊撞在一起只會分開,速度不變', () => {
  const a = at('red', -4, 0, 50, 0);
  const b = at('red', 4, 0, -50, 0);
  const out = step({ ...arena, combatants: [a, b] }, 1 / 60);
  const [na, nb] = out.combatants;
  // 速度只受摩擦影響,沒有任何來自碰撞的衝量
  assert.ok(Math.abs(na.vx - 50 * 0.995) < 1e-6, `同隊被擊飛了:vx ${na.vx}`);
  assert.ok(Math.abs(nb.vx + 50 * 0.995) < 1e-6, `同隊被擊飛了:vx ${nb.vx}`);
  // 但還是要分開,不然會互相穿透
  assert.ok(nb.x - na.x >= 8, '同隊穿透了');
});

test('不同隊撞在一起會互相彈開', () => {
  const a = at('red', -4, 0, 50, 0);
  const b = at('blue', 4, 0, -50, 0);
  const out = step({ ...arena, combatants: [a, b] }, 1 / 60);
  const [na, nb] = out.combatants;
  assert.ok(na.vx < -10, `紅隊沒有被彈開:vx ${na.vx}`);
  assert.ok(nb.vx > 10, `藍隊沒有被彈開:vx ${nb.vx}`);
});

test('攻擊道具會讓自己撞出去的力更大', () => {
  const base = step({ ...arena, combatants: [at('red', -4, 0, 50, 0), at('blue', 4, 0, -50, 0)] }, 1 / 60);
  const buffed = at('red', -4, 0, 50, 0);
  buffed.buffs.attack = 1;
  const boosted = step({ ...arena, combatants: [buffed, at('blue', 4, 0, -50, 0)] }, 1 / 60);
  assert.ok(boosted.combatants[1].vx > base.combatants[1].vx, '攻擊道具沒有加成');
});

/* ---------- 出界與勝負 ---------- */

test('被推出場外就淘汰', () => {
  const c = at('red', 99, 0, 600, 0);
  const out = step({ ...arena, combatants: [c] }, 1 / 60);
  assert.equal(out.combatants[0].alive, false);
});

test('還在場內就不會被誤判淘汰', () => {
  const out = step({ ...arena, combatants: [at('red', 0, 0)] }, 1 / 60);
  assert.equal(out.combatants[0].alive, true);
});

test('winnerTeam:只剩一隊有人活著才分勝負', () => {
  const both = { ...arena, combatants: [at('red', -20, 0), at('blue', 20, 0)] };
  assert.equal(winnerTeam(both), null);

  const dead = at('blue', 20, 0);
  dead.alive = false;
  assert.equal(winnerTeam({ ...arena, combatants: [at('red', -20, 0), dead] }), 'red');
});

test('同一隊剩幾個人都算同一隊贏', () => {
  const dead = at('blue', 20, 0);
  dead.alive = false;
  const world = { ...arena, combatants: [at('red', -20, 0), at('red', -30, 0), dead] };
  assert.equal(winnerTeam(world), 'red');
  assert.equal(aliveOf(world).length, 2);
});

test('全部出局時沒有贏家,不會回一個假的隊伍', () => {
  const a = at('red', 0, 0); a.alive = false;
  const b = at('blue', 0, 0); b.alive = false;
  assert.equal(winnerTeam({ ...arena, combatants: [a, b] }), null);
});

test('step 不就地改動傳進來的 world', () => {
  const world = { ...arena, combatants: [at('red', 0, 0, 10, 0)] };
  const before = JSON.stringify(world);
  step(world, 1 / 60);
  assert.equal(JSON.stringify(world), before);
});

/* ---------- 主動追擊 ---------- */

test('seek:往最近的敵人加速', async () => {
  const { seek } = await import('../smash/js/physics.js');
  const out = seek({ ...arena, combatants: [at('red', 0, 0), at('blue', 50, 0)] }, 1 / 60);
  assert.ok(out.combatants[0].vx > 0, '紅隊沒有往敵人移動');
  assert.ok(out.combatants[1].vx < 0, '藍隊沒有往敵人移動');
});

test('seek:不會追著隊友跑', async () => {
  const { seek } = await import('../smash/js/physics.js');
  // 場上只有同隊的人 —— 沒有敵人可追,誰都不該加速
  const out = seek({ ...arena, combatants: [at('red', 0, 0), at('red', 50, 0)] }, 1 / 60);
  assert.equal(out.combatants[0].vx, 0);
  assert.equal(out.combatants[1].vx, 0);
});

test('seek:速度道具讓追擊更猛', async () => {
  const { seek } = await import('../smash/js/physics.js');
  const fast = at('red', 0, 0);
  fast.buffs.speed = 1;
  const base = seek({ ...arena, combatants: [at('red', 0, 0), at('blue', 50, 0)] }, 1 / 60);
  const boosted = seek({ ...arena, combatants: [fast, at('blue', 50, 0)] }, 1 / 60);
  assert.ok(boosted.combatants[0].vx > base.combatants[0].vx, '速度道具沒有加成追擊');
});
