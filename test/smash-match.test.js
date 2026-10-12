// 整場比賽跑到底。
//
// 這個模式沒有「先算好再重播」的捷徑 —— 結果是一格一格算出來的,
// 所以最該驗的不是某一次碰撞,而是**一整場會不會結束**。
// 停轉是終止保證:轉速一定會掉到 0,所以每一場一定會結束。
import test from 'node:test';
import assert from 'node:assert/strict';

import { createFighter } from '../smash/js/fighters.js';
import { createWorld, step, think, aliveOf, winnerTeam } from '../smash/js/physics.js';
import { TYPE_STATS } from '../smash/js/beys.js';

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

const MAX_TIME = 60;

// 跟 main.js 的 game loop 同一套順序。回傳 { winner, seconds, alive, world }。
function playMatch({ fighters, seed, maxTime = MAX_TIME }) {
  const rng = seeded(seed);
  let world = createWorld({ fighters, rng });
  const dt = 1 / 60;
  while (world.time < maxTime) {
    world = think(world, dt);
    world = step(world, dt, rng);
    const won = winnerTeam(world);
    if (won || aliveOf(world).length === 0) {
      return { winner: won, seconds: world.time, alive: aliveOf(world).length, world };
    }
  }
  return { winner: null, seconds: world.time, alive: aliveOf(world).length, timedOut: true, world };
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

test('沒有道具也一定打得完 —— 終止保證是停轉,不是場地縮小', () => {
  for (let seed = 0; seed < 30; seed++) {
    const r = playMatch({ fighters: teams(2), seed });
    assert.ok(!r.timedOut, `seed ${seed} 打到 ${MAX_TIME} 秒還沒結束`);
  }
});

test('三種出局方式都會發生', () => {
  const seen = new Set();
  for (let seed = 0; seed < 60 && seen.size < 3; seed++) {
    for (const c of playMatch({ fighters: teams(3), seed }).world.combatants) if (c.outBy) seen.add(c.outBy);
  }
  assert.deepEqual([...seen].sort(), ['burst', 'ringout', 'spinout']);
});

test('出局方式不會一面倒:場外與爆裂加起來至少三成', () => {
  const count = { ringout: 0, spinout: 0, burst: 0 };
  for (let seed = 0; seed < 60; seed++) {
    for (const c of playMatch({ fighters: teams(3), seed }).world.combatants) if (c.outBy) count[c.outBy]++;
  }
  const total = count.ringout + count.spinout + count.burst;
  assert.ok((count.ringout + count.burst) / total >= 0.3, JSON.stringify(count));
});

test('120 個人也打得完', () => {
  const big = Array.from({ length: 10 }, (_, i) => createFighter({ name: `隊${i}`, count: 12 }));
  // 120 顆是 7140 對碰撞 × 每秒 60 格,跑兩場就好,不然整套測試會慢到沒人想跑
  for (let seed = 0; seed < 2; seed++) assert.ok(!playMatch({ fighters: big, seed }).timedOut, `seed ${seed}`);
});

// 類型是隨機發的。如果某一型強到穩贏,誰贏就變成「誰抽到好陀螺」。
// 這裡用一對一、固定類型,看每一型對每一型都不會是 0% 或 100%。

function duel(typeA, typeB, seeds = 80) {
  const red = createFighter({ name: '紅', count: 1 });
  const blue = createFighter({ name: '藍', count: 1 });
  let redWins = 0;
  let decided = 0;
  for (let seed = 0; seed < seeds; seed++) {
    const rng = seeded(seed);
    let world = createWorld({ fighters: [red, blue], rng });
    world = {
      ...world,
      combatants: world.combatants.map(c => {
        const beyType = c.fighterId === red.id ? typeA : typeB;
        return { ...c, beyType, mass: TYPE_STATS[beyType].mass };
      }),
    };
    while (world.time < 60) {
      world = think(world, 1 / 60);
      world = step(world, 1 / 60, rng);
      if (winnerTeam(world) || aliveOf(world).length === 0) break;
    }
    const won = winnerTeam(world);
    if (!won) continue;
    decided++;
    if (won === red.id) redWins++;
  }
  return { redWins, decided };
}

test('每一型對每一型都有輸有贏 —— 抽到什麼不等於穩贏', () => {
  for (const a of ['attack', 'defense', 'stamina']) {
    for (const b of ['attack', 'defense', 'stamina']) {
      if (a === b) continue;
      const { redWins, decided } = duel(a, b);
      const rate = redWins / decided;
      assert.ok(decided >= 40, `${a} vs ${b}:只有 ${decided} 場分出勝負`);
      assert.ok(rate > 0.15 && rate < 0.85, `${a} vs ${b} 勝率 ${(rate * 100).toFixed(0)}% 太一面倒`);
    }
  }
});
