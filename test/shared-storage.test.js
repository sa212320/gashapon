import test from 'node:test';
import assert from 'node:assert/strict';

import { createStore } from '../shared/js/storage.js';

function fakeStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: k => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: k => map.delete(k),
  };
}

const store = createStore({
  key: 'demo.v1',
  schema: 1,
  seed: () => ({ items: ['種子'] }),
  sanitize: parsed => (Array.isArray(parsed.items) ? { items: parsed.items } : null),
});

test('什麼都沒存時回種子資料', () => {
  assert.deepEqual(store.load(fakeStorage()), { items: ['種子'] });
});

test('壞掉的 JSON 回種子資料,不丟例外', () => {
  assert.deepEqual(store.load(fakeStorage({ 'demo.v1': '{壞掉' })), { items: ['種子'] });
});

test('空字串回種子資料', () => {
  assert.deepEqual(store.load(fakeStorage({ 'demo.v1': '' })), { items: ['種子'] });
});

test('schema 版本不認得時回種子資料', () => {
  const raw = JSON.stringify({ schema: 999, items: ['舊的'] });
  assert.deepEqual(store.load(fakeStorage({ 'demo.v1': raw })), { items: ['種子'] });
});

test('sanitize 回 null 時回種子資料', () => {
  const raw = JSON.stringify({ schema: 1, items: '不是陣列' });
  assert.deepEqual(store.load(fakeStorage({ 'demo.v1': raw })), { items: ['種子'] });
});

test('存了再讀,內容一致', () => {
  const s = fakeStorage();
  store.save({ items: ['甲', '乙'] }, s);
  assert.deepEqual(store.load(s), { items: ['甲', '乙'] });
});

test('save 會寫進 schema 版本', () => {
  const s = fakeStorage();
  store.save({ items: [] }, s);
  assert.equal(JSON.parse(s.getItem('demo.v1')).schema, 1);
});

test('空間爆掉時 save 不丟例外,並回 false', () => {
  const s = fakeStorage();
  s.setItem = () => { throw new DOMException('full', 'QuotaExceededError'); };
  let result;
  assert.doesNotThrow(() => { result = store.save({ items: [] }, s); });
  assert.equal(result, false);
});

test('兩個 store 用不同 key,互不干擾', () => {
  const other = createStore({
    key: 'other.v1', schema: 1,
    seed: () => ({ n: 0 }),
    sanitize: p => (typeof p.n === 'number' ? { n: p.n } : null),
  });
  const s = fakeStorage();
  store.save({ items: ['甲'] }, s);
  other.save({ n: 7 }, s);
  assert.deepEqual(store.load(s), { items: ['甲'] });
  assert.deepEqual(other.load(s), { n: 7 });
});
