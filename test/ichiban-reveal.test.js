// 開籤演出的煙霧測試。
//
// 為什麼值得寫:ui.js 的演出全是私有函式,一個名字打錯或一段被誤刪,
// 語法檢查跟其他測試都照樣全綠,要等真的在瀏覽器點下去才會 ReferenceError
// ——「點籤紙沒反應」實際上線過一次,原因就是 animate / originOffset / reset
// 三支被一次砍掉。這裡用最小的 DOM 替身把 hold → tear 真的跑一遍,
// 只要有任何一支不存在就會炸在這裡。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// 只要能被呼叫就好:這裡驗的是「退路有沒有跑完」,不是畫出來長什麼樣。
function fakeCtx() {
  const noop = () => {};
  return new Proxy({ measureText: () => ({ width: 10 }) }, {
    get: (t, k) => (k in t ? t[k] : noop),
    set: () => true,
  });
}

function stubEl() {
  const el = {
    style: {
      _v: {},
      setProperty(k, v) { this._v[k] = v; },
      getPropertyValue(k) { return this._v[k] ?? ''; },
    },
    dataset: {},
    hidden: false,
    offsetWidth: 340,
    _l: {},
    addEventListener(type, fn, opts) {
      (el._l[type] ??= []).push(fn);
      opts?.signal?.addEventListener('abort', () => { el._l[type] = el._l[type].filter(f => f !== fn); });
    },
    removeEventListener(type, fn) { el._l[type] = (el._l[type] ?? []).filter(f => f !== fn); },
    dispatch(type, ev) { for (const fn of [...(el._l[type] ?? [])]) fn(ev); },
    setPointerCapture() {},
    classList: { add() {}, remove() {} },
    children: [],
    removeAttribute(k) { delete el.dataset[k.replace(/^data-/, '')]; },
    setAttribute() {},
    appendChild(c) { el.children.push(c); },
    replaceChildren() { el.children.length = 0; },
    getBoundingClientRect() { return { left: 0, top: 0, width: 340, height: 150 }; },
    // 真瀏覽器會回一個 Animation;這裡回一個立刻完成的替身。
    animate() { return { finished: Promise.resolve(), finish() {}, cancel() {} }; },
    // 票卡是畫在 canvas 上的。Node 裡沒有 three,所以測試跑到的是
    // 「three.js 載不起來 → 直接把獎項畫出來」那條退路 —— 這正是最該有人走過的路徑。
    width: 0,
    height: 0,
    getContext() { return fakeCtx(); },
  };
  return el;
}

const EL_KEYS = ['dim', 'tearCard', 'canvas', 'cardResult', 'cardBadge', 'cardName', 'aura', 'particles', 'ticketActions', 'holdCancelBtn', 'tearBtn', 'tearHint'];

async function withDomStubs(fn) {
  const saved = { document: globalThis.document, window: globalThis.window };
  globalThis.document = { createElement: () => stubEl(), createDocumentFragment: () => stubEl() };
  globalThis.window = { innerWidth: 1024, innerHeight: 768 };
  try {
    return await fn();
  } finally {
    globalThis.document = saved.document;
    globalThis.window = saved.window;
  }
}

test('hold 之後 tear,每一步的私有函式都存在', async () => {
  await withDomStubs(async () => {
    const { createRevealer } = await import('../ichiban/js/ui.js');
    const els = Object.fromEntries(EL_KEYS.map(k => [k, stubEl()]));
    const revealer = createRevealer(els);

    await revealer.hold({ tier: 'A', name: '大獎', no: 7 }, { rect: { left: 10, top: 20, width: 60, height: 84 }, tilt: 2 });
    assert.equal(revealer.isPlaying, false);

    await revealer.tear();
    assert.equal(els.cardName.textContent, '大獎');
    assert.equal(els.cardBadge.textContent, 'A賞');
  });
});

test('G 賞(最樸素的那一階)也走得完', async () => {
  await withDomStubs(async () => {
    const { createRevealer } = await import('../ichiban/js/ui.js');
    const els = Object.fromEntries(EL_KEYS.map(k => [k, stubEl()]));
    const revealer = createRevealer(els);
    await revealer.hold({ tier: 'G', name: '銘謝惠顧', no: 1 }, null);
    await revealer.tear();
    assert.equal(els.cardName.textContent, '銘謝惠顧');
  });
});

test('最後一抽賞:holdBonus + tear,獎項留在無障礙用的文字裡', async () => {
  await withDomStubs(async () => {
    const { createRevealer } = await import('../ichiban/js/ui.js');
    const els = Object.fromEntries(EL_KEYS.map(k => [k, stubEl()]));
    const revealer = createRevealer(els);
    await revealer.holdBonus('最後一抽大獎');
    await revealer.tear(0);
    // 票卡上的字是畫進貼圖的,DOM 裡只剩這一份給螢幕閱讀器 —— 所以它一定要對。
    assert.equal(els.cardName.textContent, '最後一抽大獎');
    assert.equal(els.cardBadge.textContent, '🌟 最後一抽賞');
  });
});

