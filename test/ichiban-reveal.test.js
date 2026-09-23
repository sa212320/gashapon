// 開籤演出的煙霧測試。
//
// 為什麼值得寫:ui.js 的演出全是私有函式,一個名字打錯或一段被誤刪,
// 語法檢查跟其他測試都照樣全綠,要等真的在瀏覽器點下去才會 ReferenceError
// ——「點籤紙沒反應」實際上線過一次,原因就是 animate / originOffset / reset
// 三支被一次砍掉。這裡用最小的 DOM 替身把 hold → tear 真的跑一遍,
// 只要有任何一支不存在就會炸在這裡。
import test from 'node:test';
import assert from 'node:assert/strict';

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
  };
  return el;
}

const EL_KEYS = ['dim', 'tearCard', 'ticket', 'sleeve', 'cavity', 'cardResult', 'cardBadge', 'cardName', 'aura', 'particles'];

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

    await revealer.hold({ tier: 'A' }, { left: 10, top: 20, width: 60, height: 84 });
    assert.equal(revealer.isPlaying, false);

    await revealer.tear({ name: '大獎', tier: 'A' });
    assert.equal(els.cardName.textContent, '大獎');
    assert.equal(els.cardBadge.textContent, 'A賞');
  });
});

test('G 賞(最樸素的那一階)也走得完', async () => {
  await withDomStubs(async () => {
    const { createRevealer } = await import('../ichiban/js/ui.js');
    const els = Object.fromEntries(EL_KEYS.map(k => [k, stubEl()]));
    const revealer = createRevealer(els);
    await revealer.hold({ tier: 'G' }, null);
    await revealer.tear({ name: '銘謝惠顧', tier: 'G' });
    assert.equal(els.cardName.textContent, '銘謝惠顧');
  });
});

test('最後一抽賞:hold + tear 一次跑完,票卡標成 bonus', async () => {
  await withDomStubs(async () => {
    const { createRevealer } = await import('../ichiban/js/ui.js');
    const els = Object.fromEntries(EL_KEYS.map(k => [k, stubEl()]));
    const revealer = createRevealer(els);
    await revealer.playBonus('最後一抽大獎');
    assert.equal(els.cardName.textContent, '最後一抽大獎');
    assert.equal(els.tearCard.dataset.bonus, 'true');
  });
});

test('取消:票卡飛回去,不會丟例外', async () => {
  await withDomStubs(async () => {
    const { createRevealer } = await import('../ichiban/js/ui.js');
    const els = Object.fromEntries(EL_KEYS.map(k => [k, stubEl()]));
    const revealer = createRevealer(els);
    await revealer.hold({ tier: 'C' }, { left: 5, top: 5, width: 60, height: 84 });
    await revealer.cancelReturn({ left: 5, top: 5, width: 60, height: 84 });
    revealer.clear();
  });
});
