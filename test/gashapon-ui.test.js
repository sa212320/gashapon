// 扭蛋機主畫面的純邏輯:錨點讀取與換算、剩餘標籤、把手跟「轉!」的 disabled。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  DEFAULT_ANCHORS, isValidAnchors, loadAnchors, anchorVars, outletPoint,
} from '../gashapon/js/machine-art.js';
import { createMachineView } from '../gashapon/js/ui-machine.js';
import { createMachine, createPrize } from '../gashapon/js/state.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const fileAnchors = JSON.parse(readFileSync(join(root, 'gashapon/img/anchors.json'), 'utf8'));

test('DEFAULT_ANCHORS 跟 anchors.json 一致(換圖時兩邊要一起改)', () => {
  assert.deepEqual(DEFAULT_ANCHORS, fileAnchors);
});

test('isValidAnchors:檔案本身合法、缺欄位或超出 0–1 不合法', () => {
  assert.equal(isValidAnchors(fileAnchors), true);
  assert.equal(isValidAnchors({ ...fileAnchors, outlet: { x: 0.5 } }), false);
  assert.equal(isValidAnchors({ ...fileAnchors, knob: { cx: 1.2, cy: 0.5, r: 0.1 } }), false);
  assert.equal(isValidAnchors(null), false);
});

test('isValidAnchors:把手圓不能超出圖', () => {
  const a = { ...fileAnchors, knob: { cx: 0.05, cy: 0.5, r: 0.1 } };
  assert.equal(isValidAnchors(a), false);
});

test('loadAnchors:fetch 失敗、404、壞 JSON、格式不對都退回預設值', async () => {
  const cases = [
    () => Promise.reject(new TypeError('offline')),
    () => Promise.resolve({ ok: false, json: async () => fileAnchors }),
    () => Promise.resolve({ ok: true, json: async () => { throw new SyntaxError('bad'); } }),
    () => Promise.resolve({ ok: true, json: async () => ({ aspect: 2 }) }),
  ];
  for (const f of cases) assert.equal(await loadAnchors(f), DEFAULT_ANCHORS);
});

test('loadAnchors:正常時回傳檔案內容', async () => {
  const a = await loadAnchors(() => Promise.resolve({ ok: true, json: async () => fileAnchors }));
  assert.deepEqual(a, fileAnchors);
});

test('anchorVars:輸出 CSS 變數字串', () => {
  const a = { aspect: 0.75, knob: { cx: 0.5, cy: 0.6, r: 0.1 }, outlet: { x: 0.5, y: 0.8 } };
  assert.deepEqual(anchorVars(a), {
    '--machine-aspect': '0.75', '--knob-x': '0.5', '--knob-y': '0.6', '--knob-r': '0.1',
  });
});

test('outletPoint:比例乘上機台實際位置', () => {
  const a = { aspect: 0.75, knob: { cx: 0.5, cy: 0.6, r: 0.1 }, outlet: { x: 0.5, y: 0.8 } };
  assert.deepEqual(outletPoint({ left: 100, top: 50, width: 300, height: 400 }, a), { x: 250, y: 370 });
});

function el() {
  return { hidden: false, disabled: false, textContent: '', classList: { toggle() {} }, setAttribute() {} };
}
function viewWith() {
  const els = { remainTag: el(), emptyState: el(), drawBtn: el(), knob: el(), soundBtn: el(), soundIcon: el() };
  return { els, view: createMachineView(els) };
}
const prizes = () => [createPrize({ name: 'a', count: 2 }), createPrize({ name: 'b', count: 1 })];

test('render:剩餘標籤顯示「剩 X 顆」', () => {
  const { els, view } = viewWith();
  view.render(createMachine({ prizes: prizes() }));
  assert.equal(els.remainTag.textContent, '剩 3 顆');
  assert.equal(els.remainTag.hidden, false);
});

test('render:抽到不拿走時不顯示剩餘標籤', () => {
  const { els, view } = viewWith();
  view.render(createMachine({ prizes: prizes(), removeOnDraw: false }));
  assert.equal(els.remainTag.hidden, true);
});

test('render:抽空了 → 空機畫面、轉!跟把手都 disabled', () => {
  const { els, view } = viewWith();
  const m = createMachine({ prizes: prizes() });
  view.render({ ...m, pool: m.pool.map(c => ({ ...c, drawn: true })) });
  assert.equal(els.emptyState.hidden, false);
  assert.equal(els.drawBtn.disabled, true);
  assert.equal(els.knob.disabled, true);
});

test('render:沒有獎項 → 轉!跟把手都 disabled,標籤提示去設定', () => {
  const { els, view } = viewWith();
  view.render(createMachine({ prizes: [] }));
  assert.equal(els.drawBtn.disabled, true);
  assert.equal(els.knob.disabled, true);
  assert.equal(els.remainTag.textContent, '還沒有獎項');
  assert.equal(els.remainTag.hidden, false);
});

test('render:正常時兩個都能按', () => {
  const { els, view } = viewWith();
  view.render(createMachine({ prizes: prizes() }));
  assert.equal(els.drawBtn.disabled, false);
  assert.equal(els.knob.disabled, false);
});

import { PATTERN_URLS, preloadImages } from '../gashapon/js/patterns.js';

test('PATTERN_URLS:每個稀有度一張花紋貼圖', () => {
  assert.equal(PATTERN_URLS.length, 5);
  assert.ok(PATTERN_URLS.includes('img/pattern-UR.webp'));
});

test('preloadImages:全部成功 → true;有一張失敗 → false,不丟例外', async () => {
  assert.equal(await preloadImages(['a', 'b'], () => Promise.resolve()), true);
  assert.equal(await preloadImages(['a', 'b'], u => (u === 'b' ? Promise.reject(new Error('404')) : Promise.resolve())), false);
});
