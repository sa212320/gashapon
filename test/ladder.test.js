// 阿彌陀籤的純邏輯。
//
// 這裡最重要的兩個測試是「排最後的獎項也抽得到」跟「機率均勻」——
// 它們釘死的是這個模式的公平性,而公平性**來自 lineup 與 bottomSlots 兩端的洗牌**,
// 不是來自橫槓密度。任何「橫槓多一點比較公平」的改法都是做錯了。
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  PALETTE, createPlayer, createGhostPrize, pickColor,
  shuffle, lineup, bottomSlots, buildLadder, walk, assign,
} from '../ghostleg/js/ladder.js';

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

const players = n => Array.from({ length: n }, (_, i) => createPlayer({ name: `p${i}` }));
const prizes = n => Array.from({ length: n }, (_, i) => createGhostPrize({ name: `獎${i}`, count: 1 }));

/* ---------- 建立 ---------- */

test('createGhostPrize 擋掉不可信的 count', () => {
  // Infinity 會讓 expand 的迴圈永遠跑不完(這個坑在一番賞踩過,真的會 OOM)
  assert.equal(createGhostPrize({ count: Infinity }).count, 0);
  assert.equal(createGhostPrize({ count: NaN }).count, 0);
  assert.equal(createGhostPrize({ count: -3 }).count, 0);
  assert.equal(createGhostPrize({ count: 2.7 }).count, 2);
});

test('pickColor 在調色盤用完之前不重複', () => {
  const chosen = [];
  for (let i = 0; i < PALETTE.length; i++) {
    chosen.push({ color: pickColor(chosen) });
  }
  assert.equal(new Set(chosen.map(c => c.color)).size, PALETTE.length);
});

test('調色盤是 20 色 —— 再多就會出現肉眼分不出來的相近色', () => {
  assert.equal(PALETTE.length, 20);
  assert.equal(new Set(PALETTE).size, 20);
});

/* ---------- 洗牌 ---------- */

test('shuffle 回傳新陣列,不動原本的', () => {
  const src = [1, 2, 3, 4, 5];
  const out = shuffle(src, seeded(1));
  assert.notEqual(out, src);
  assert.deepEqual(src, [1, 2, 3, 4, 5]);
  assert.deepEqual([...out].sort(), [...src].sort());
});

test('lineup 把玩家洗到車道上 —— 畫面順序跟設定清單無關', () => {
  const list = players(8);
  let moved = 0;
  for (let seed = 0; seed < 50; seed++) {
    const order = lineup(list, seeded(seed));
    assert.equal(order.length, list.length);
    assert.deepEqual([...order].map(p => p.id).sort(), [...list].map(p => p.id).sort());
    if (order[0].id !== list[0].id) moved++;
  }
  assert.ok(moved > 30, `50 局裡只有 ${moved} 局第一個位置換人,沒有真的洗`);
});

/* ---------- 底部格子 ---------- */

test('底部格子數恆等於玩家數 —— 不足時補銘謝惠顧', () => {
  const slots = bottomSlots(prizes(3), 6, seeded(1));
  assert.equal(slots.length, 6);
  assert.equal(slots.filter(s => s.prizeId === null).length, 3);
  assert.ok(slots.filter(s => s.prizeId === null).every(s => s.name === '銘謝惠顧'));
});

test('獎項數剛好等於玩家數時,不補也不砍', () => {
  const list = [createGhostPrize({ name: '甲', count: 2 }), createGhostPrize({ name: '乙', count: 2 })];
  const slots = bottomSlots(list, 4, seeded(1));
  assert.equal(slots.length, 4);
  assert.equal(slots.filter(s => s.prizeId === null).length, 0);
});

test('獎項比人多時隨機取樣 —— 排在清單最後的獎項也抽得到', () => {
  // 舊寫法是 slice(0, playerCount),排最後的獎項永遠不會出現,
  // 而且畫面上不會有任何提示 —— 沉默的不公平,比看得見的限制糟糕得多。
  const list = prizes(10);
  const last = list[list.length - 1].id;
  let seen = 0;
  for (let seed = 0; seed < 400; seed++) {
    assert.equal(bottomSlots(list, 4, seeded(seed)).length, 4);
    if (bottomSlots(list, 4, seeded(seed)).some(s => s.prizeId === last)) seen++;
  }
  assert.ok(seen > 100, `排最後的獎項只在 ${seen}/400 局出現,取樣沒有隨機`);
});

/* ---------- 梯子 ---------- */

