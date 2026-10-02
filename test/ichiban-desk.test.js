import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DESK_COLORS, faceColorFor, critterFor, tiltFor, layoutDesk, MIN_CARD_W, MAX_CARD_W, CARD_ASPECT,
} from '../ichiban/js/desk-layout.js';

test('7 個冷色,互不相同', () => {
  assert.equal(DESK_COLORS.length, 7);
  assert.equal(new Set(DESK_COLORS).size, 7);
});

test('每個底色都夠深,白色印刷(雪花、角色頭)看得見', () => {
  for (const c of DESK_COLORS) {
    const n = parseInt(c.slice(1), 16);
    const lum = (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
    assert.ok(lum < 0.88, `${c} 太淺(${lum.toFixed(2)})`);
  }
});

test('顏色 / 角色 / 歪斜只看號碼:同一個號碼永遠一樣', () => {
  for (const no of [1, 7, 8, 99, 150]) {
    assert.equal(faceColorFor(no), faceColorFor(no));
    assert.equal(critterFor(no), critterFor(no));
    assert.equal(tiltFor(no), tiltFor(no));
  }
  assert.equal(faceColorFor(1), DESK_COLORS[0]);
  assert.equal(faceColorFor(8), DESK_COLORS[0]);
  assert.equal(faceColorFor(7), DESK_COLORS[6]);
});

test('角色兩隻都會出現,歪斜在 ±4 度內', () => {
  const kinds = new Set();
  for (let no = 1; no <= 20; no++) {
    kinds.add(critterFor(no));
    assert.ok(Math.abs(tiltFor(no)) <= 4);
  }
  assert.deepEqual([...kinds].sort(), ['ermine', 'fox']);
});

test('桌上小卡跟大卡一樣是橫的(34:15),只差大小', () => {
  const l = layoutDesk({ count: 30, width: 358, height: 500 });
  assert.ok(l.cardW > l.cardH);
  assert.equal(l.cardH, Math.round(l.cardW * 15 / 34));
});

test('layoutDesk:張數少就用最大卡', () => {
  const l = layoutDesk({ count: 5, width: 358, height: 500 });
  assert.equal(l.cardW, MAX_CARD_W);
  assert.equal(l.cardH, Math.round(MAX_CARD_W * CARD_ASPECT));
});

test('layoutDesk:縮到剛好放得下', () => {
  const l = layoutDesk({ count: 40, width: 358, height: 500 });
  assert.ok(l.cardW < MAX_CARD_W && l.cardW >= MIN_CARD_W);
  assert.ok(l.rows * l.cardH + (l.rows - 1) * l.gap <= 500);
  assert.ok(l.cols * l.rows >= 40);
  // 桌面變矮,卡只會變小或一樣,不會變大
  assert.ok(layoutDesk({ count: 40, width: 358, height: 380 }).cardW <= l.cardW);
});

test('layoutDesk:太多張就停在最小卡寬,改捲動', () => {
  const l = layoutDesk({ count: 400, width: 358, height: 500 });
  assert.equal(l.cardW, MIN_CARD_W);
  assert.ok(l.rows * l.cardH > 500);
});

test('layoutDesk:欄數不會是 7 的倍數(否則同一欄上下同色)', () => {
  for (let width = 200; width <= 1400; width += 7) {
    for (const count of [30, 90, 300]) {
      const l = layoutDesk({ count, width, height: 600 });
      if (count > l.cols) assert.notEqual(l.cols % 7, 0, `width ${width} count ${count} cols ${l.cols}`);
    }
  }
});

test('layoutDesk:0 張、極窄都不會爆', () => {
  assert.equal(layoutDesk({ count: 0, width: 358, height: 500 }).rows, 0);
  assert.ok(layoutDesk({ count: 10, width: 10, height: 500 }).cols >= 1);
});

function el(extra = {}) {
  const e = {
    style: { _v: {}, setProperty(k, v) { this._v[k] = v; }, transform: '' },
    dataset: {}, attrs: {}, children: [], hidden: false,
    classList: { _s: new Set(), add(...c) { c.forEach(x => this._s.add(x)); }, remove(...c) { c.forEach(x => this._s.delete(x)); }, contains(c) { return this._s.has(c); } },
    setAttribute(k, v) { e.attrs[k] = v; },
    replaceChildren(...k) { e.children = k; },
    addEventListener() {},
    getContext() { return new Proxy({}, { get: () => () => {}, set: () => true }); },
    offsetLeft: 0, offsetTop: 0, clientWidth: 390, clientHeight: 540, scrollTop: 0,
    ...extra,
  };
  return e;
}

test('桌面:只為還沒抽的籤建按鈕,號碼與歪斜跟著號碼走', async () => {
  const keys = ['document', 'window', 'getComputedStyle', 'requestAnimationFrame', 'ResizeObserver'];
  const saved = Object.fromEntries(keys.map(k => [k, globalThis[k]]));
  globalThis.document = { createElement: () => el() };
  globalThis.window = { devicePixelRatio: 2 };
  globalThis.getComputedStyle = () => ({ paddingLeft: '16px', paddingRight: '16px', paddingTop: '14px', paddingBottom: '28px' });
  globalThis.requestAnimationFrame = fn => { fn(); return 1; };
  globalThis.ResizeObserver = class { observe() {} };
  try {
    const { createDeskView } = await import('../ichiban/js/ui.js');
    const pileEl = el();
    const desk = createDeskView({ deskEl: el(), pileEl, canvasEl: el(), boxEl: el(), emptyStateEl: el(), onPick() {} });
    desk.render({ tickets: [1, 2, 3, 4, 5].map(no => ({ no, prizeId: 'p', drawn: no === 2 })) });
    assert.deepEqual(pileEl.children.map(b => b.dataset.no), ['1', '3', '4', '5']);
    assert.equal(pileEl.children[1].attrs['aria-label'], '抽 3 號籤');
    assert.equal(pileEl.children[1].style.transform, `rotate(${tiltFor(3)}deg)`);
  } finally {
    for (const k of keys) globalThis[k] = saved[k];
  }
});

async function withDesk(fn) {
  const keys = ['document', 'window', 'getComputedStyle', 'requestAnimationFrame', 'ResizeObserver'];
  const saved = Object.fromEntries(keys.map(k => [k, globalThis[k]]));
  const made = [];
  globalThis.document = { createElement: tag => { const e = el(); e.tag = tag; made.push(e); return e; } };
  globalThis.window = { devicePixelRatio: 2 };
  globalThis.getComputedStyle = () => ({ paddingLeft: '16px', paddingRight: '16px', paddingTop: '14px', paddingBottom: '28px' });
  globalThis.requestAnimationFrame = f => { f(); return 1; };
  const observers = [];
  globalThis.ResizeObserver = class { constructor(cb) { observers.push(cb); } observe() {} };
  try {
    const { createDeskView } = await import('../ichiban/js/ui.js');
    const handlers = {};
    const deskEl = el({ clientWidth: 375, addEventListener: (k, f) => { handlers[k] = f; } });
    const canvasEl = el();
    const pileEl = el();
    const boxEl = el({ hidden: true, offsetHeight: 100 });
    const desk = createDeskView({ deskEl, pileEl, canvasEl, boxEl, emptyStateEl: el(), onPick() {} });
    const resized = () => observers.forEach(cb => cb([]));
    return await fn({ desk, deskEl, canvasEl, pileEl, boxEl, handlers, made, resized });
  } finally {
    for (const k of keys) globalThis[k] = saved[k];
  }
}

test('捲動重畫時重用每張卡畫好的小圖,不重畫整張票卡(review: 捲動效能)', async () => {
  await withDesk(async ({ desk, handlers, made }) => {
    desk.render({ tickets: [1, 2, 3, 4].map(no => ({ no, prizeId: 'p', drawn: false })) });
    const sprites = () => made.filter(e => e.tag === 'canvas').length;
    const first = sprites();
    assert.equal(first, 4, '每張卡一張小圖');
    handlers.scroll();
    handlers.scroll();
    assert.equal(sprites(), first, '捲動不該再建小圖');
  });
});

test('canvas 的 CSS 尺寸等於畫的尺寸(有傳統捲軸時不能被拉伸,review)', async () => {
  await withDesk(async ({ desk, canvasEl }) => {
    desk.render({ tickets: [{ no: 1, prizeId: 'p', drawn: false }] });
    assert.equal(canvasEl.style.width, '375px');
    assert.equal(canvasEl.style.height, '540px');
  });
});


// 開場動畫(2026-10-02):rAF 跟時間都由測試推進
async function withDealDesk(fn) {
  const queue = [];
  let now = 0;
  const savedNow = performance.now;
  performance.now = () => now;
  try {
    await withDesk(async ctx => {
      globalThis.requestAnimationFrame = f => { queue.push(f); return queue.length; };
      const tick = ms => { now += ms; const q = queue.splice(0); q.forEach(f => f(now)); };
      await fn({ ...ctx, tick });
    });
  } finally {
    performance.now = savedNow;
  }
}

const tickets = n => Array.from({ length: n }, (_, i) => ({ no: i + 1, prizeId: 'p', drawn: false }));

test('開場動畫:播放中按鈕不能點、盒子出現;播完恢復', async () => {
  await withDealDesk(async ({ desk, tick, pileEl, boxEl }) => {
    desk.deal({ tickets: tickets(5) });
    assert.equal(pileEl.style.pointerEvents, 'none');
    assert.equal(boxEl.hidden, false);
    assert.equal(desk.isDealing, true);
    for (let i = 0; i < 80; i++) tick(50);   // 搖箱子 0.9 秒 + 最多 5 波 + 飛行,4 秒一定播完
    assert.equal(desk.isDealing, false);
    assert.equal(pileEl.style.pointerEvents, '');
  });
});

test('開場動畫:觸發它的那一下點擊(桌面裡的「重新鋪一桌」)不能把它跳過', async () => {
  await withDealDesk(async ({ desk, handlers }) => {
    desk.deal({ tickets: tickets(20) });
    handlers.click({ target: {} });   // 同一個點擊冒泡到桌面
    assert.equal(desk.isDealing, true);
  });
});

test('開場動畫:點一下桌面就直接全部排好', async () => {
  await withDealDesk(async ({ desk, handlers, pileEl, tick }) => {
    desk.deal({ tickets: tickets(20) });
    tick(16);
    handlers.click({ target: {} });
    assert.equal(desk.isDealing, false);
    assert.equal(pileEl.style.pointerEvents, '');
  });
});

test('一般 render 不播開場動畫', async () => {
  await withDealDesk(async ({ desk, pileEl, boxEl }) => {
    desk.render({ tickets: tickets(5) });
    assert.equal(desk.isDealing, false);
    assert.notEqual(pileEl.style.pointerEvents, 'none');
    assert.equal(boxEl.hidden, true);
  });
});

test('開場動畫中又 render(轉手機、改設定):動畫直接結束', async () => {
  await withDealDesk(async ({ desk }) => {
    desk.deal({ tickets: tickets(10) });
    desk.render({ tickets: tickets(10) });
    assert.equal(desk.isDealing, false);
  });
});

test('ResizeObserver 剛掛上時那一次(尺寸沒變)不能把進頁面的開場動畫收掉', async () => {
  await withDealDesk(async ({ desk, resized }) => {
    desk.deal({ tickets: tickets(10) });
    resized();
    assert.equal(desk.isDealing, true);
  });
});

test('桌面真的變大小(轉手機)才重排,動畫直接結束', async () => {
  await withDealDesk(async ({ desk, resized, deskEl }) => {
    desk.deal({ tickets: tickets(10) });
    deskEl.clientWidth = 700;
    resized();
    assert.equal(desk.isDealing, false);
  });
});

test('連射:每射一發,箱子就抖一下(後座力)', async () => {
  await withDealDesk(async ({ desk, tick, boxEl }) => {
    const kicks = [];
    boxEl.animate = (frames, opts) => { kicks.push(frames); return { cancel() {} }; };
    desk.deal({ tickets: tickets(20) });
    for (let i = 0; i < 100; i++) tick(50);
    // 20 張、每發 1~2 張 → 10~20 發
    assert.ok(kicks.length >= 10 && kicks.length <= 20, `抖了 ${kicks.length} 下`);
  });
});
