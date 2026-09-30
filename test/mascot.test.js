// 吉祥物。沿用 test/dialog.test.js 那套假 DOM。
//
// 最要釘死的一句:**pose 屬於這一對,不屬於個別動物**。
//
// 修訂二(2026-09-30):素材改成 canvas 逐格播放的影片片段
// (docs/superpowers/specs/2026-09-30-mascot-video-segments-design.md)。
// 播放規則在 test/mascot-player.test.js 測;這裡只測 mascot.js 自己的事:
// 狀態、飛行、接線、時鐘、stop()。
//
// 每個 mountMascots() 都要走 mount() 這個 helper:它注入 manifest 與
// 假時鐘。沒注入的話逐格時鐘會用真的 setTimeout 一直重排,node --test
// 永遠不會結束。
import test from 'node:test';
import assert from 'node:assert/strict';

import { POSES, mountMascots } from '../shared/js/mascot.js';
import { makeManifest } from './mascot-route.test.js';

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
      width: 0,
      height: 0,
      __ctx: null,
      getContext(kind) {
        if (kind !== '2d') return null;
        el.__ctx ??= {
          ops: [],
          set globalAlpha(v) { this.ops.push(['alpha', v]); },
          clearRect(...a) { this.ops.push(['clear', ...a]); },
          drawImage(img, ...a) { this.ops.push(['draw', img.url, ...a]); },
        };
        return el.__ctx;
      },
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

// 假時鐘:逐格時鐘與飛行傾斜都用注入的 timers,測試同步把時間推進去。
// tick(ms) 逐個 job 推進時間 —— 逐格時鐘在 callback 裡重排下一格,
// tick(1000/16*200) 才會真的前進 200 格。
function fakeTimers() {
  let now = 0;
  let id = 0;
  const jobs = new Map();
  return {
    set: (fn, ms) => { jobs.set(++id, { at: now + ms, fn }); return id; },
    clear: (i) => jobs.delete(i),
    tick(ms) {
      // 逐個 job 推進:先把 now 設成那個 job 的到期時間再執行,這樣
      // callback 裡重排的下一格(now + 62.5)才會落在目標時間之內,
      // 同一次 tick 裡繼續被執行。
      const end = now + ms;
      for (;;) {
        const due = [...jobs].filter(([, j]) => j.at <= end).sort((a, b) => a[1].at - b[1].at);
        if (!due.length) break;
        const [i, j] = due[0];
        jobs.delete(i);
        now = j.at;
        j.fn();
      }
      now = end;
    },
    get pending() { return jobs.size; },
  };
}

// 所有素材一律「立刻載好」:回傳帶網址的假圖。
const instantImage = (url) => Promise.resolve({ url });

function mount(opts = {}) {
  const timers = opts.timers ?? fakeTimers();
  const m = mountMascots({
    doc: fakeDoc(),
    manifest: makeManifest(),
    loadImage: instantImage,
    timers,
    ...opts,
  });
  return Object.assign(m, { timers });
}

// 讓 createSheets 那串 promise 跑完。假圖都是已 resolve 的 promise,
// setImmediate 在 microtask 佇列清空之後才跑,所以一次就能等到全部載完
// (數 microtask 的次數不可靠:17 段依序 await,每段要好幾個 tick)。
function settle() {
  return new Promise(r => setImmediate(r));
}

function canvasOf(m) { return m.el.children.find(c => c.getContext); }


test('POSES 就是那五個,順序固定', () => {
  assert.deepEqual([...POSES], ['idle', 'watch', 'cheer', 'aww', 'empty']);
});

test('初始狀態是 idle / corner', () => {
  const m = mount();
  assert.deepEqual(m.getState(), { pose: 'idle', placement: 'corner' });
});

test('setPose 只改姿勢,不動位置', () => {
  const m = mount();
  m.setPose('aww');
  assert.deepEqual(m.getState(), { pose: 'aww', placement: 'corner' });
});

test('不認得的姿勢會被擋掉,不會把 class 弄成垃圾', () => {
  const m = mount();
  m.setPose('nope');
  assert.equal(m.getState().pose, 'idle');
});

