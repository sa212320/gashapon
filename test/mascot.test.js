// 吉祥物。這個 session 已經有 test/dialog.test.js 用假 DOM 測過 shared 模組,
// 這裡沿用同一套做法。
//
// 最要釘死的一句:**pose 屬於這一對,不屬於個別動物**。
// 沒有 fox.pose / ermine.pose —— 拆開會生出「狐狸在抱空氣」這種組合,
// 而且兩隻會不同步。
//
// 修訂一:素材從手刻 SVG 改成生成的 WebP 圖,測試不再檢查 SVG 內部
// 結構(m-fox__xxx 之類的零件),但狀態機的斷言原封不動保留。
//
// 全部的 mountMascots() 呼叫都要傳 fidget: false。待機排程用
// setTimeout 而且會自己重排,node 的事件迴圈永遠清不空,不關掉的話
// node --test 會直接掛住不結束。
import test from 'node:test';
import assert from 'node:assert/strict';

import { POSES, mountMascots } from '../shared/js/mascot.js';

// 只做這個模組真正會用到的最小 DOM
function fakeDoc() {
  const make = () => {
    const el = {
      className: '',
      innerHTML: '',
      src: '',
      alt: '',
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

// 錨點有正常尺寸時,回傳的 rect 才有意義
function anchorAt(x, y) {
  return {
    getBoundingClientRect: () => ({ x, y, left: x, top: y, width: 10, height: 10 }),
  };
}

// 被 hidden 的元素,getBoundingClientRect 全部是 0
const hiddenAnchor = {
  getBoundingClientRect: () => ({ x: 0, y: 0, left: 0, top: 0, width: 0, height: 0 }),
};

test('POSES 就是那五個,順序固定', () => {
  assert.deepEqual([...POSES], ['idle', 'watch', 'cheer', 'aww', 'empty']);
});

test('初始狀態是 idle / corner', () => {
  const m = mountMascots({ doc: fakeDoc(), fidget: false });
  assert.deepEqual(m.getState(), { pose: 'idle', placement: 'corner' });
});

test('setPose 只改姿勢,不動位置', () => {
  const m = mountMascots({ doc: fakeDoc(), fidget: false });
  m.setPose('aww');
  assert.deepEqual(m.getState(), { pose: 'aww', placement: 'corner' });
});

test('不認得的姿勢會被擋掉,不會把 class 弄成垃圾', () => {
  const m = mountMascots({ doc: fakeDoc(), fidget: false });
  m.setPose('nope');
  assert.equal(m.getState().pose, 'idle');
});

test('根元素的 class 帶著目前的姿勢 —— CSS 就是靠這個選的', () => {
  const m = mountMascots({ doc: fakeDoc(), fidget: false });
  m.setPose('cheer');
  assert.ok(m.el.className.includes('mascots--cheer'), m.el.className);
  assert.ok(!m.el.className.includes('mascots--idle'), m.el.className);
});

test('home 模式只影響外觀,不是第三種 placement', () => {
  const m = mountMascots({ doc: fakeDoc(), home: true, fidget: false });
  assert.equal(m.getState().placement, 'corner');
  assert.ok(m.el.className.includes('mascots--home'), m.el.className);
});

/* ---------- 飛行與回家 ---------- */

test('flyTo 把位置換成 reveal,順便換姿勢', () => {
  const m = mountMascots({ doc: fakeDoc(), fidget: false });
  m.flyTo(anchorAt(300, 200), { pose: 'cheer' });
  assert.deepEqual(m.getState(), { pose: 'cheer', placement: 'reveal' });
});

// 這一條是真的會發生的:揭曉面板還掛著 hidden 的時候就呼叫 flyTo,
// rect 會是全 0,照算的話兩隻會飛到畫面左上角 (0,0) 卡在那裡。
test('錨點是隱藏的(rect 全 0)→ 退回角落,不要飛到左上角', () => {
  const m = mountMascots({ doc: fakeDoc(), fidget: false });
  m.flyTo(hiddenAnchor, { pose: 'cheer' });
  assert.equal(m.getState().placement, 'corner');
});

test('錨點給 null 也不能爆炸', () => {
  const m = mountMascots({ doc: fakeDoc(), fidget: false });
  m.flyTo(null, { pose: 'cheer' });
  assert.equal(m.getState().placement, 'corner');
});

test('home 回到 idle / corner', () => {
  const m = mountMascots({ doc: fakeDoc(), fidget: false });
  m.flyTo(anchorAt(300, 200), { pose: 'cheer' });
  m.home();
  assert.deepEqual(m.getState(), { pose: 'idle', placement: 'corner' });
});

/* ---------- 圖片版才有的規則 ---------- */

test('doze 不是 pose,setPose 擋掉它', () => {
  const m = mountMascots({ doc: fakeDoc(), fidget: false });
  m.setPose('doze');
  assert.equal(m.getState().pose, 'idle');
});

test('只有 idle 在一開始就有 src —— 其餘五張延後載入', () => {
  const m = mountMascots({ doc: fakeDoc(), fidget: false });
  const srcs = m.el.children.flatMap(c => c.src ? [c.src] : []);
  assert.equal(srcs.length, 1, `一開始只該有一個 src,實際 ${srcs.length}`);
  assert.ok(srcs[0].includes('idle'), srcs[0]);
});

test('fidget: false 時不排任何計時器 —— 不然 node --test 不會結束', () => {
  const m = mountMascots({ doc: fakeDoc(), fidget: false });
  assert.equal(typeof m.stop, 'function');
  m.stop();  // 呼叫兩次也不能爆
  m.stop();
});
