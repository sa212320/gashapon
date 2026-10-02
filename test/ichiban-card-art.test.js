import test from 'node:test';
import assert from 'node:assert/strict';
import { drawFace, drawPrize, traceTicket, useCardArt, CARD_W, CARD_H } from '../ichiban/js/card-art.js';

// 記下每一次呼叫與屬性設定,沒定義的方法一律當成可呼叫的 noop。
function recCtx() {
  const calls = [];
  const target = { calls, measureText: s => ({ width: String(s).length * 30 }) };
  return new Proxy(target, {
    get: (t, k) => (k in t ? t[k] : (...a) => { calls.push([k, ...a]); }),
    set: (t, k, v) => { calls.push(['set:' + String(k), v]); return true; },
  });
}
const texts = ctx => ctx.calls.filter(c => c[0] === 'fillText').map(c => c[1]);

test('號碼是白色印刷的大數字,沒有圓圈(2026-10-02 使用者選 B)', () => {
  const ctx = recCtx();
  drawFace(ctx, { color: '#A9D2F5', no: 7, critter: 'fox', w: 62, h: 27 });
  const at = ctx.calls.findIndex(c => c[0] === 'fillText' && c[1] === '7');
  assert.ok(at > 0, '有畫號碼');
  const fill = ctx.calls.slice(0, at).filter(c => c[0] === 'set:fillStyle').at(-1)[1];
  assert.equal(fill, '#fff');
  // 號碼前後不能有白底圓圈:最後一次 fill 是卡面或雪花,不是 #fff 的圓
  const fills = ctx.calls.filter(c => c[0] === 'set:fillStyle' && c[1] === '#fff');
  assert.equal(fills.length, 1, '白色只用在號碼字上');
});

test('drawFace 不清畫布(桌面一張 canvas 上畫很多張)', () => {
  const ctx = recCtx();
  drawFace(ctx, { color: '#A9D2F5', no: 1, critter: 'fox' });
  assert.equal(ctx.calls.filter(c => c[0] === 'clearRect').length, 0);
});

test('drawFace 的底色是傳進來的裝飾色(不是賞別色)', () => {
  const ctx = recCtx();
  drawFace(ctx, { color: '#ABCDEF', no: 1, critter: 'fox' });
  assert.ok(ctx.calls.some(c => c[0] === 'set:fillStyle' && c[1] === '#ABCDEF'));
});

test('三位數號碼縮字', () => {
  const size = no => {
    const ctx = recCtx();
    drawFace(ctx, { color: '#A9D2F5', no, critter: 'fox', w: 62, h: 27 });
    const f = ctx.calls.filter(c => c[0] === 'set:font').map(c => parseFloat(c[1].match(/(\d+(\.\d+)?)px/)[1]));
    return Math.max(...f);
  };
  assert.ok(size(123) < size(12));
});

test('最後一抽賞:號碼位置畫 🌟', () => {
  const ctx = recCtx();
  drawFace(ctx, { color: '#FFD24C', no: '★', critter: 'both' });
  assert.ok(texts(ctx).includes('🌟'));
});

test('素材沒載入時照樣畫得完,不呼叫 drawImage', () => {
  useCardArt({ fox: null, ermine: null });
  const ctx = recCtx();
  drawFace(ctx, { color: '#fff', no: 3, critter: 'ermine' });
  drawPrize(ctx, { color: '#FF6F91', letter: 'A', name: '大獎' });
  assert.equal(ctx.calls.filter(c => c[0] === 'drawImage').length, 0);
});

test('素材載入後:背面畫角色頭,獎項面不畫任何圖(2026-10-02 拿掉紙紋)', () => {
  const fox = { id: 'fox' }, ermine = { id: 'ermine' };
  useCardArt({ fox, ermine });
  try {
    const face = recCtx();
    drawFace(face, { color: '#fff', no: 3, critter: 'ermine' });
    assert.deepEqual(face.calls.filter(c => c[0] === 'drawImage').map(c => c[1]), [ermine]);

    const prize = recCtx();
    drawPrize(prize, { color: '#FF6F91', letter: 'A', name: '大獎' });
    assert.equal(prize.calls.filter(c => c[0] === 'drawImage').length, 0, '獎項面不印角色');
  } finally {
    useCardArt({ fox: null, ermine: null });
  }
});

test('獎項面:字母 + 獎品名,沒有號碼', () => {
  const ctx = recCtx();
  drawPrize(ctx, { color: '#FF6F91', letter: 'A', name: '大獎' });
  assert.deepEqual(texts(ctx), ['A', '大獎']);
});

test('獎項名太長會縮字', () => {
  const font = name => {
    const ctx = recCtx();
    drawPrize(ctx, { color: '#FF6F91', letter: 'A', name });
    return ctx.calls.filter(c => c[0] === 'set:font').map(c => c[1]).at(-1);
  };
  assert.notEqual(font('短'), font('這是一個非常非常非常長的獎品名字二十字'));
});

test('traceTicket 只建路徑,不填色', () => {
  const ctx = recCtx();
  traceTicket(ctx, { w: 68, h: 30 });
  assert.equal(ctx.calls.filter(c => c[0] === 'fill' || c[0] === 'stroke').length, 0);
  assert.ok(ctx.calls.some(c => c[0] === 'lineTo'));
});

test('票卡輪廓:兩條長邊各一排撕線孔(2026-10-02 使用者選 D),不是方齒', () => {
  const ctx = recCtx();
  traceTicket(ctx);
  const holes = ctx.calls.filter(c => c[0] === 'arc');
  assert.ok(holes.length >= 20, `只有 ${holes.length} 個孔`);
  const ys = new Set(holes.map(c => Math.round(c[2])));
  assert.equal(ys.size, 2, '孔只在上下兩條長邊');
});

test('雪花紋不規則:每張依號碼散佈不同,同一張永遠一樣', () => {
  const flakes = no => {
    const ctx = recCtx();
    drawFace(ctx, { color: '#fff', no, critter: 'fox' });
    return JSON.stringify(ctx.calls.filter(c => c[0] === 'moveTo'));
  };
  assert.equal(flakes(3), flakes(3));
  assert.notEqual(flakes(3), flakes(4));
});

test('loadCardArt 只下載狐狸跟白鼬兩張頭(沒有紙紋),網址帶 ?v= 內容雜湊', async () => {
  const { loadCardArt } = await import('../ichiban/js/card-art.js');
  const asked = [];
  await loadCardArt(url => { asked.push(url); return Promise.resolve({ url }); });
  assert.equal(asked.length, 2);
  assert.ok(asked.some(u => /\/img\/fox\.webp\?v=[0-9a-f]{8}$/.test(u)), asked.join());
  assert.ok(asked.some(u => /\/img\/ermine\.webp\?v=[0-9a-f]{8}$/.test(u)), asked.join());
  useCardArt({ fox: null, ermine: null });
});

test('印刷一律白色(2026-10-02 使用者:要統一白色)', () => {
  for (const color of ['#A9D2F5', '#8FB3E8']) {
    const ctx = recCtx();
    drawFace(ctx, { color, no: 4, critter: 'fox' });
    const strokes = ctx.calls.filter(c => c[0] === 'set:strokeStyle').map(c => c[1]).filter(s => s.startsWith('rgba'));
    assert.ok(strokes.length > 0 && strokes.every(s => s.startsWith('rgba(255,255,255')), color);
  }
});
