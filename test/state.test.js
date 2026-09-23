import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createPrize, createMachine, buildPool, refillMachine,
  prizesChanged, needsRebuild, remaining, createInitialState,
  addMachine, removeMachine, getActiveMachine,
} from '../gashapon/js/state.js';
import { RARITIES, SEED_PRIZES, RARITY_META } from '../gashapon/js/constants.js';

const prizes = () => [
  createPrize({ name: '掃地', count: 3, rarity: 'N' }),
  createPrize({ name: '放假', count: 1, rarity: 'UR' }),
];

test('buildPool 依 count 展開成一顆一顆的蛋', () => {
  const p = prizes();
  const pool = buildPool(p);
  assert.equal(pool.length, 4);
  assert.equal(pool.filter(c => c.prizeId === p[0].id).length, 3);
  assert.equal(pool.filter(c => c.prizeId === p[1].id).length, 1);
  assert.ok(pool.every(c => c.drawn === false));
});

test('count 為 0 的獎項不會產生任何蛋', () => {
  const pool = buildPool([createPrize({ name: '空的', count: 0, rarity: 'N' })]);
  assert.equal(pool.length, 0);
});

test('createMachine 預設會把池子裝滿,且預設會移除抽到的項目', () => {
  const m = createMachine({ name: '測試機', prizes: prizes() });
  assert.equal(m.name, '測試機');
  assert.equal(m.removeOnDraw, true);
  assert.equal(m.pool.length, 4);
  assert.equal(remaining(m), 4);
});

test('remaining 只算還沒抽走的蛋', () => {
  const m = createMachine({ prizes: prizes() });
  m.pool[0].drawn = true;
  m.pool[1].drawn = true;
  assert.equal(remaining(m), 2);
});

test('refillMachine 把已抽的全部放回去,且不動 prizes', () => {
  const m = createMachine({ prizes: prizes() });
  m.pool.forEach(c => { c.drawn = true; });
  const refilled = refillMachine(m);
  assert.equal(remaining(refilled), 4);
  assert.deepEqual(refilled.prizes, m.prizes);
  assert.equal(remaining(m), 0, 'refillMachine 不該就地改動原本的機台');
});

test('prizesChanged:完全沒動就是沒變', () => {
  const before = prizes();
  const after = before.map(p => ({ ...p }));
  assert.equal(prizesChanged(before, after), false);
});

test('prizesChanged:改名字算變了', () => {
  const before = prizes();
  const after = before.map(p => ({ ...p }));
  after[0].name = '拖地';
  assert.equal(prizesChanged(before, after), true);
});

test('prizesChanged:改數量算變了', () => {
  const before = prizes();
  const after = before.map(p => ({ ...p }));
  after[0].count = 5;
  assert.equal(prizesChanged(before, after), true);
});

test('prizesChanged:改稀有度算變了', () => {
  const before = prizes();
  const after = before.map(p => ({ ...p }));
  after[0].rarity = 'SSR';
  assert.equal(prizesChanged(before, after), true);
});

test('prizesChanged:新增或刪除獎項算變了', () => {
  const before = prizes();
  assert.equal(prizesChanged(before, [...before, createPrize({})]), true);
  assert.equal(prizesChanged(before, [before[0]]), true);
});

test('prizesChanged:只是順序不同,內容一樣,不算變(不該沒收小孩的進度)', () => {
  const before = prizes();
  const after = [...before].reverse().map(p => ({ ...p }));
  assert.equal(prizesChanged(before, after), false);
});

test('createInitialState 給一台種子機台,並指向它', () => {
  const s = createInitialState();
  assert.equal(s.machines.length, 1);
  assert.equal(getActiveMachine(s).id, s.machines[0].id);
  assert.ok(remaining(s.machines[0]) > 0);
});

