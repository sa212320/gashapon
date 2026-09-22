import test from 'node:test';
import assert from 'node:assert/strict';

import { createPrize, createMachine, remaining } from '../js/state.js';
import { draw, buildRevealSteps } from '../js/gacha.js';

// 可重現的亂數,讓分布測試不會偶爾紅一次
function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const countOf = (steps, type) => steps.filter(s => s.type === type).length;

test('buildRevealSteps:N 只搖一次就裂開,不升階', () => {
  const steps = buildRevealSteps('N');
  assert.equal(countOf(steps, 'shake'), 1);
  assert.equal(countOf(steps, 'upgrade'), 0);
});

test('buildRevealSteps:階數越高,搖越多次、升越多階', () => {
  const expected = { N: [1, 0], R: [1, 1], SR: [2, 2], SSR: [3, 3], UR: [4, 4] };
  for (const [rarity, [shakes, upgrades]] of Object.entries(expected)) {
    const steps = buildRevealSteps(rarity);
    assert.equal(countOf(steps, 'shake'), shakes, `${rarity} 的 shake 次數`);
    assert.equal(countOf(steps, 'upgrade'), upgrades, `${rarity} 的 upgrade 次數`);
  }
});

test('buildRevealSteps:升階依序經過 R → SR → SSR → UR', () => {
  const steps = buildRevealSteps('UR');
  assert.deepEqual(steps.filter(s => s.type === 'upgrade').map(s => s.to), ['R', 'SR', 'SSR', 'UR']);
});

test('buildRevealSteps:開頭是轉把手再掉蛋,結尾固定是 crack → burst → show', () => {
  for (const rarity of ['N', 'R', 'SR', 'SSR', 'UR']) {
    const steps = buildRevealSteps(rarity);
    assert.deepEqual(steps.slice(0, 2).map(s => s.type), ['turn', 'drop'], `${rarity} 的開頭`);
    assert.deepEqual(steps.slice(-3).map(s => s.type), ['crack', 'burst', 'show'], `${rarity} 的收尾`);
  }
});

test('按「再抽一次」時跳過扭蛋機本體的動畫,直接從掉蛋開始', () => {
  const steps = buildRevealSteps('SSR', null, { turn: false });
  assert.equal(steps[0].type, 'drop');
  assert.equal(steps.filter(s => s.type === 'turn').length, 0);
  // 其他部分一個都不能少
  assert.equal(steps.filter(s => s.type === 'upgrade').length, 3);
  assert.deepEqual(steps.slice(-3).map(s => s.type), ['crack', 'burst', 'show']);
});

test('draw 預設帶轉把手,明講不要時就不帶', () => {
  const machine = createMachine({ removeOnDraw: false, prizes: [createPrize({ name: '揃', count: 1, rarity: 'N' })] });
  assert.equal(draw(machine, seeded(2)).revealSteps[0].type, 'turn');
  assert.equal(draw(machine, seeded(2), { turn: false }).revealSteps[0].type, 'drop');
});

test('buildRevealSteps:每次搖的 tension 逐次遞增', () => {
  const tensions = buildRevealSteps('UR').filter(s => s.type === 'shake').map(s => s.tension);
  assert.deepEqual(tensions, [0, 1, 2, 3]);
});

test('中獎機率只看顆數:3 比 1 就是大約 75% 比 25%', () => {
  const machine = createMachine({
    removeOnDraw: false,
    prizes: [
      createPrize({ name: '多的', count: 3, rarity: 'N' }),
      createPrize({ name: '少的', count: 1, rarity: 'N' }),
    ],
  });
  const rng = seeded(42);
  let many = 0;
  const N = 10000;
  for (let i = 0; i < N; i++) if (draw(machine, rng).prize.name === '多的') many++;
  assert.ok(Math.abs(many / N - 0.75) < 0.02, `實測 ${many / N},應該接近 0.75`);
});

test('稀有度完全不影響機率:把稀有度整個對調,抽出來的序列一模一樣', () => {
  const build = (r1, r2) => createMachine({
    removeOnDraw: false,
    prizes: [
      createPrize({ name: 'A', count: 3, rarity: r1 }),
      createPrize({ name: 'B', count: 1, rarity: r2 }),
    ],
  });
  const a = build('N', 'UR');
  const b = build('UR', 'N');
  const rngA = seeded(7);
  const rngB = seeded(7);
  const seqA = Array.from({ length: 500 }, () => draw(a, rngA).prize.name);
  const seqB = Array.from({ length: 500 }, () => draw(b, rngB).prize.name);
  assert.deepEqual(seqA, seqB);
});

test('抽獎不會動到 prizes 的 count,只有 pool 會少', () => {
  const machine = createMachine({ prizes: [createPrize({ name: '掃地', count: 3, rarity: 'N' })] });
  const result = draw(machine, seeded(1));
  assert.equal(machine.prizes[0].count, 3);
  assert.equal(result.prize.count, 3);
  assert.equal(result.pool.filter(c => c.drawn).length, 1);
});

test('draw 不就地改動傳進來的機台', () => {
  const machine = createMachine({ prizes: [createPrize({ name: '掃地', count: 3, rarity: 'N' })] });
  draw(machine, seeded(1));
  assert.equal(remaining(machine), 3);
});

test('關掉「移除抽到的項目」時,池子永遠不會被消耗', () => {
  const machine = createMachine({
    removeOnDraw: false,
    prizes: [createPrize({ name: '掃地', count: 2, rarity: 'N' })],
  });
  const rng = seeded(3);
  let m = machine;
  for (let i = 0; i < 50; i++) {
    const r = draw(m, rng);
    assert.ok(r !== null);
    m = { ...m, pool: r.pool };
  }
  assert.equal(remaining(m), 2);
});

test('蛋抽光了就回 null', () => {
  let machine = createMachine({ prizes: [createPrize({ name: '掃地', count: 2, rarity: 'N' })] });
  const rng = seeded(5);
  for (let i = 0; i < 2; i++) {
    const r = draw(machine, rng);
    assert.ok(r !== null);
    machine = { ...machine, pool: r.pool };
  }
  assert.equal(draw(machine, rng), null);
});

test('抽到的獎項會帶著自己的演出腳本', () => {
  const machine = createMachine({ prizes: [createPrize({ name: '放假', count: 1, rarity: 'UR' })] });
  const result = draw(machine, seeded(9));
  assert.equal(result.prize.rarity, 'UR');
  assert.equal(countOf(result.revealSteps, 'upgrade'), 4);
  assert.equal(result.revealSteps.at(-1).prize.name, '放假');
});