test('同一列不會有相鄰的橫線(不然走法有歧義)', () => {
  for (let seed = 0; seed < 100; seed++) {
    const ladder = buildLadder({ lanes: 6, rng: seeded(seed) });
    const byRow = new Map();
    for (const rung of ladder.rungs) {
      if (!byRow.has(rung.row)) byRow.set(rung.row, []);
      byRow.get(rung.row).push(rung.left);
    }
    for (const lefts of byRow.values()) {
      const sorted = [...lefts].sort((a, b) => a - b);
      for (let i = 1; i < sorted.length; i++) {
        assert.ok(sorted[i] - sorted[i - 1] >= 2, `第 ${sorted[i - 1]} 與 ${sorted[i]} 兩根橫線相鄰`);
      }
    }
  }
});

test('跑道長度不跟著人數暴衝 —— 40 人也在看得完的範圍', () => {
  // 舊公式是 rows = max(6, lanes*2),40 人就是 80 列。
  // rows 決定的是「看多久」,公平性不在這裡,所以可以封頂。
  for (const lanes of [2, 6, 12, 40]) {
    const ladder = buildLadder({ lanes, rng: seeded(lanes) });
    assert.ok(ladder.rows >= 12 && ladder.rows <= 16, `${lanes} 條線時 rows = ${ladder.rows}`);
  }
});

test('walk 照著橫線走', () => {
  const flat = { lanes: 4, rows: 3, rungs: [] };
  assert.equal(walk(flat, 2), 2);

  const one = { lanes: 4, rows: 3, rungs: [{ row: 1, left: 1 }] };
  assert.equal(walk(one, 1), 2);
  assert.equal(walk(one, 2), 1);
  assert.equal(walk(one, 0), 0);

  const two = { lanes: 3, rows: 4, rungs: [{ row: 0, left: 0 }, { row: 2, left: 1 }] };
  assert.equal(walk(two, 0), 2);
});

test('walk 是雙射 —— 沒有兩個人走到同一格', () => {
  for (const lanes of [2, 5, 12, 40]) {
    for (let seed = 0; seed < 30; seed++) {
      const ladder = buildLadder({ lanes, rng: seeded(seed) });
      const ends = Array.from({ length: lanes }, (_, i) => walk(ladder, i));
      assert.equal(new Set(ends).size, lanes, `${lanes} 條線 seed ${seed}:有人撞在一起`);
    }
  }
});

/* ---------- 公平性 ---------- */

test('機率均勻 —— 每個人拿到每個獎的機率一樣', () => {
  // 刻意用一個橫槓很少的梯子:那種梯子如果沒有兩端洗牌,會嚴重偏向自己正對面那格。
  // 所以這個測試驗的是「兩個洗牌有沒有寫對」,不是「梯子夠不夠亂」。
  const LANES = 6;
  const RUNS = 12000;
  const list = players(LANES);
  const pool = prizes(LANES);
  const tally = new Map(list.map(p => [p.id, new Map()]));

  for (let seed = 0; seed < RUNS; seed++) {
    const rng = seeded(seed);
    const order = lineup(list, rng);
    const slots = bottomSlots(pool, LANES, rng);
    const ladder = buildLadder({ lanes: LANES, rows: 4, density: 0.15, rng });
    for (const r of assign(ladder, order, slots)) {
      const row = tally.get(r.playerId);
      row.set(r.slot.name, (row.get(r.slot.name) ?? 0) + 1);
    }
  }

  const expected = RUNS / LANES;
  for (const [playerId, row] of tally) {
    assert.equal(row.size, LANES, `${playerId} 沒拿到過全部 ${LANES} 種獎`);
    for (const [name, n] of row) {
      const drift = Math.abs(n - expected) / expected;
      assert.ok(drift < 0.12, `${playerId} 拿到「${name}」${n} 次,偏離平均 ${(drift * 100).toFixed(1)}%`);
    }
  }
});

test('assign 把結果對上玩家與格子', () => {
  const list = players(4);
  const slots = bottomSlots(prizes(4), 4, seeded(3));
  const ladder = buildLadder({ lanes: 4, rng: seeded(3) });
  const out = assign(ladder, list, slots);
  assert.equal(out.length, 4);
  assert.deepEqual(out.map(r => r.playerId).sort(), list.map(p => p.id).sort());
  assert.equal(new Set(out.map(r => r.slotIndex)).size, 4);
  for (const r of out) assert.equal(r.slot, slots[r.slotIndex]);
});
