// 整場比賽跑到底。
//
// 這個模式沒有「先算好再重播」的捷徑 —— 結果是一格一格算出來的,
// 所以最該驗的不是某一次碰撞,而是**一整場會不會結束**。
// 摩擦力會讓大家停下來,沒有主動追擊就會變成兩顆球停在場中間互瞪到天荒地老。
import test from 'node:test';
import assert from 'node:assert/strict';

import { createFighter } from '../smash/js/fighters.js';
import { createWorld, step, seek, shrink, aliveOf, winnerTeam } from '../smash/js/physics.js';
import { spawnItem, spawnBomb, applyPickups, explodeBombs, ITEM_TYPES } from '../smash/js/items.js';

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

// 跟 main.js 的 game loop 同一套順序。回傳 { winner, seconds, alive }。
function playMatch({ fighters, seed, withItems = true, maxTime = 45 }) {
  const rng = seeded(seed);
  let world = createWorld({ fighters, arenaRadius: 100, rng });
  const dt = 1 / 60;
  let nextItem = 2.6;

  while (world.time < maxTime) {
    if (withItems) {
      nextItem -= dt;
      if (nextItem <= 0) {
        const type = ITEM_TYPES[Math.floor(rng() * ITEM_TYPES.length)];
        world = type === 'bomb' ? spawnBomb(world, rng) : spawnItem(world, type, rng);
        nextItem = 2.6;
      }
    }
    world = explodeBombs(world, dt);
    world = applyPickups(world);
    world = seek(world, dt);
    world = shrink(world, dt);
    world = step(world, dt);

    const won = winnerTeam(world);
    if (won || aliveOf(world).length === 0) {
      return { winner: won, seconds: world.time, alive: aliveOf(world).length };
    }
  }
  return { winner: null, seconds: world.time, alive: aliveOf(world).length, timedOut: true };
}

const teams = n => Array.from({ length: n }, (_, i) => createFighter({ name: `隊${i}`, count: 3 }));

test('一整場會結束,不會變成互瞪的僵局', () => {
  let timeouts = 0;
  for (let seed = 0; seed < 30; seed++) {
    const r = playMatch({ fighters: teams(3), seed });
    if (r.timedOut) timeouts++;
  }
  assert.equal(timeouts, 0, `30 場裡有 ${timeouts} 場打到時間上限還沒結束`);
});

test('沒有道具也打得完 —— 結束靠的是主動追擊,不是靠炸彈', () => {
  let timeouts = 0;
  for (let seed = 0; seed < 30; seed++) {
    if (playMatch({ fighters: teams(3), seed, withItems: false }).timedOut) timeouts++;
  }
  assert.equal(timeouts, 0, `沒有道具時有 ${timeouts} 場打不完`);
});

test('贏的那一隊一定還有人活著', () => {
  for (let seed = 0; seed < 30; seed++) {
    const r = playMatch({ fighters: teams(3), seed });
    if (r.winner) assert.ok(r.alive > 0, `seed ${seed}:有贏家卻沒人活著`);
  }
});

test('兩隊都會贏 —— 不會永遠是同一隊(隊伍順序沒有優勢)', () => {
  const won = new Map();
  const fighters = teams(2);
  for (let seed = 0; seed < 120; seed++) {
    const r = playMatch({ fighters, seed });
    if (r.winner) won.set(r.winner, (won.get(r.winner) ?? 0) + 1);
  }
  assert.equal(won.size, 2, '只有一隊贏過,隊伍順序有優勢');
  const [a, b] = [...won.values()];
  assert.ok(Math.min(a, b) / Math.max(a, b) > 0.35, `勝率太偏:${a} vs ${b}`);
});

test('人多的隊伍比較有利,但不是穩贏', () => {
  const big = createFighter({ name: '大隊', count: 6 });
  const small = createFighter({ name: '小隊', count: 2 });
  let bigWins = 0;
  let decided = 0;
  for (let seed = 0; seed < 120; seed++) {
    const r = playMatch({ fighters: [big, small], seed });
    if (!r.winner) continue;
    decided++;
    if (r.winner === big.id) bigWins++;
  }
  assert.ok(decided > 100, `只有 ${decided} 場分出勝負`);
  assert.ok(bigWins / decided > 0.55, `人多反而比較不利:${bigWins}/${decided}`);
  assert.ok(bigWins / decided < 1, '人多變成穩贏,那就不好玩了');
});

test('只有一隊時立刻算它贏 —— 場上沒有對手,本來就沒得打', () => {
  const only = createFighter({ name: '孤單', count: 3 });
  const r = playMatch({ fighters: [only], seed: 1, maxTime: 3 });
  assert.equal(r.winner, only.id);
  assert.equal(r.alive, 3);
  // 畫面那一層還是擋著:少於兩隊不給按開打(main.js 的 render)。
});

test('場地會縮小 —— 這是終止保證,不只是效果', () => {
  const fighters = teams(2);
  const long = playMatch({ fighters, seed: 3, withItems: false, maxTime: 60 });
  assert.ok(!long.timedOut, '場地縮小之後還是打不完');
});
