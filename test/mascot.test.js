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

// 只做這個模組真正會用到的最小 DOM。
//
// style 要真的記住 setProperty() 存的值(getPropertyValue() 讀得回來),
// 而且 getBoundingClientRect() 要照著目前的 --fly-x/--fly-y 位移計算 ——
// 不然測不出「flyTo() 拿目前畫面上的位置去算下一段位移」這件事:如果
// getBoundingClientRect() 永遠回同一個固定值,不管 flyTo() 內部怎麼算,
// 測試都會通過,等於沒測到。
function fakeDoc() {
  // 元素「沒有位移時」的基準矩形,模擬 position:fixed 的角落位置。
  const BASE = { left: 0, top: 0, width: 100, height: 80 };
  const make = () => {
    const props = {};
    // 預設模擬「位移瞬間生效」:getBoundingClientRect() 永遠照
    // --fly-x/--fly-y 目前的值算,量到的矩形跟這個值同步。
    //
    // 真瀏覽器不是這樣 —— transform transition 播放中途,
    // getBoundingClientRect() 讀到的是插值中的位置,但 --fly-x/--fly-y
    // 早就是這次呼叫設下去的終點值。__setDisplayedOffset() 讓測試能
    // 模擬這個「插值位置」跟「CSS 變數終點值」不同步的狀態:呼叫之後
    // getBoundingClientRect() 改回傳這裡指定的座標,不再跟 props 同步,
    // 直到 __clearDisplayedOffset() 或再次呼叫為止。
    let displayed = null;
    const el = {
      className: '',
      innerHTML: '',
      src: '',
      alt: '',
      style: {
        cssText: '',
        setProperty(name, value) { props[name] = value; },
        getPropertyValue(name) { return props[name] ?? ''; },
      },
      children: [],
      setAttribute() {},
      append(...kids) { el.children.push(...kids); },
      getBoundingClientRect: () => {
        const dx = displayed ? displayed.x : (parseFloat(props['--fly-x']) || 0);
        const dy = displayed ? displayed.y : (parseFloat(props['--fly-y']) || 0);
        return {
          x: BASE.left + dx, y: BASE.top + dy,
          left: BASE.left + dx, top: BASE.top + dy,
          width: BASE.width, height: BASE.height,
        };
      },
      __setDisplayedOffset(x, y) { displayed = { x, y }; },
      __clearDisplayedOffset() { displayed = null; },
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
//
// 先真的飛到一個正常錨點讓狀態變成 reveal,再飛去隱藏錨點 —— 不然從
// 一開始就是 corner 的話,「退回角落」跟「本來就在角落、什麼都沒做」
// 兩種結果長得一模一樣,測試分辨不出程式碼是真的處理了 rect 全 0
// 這個分支,還是根本沒進去過。同時斷言 --fly-x/--fly-y 真的被歸零,
// 不然位移可能還停在飛去正常錨點時的值,只是 placement 標籤被改回
// corner,畫面上兩隻其實還在半空中。
test('錨點是隱藏的(rect 全 0)→ 從 reveal 退回角落,位移歸零', () => {
  const m = mountMascots({ doc: fakeDoc(), fidget: false });
  m.flyTo(anchorAt(300, 200), { pose: 'cheer' });
  assert.equal(m.getState().placement, 'reveal');

  m.flyTo(hiddenAnchor, { pose: 'aww' });
  assert.equal(m.getState().placement, 'corner');
  assert.equal(m.el.style.getPropertyValue('--fly-x'), '0px');
  assert.equal(m.el.style.getPropertyValue('--fly-y'), '0px');
});

test('錨點給 null 也不能爆炸,一樣從 reveal 退回角落並歸零位移', () => {
  const m = mountMascots({ doc: fakeDoc(), fidget: false });
  m.flyTo(anchorAt(300, 200), { pose: 'cheer' });
  assert.equal(m.getState().placement, 'reveal');

  m.flyTo(null, { pose: 'aww' });
  assert.equal(m.getState().placement, 'corner');
  assert.equal(m.el.style.getPropertyValue('--fly-x'), '0px');
  assert.equal(m.el.style.getPropertyValue('--fly-y'), '0px');
});

test('home 回到 idle / corner', () => {
  const m = mountMascots({ doc: fakeDoc(), fidget: false });
  m.flyTo(anchorAt(300, 200), { pose: 'cheer' });
  m.home();
  assert.deepEqual(m.getState(), { pose: 'idle', placement: 'corner' });
});

// 這條釘死 flyTo() 的核心性質:算出來的位移只跟「角落位置」和「錨點
// 位置」有關,跟呼叫當下已經飛到哪裡無關。回歸測試:flyTo() 原本是拿
// el.getBoundingClientRect()(套用了目前位移之後的矩形)直接去算下一段
// 位移,如果連續兩次 flyTo() 中間沒有先 home() 讓位移歸零,算出來的結果
// 會偏掉「目前的位移量」那麼多 —— 曾經在瀏覽器裡實測撞到,兩隻被送到
// 螢幕外面(x 座標變成負的)。這裡沒有呼叫 home(),直接連續飛兩次錨點,
// 驗證第二次算出來的 --fly-x/--fly-y 跟「從角落直接飛到同一個錨點」
// 完全相同。
test('flyTo 連續呼叫不用先 home() 等歸零 —— 直接飛到下一個錨點,結果跟從角落飛過去一樣', () => {
  const chained = mountMascots({ doc: fakeDoc(), fidget: false });
  chained.flyTo(anchorAt(300, 200), { pose: 'cheer' }); // 先飛到 A,故意不 home()
  chained.flyTo(anchorAt(500, 100), { pose: 'empty' }); // 直接飛到 B

  const direct = mountMascots({ doc: fakeDoc(), fidget: false });
  direct.flyTo(anchorAt(500, 100), { pose: 'empty' }); // 從角落直接飛到 B

  assert.equal(
    chained.el.style.getPropertyValue('--fly-x'),
    direct.el.style.getPropertyValue('--fly-x'),
  );
  assert.equal(
    chained.el.style.getPropertyValue('--fly-y'),
    direct.el.style.getPropertyValue('--fly-y'),
  );
});

// 這條才是真正釘死修訂後的 flyTo():它完全不量自己。上面那條「連續呼叫」
// 測試只證明得出「結果剛好正確」,如果假 DOM 把位移模擬成瞬間生效
// (getBoundingClientRect 永遠照 --fly-x/--fly-y 算),那條測試就算
// flyTo() 還在犯「拿呼叫當下的自己去算」這個錯,也會通過 —— 因為假
// DOM 裡從來沒有「插值中」跟「終點值」不同步的情況。這裡故意用
// __setDisplayedOffset() 製造這個不同步:呼叫 flyTo() 飛到 A 之後,
// 把畫面矩形硬改成一個跟 home、跟 A 都不一樣的座標(模擬「飛往 A 的
// 轉場正在播到一半,還沒到 A」),然後在這個狀態下再飛到 B。如果
// flyTo() 有偷量自己,這裡算出來的 --fly-x/--fly-y 一定會被那個插值
// 座標污染,跟「從角落直接飛到 B」的結果對不起來。
test('flyTo 呼叫當下轉場正在播(矩形是插值位置,--fly-x 已是終點值)——下一次 flyTo 仍然算對', () => {
  const m = mountMascots({ doc: fakeDoc(), fidget: false });
  m.flyTo(anchorAt(300, 200), { pose: 'cheer' }); // 飛到 A,--fly-x/--fly-y 變成 A 的終點值

  // 模擬轉場播到一半:畫面矩形卡在插值中的某個點,跟 home(0,0)、
  // 跟終點值都不一樣。
  m.el.__setDisplayedOffset(37, 51);

  m.flyTo(anchorAt(500, 100), { pose: 'empty' }); // 在插值狀態下飛到 B

  const direct = mountMascots({ doc: fakeDoc(), fidget: false });
  direct.flyTo(anchorAt(500, 100), { pose: 'empty' }); // 從角落直接飛到 B

  assert.equal(
    m.el.style.getPropertyValue('--fly-x'),
    direct.el.style.getPropertyValue('--fly-x'),
  );
  assert.equal(
    m.el.style.getPropertyValue('--fly-y'),
    direct.el.style.getPropertyValue('--fly-y'),
  );
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
  // 只斷言 m.stop 是函式、呼叫兩次不爆炸,測不出「真的沒排計時器」——
  // 沒排跟排了但清得掉,兩種情況這樣寫都會通過。改注入假時鐘,直接
  // 斷言排程佇列裡的計時器數量是 0。
  const ft = fakeTimers();
  const m = mountMascots({ doc: fakeDoc(), timers: ft, fidget: false });
  assert.equal(ft.pending, 0, 'fidget: false 不該排任何計時器');
  m.stop();  // 呼叫兩次也不能爆,而且不該讓 pending 變化
  m.stop();
  assert.equal(ft.pending, 0);
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
