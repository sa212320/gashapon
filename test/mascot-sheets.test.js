import test from 'node:test';
import assert from 'node:assert/strict';

import { PRELOAD_ORDER, createSheets, frameRect, draw } from '../shared/js/mascot-sheets.js';
import { makeManifest } from './mascot-route.test.js';

const BASE = 'https://example.test/shared/img/mascot/segments.json';

// loadImage 的假版本:每次呼叫都記下網址,回傳一個由測試決定何時 resolve 的 promise。
function fakeLoader({ fail = [] } = {}) {
  const calls = [];
  const loadImage = (url) => {
    calls.push(url);
    if (fail.some(f => url.includes(f))) return Promise.reject(new Error('404'));
    return Promise.resolve({ url });
  };
  return { calls, loadImage };
}

test('關鍵圖先載,片段照 PRELOAD_ORDER 一段一段載,其餘排在後面', async () => {
  const m = makeManifest();
  const { calls, loadImage } = fakeLoader();
  const sheets = createSheets({ manifest: m, baseURL: BASE, loadImage });
  await sheets.done;

  const keyCalls = calls.slice(0, 5);
  assert.ok(keyCalls.every(u => u.includes('/key/')), keyCalls.join('\n'));
  const segIds = calls.slice(5).map(u => u.match(/seg\/(.+)\.webp/)[1]);
  assert.deepEqual(segIds.slice(0, PRELOAD_ORDER.length), [...PRELOAD_ORDER]);
  assert.equal(new Set(segIds).size, m.segments.length, '每段都載一次,不重複');
});

test('網址相對於 segments.json 解析', async () => {
  const { calls, loadImage } = fakeLoader();
  const sheets = createSheets({ manifest: makeManifest(), baseURL: BASE, loadImage });
  await sheets.done;
  assert.ok(calls.includes('https://example.test/shared/img/mascot/seg/idle-loop.webp'), calls[5]);
});

test('載好之前 isLoaded 是 false,載好之後是 true', async () => {
  const sheets = createSheets({ manifest: makeManifest(), baseURL: BASE, loadImage: fakeLoader().loadImage });
  assert.equal(sheets.isLoaded('idle-loop'), false);
  await sheets.done;
  assert.equal(sheets.isLoaded('idle-loop'), true);
  assert.deepEqual(sheets.sheet('idle-loop'), { url: 'https://example.test/shared/img/mascot/seg/idle-loop.webp' });
  assert.ok(sheets.key('watch'));
});

test('載入失敗:那段維持未載入、繼續載後面的、只警告一次', async () => {
  const warns = [];
  const { loadImage } = fakeLoader({ fail: ['idle-watch', 'watch-loop', 'key/aww'] });
  const sheets = createSheets({ manifest: makeManifest(), baseURL: BASE, loadImage, warn: (...a) => warns.push(a) });
  await sheets.done;
  assert.equal(sheets.isLoaded('idle-watch'), false);
  assert.equal(sheets.isLoaded('watch-cheer'), true, '失敗之後還要繼續載');
  assert.equal(sheets.key('aww'), undefined);
  assert.equal(warns.length, 1, `應該只警告一次,實際 ${warns.length}`);
});

test('frameRect:照 cols 換行', () => {
  const seg = { cols: 5 };
  const frame = { w: 48, h: 43 };
  assert.deepEqual(frameRect(seg, 0, frame), { sx: 0, sy: 0, sw: 48, sh: 43 });
  assert.deepEqual(frameRect(seg, 4, frame), { sx: 192, sy: 0, sw: 48, sh: 43 });
  assert.deepEqual(frameRect(seg, 7, frame), { sx: 96, sy: 43, sw: 48, sh: 43 });
});

function fakeCtx() {
  const ops = [];
  return {
    ops,
    set globalAlpha(v) { ops.push(['alpha', v]); },
    clearRect: (...a) => ops.push(['clear', ...a]),
    drawImage: (img, ...a) => ops.push(['draw', img.url, ...a]),
  };
}

test('draw:先清畫布,由下往上畫每一層,各自套 alpha,最後把 alpha 設回 1', async () => {
  const m = makeManifest();
  const sheets = createSheets({ manifest: m, baseURL: BASE, loadImage: fakeLoader().loadImage });
  await sheets.done;
  const ctx = fakeCtx();
  draw(ctx, { layers: [
    { kind: 'seg', id: 'idle-loop', index: 6 - 1, alpha: 1 },
    { kind: 'key', pose: 'watch', alpha: 0.4 },
  ] }, { manifest: m, sheets });

  assert.deepEqual(ctx.ops[0], ['clear', 0, 0, 48, 43]);
  assert.deepEqual(ctx.ops[1], ['alpha', 1]);
  assert.deepEqual(ctx.ops[2], ['draw', 'https://example.test/shared/img/mascot/seg/idle-loop.webp', 0, 43, 48, 43, 0, 0, 48, 43]);
  assert.deepEqual(ctx.ops[3], ['alpha', 0.4]);
  assert.deepEqual(ctx.ops[4], ['draw', 'https://example.test/shared/img/mascot/key/watch.webp', 0, 0, 48, 43]);
  assert.deepEqual(ctx.ops.at(-1), ['alpha', 1]);
});

test('draw:圖還沒載到的層直接跳過,不丟錯', () => {
  const m = makeManifest();
  const sheets = { sheet: () => undefined, key: () => undefined };
  const ctx = fakeCtx();
  draw(ctx, { layers: [{ kind: 'seg', id: 'idle-loop', index: 0, alpha: 1 }] }, { manifest: m, sheets });
  assert.ok(!ctx.ops.some(o => o[0] === 'draw'));
});
