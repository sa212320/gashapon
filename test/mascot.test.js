// 吉祥物。沿用 test/dialog.test.js 那套假 DOM。
//
// 最要釘死的一句:**pose 屬於這一對,不屬於個別動物**。
//
// 修訂二(2026-09-30):素材改成 canvas 逐格播放的影片片段
// (docs/superpowers/specs/2026-09-30-mascot-video-segments-design.md)。
// 播放規則在 test/mascot-player.test.js 測;這裡只測 mascot.js 自己的事:
// 狀態、接線、時鐘、stop()。
//
// 每個 mountMascots() 都要走 mount() 這個 helper:它注入 manifest 與
// 假時鐘。沒注入的話逐格時鐘會用真的 setTimeout 一直重排,node --test
// 永遠不會結束。
import test from 'node:test';
import assert from 'node:assert/strict';

import { POSES, mountMascots } from '../shared/js/mascot.js';
import { makeManifest } from './mascot-route.test.js';

// 只做這個模組真正會用到的最小 DOM:建元素、掛上去、style 變數、canvas 2d。
// canvas 的 2d context 只記錄呼叫,測試看「畫了哪張圖的哪一格」。
function fakeDoc() {
  const make = () => {
    const props = {};
    const el = {
      className: '',
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
        setProperty(name, value) { props[name] = value; },
        getPropertyValue(name) { return props[name] ?? ''; },
      },
      children: [],
      setAttribute() {},
      append(...kids) { el.children.push(...kids); },
    };
    return el;
  };
  const body = make();
  return { createElement: make, body };
}

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

test('初始狀態是 idle', () => {
  const m = mount();
  assert.deepEqual(m.getState(), { pose: 'idle' });
});

test('setPose 換姿勢', () => {
  const m = mount();
  m.setPose('aww');
  assert.deepEqual(m.getState(), { pose: 'aww' });
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

test('fidget: false 時永遠不插播小動作', async () => {
  const m = mount({ rng: () => 0, fidget: false });
  await settle();
  const ctx = canvasOf(m).__ctx;
  m.timers.tick(1000 / 16 * 500);
  assert.ok(!ctx.ops.some(o => o[0] === 'draw' && o[1].includes('idle-ear')));
});

test('小動作預設會插播(吉祥物永遠在角落)', async () => {
  const m = mount({ rng: () => 0 });
  await settle();
  const ctx = canvasOf(m).__ctx;
  m.timers.tick(1000 / 16 * 200);
  assert.ok(ctx.ops.some(o => o[0] === 'draw' && o[1].includes('idle-ear')));
});

test('回傳的 API 只剩 setPose / getState / stop / el(不再有 flyTo / home)', () => {
  const m = mount();
  assert.deepEqual(Object.keys(m).filter(k => k !== 'timers').sort(), ['el', 'getState', 'setPose', 'stop']);
});
