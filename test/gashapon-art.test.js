// 扭蛋機頁引用的素材都要真的存在、引用要帶內容雜湊;舊的 SVG 機台不能殘留。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = p => readFileSync(join(root, p), 'utf8');
const strip = u => u.split('?')[0];

function pageRefs() {
  const html = read('gashapon/index.html');
  const css = read('gashapon/css/style.css');
  const fromHtml = [...html.matchAll(/<img\b[^>]*\bsrc="([^"]+)"/g)].map(m => join('gashapon', m[1]));
  const fromCss = [...css.matchAll(/url\(\s*["']?([^"')#]+)["']?\s*\)/g)].map(m => join('gashapon/css', m[1]));
  return [...fromHtml, ...fromCss].filter(p => !/data:|https?:/.test(p));
}

test('扭蛋機頁引用的每一張圖都存在', () => {
  for (const p of pageRefs()) assert.ok(existsSync(join(root, strip(p))), `找不到 ${p}`);
});

test('扭蛋機頁的圖都帶內容雜湊', () => {
  for (const p of pageRefs().filter(p => p.endsWith('.webp') || p.includes('.webp?'))) {
    assert.match(p, /\.webp\?v=[0-9a-f]{8}$/, p);
  }
});

test('機台用插畫與把手按鈕,舊的 SVG 機台、標題、眼睛都拿掉了', () => {
  const html = read('gashapon/index.html');
  assert.match(html, /<img[^>]+src="img\/machine\.webp/);
  assert.match(html, /<button[^>]+id="knob"/);
  assert.match(html, /id="remainTag"/);
  for (const gone of ['id="capsuleGroup"', 'class="eye', 'id="machineName"', 'id="remaining"', '<svg class="machine"']) {
    assert.ok(!html.includes(gone), `還有 ${gone}`);
  }
});

import { RARITIES } from '../gashapon/js/constants.js';

test('5 張花紋貼圖都存在', () => {
  for (const r of RARITIES) assert.ok(existsSync(join(root, `gashapon/img/pattern-${r}.webp`)), r);
});

test('每個稀有度的蛋殼都套上自己的花紋貼圖(帶內容雜湊)', () => {
  const css = read('gashapon/css/style.css');
  for (const r of RARITIES) {
    const re = new RegExp(`\\.capsule\\[data-rarity="${r}"\\][^{]*\\{[^}]*--pattern:\\s*url\\(\\.\\./img/pattern-${r}\\.webp\\?v=[0-9a-f]{8}\\)`);
    assert.match(css, re, r);
  }
});

test('蛋殼是 CSS 畫的球:不用 mask(圖沒載入時蛋不能隱形)', () => {
  const css = read('gashapon/css/style.css');
  assert.ok(!/\bmask(-image)?\s*:/.test(css), 'style.css 不該再有 mask');
});

test('外框是 5 張生成的彩色整張框,卡片固定 4:3,不用九宮格、濾鏡,也沒有程式畫的雪花', () => {
  const css = read('shared/css/prize-frame.css');
  for (const r of RARITIES) {
    assert.ok(existsSync(join(root, `shared/img/frames/frame-${r}.webp`)), r);
    assert.match(css, new RegExp(`\\.prize-frame\\[data-rarity="${r}"\\]\\s*\\{[^}]*frame-${r}\\.webp\\?v=[0-9a-f]{8}`), r);
  }
  assert.match(css, /\.prize-frame\s*\{[^}]*aspect-ratio:\s*4\s*\/\s*3/);
  assert.ok(!/border-image|filter:\s*url\(#tint|mask-box-image|flake-|snow-cap/.test(css), '舊外框的東西要拿乾淨');
  assert.ok(!existsSync(join(root, 'shared/img/flakes')), '程式畫的雪花不用了');
  assert.ok(!/prize-frame__(corner|snow)/.test(read('gashapon/index.html')));
});

test('卡片固定大小,名字靠自動縮字塞進去', () => {
  assert.match(read('gashapon/js/reveal.js'), /fitText\(/);
});

test('扭蛋機的揭曉卡片用了 prize-frame,也引用了 prize-frame.css', () => {
  const html = read('gashapon/index.html');
  assert.match(html, /class="prize-card prize-frame"/);
  assert.match(html, /href="\.\.\/shared\/css\/prize-frame\.css"/);
});