test('根元素的 class 帶著目前的姿勢 —— CSS 就是靠這個選的', () => {
  const m = mount();
  m.setPose('cheer');
  assert.ok(m.el.className.includes('mascots--cheer'), m.el.className);
  assert.ok(!m.el.className.includes('mascots--idle'), m.el.className);
});

test('home 模式只影響外觀,不是第三種 placement', () => {
  const m = mount({ home: true });
  assert.equal(m.getState().placement, 'corner');
  assert.ok(m.el.className.includes('mascots--home'), m.el.className);
});

/* ---------- 飛行與回家 ---------- */

test('flyTo 把位置換成 reveal,順便換姿勢', () => {
  const m = mount();
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
  const m = mount();
  m.flyTo(anchorAt(300, 200), { pose: 'cheer' });
  assert.equal(m.getState().placement, 'reveal');

  m.flyTo(hiddenAnchor, { pose: 'aww' });
  assert.equal(m.getState().placement, 'corner');
  assert.equal(m.el.style.getPropertyValue('--fly-x'), '0px');
  assert.equal(m.el.style.getPropertyValue('--fly-y'), '0px');
});

test('錨點給 null 也不能爆炸,一樣從 reveal 退回角落並歸零位移', () => {
  const m = mount();
  m.flyTo(anchorAt(300, 200), { pose: 'cheer' });
  assert.equal(m.getState().placement, 'reveal');

  m.flyTo(null, { pose: 'aww' });
  assert.equal(m.getState().placement, 'corner');
  assert.equal(m.el.style.getPropertyValue('--fly-x'), '0px');
  assert.equal(m.el.style.getPropertyValue('--fly-y'), '0px');
});

