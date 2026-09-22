import test from 'node:test';
import assert from 'node:assert/strict';

import { load, save, createDebouncedSave } from '../gashapon/js/storage.js';
import { createInitialState, addMachine, getActiveMachine, remaining } from '../gashapon/js/state.js';
import { STORAGE_KEY } from '../gashapon/js/constants.js';

function fakeStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: k => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: k => map.delete(k),
    _dump: () => Object.fromEntries(map),
  };
}

test('第一次開站(什麼都沒存)會拿到種子機台', () => {
  const state = load(fakeStorage());
  assert.equal(state.machines.length, 1);
  assert.ok(remaining(state.machines[0]) > 0);
});

test('存檔是壞掉的 JSON 時回種子資料,不丟例外', () => {
  const state = load(fakeStorage({ [STORAGE_KEY]: '{這不是 JSON' }));
  assert.equal(state.machines.length, 1);
  assert.ok(remaining(state.machines[0]) > 0);
});

test('存檔是空字串時回種子資料', () => {
  assert.equal(load(fakeStorage({ [STORAGE_KEY]: '' })).machines.length, 1);
});

test('存檔結構不對(machines 不是陣列)時回種子資料', () => {
  const state = load(fakeStorage({ [STORAGE_KEY]: JSON.stringify({ schema: 1, machines: '壞掉' }) }));
  assert.equal(state.machines.length, 1);
  assert.ok(remaining(state.machines[0]) > 0);
});

test('schema 版本不認得時回種子資料', () => {
  const store = fakeStorage();
  save(addMachine(createInitialState(), '第二台'), store);
  const raw = JSON.parse(store.getItem(STORAGE_KEY));
  raw.schema = 999;
  store.setItem(STORAGE_KEY, JSON.stringify(raw));
  assert.equal(load(store).machines.length, 1);
});

test('存了再讀,機台、進度都還在', () => {
  const store = fakeStorage();
  let state = addMachine(createInitialState(), '第二台');
  state.machines[0].pool[0].drawn = true;
  state.machines[0].removeOnDraw = false;
  save(state, store);

  const loaded = load(store);
  assert.equal(loaded.machines.length, 2);
  assert.equal(getActiveMachine(loaded).name, '第二台');
  assert.equal(loaded.machines[0].pool[0].drawn, true);
  assert.equal(loaded.machines[0].removeOnDraw, false);
});

// soundOn 搬去 shared/js/prefs.js 的 prefs.v1 了。這裡的存檔只讀不寫那個舊欄位
// (shared/js/prefs.js 的 migrate() 會讀),save() 絕對不能把它寫回去 ——
// 否則舊使用者遷移前的設定會在遷移發生前就被抹掉。
test('save 不會把 soundOn 寫進存檔,就算 state 上帶著這個欄位', () => {
  const store = fakeStorage();
  const state = { ...createInitialState(), soundOn: false };
  save(state, store);
  const raw = JSON.parse(store.getItem(STORAGE_KEY));
  assert.equal('soundOn' in raw, false);
});

test('load 回來的 state 不會帶 soundOn 欄位', () => {
  const store = fakeStorage({
    [STORAGE_KEY]: JSON.stringify({ schema: 1, soundOn: false, machines: [], activeMachineId: 'x' }),
  });
  assert.equal('soundOn' in load(store), false);
});

test('讀了再存一輪之後,舊存檔裡的 soundOn 不會被改寫成別的值,而是單純消失', () => {
  const store = fakeStorage({
    [STORAGE_KEY]: JSON.stringify({ schema: 1, soundOn: false, machines: [], activeMachineId: 'x' }),
  });
  // 模擬遷移完成前,使用者做了別的操作觸發存檔
  save(load(store), store);
  const raw = JSON.parse(store.getItem(STORAGE_KEY));
  assert.equal('soundOn' in raw, false);
});

test('存檔裡的機台缺了 pool 時,會依 prizes 重新裝滿而不是壞掉', () => {
  const store = fakeStorage();
  save(createInitialState(), store);
  const raw = JSON.parse(store.getItem(STORAGE_KEY));
  delete raw.machines[0].pool;
  store.setItem(STORAGE_KEY, JSON.stringify(raw));

  const loaded = load(store);
  assert.ok(remaining(loaded.machines[0]) > 0);
});

test('存檔指向一台不存在的機台時,會退回第一台', () => {
  const store = fakeStorage();
  save(createInitialState(), store);
  const raw = JSON.parse(store.getItem(STORAGE_KEY));
  raw.activeMachineId = '不存在的 id';
  store.setItem(STORAGE_KEY, JSON.stringify(raw));
  assert.equal(getActiveMachine(load(store)).id, load(store).machines[0].id);
});

test('拿不到 storage 時 save 回 false,不能因為 ?. 短路就騙自己存成功了', () => {
  assert.equal(save(createInitialState(), null), false);
});

test('空間爆掉時 save 不丟例外(設定面板不能被卡死)', () => {
  const store = fakeStorage();
  store.setItem = () => { throw new DOMException('full', 'QuotaExceededError'); };
  assert.doesNotThrow(() => save(createInitialState(), store));
});

test('存進去的獎項不會被池子污染:count 還是原本的', () => {
  const store = fakeStorage();
  const state = createInitialState();
  const before = state.machines[0].prizes.map(p => p.count);
  state.machines[0].pool.forEach(c => { c.drawn = true; });
  save(state, store);
  assert.deepEqual(load(store).machines[0].prizes.map(p => p.count), before);
});

test('localStorage 這個 getter 本身就丟例外時,load 回種子資料而不是炸出來', () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    get() { throw new DOMException('The operation is insecure.', 'SecurityError'); },
  });
  try {
    assert.doesNotThrow(() => load());
    assert.ok(remaining(load().machines[0]) > 0, '拿不到 localStorage 時要回種子機台');
    assert.doesNotThrow(() => save(createInitialState()));
    assert.doesNotThrow(() => createDebouncedSave());
  } finally {
    if (original) Object.defineProperty(globalThis, 'localStorage', original);
    else delete globalThis.localStorage;
  }
});
