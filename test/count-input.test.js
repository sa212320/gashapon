// 設定頁的數量輸入框(大亂鬥每隊人數、爬格子每種獎品數量)。
// 這個 bug 上線過:每打一個字就把整張清單重畫,輸入框被換掉、游標不見,
// 刪掉數字再打,字常常打不進去。打字時只回報數字,不准動輸入框;離開時才整理顯示。
import test from 'node:test';
import assert from 'node:assert/strict';
import { bindCountInput, parseCount } from '../shared/js/count-input.js';

function fakeInput() {
  const handlers = {};
  return {
    value: '', type: '', min: '', max: '',
    addEventListener(type, fn) { (handlers[type] ??= []).push(fn); },
    fire(type) { for (const fn of handlers[type] ?? []) fn({ target: this }); },
  };
}

test('parseCount:空白當 0、夾在 0~max、去掉小數、亂打的當 0', () => {
  assert.equal(parseCount('', 12), 0);
  assert.equal(parseCount('7', 12), 7);
  assert.equal(parseCount('30', 12), 12);
  assert.equal(parseCount('-3', 12), 0);
  assert.equal(parseCount('4.8', 12), 4);
  assert.equal(parseCount('abc', 12), 0);
});

test('一開始顯示原本的數字,設好 number / min / max', () => {
  const el = fakeInput();
  bindCountInput(el, { value: 5, max: 12, onCount() {} });
  assert.equal(el.value, '5');
  assert.equal(el.type, 'number');
  assert.equal(el.max, '12');
});

test('打字時:回報數字,但不改輸入框裡的字(刪光不會被改回 0,游標也不會跑掉)', () => {
  const el = fakeInput();
  const got = [];
  bindCountInput(el, { value: 12, max: 12, onCount: v => got.push(v) });
  el.value = '';
  el.fire('input');
  assert.equal(el.value, '', '刪光時不能馬上被改回 0');
  el.value = '8';
  el.fire('input');
  assert.equal(el.value, '8');
  assert.deepEqual(got, [0, 8]);
});

test('離開輸入框時才整理顯示:空白 → 0、超過上限 → 上限', () => {
  const el = fakeInput();
  bindCountInput(el, { value: 3, max: 12, onCount() {} });
  el.value = '';
  el.fire('input');
  el.fire('change');
  assert.equal(el.value, '0');
  el.value = '99';
  el.fire('input');
  el.fire('change');
  assert.equal(el.value, '12');
});

// 大亂鬥與爬格子的數量欄都要走這個元件(不要又在 input 事件裡重畫整張清單)
import { readFileSync } from 'node:fs';
test('大亂鬥、爬格子的數量欄用 bindCountInput,沒有自己綁 input 事件', () => {
  for (const f of ['smash/js/main.js', 'ghostleg/js/main.js']) {
    const src = readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
    assert.match(src, /bindCountInput\(count,/, f);
    assert.doesNotMatch(src, /count\.addEventListener\('input'/, f);
  }
});
