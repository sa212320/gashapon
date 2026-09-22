import test from 'node:test';
import assert from 'node:assert/strict';

import { loadPrefs, savePrefs } from '../shared/js/prefs.js';

function fakeStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: k => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: k => map.delete(k),
    has: k => map.has(k),
  };
}

test('全新的瀏覽器:音效預設是開的', () => {
  assert.equal(loadPrefs(fakeStorage()).soundOn, true);
});

test('存了再讀,音效開關留著', () => {
  const s = fakeStorage();
  savePrefs({ soundOn: false }, s);
  assert.equal(loadPrefs(s).soundOn, false);
});

test('遷移:舊的 gashapon.v1 關了音效,新的 prefs 也要是關的', () => {
  const s = fakeStorage({
    'gashapon.v1': JSON.stringify({ schema: 1, soundOn: false, machines: [], activeMachineId: 'x' }),
  });
  assert.equal(loadPrefs(s).soundOn, false);
});

test('遷移:舊的 gashapon.v1 音效是開的,新的也是開的', () => {
  const s = fakeStorage({
    'gashapon.v1': JSON.stringify({ schema: 1, soundOn: true, machines: [], activeMachineId: 'x' }),
  });
  assert.equal(loadPrefs(s).soundOn, true);
});

test('遷移:舊存檔壞掉時不丟例外,當成開著', () => {
  assert.equal(loadPrefs(fakeStorage({ 'gashapon.v1': '{壞掉' })).soundOn, true);
});

test('遷移只在 prefs 還沒建立時發生 —— 已經有 prefs 就以 prefs 為準', () => {
  const s = fakeStorage({
    'gashapon.v1': JSON.stringify({ schema: 1, soundOn: false }),
  });
  savePrefs({ soundOn: true }, s);
  assert.equal(loadPrefs(s).soundOn, true);
});

test('遷移不會去改動舊的 gashapon.v1', () => {
  const before = JSON.stringify({ schema: 1, soundOn: false, machines: [], activeMachineId: 'x' });
  const s = fakeStorage({ 'gashapon.v1': before });
  loadPrefs(s);
  assert.equal(s.getItem('gashapon.v1'), before);
});
