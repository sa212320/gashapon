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

// 假時鐘:待機排程(scheduleFidget / doze)可以注入 timers,測試才能
// 同步把時間推進去,驗證那段邏輯(包括競態保護)真的會被跑到 ——
// 不然全部測試都傳 fidget: false 的代價,就是這 20 行永遠沒有自動
// 測試執行過。tick 要處理「job 執行時又排了新 job」:用 snapshot
// 陣列跑迴圈,新排的 job 進真正的 Map,不會在同一次 tick 裡被誤觸發。
function fakeTimers() {
  let now = 0;
  let id = 0;
  const jobs = new Map();
  return {
    set: (fn, ms) => { jobs.set(++id, { at: now + ms, fn }); return id; },
    clear: (i) => jobs.delete(i),
    tick(ms) {
      now += ms;
      for (const [i, j] of [...jobs].sort((a, b) => a[1].at - b[1].at)) {
        if (j.at <= now) { jobs.delete(i); j.fn(); }
      }
    },
    get pending() { return jobs.size; },
  };
}

// 找目前正在淡入顯示的那張 <img>(class 帶 mascots__img--visible)的 src。
function visibleSrc(m) {
  return m.el.children.find(c => c.className.includes('mascots__img--visible'))?.src;
}

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

/* ---------- 待機排程(注入假時鐘,真的把 doze 邏輯跑過一次) ---------- */

test('排程時間到,切到 doze;getState().pose 仍然是 idle(doze 不是 pose)', () => {
  const ft = fakeTimers();
  const m = mountMascots({ doc: fakeDoc(), timers: ft, rng: () => 0 });
  ft.tick(4000);   // DOZE_GAP 下限,rng() 固定回 0 時排程剛好在這裡到期
  assert.ok(visibleSrc(m).includes('doze'), visibleSrc(m));
  assert.equal(m.getState().pose, 'idle');
});

test('doze 停留 1.6 秒後,自己切回 idle', () => {
  const ft = fakeTimers();
  const m = mountMascots({ doc: fakeDoc(), timers: ft, rng: () => 0 });
  ft.tick(4000);   // 進入 doze
  ft.tick(1600);   // DOZE_LEN 到期
  assert.ok(visibleSrc(m).includes('idle'), visibleSrc(m));
});

// 這是那條從沒被自動測試跑過的競態保護:doze 停留期間如果姿勢被換掉,
// 回切的計時器到期時**不可以**把姿勢搶回 idle —— 圖已經是使用者要的
// 新姿勢了。
test('doze 期間換了姿勢,回切計時器到期時不會搶回 idle', () => {
  const ft = fakeTimers();
  const m = mountMascots({ doc: fakeDoc(), timers: ft, rng: () => 0 });
  ft.tick(4000);          // 進入 doze
  m.setPose('cheer');     // 使用者在打瞌睡途中換了姿勢
  ft.tick(1600);          // 內層計時器到期
  assert.equal(m.getState().pose, 'cheer');
  assert.ok(visibleSrc(m).includes('cheer'), visibleSrc(m));
});

// stop() 的契約是「完全停掉待機排程」。doze 期間呼叫 stop() 之後,
// 就算把時間推得再遠,也不該再有任何 paint() 或圖片變動 —— 不然就是
// 還有一個計時器沒被清掉,躲在背景等著把牠們改回 idle。
test('doze 期間呼叫 stop(),往後推進時間不會再有任何變化', () => {
  const ft = fakeTimers();
  const m = mountMascots({ doc: fakeDoc(), timers: ft, rng: () => 0 });
  ft.tick(4000);   // 進入 doze
  const srcBefore = visibleSrc(m);
  const classBefore = m.el.className;
  m.stop();
  ft.tick(1_000_000);   // 把假時鐘推到很遠的未來
  assert.equal(visibleSrc(m), srcBefore, 'stop() 之後不該再有任何 src 變動');
  assert.equal(m.el.className, classBefore, 'stop() 之後不該再有任何 paint() 變動');
  assert.equal(ft.pending, 0, 'stop() 之後不該還有計時器留在排程裡');
});
