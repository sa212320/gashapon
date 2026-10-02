// 一番賞手指撕籤的規則(2026-10-02 grill 定案)。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createTearDrag, COMMIT_AT, AUTO_AT, RIP_STEP } from '../ichiban/js/tear-drag.js';

const read = p => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

test('常數是定案的值', () => {
  assert.deepEqual([COMMIT_AT, AUTO_AT, RIP_STEP], [0.03, 0.9, 0.08]);   // AUTO_AT:2026-10-02 使用者 70% → 90%
});

test('單點(沒拉動)不算撕', () => {
  const d = createTearDrag();
  d.down(0.5); d.up();
  assert.equal(d.progress, 0);
  assert.equal(d.committed, false);
});

test('往右拉的距離 / 籤寬 = 進度;超過 3% 才 commit,只 commit 一次', () => {
  const d = createTearDrag();
  d.down(0.2);
  assert.deepEqual(d.move(0.22).events, []);
  const r = d.move(0.24);
  assert.ok(Math.abs(r.progress - 0.04) < 1e-9);
  assert.deepEqual(r.events, ['commit']);
  assert.ok(!d.move(0.25).events.includes('commit'));
});

test('放開停在原地,下一次從目前進度接著拉', () => {
  const d = createTearDrag();
  d.down(0.1); d.move(0.4); d.up();
  assert.ok(Math.abs(d.progress - 0.3) < 1e-9);
  d.down(0.6); d.move(0.7);
  assert.ok(Math.abs(d.progress - 0.4) < 1e-9);
});

test('可以往回拉,進度會減少,但 committed 不會變回 false(模型錯誤 #2)', () => {
  const d = createTearDrag();
  d.down(0); d.move(0.3); d.move(-0.5);
  assert.equal(d.progress, 0);
  assert.equal(d.committed, true);
});

test('撕紙聲:往前每 8% 一聲,往回不出聲,再往前又會響', () => {
  const d = createTearDrag();
  d.down(0);
  const rips = x => d.move(x).events.filter(e => e === 'rip').length;
  assert.equal(rips(0.05), 0);
  assert.equal(rips(0.09), 1);
  assert.equal(rips(0.30), 1, '一次跨過好幾段也只響一聲');
  assert.equal(rips(0.10), 0, '往回不出聲');
  assert.equal(rips(0.20), 1);
});

test('到 90% 自動撕完(89% 還不會);之後拖曳無效', () => {
  const d = createTearDrag();
  d.down(0);
  assert.ok(!d.move(0.89).events.includes('auto'));
  d.move(0);
  const r = d.move(0.91);
  assert.ok(r.events.includes('auto') && r.events.includes('commit'));
  assert.equal(d.auto, true);
  assert.deepEqual(d.move(0.1).events, []);
  assert.ok(Math.abs(d.progress - 0.91) < 1e-9);
});

test('按「撕開」:任何進度都直接 auto(還沒 commit 的也一起 commit);只算一次', () => {
  const d = createTearDrag();
  assert.deepEqual(d.button().events, ['commit', 'auto']);
  assert.deepEqual(d.button().events, []);
  const e = createTearDrag();
  e.down(0); e.move(0.3);
  assert.deepEqual(e.button().events, ['auto']);
  assert.ok(Math.abs(e.button().progress - 0.3) < 1e-9);
});

test('沒有 down 的 move 不算數(手指從籤外面滑進來)', () => {
  const d = createTearDrag();
  assert.deepEqual(d.move(0.5).events, []);
  assert.equal(d.progress, 0);
});

test('curl.js 可以畫到任意進度、從任意進度接著播', () => {
  const src = read('ichiban/js/curl.js');
  assert.match(src, /show\(p\) \{/);
  assert.match(src, /playFrom\(from, ms\) \{/);
  assert.match(src, /play\(ms\) \{\s*return this\.playFrom\(0, ms\);/);
});

test('音效庫有短撕紙聲 rip', async () => {
  const { sfx } = await import('../shared/js/sound.js');
  assert.equal(typeof sfx.rip, 'function');
});

test('main.js:存檔只在 onCommit 裡(手指 > 3% 或按撕開);金卡不能取消', () => {
  const src = read('ichiban/js/main.js');
  assert.ok(!/waitForChoice/.test(src));
  assert.match(src, /waitForTear\(\{\s*onCommit: \(\) => \{[\s\S]*?persist\(state\);[\s\S]*?\}\s*,?\s*\}\)/);
  assert.match(src, /holdBonus\(result\.lastOnePrize\)[\s\S]*?waitForTear\(\{ cancellable: false \}\)/);
  assert.ok(!/playBonus\(/.test(src));
});

// review(2026-10-02):滑鼠拖過 70% 放開,瀏覽器補送的 click 冒泡到 overlay → 被當成「跳過」,獎項演出直接跳到最後
test('main.js:overlay 的「點一下跳過」不理會從籤卡上來的點擊', () => {
  const src = read('ichiban/js/main.js');
  const i = src.indexOf("overlay.addEventListener('click', e =>");
  assert.ok(i > -1, 'overlay 的 click 要拿 event');
  assert.match(src.slice(i, src.indexOf('});', i)), /e\.target\.closest\?\.\('#tearCard'\)/);
});

// 2026-10-02 使用者:「手撕幅度到實際撕的不一樣」—— 拖曳套了 ease-in-out,手指 30% 時紙只到 18%
import { autoProgress } from '../ichiban/js/tear-drag.js';
test('curl.js:拖曳時紙的位置 = 手指進度(線性);ease 只用在自動撕完那一段', () => {
  const src = read('ichiban/js/curl.js');
  const fn = src.slice(src.indexOf('function setProgress('), src.indexOf('\n  }\n', src.indexOf('function setProgress(')));
  assert.ok(!/2 \* p \* p|Math\.pow\(-2 \* p/.test(fn), 'setProgress 不能再套 ease');
  assert.match(src, /autoProgress\(from, /);
});

test('autoProgress:從 from 接著撕、開頭不跳(t=0 就是 from)、先快後慢、最後到 1', () => {
  assert.equal(autoProgress(0.7, 0), 0.7);
  assert.equal(autoProgress(0.7, 1), 1);
  assert.equal(autoProgress(0, 0), 0);
  const a = autoProgress(0.3, 0.25) - autoProgress(0.3, 0);
  const b = autoProgress(0.3, 1) - autoProgress(0.3, 0.75);
  assert.ok(a > b, '先快後慢');
});