test('addMachine 新增一台並切過去,原本那台的進度不受影響', () => {
  let s = createInitialState();
  const firstId = s.machines[0].id;
  s.machines[0].pool[0].drawn = true;
  const before = remaining(s.machines[0]);

  s = addMachine(s, '第二台');

  assert.equal(s.machines.length, 2);
  assert.equal(getActiveMachine(s).name, '第二台');
  assert.notEqual(getActiveMachine(s).id, firstId);
  assert.equal(remaining(s.machines.find(m => m.id === firstId)), before);
});

test('removeMachine 刪掉正在用的那台時,會改指到還在的機台', () => {
  let s = addMachine(createInitialState(), '第二台');
  const keptId = s.machines[0].id;
  s = removeMachine(s, getActiveMachine(s).id);
  assert.equal(s.machines.length, 1);
  assert.equal(getActiveMachine(s).id, keptId);
});

test('removeMachine 刪到一台都不剩時,自動補一台種子機台', () => {
  let s = createInitialState();
  s = removeMachine(s, s.machines[0].id);
  assert.equal(s.machines.length, 1);
  assert.ok(remaining(getActiveMachine(s)) > 0);
});

test('每個獎項與機台都有自己的 id', () => {
  const ids = [...prizes(), ...prizes()].map(p => p.id);
  assert.equal(new Set(ids).size, 4);
});

// needsRebuild 問的是「池子的形狀變了嗎」,比 prizesChanged 嚴格:
// 改名字、改稀有度不影響池子裡有幾顆蛋,就不該沒收小孩的進度。
test('needsRebuild:只改名字不需要重建池子', () => {
  const before = prizes();
  const after = before.map(p => ({ ...p }));
  after[0].name = '拖地';
  assert.equal(needsRebuild(before, after), false);
});

test('needsRebuild:只改稀有度不需要重建池子', () => {
  const before = prizes();
  const after = before.map(p => ({ ...p }));
  after[0].rarity = 'SSR';
  assert.equal(needsRebuild(before, after), false);
});

test('needsRebuild:改數量一定要重建', () => {
  const before = prizes();
  const after = before.map(p => ({ ...p }));
  after[0].count = 5;
  assert.equal(needsRebuild(before, after), true);
});

test('needsRebuild:新增或刪除獎項一定要重建', () => {
  const before = prizes();
  assert.equal(needsRebuild(before, [...before, createPrize({})]), true);
  assert.equal(needsRebuild(before, [before[0]]), true);
});

test('needsRebuild:什麼都沒動就不用重建', () => {
  const before = prizes();
  assert.equal(needsRebuild(before, before.map(p => ({ ...p }))), false);
  assert.equal(needsRebuild(before, [...before].reverse().map(p => ({ ...p }))), false);
});

test('count 是 Infinity 時當成 0,不會把瀏覽器打死', () => {
  const prize = createPrize({ name: 'x', count: Infinity, rarity: 'N' });
  assert.equal(prize.count, 0);
  assert.equal(buildPool([prize]).length, 0);
});

test('count 是 NaN 時當成 0', () => {
  assert.equal(createPrize({ name: 'x', count: NaN, rarity: 'N' }).count, 0);
});

test('RARITIES 是凍結的,外部改不動', () => {
  assert.equal(Object.isFrozen(RARITIES), true);
  assert.throws(() => { RARITIES.push('LR'); }, TypeError);
});

test('SEED_PRIZES 跟裡面每一個項目都是凍結的', () => {
  assert.equal(Object.isFrozen(SEED_PRIZES), true);
  assert.ok(SEED_PRIZES.every(Object.isFrozen));
  assert.throws(() => { SEED_PRIZES.push({ name: 'x', count: 1, rarity: 'N' }); }, TypeError);
  assert.throws(() => { SEED_PRIZES[0].count = 99; }, TypeError);
});

test('RARITY_META 是凍結的', () => {
  assert.equal(Object.isFrozen(RARITY_META), true);
});

test('RARITY_META 的內層也凍住了,不能偷改某個稀有度的顏色', () => {
  assert.equal(Object.isFrozen(RARITY_META.N), true);
  assert.throws(() => { RARITY_META.N.color = 'x'; }, TypeError);
});
