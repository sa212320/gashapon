// 開籤演出的煙霧測試。
//
// 為什麼值得寫:ui.js 的演出全是私有函式,一個名字打錯或一段被誤刪,
// 語法檢查跟其他測試都照樣全綠,要等真的在瀏覽器點下去才會 ReferenceError
// ——「點籤紙沒反應」實際上線過一次,原因就是 animate / originOffset / reset
// 三支被一次砍掉。這裡用最小的 DOM 替身把 hold → tear 真的跑一遍,
// 只要有任何一支不存在就會炸在這裡。
import test from 'node:test';
import assert from 'node:assert/strict';

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

const EL_KEYS = ['dim', 'tearCard', 'canvas', 'cardResult', 'cardBadge', 'cardName', 'aura', 'particles'];

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

    await revealer.hold({ tier: 'A', name: '大獎' }, { left: 10, top: 20, width: 60, height: 84 });
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
    await revealer.hold({ tier: 'G', name: '銘謝惠顧' }, null);
    await revealer.tear();
    assert.equal(els.cardName.textContent, '銘謝惠顧');
  });
});

test('最後一抽賞:hold + tear 一次跑完,獎項留在無障礙用的文字裡', async () => {
  await withDomStubs(async () => {
    const { createRevealer } = await import('../ichiban/js/ui.js');
    const els = Object.fromEntries(EL_KEYS.map(k => [k, stubEl()]));
    const revealer = createRevealer(els);
    await revealer.playBonus('最後一抽大獎');
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
    await revealer.hold({ tier: 'C', name: '三獎' }, { left: 5, top: 5, width: 60, height: 84 });
    await revealer.cancelReturn({ left: 5, top: 5, width: 60, height: 84 });
    revealer.clear();
  });
});
