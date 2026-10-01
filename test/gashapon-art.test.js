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

test('外框所有稀有度同一個冰藍色,只靠裝飾變華麗;沒有生成圖、沒有濾鏡、沒有彩虹框', () => {
  const css = read('shared/css/prize-frame.css');
  assert.match(css, /\.prize-frame\s*\{[^}]*--frame-color:\s*#[0-9A-Fa-f]{6}/);
  assert.equal((css.match(/--frame-color:/g) || []).length, 1, '框的顏色只能定義一次,不分稀有度');
  assert.ok(!/--rainbow/.test(css), 'UR 不再用彩虹框(使用者 2026-10-01)');
  assert.ok(!/frames\/frame-|filter:\s*url\(#tint|mask-box-image/.test(css), '舊的九宮格外框要拿乾淨');
  assert.ok(!existsSync(join(root, 'shared/js/tint.js')), 'tint.js 只給舊外框用,要刪掉');
});

test('外框裝飾逐級增加:N 沒積雪、SR 起有亮點、SSR 起雙層外框、UR 有光澤動畫', () => {
  const css = read('shared/css/prize-frame.css');
  assert.match(css, /\.prize-frame\[data-rarity="N"\] \.prize-frame__snow\s*\{[^}]*display:\s*none/);
  assert.match(css, /\[data-rarity="SR"\][^{]*\{[^}]*radial-gradient/);
  assert.match(css, /\[data-rarity="SSR"\][^{]*\{[^}]*box-shadow/);
  assert.match(css, /\[data-rarity="UR"\][^{]*\{[^}]*animation:/);
});

test('外框上緣有一片積雪', () => {
  assert.ok(existsSync(join(root, 'shared/img/flakes/snow-cap.svg')));
  assert.match(read('gashapon/index.html'), /class="prize-frame__snow"/);
  assert.match(read('shared/css/prize-frame.css'), /\.prize-frame__snow\s*\{[^}]*snow-cap\.svg/);
});

test('卡片內距寫成 calc(var(--frame-w) + Npx)(長名字不會壓到四角雪花)', () => {
  const css = read('shared/css/prize-frame.css');
  assert.match(css, /\.prize-frame\s*\{[^}]*padding:\s*calc\(var\(--frame-w\)\s*\+\s*\d+px\)/);
});

test('扭蛋機的揭曉卡片用了 prize-frame,也引用了 prize-frame.css', () => {
  const html = read('gashapon/index.html');
  assert.match(html, /class="prize-card prize-frame"/);
  assert.match(html, /href="\.\.\/shared\/css\/prize-frame\.css"/);
});

test('外框四角的雪花:獨立一層、每個稀有度一款、不吃稀有度濾鏡', () => {
  const css = read('shared/css/prize-frame.css');
  const html = read('gashapon/index.html');
  for (const pos of ['tl', 'tr', 'bl', 'br']) assert.match(html, new RegExp(`prize-frame__corner--${pos}`));
  for (const r of RARITIES) {
    assert.ok(existsSync(join(root, `shared/img/flakes/flake-${r}.svg`)), r);
    assert.match(css, new RegExp(`\\[data-rarity="${r}"\\] \\.prize-frame__corner\\s*\\{[^}]*flake-${r}\\.svg`), r);
  }
  const cornerRules = [...css.matchAll(/\.prize-frame__corner[^{]*\{([^}]*)\}/g)].map(m => m[1]).join('\n');
  assert.ok(!/filter:/.test(cornerRules), '四角的雪花不能上稀有度色');
});

test('四角雪花一階比一階華麗(檔案裡的線條越來越多)', () => {
  const counts = RARITIES.map(r => (read(`shared/img/flakes/flake-${r}.svg`).match(/<path\b/g) || []).length);
  for (let i = 1; i < counts.length; i++) assert.ok(counts[i] > counts[i - 1], counts.join(','));
});
