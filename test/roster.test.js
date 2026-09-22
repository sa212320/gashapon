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

// --- entriesChanged:修正 JSON.stringify 誤判(undefined/NaN 序列化成 null、只排序頂層 key) ---

test('entriesChanged:undefined 與 null 是不同的值', () => {
  assert.equal(entriesChanged([{ id: 'a', count: 1, x: undefined }], [{ id: 'a', count: 1, x: null }]), true);
});

test('entriesChanged:NaN 與 null 是不同的值', () => {
  assert.equal(entriesChanged([{ id: 'a', count: 1, x: NaN }], [{ id: 'a', count: 1, x: null }]), true);
});

test('entriesChanged:NaN 跟自己比算沒變', () => {
  assert.equal(entriesChanged([{ id: 'a', count: 1, x: NaN }], [{ id: 'a', count: 1, x: NaN }]), false);
});

test('entriesChanged:巢狀物件內容一樣、key 順序不同,不算變', () => {
  assert.equal(entriesChanged(
    [{ id: 'a', count: 1, style: { color: 'red', size: 'big' } }],
    [{ id: 'a', count: 1, style: { size: 'big', color: 'red' } }]), false);
});

test('entriesChanged:巢狀物件內容不一樣就算變', () => {
  assert.equal(entriesChanged(
    [{ id: 'a', count: 1, style: { color: 'red' } }],
    [{ id: 'a', count: 1, style: { color: 'blue' } }]), true);
});

test('entriesChanged:陣列的順序有意義', () => {
  assert.equal(entriesChanged([{ id: 'a', count: 1, tags: ['x', 'y'] }], [{ id: 'a', count: 1, tags: ['y', 'x'] }]), true);
});

test('entriesChanged:物件多了或少了一個 key 也算變', () => {
  assert.equal(entriesChanged([{ id: 'a', count: 1 }], [{ id: 'a', count: 1, extra: 'x' }]), true);
});

test('entriesChanged:陣列裡的巢狀物件,物件內 key 順序不算、陣列順序算', () => {
  assert.equal(entriesChanged(
    [{ id: 'a', count: 1, list: [{ color: 'red', size: 'big' }] }],
    [{ id: 'a', count: 1, list: [{ size: 'big', color: 'red' } ] }]), false);
  assert.equal(entriesChanged(
    [{ id: 'a', count: 1, list: [{ x: 1 }, { x: 2 }] }],
    [{ id: 'a', count: 1, list: [{ x: 2 }, { x: 1 }] }]), true);
});

test('entriesChanged:同值不同型別(字串 vs 數字)算變', () => {
  assert.equal(entriesChanged([{ id: 'a', count: 1, x: '1' }], [{ id: 'a', count: 1, x: 1 }]), true);
});

// Object.create(null) 是合法的純資料(JSON 往返後會變成普通物件),
// 跟 Date / RegExp 不一樣——isPlainObject 必須繼續認得它,這條要有測試守著。
test('entriesChanged:Object.create(null) 仍然當成普通物件比內容', () => {
  const mk = v => { const o = Object.create(null); o.k = v; return o; };
  assert.equal(entriesChanged([{ id: 'a', count: 1, o: mk(1) }], [{ id: 'a', count: 1, o: mk(1) }]), false);
  assert.equal(entriesChanged([{ id: 'a', count: 1, o: mk(1) }], [{ id: 'a', count: 1, o: mk(2) }]), true);
});
