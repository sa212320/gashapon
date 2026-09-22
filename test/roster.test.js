import test from 'node:test';
import assert from 'node:assert/strict';

import { newId } from '../shared/js/ids.js';
import {
  expand, countOf, remaining, needsRebuild, entriesChanged,
  createSetupList, getActive, replaceSetup, addSetup, removeSetup,
} from '../shared/js/roster.js';

const entry = (id, count, extra = {}) => ({ id, count, name: id, ...extra });

test('newId 產生的 id 不重複,而且帶著前綴', () => {
  const ids = Array.from({ length: 200 }, () => newId('p'));
  assert.equal(new Set(ids).size, 200);
  assert.ok(ids.every(id => id.startsWith('p_')));
});

test('expand 依 count 展開,並把 entry 交給 makeItem', () => {
  const items = expand([entry('a', 3), entry('b', 1)], e => ({ ref: e.id }));
  assert.equal(items.length, 4);
  assert.equal(items.filter(i => i.ref === 'a').length, 3);
  assert.equal(items.filter(i => i.ref === 'b').length, 1);
});

test('expand 的 makeItem 拿得到「這是該項目的第幾個」', () => {
  const items = expand([entry('a', 3)], (e, i) => ({ i }));
  assert.deepEqual(items.map(x => x.i), [0, 1, 2]);
});

test('count 為 0 的項目不產生任何個體', () => {
  assert.equal(expand([entry('a', 0)], () => ({})).length, 0);
});

test('countOf 是所有 count 的總和', () => {
  assert.equal(countOf([entry('a', 3), entry('b', 2)]), 5);
});

test('remaining 只算還沒被抽走的個體', () => {
  assert.equal(remaining([{ drawn: false }, { drawn: true }, { drawn: false }]), 2);
  assert.equal(remaining([]), 0);
});

test('needsRebuild:改 count 或增刪項目才要重建', () => {
  const before = [entry('a', 3), entry('b', 1)];
  assert.equal(needsRebuild(before, [entry('a', 3), entry('b', 1)]), false);
  assert.equal(needsRebuild(before, [entry('a', 4), entry('b', 1)]), true);
  assert.equal(needsRebuild(before, [entry('a', 3)]), true);
  assert.equal(needsRebuild(before, [...before, entry('c', 1)]), true);
});

test('needsRebuild:改名字、改稀有度、改賞別、改顏色都不重建', () => {
  const before = [entry('a', 3, { rarity: 'N', tier: 'C', color: '#fff' })];
  const after = [entry('a', 3, { rarity: 'UR', tier: 'A', color: '#000' })];
  after[0].name = '換了名字';
  assert.equal(needsRebuild(before, after), false);
});

test('needsRebuild:順序不同但內容一樣,不重建', () => {
  const before = [entry('a', 3), entry('b', 1)];
  assert.equal(needsRebuild(before, [entry('b', 1), entry('a', 3)]), false);
});

test('entriesChanged:任何欄位不同都算變了,順序不算', () => {
  const before = [entry('a', 3, { rarity: 'N' })];
  assert.equal(entriesChanged(before, [entry('a', 3, { rarity: 'N' })]), false);
  assert.equal(entriesChanged(before, [entry('a', 3, { rarity: 'UR' })]), true);
  const two = [entry('a', 1), entry('b', 1)];
  assert.equal(entriesChanged(two, [entry('b', 1), entry('a', 1)]), false);
});

test('createSetupList 給一組設定並指向它', () => {
  const state = createSetupList({ id: 's1', name: '第一組' });
  assert.equal(state.setups.length, 1);
  assert.equal(getActive(state).id, 's1');
});

test('addSetup 新增並切過去,原本那組不受影響', () => {
  let state = createSetupList({ id: 's1', name: '第一組', data: 1 });
  state = addSetup(state, { id: 's2', name: '第二組' });
  assert.equal(state.setups.length, 2);
  assert.equal(getActive(state).id, 's2');
  assert.equal(state.setups[0].data, 1);
});

test('replaceSetup 只換掉同 id 的那一組', () => {
  let state = createSetupList({ id: 's1', name: '舊的' });
  state = addSetup(state, { id: 's2', name: '第二組' });
  state = replaceSetup(state, { id: 's1', name: '新的' });
  assert.equal(state.setups.find(s => s.id === 's1').name, '新的');
  assert.equal(state.setups.find(s => s.id === 's2').name, '第二組');
});

test('removeSetup 刪掉正在用的那組時改指到還在的', () => {
  let state = createSetupList({ id: 's1', name: '第一組' });
  state = addSetup(state, { id: 's2', name: '第二組' });
  state = removeSetup(state, 's2', () => ({ id: 'seed', name: '種子' }));
  assert.equal(state.setups.length, 1);
  assert.equal(getActive(state).id, 's1');
});

test('removeSetup 刪到一組都不剩時,用 makeSeed 補一組', () => {
  let state = createSetupList({ id: 's1', name: '第一組' });
  state = removeSetup(state, 's1', () => ({ id: 'seed', name: '種子' }));
  assert.equal(state.setups.length, 1);
  assert.equal(getActive(state).id, 'seed');
});