test('取消:票卡飛回去,不會丟例外', async () => {
  await withDomStubs(async () => {
    const { createRevealer } = await import('../ichiban/js/ui.js');
    const els = Object.fromEntries(EL_KEYS.map(k => [k, stubEl()]));
    const revealer = createRevealer(els);
    const origin = { rect: { left: 5, top: 5, width: 60, height: 84 }, tilt: -3 };
    await revealer.hold({ tier: 'C', name: '三獎', no: 3 }, origin);
    await revealer.cancelReturn(origin);
    revealer.clear();
  });
});

/* ---------- 手指撕籤(2026-10-02) ---------- */
const tearEls = () => Object.fromEntries(EL_KEYS.map(k => [k, stubEl()]));
const ev = (clientX = 0) => ({ clientX, pointerId: 1, button: 0, isPrimary: true, stopPropagation() {}, preventDefault() {} });

test('waitForTear:手指拉超過 3% 呼叫 onCommit 一次、收起取消;拉到 70% resolve { from }', async () => {
  await withDomStubs(async () => {
    const { createRevealer } = await import('../ichiban/js/ui.js');
    const els = tearEls();
    const r = createRevealer(els);
    await r.hold({ tier: 'C', name: '三獎', no: 3 }, null);
    let commits = 0;
    const p = r.waitForTear({ onCommit: () => commits++ });
    assert.equal(els.tearHint.hidden, false);
    assert.equal(els.holdCancelBtn.hidden, false);
    els.tearCard.dispatch('pointerdown', ev(0));
    els.tearCard.dispatch('pointermove', ev(340 * 0.05));
    assert.equal(commits, 1);
    assert.equal(els.holdCancelBtn.hidden, true);
    assert.equal(els.tearHint.hidden, true);
    els.tearCard.dispatch('pointermove', ev(340 * 0.75));
    const res = await p;
    assert.ok(Math.abs(res.from - 0.75) < 1e-9);
    assert.equal(commits, 1);
    await r.tear(res.from);
  });
});

test('waitForTear:沒拉就按取消 → resolve cancel、不 commit', async () => {
  await withDomStubs(async () => {
    const { createRevealer } = await import('../ichiban/js/ui.js');
    const els = tearEls();
    const r = createRevealer(els);
    await r.hold({ tier: 'C', name: '三獎', no: 3 }, null);
    let commits = 0;
    const p = r.waitForTear({ onCommit: () => commits++ });
    els.holdCancelBtn.dispatch('click', ev());
    assert.equal(await p, 'cancel');
    assert.equal(commits, 0);
  });
});

test('waitForTear:撕到一半按撕開 → 從目前進度;連按、70% 同時按都只 resolve 一次', async () => {
  await withDomStubs(async () => {
    const { createRevealer } = await import('../ichiban/js/ui.js');
    const els = tearEls();
    const r = createRevealer(els);
    await r.hold({ tier: 'C', name: '三獎', no: 3 }, null);
    let commits = 0;
    const p = r.waitForTear({ onCommit: () => commits++ });
    els.tearCard.dispatch('pointerdown', ev(0));
    els.tearCard.dispatch('pointermove', ev(340 * 0.3));
    els.tearBtn.dispatch('click', ev());
    els.tearBtn.dispatch('click', ev());
    els.tearCard.dispatch('pointermove', ev(340 * 0.9));
    const res = await p;
    assert.ok(Math.abs(res.from - 0.3) < 1e-9);
    assert.equal(commits, 1);
  });
});

test('waitForTear:金卡(cancellable: false)看不到取消', async () => {
  await withDomStubs(async () => {
    const { createRevealer } = await import('../ichiban/js/ui.js');
    const els = tearEls();
    const r = createRevealer(els);
    await r.holdBonus('最後一抽大獎');
    const p = r.waitForTear({ cancellable: false });
    assert.equal(els.holdCancelBtn.hidden, true);
    els.tearBtn.dispatch('click', ev());
    assert.deepEqual(await p, { from: 0 });
    await r.tear(0);
    assert.equal(els.cardBadge.textContent, '🌟 最後一抽賞');
  });
});

test('撕籤區塊不讓瀏覽器拿去捲動 / 返回手勢', () => {
  const css = readFileSync(new URL('../ichiban/css/ichiban.css', import.meta.url), 'utf8');
  const rule = css.slice(css.indexOf('.tear {'), css.indexOf('}', css.indexOf('.tear {')));
  assert.match(rule, /touch-action: none;/);
});

test('waitForTear:右鍵 / 第二根手指不能撕(只有主要按鍵)', async () => {
  await withDomStubs(async () => {
    const { createRevealer } = await import('../ichiban/js/ui.js');
    const els = tearEls();
    const r = createRevealer(els);
    await r.hold({ tier: 'C', name: '三獎', no: 3 }, null);
    let commits = 0;
    r.waitForTear({ onCommit: () => commits++ });
    els.tearCard.dispatch('pointerdown', { ...ev(0), button: 2, isPrimary: true });
    els.tearCard.dispatch('pointermove', ev(340 * 0.3));
    els.tearCard.dispatch('pointerdown', { ...ev(0), button: 0, isPrimary: false });
    els.tearCard.dispatch('pointermove', ev(340 * 0.3));
    assert.equal(commits, 0);
  });
});
