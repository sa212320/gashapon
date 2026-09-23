// 把 walk 的「結果」展開成「過程」。
// 這條折線就是之後畫在地上的彩色軌跡帶,所以它必須跟 walk 算出來的終點一致 ——
// 兩邊各自算會漂移,那會變成「動畫顯示我走到 A,結果清單說我拿到 B」。
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildLadder, walk } from '../ghostleg/js/ladder.js';
import { pathOf } from '../ghostleg/js/race.js';

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

test('沒有橫線時就是一條直線', () => {
  const ladder = { lanes: 4, rows: 3, rungs: [] };
  assert.deepEqual(pathOf(ladder, 2), [{ lane: 2, row: 0 }, { lane: 2, row: 3 }]);
});

test('遇到橫線時先走到那一列,再橫移', () => {
  const ladder = { lanes: 4, rows: 4, rungs: [{ row: 1, left: 1 }] };
  assert.deepEqual(pathOf(ladder, 1), [
    { lane: 1, row: 0 },
    { lane: 1, row: 1 },
    { lane: 2, row: 1 },
    { lane: 2, row: 4 },
  ]);
});

test('折線的終點一定等於 walk 的答案', () => {
  for (const lanes of [2, 5, 12, 40]) {
    for (let seed = 0; seed < 40; seed++) {
      const ladder = buildLadder({ lanes, rng: seeded(seed) });
      for (let lane = 0; lane < lanes; lane++) {
        const path = pathOf(ladder, lane);
        assert.equal(path.at(-1).lane, walk(ladder, lane),
          `${lanes} 條線 seed ${seed} 第 ${lane} 條:折線跟 walk 不一致`);
        assert.equal(path.at(-1).row, ladder.rows);
        assert.equal(path[0].lane, lane);
        assert.equal(path[0].row, 0);
      }
    }
  }
});

test('折線只有垂直段與水平段,而且水平段一次只移動一條', () => {
  const ladder = buildLadder({ lanes: 8, rng: seeded(9) });
  for (let lane = 0; lane < 8; lane++) {
    const path = pathOf(ladder, lane);
    for (let i = 1; i < path.length; i++) {
      const a = path[i - 1];
      const b = path[i];
      const dLane = Math.abs(b.lane - a.lane);
      const dRow = b.row - a.row;
      assert.ok((dLane === 0 && dRow > 0) || (dLane === 1 && dRow === 0),
        `第 ${i} 段既不是垂直也不是單格水平:${JSON.stringify(a)} → ${JSON.stringify(b)}`);
    }
  }
});
