// 大亂鬥的物理與勝負判定。
//
// 最要釘死的兩句:
//   1. **Fighter 就是隊伍**,沒有獨立的 Team;count 就是隊伍人數。
//   2. **同隊不互相擊飛** —— 會分離避免穿透,但不施加任何衝量。
// 這也是整個站上唯一「結果不預先決定」的模式,所以物理必須真的算對。
import test from 'node:test';
import assert from 'node:assert/strict';

import { createFighter, pickColor, PALETTE } from '../smash/js/fighters.js';
import { createWorld, step, aliveOf, winnerTeam, HIT_POWER } from '../smash/js/physics.js';

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

/* ---------- 道具的效果 ---------- */

// 衝量對稱的話,攻擊力等於「兩邊一起飛得更遠」—— 對「誰被撞出場」幾乎沒有影響,
// 撿到的人自己也被彈得更遠。要有感覺,多出來的力必須只加在對方身上。
test('攻擊力是打在對方身上,不是兩邊一起飛', () => {
  const a = { ...at('red', -8, 0, 140, 0), buffs: { attack: 2, speed: 0, giant: 0 } };
  const b = at('blue', 8, 0, -140, 0);
  const out = step({ ...arena, combatants: [a, b] }, 1 / 60);
  const me = Math.abs(out.combatants[0].vx);
  const him = Math.abs(out.combatants[1].vx);
  assert.ok(him > me * 1.5, `對方 ${him.toFixed(0)} 應該明顯大於自己 ${me.toFixed(0)}`);
});

test('沒有攻擊力時兩邊彈開的力一樣大', () => {
  const out = step({ ...arena, combatants: [at('red', -8, 0, 140, 0), at('blue', 8, 0, -140, 0)] }, 1 / 60);
  const me = Math.abs(out.combatants[0].vx);
  const him = Math.abs(out.combatants[1].vx);
  assert.ok(Math.abs(me - him) < 1, `${me.toFixed(2)} vs ${him.toFixed(2)}`);
});

/* ---------- 撞擊回報(給演出與音效用)---------- */

// 實測一場比賽平均每秒 15 次碰撞,但 power 中位數只有 3 —— 絕大多數是
// 陀螺靠在一起互相推擠。全部回報的話畫面會變閃光燈、聲音會變機關槍。
test('輕輕靠在一起不算撞到,不會回報', () => {
  const out = step({ ...arena, combatants: [at('red', -7.9, 0, 1, 0), at('blue', 7.9, 0, -1, 0)] }, 1 / 60);
  assert.equal(out.impacts.length, 0);
});

test('用力對撞才回報,而且記下位置與強度', () => {
  const out = step({ ...arena, combatants: [at('red', -7.9, 0, 200, 0), at('blue', 7.9, 0, -200, 0)] }, 1 / 60);
  assert.equal(out.impacts.length, 1);
  assert.ok(Math.abs(out.impacts[0].x) < 1, '接觸點應該在兩顆中間');
  assert.ok(out.impacts[0].power >= HIT_POWER);
});

test('同隊撞在一起不回報 —— 隊友之間根本沒有衝量可言', () => {
  const out = step({ ...arena, combatants: [at('red', -7.9, 0, 200, 0), at('red', 7.9, 0, -200, 0)] }, 1 / 60);
  assert.equal(out.impacts.length, 0);
});

test('impacts 每一格重算,不會累積', () => {
  const hard = { ...arena, combatants: [at('red', -7.9, 0, 200, 0), at('blue', 7.9, 0, -200, 0)] };
  const first = step(hard, 1 / 60);
  assert.equal(first.impacts.length, 1);
  // 撞完彈開之後再跑一格,上一格的撞擊不該還留著
  const second = step(first, 1 / 60);
  assert.equal(second.impacts.length, 0);
});

/* ---------- 出界與勝負 ---------- */

test('被推出場外就淘汰', () => {
  const c = at('red', 99, 0, 600, 0);
  const out = step({ ...arena, combatants: [c] }, 1 / 60);
  assert.equal(out.combatants[0].alive, false);
});

