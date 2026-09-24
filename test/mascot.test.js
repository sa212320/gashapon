// 吉祥物。這個 session 已經有 test/dialog.test.js 用假 DOM 測過 shared 模組,
// 這裡沿用同一套做法。
//
// 最要釘死的一句:**pose 屬於這一對,不屬於個別動物**。
// 沒有 fox.pose / ermine.pose —— 拆開會生出「狐狸在抱空氣」這種組合,
// 而且兩隻會不同步。
import test from 'node:test';
import assert from 'node:assert/strict';

import { POSES, mountMascots } from '../shared/js/mascot.js';

// 只做這個模組真正會用到的最小 DOM
function fakeDoc() {
  const make = () => {
    const el = {
      className: '',
      innerHTML: '',
      style: { cssText: '', setProperty() {} },
      children: [],
      setAttribute() {},
      append(...kids) { el.children.push(...kids); },
      getBoundingClientRect: () => ({ x: 0, y: 0, width: 0, height: 0, left: 0, top: 0 }),
    };
    return el;
  };
  const body = make();
  return { createElement: make, body };
}

test('POSES 就是那五個,順序固定', () => {
  assert.deepEqual([...POSES], ['idle', 'watch', 'cheer', 'aww', 'empty']);
});

test('初始狀態是 idle / corner', () => {
  const m = mountMascots({ doc: fakeDoc() });
  assert.deepEqual(m.getState(), { pose: 'idle', placement: 'corner' });
});

test('setPose 只改姿勢,不動位置', () => {
  const m = mountMascots({ doc: fakeDoc() });
  m.setPose('aww');
  assert.deepEqual(m.getState(), { pose: 'aww', placement: 'corner' });
});

test('不認得的姿勢會被擋掉,不會把 class 弄成垃圾', () => {
  const m = mountMascots({ doc: fakeDoc() });
  m.setPose('nope');
  assert.equal(m.getState().pose, 'idle');
});

test('根元素的 class 帶著目前的姿勢 —— CSS 就是靠這個選的', () => {
  const m = mountMascots({ doc: fakeDoc() });
  m.setPose('cheer');
  assert.ok(m.el.className.includes('mascots--cheer'), m.el.className);
  assert.ok(!m.el.className.includes('mascots--idle'), m.el.className);
});

test('home 模式只影響外觀,不是第三種 placement', () => {
  const m = mountMascots({ doc: fakeDoc(), home: true });
  assert.equal(m.getState().placement, 'corner');
  assert.ok(m.el.className.includes('mascots--home'), m.el.className);
});