test('home 回到 idle / corner', () => {
  const m = mount();
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
  const chained = mount();
  chained.flyTo(anchorAt(300, 200), { pose: 'cheer' }); // 先飛到 A,故意不 home()
  chained.flyTo(anchorAt(500, 100), { pose: 'empty' }); // 直接飛到 B

  const direct = mount();
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
  const m = mount();
  m.flyTo(anchorAt(300, 200), { pose: 'cheer' }); // 飛到 A,--fly-x/--fly-y 變成 A 的終點值

  // 模擬轉場播到一半:畫面矩形卡在插值中的某個點,跟 home(0,0)、
  // 跟終點值都不一樣。
  m.el.__setDisplayedOffset(37, 51);

  m.flyTo(anchorAt(500, 100), { pose: 'empty' }); // 在插值狀態下飛到 B

  const direct = mount();
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

/* ---------- doze 已經不是 pose ---------- */

test('doze 不是 pose,setPose 擋掉它', () => {
  const m = mount();
  m.setPose('doze');
  assert.equal(m.getState().pose, 'idle');
});

/* ---------- canvas 與逐格時鐘 ---------- */

test('掛上一張 canvas,尺寸照 manifest.frame', () => {
  const m = mount();
  const c = canvasOf(m);
  assert.ok(c, '應該有一張 canvas');
  assert.equal(c.width, 48);
  assert.equal(c.height, 43);
  assert.equal(m.el.style.getPropertyValue('--mascot-aspect'), '48 / 43');
});

test('時鐘每 1000/fps 毫秒前進一格並重畫', async () => {
  const m = mount();
  await settle();
  const ctx = canvasOf(m).__ctx;
  ctx.ops.length = 0;
  m.timers.tick(1000 / 16);
  assert.ok(ctx.ops.some(o => o[0] === 'draw' && o[1].includes('seg/idle-loop.webp')), JSON.stringify(ctx.ops));
});

test('setPose 交給播放器:幾格之後畫的是 idle-watch', async () => {
  const m = mount();
  await settle();
  m.setPose('watch');
  assert.equal(m.getState().pose, 'watch', 'getState 立刻回報最後一次要求的目標');
  const ctx = canvasOf(m).__ctx;
  ctx.ops.length = 0;
  m.timers.tick(1000 / 16);
  assert.ok(ctx.ops.some(o => o[0] === 'draw' && o[1].includes('seg/idle-watch.webp')), JSON.stringify(ctx.ops));
});

test('home() 之後立刻 setPose(watch):watch 贏(pending 只有一格)', () => {
  const m = mount();
  m.flyTo(anchorAt(300, 200), { pose: 'cheer' });
  m.home();
  m.setPose('watch');
  assert.deepEqual(m.getState(), { pose: 'watch', placement: 'corner' });
});

test('stop() 清掉逐格時鐘:之後推進時間不再畫、不留計時器', async () => {
  const m = mount();
  await settle();
  m.stop();
  const ctx = canvasOf(m).__ctx;
  ctx.ops.length = 0;
  m.timers.tick(100_000);
  assert.equal(ctx.ops.length, 0);
  assert.equal(m.timers.pending, 0);
});

test('manifest 還沒到時 setPose 不遺失:到了之後播放器從那個目標出發', async () => {
  let resolve;
  const m = mount({ manifest: null, loadManifest: () => new Promise(r => { resolve = r; }) });
  m.setPose('cheer');
  assert.equal(m.getState().pose, 'cheer');
  resolve(makeManifest());
  await settle();
  const ctx = canvasOf(m).__ctx;
  ctx.ops.length = 0;
  m.timers.tick(1000 / 16);
  assert.ok(ctx.ops.some(o => o[0] === 'draw' && o[1].includes('seg/idle-cheer.webp')), JSON.stringify(ctx.ops));
});

test('manifest 載入失敗只警告,不丟錯、不排時鐘', async () => {
  const warns = [];
  const origWarn = console.warn;
  console.warn = (...a) => warns.push(a);
  try {
    const m = mount({ manifest: null, loadManifest: () => Promise.reject(new Error('404')) });
    await settle();
    m.setPose('cheer');
    assert.equal(m.getState().pose, 'cheer');
    assert.equal(m.timers.pending, 0);
    assert.equal(warns.length, 1);
  } finally {
    console.warn = origWarn;
  }
});

test('不合法的 manifest 同樣只警告(部署漏檔不能讓整頁掛掉)', async () => {
  const warns = [];
  const origWarn = console.warn;
  console.warn = (...a) => warns.push(a);
  try {
    const bad = makeManifest({ drop: ['watch-cheer'] });
    const m = mount({ manifest: null, loadManifest: () => Promise.resolve(bad) });
    await settle();
    assert.equal(m.timers.pending, 0);
    assert.match(String(warns[0]), /watch-cheer/);
  } finally {
    console.warn = origWarn;
  }
});

test('小動作只在角落時允許:飛到揭曉區就關掉,回家再打開', async () => {
  const m = mount({ rng: () => 0 });
  await settle();
  m.flyTo(anchorAt(300, 200));           // 不換姿勢,只飛
  const ctx = canvasOf(m).__ctx;
  ctx.ops.length = 0;
  m.timers.tick(1000 / 16 * 200);
  assert.ok(!ctx.ops.some(o => o[0] === 'draw' && o[1].includes('idle-ear')), '揭曉區不插播');
  m.home();
  ctx.ops.length = 0;
  m.timers.tick(1000 / 16 * 200);
  assert.ok(ctx.ops.some(o => o[0] === 'draw' && o[1].includes('idle-ear')), '回到角落要插播');
});

test('fidget: false 時永遠不插播小動作', async () => {
  const m = mount({ rng: () => 0, fidget: false });
  await settle();
  const ctx = canvasOf(m).__ctx;
  m.timers.tick(1000 / 16 * 500);
  assert.ok(!ctx.ops.some(o => o[0] === 'draw' && o[1].includes('idle-ear')));
});

test('根元素不再帶 squash / bounce class', async () => {
  const m = mount();
  m.setPose('cheer');
  m.flyTo(anchorAt(300, 200), { pose: 'cheer' });
  assert.ok(!/squash|bounce/.test(m.el.className), m.el.className);
});