// 淘汰線就是畫面上那個圓盤的邊。以前留了一個半徑的寬容,結果小孩會看到
// 角色整個人站在盤子外面還活得好好的 —— 中心出界就算掉下去。
test('中心一離開圓盤就出局,不能整個人站在盤子外面還活著', () => {
  const out = step({ ...arena, combatants: [at('red', 104, 0)] }, 1 / 60);
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

/* ---------- AI ---------- */

test('會往敵人移動', async () => {
  const { think } = await import('../smash/js/physics.js');
  const out = think({ ...arena, combatants: [at('red', 0, 0), at('blue', 50, 0)] }, 1 / 60);
  assert.ok(out.combatants[0].vx > 0, '紅隊沒有往敵人移動');
  assert.ok(out.combatants[1].vx < 0, '藍隊沒有往敵人移動');
});

test('不會追著隊友跑', async () => {
  const { think } = await import('../smash/js/physics.js');
  const out = think({ ...arena, combatants: [at('red', 0, 0), at('red', 50, 0)] }, 1 / 60);
  assert.equal(out.combatants[0].vx, 0);
  assert.equal(out.combatants[1].vx, 0);
});

test('速度道具讓追擊更猛', async () => {
  const { think } = await import('../smash/js/physics.js');
  const fast = at('red', 0, 0);
  fast.buffs.speed = 1;
  const base = think({ ...arena, combatants: [at('red', 0, 0), at('blue', 50, 0)] }, 1 / 60);
  const boosted = think({ ...arena, combatants: [fast, at('blue', 50, 0)] }, 1 / 60);
  assert.ok(boosted.combatants[0].vx > base.combatants[0].vx, '速度道具沒有加成追擊');
});

test('站在邊緣時會往場中央閃 —— 追人不能追到把自己送出去', async () => {
  const { think } = await import('../smash/js/physics.js');
  // 紅隊站在右邊的懸崖邊,敵人還在更右邊。只會追人的話他會繼續往右走出去。
  const out = think({ ...arena, combatants: [at('red', 95, 0), at('blue', 99, 0)] }, 1 / 60);
  assert.ok(out.combatants[0].vx < 0, `站在邊緣還往外走:vx ${out.combatants[0].vx}`);
});

test('場中央不會被邊緣的斥力干擾', async () => {
  const { think } = await import('../smash/js/physics.js');
  const out = think({ ...arena, combatants: [at('red', 0, 0), at('blue', 40, 0)] }, 1 / 60);
  assert.ok(out.combatants[0].vx > 0, '在場中央反而往後退');
});

test('引信快到的炸彈會被閃開', async () => {
  const { think } = await import('../smash/js/physics.js');
  const w = { ...arena, combatants: [at('red', 10, 0), at('blue', 60, 0)] , bombs: [{ id: 'b', x: 0, y: 0, radius: 6, fuse: 0.3 }] };
  const out = think(w, 1 / 60);
  assert.ok(out.combatants[0].vx > 0, '沒有從炸彈旁邊逃開');
});

test('引信還久的炸彈不用理 —— 不然整場都在逃命', async () => {
  const { think } = await import('../smash/js/physics.js');
  const near = { ...arena, combatants: [at('red', 10, 0), at('blue', -60, 0)], bombs: [{ id: 'b', x: 0, y: 0, radius: 6, fuse: 3 }] };
  // 敵人在左邊,炸彈在左邊但還久 —— 應該照樣往左追
  assert.ok(think(near, 1 / 60).combatants[0].vx < 0, '被還沒響的炸彈嚇跑了');
});

test('道具比敵人近的時候會先去撿', async () => {
  const { think } = await import('../smash/js/physics.js');
  const w = { ...arena, combatants: [at('red', 0, 0), at('blue', -70, 0)], items: [{ id: 'i', type: 'attack', x: 20, y: 0, radius: 7 }] };
  assert.ok(think(w, 1 / 60).combatants[0].vx > 0, '沒有先去撿旁邊的道具');
});

test('距離一樣時,優先挑靠近邊緣的敵人 —— 一撞就出局比較划算', async () => {
  const { think } = await import('../smash/js/physics.js');
  // 自己站在 (30,0)。兩個敵人**離自己一樣遠(40)**,但一個在場中央側、一個貼著邊緣。
  // 自己不能站在圓心,不然「離我多遠」跟「離邊緣多遠」會是同一件事,測不出差別。
  const w = { ...arena, combatants: [at('red', 30, 0), at('blue', 30, 40), at('green', 70, 0)] };
  const out = think(w, 1 / 60);
  assert.ok(out.combatants[0].vx > 0, `沒有往邊緣那個敵人去:vx ${out.combatants[0].vx}`);
  assert.ok(Math.abs(out.combatants[0].vx) > Math.abs(out.combatants[0].vy), '追的是場中央那個');
});
