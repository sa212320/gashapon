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


test('icons.svg 有 4 個 symbol,扭蛋機頁引用的 id 都存在,頁面上沒有 emoji 圖示', () => {
  const svg = read('shared/img/icons.svg');
  const ids = [...svg.matchAll(/<symbol\b[^>]*\bid="([^"]+)"/g)].map(m => m[1]);
  assert.deepEqual(ids.sort(), ['home', 'settings', 'sound-off', 'sound-on']);
  const html = read('gashapon/index.html');
  const used = [...html.matchAll(/icons\.svg#([\w-]+)/g)].map(m => m[1]);
  assert.ok(used.length >= 3, '扭蛋機頁至少用到 3 個圖示');
  for (const id of used) assert.ok(ids.includes(id), id);
  const toolbar = html.slice(html.indexOf('<footer class="toolbar">'), html.indexOf('</footer>'));
  assert.ok(!/🔊|🔇|⚙/u.test(toolbar), '工具列不能再有 emoji 圖示');
  assert.ok(!/>←</.test(html), '回首頁不能再是文字箭頭');
});

test('圖示只用 currentColor 跟 --icon-stroke,沒有寫死的顏色或漸層', () => {
  const svg = read('shared/img/icons.svg');
  assert.ok(!/#[0-9a-fA-F]{3,6}\b/.test(svg), '不要寫死顏色');
  assert.ok(!/Gradient/.test(svg), '不要漸層');
});

test('SVG 檔的註解裡不能有 --(不合法的 XML,整個檔案會被瀏覽器拒絕,圖示全部消失)', () => {
  for (const f of ['shared/img/icons.svg']) {
    for (const [, body] of read(f).matchAll(/<!--([\s\S]*?)-->/g)) assert.ok(!body.includes('--'), `${f} 的註解有 --`);
  }
});

test('音效、設定移到右上角;工具列只剩「剩 X 顆」和「轉!」', () => {
  const html = read('gashapon/index.html');
  const toolbar = html.slice(html.indexOf('<footer class="toolbar">'), html.indexOf('</footer>'));
  assert.ok(!/id="soundBtn"|id="settingsBtn"/.test(toolbar), '工具列裡不該再有音效/設定');
  assert.match(toolbar, /id="drawBtn"/);
  const corner = html.slice(html.indexOf('<div class="corner-tools"'), html.indexOf('</div>', html.indexOf('<div class="corner-tools"')));
  assert.match(corner, /id="soundBtn"/);
  assert.match(corner, /id="settingsBtn"/);
});

test('把手位置直接寫在 #machine 的 inline style,跟 anchors.json 一致(不等 JS,圖還沒載完也對得準)', () => {
  const a = JSON.parse(read('gashapon/img/anchors.json'));
  const tag = /<div class="machine" id="machine"[^>]*>/.exec(read('gashapon/index.html'))?.[0] ?? '';
  const v = name => Number(new RegExp(`--${name}:\\s*([\\d.]+)`).exec(tag)?.[1]);
  assert.equal(v('machine-aspect'), a.aspect);
  assert.equal(v('knob-x'), a.knob.cx);
  assert.equal(v('knob-y'), a.knob.cy);
  assert.equal(v('knob-r'), a.knob.r);
});

test('卡片內距不能用百分比(百分比是相對外層遮罩的寬度,電腦上會把卡片撐成直的)', () => {
  const css = read('shared/css/prize-frame.css');
  const rule = /\.prize-frame\s*\{([^}]*)\}/.exec(css)[1];
  assert.ok(!/padding:[^;]*%/.test(rule), rule);
});

test('外框與扭蛋花紋用「預載架」預先載入(跟 CSS 同一個網址,含 ?v=)', () => {
  assert.match(read('gashapon/js/main.js'), /mountPreloadRack\(/);
  // 2026-10-02 搬到 shared/css/prize-frame.css:立體扭蛋機也用它暖外框圖
  assert.match(read('shared/css/prize-frame.css'), /\.preload-rack\s*\{/);
});

test('外框圖還沒到時卡片有保底外觀(奶油色圓角卡片),不是一片透明', () => {
  assert.match(read('shared/css/prize-frame.css'), /\.prize-frame\.is-frame-loading\s*\{[^}]*background-color:/);
  assert.match(read('gashapon/js/reveal.js'), /is-frame-loading/);
});

// UR 的流動只轉彩虹底色(2026-10-02 使用者選 A):水晶藍雪花跟深棕描邊都不能跟著變色。
// filter 會連子元素、邊框一起轉,所以 shimmer 只能掛在獨立的底色層上。
test('UR 的 shimmer 只掛在底色層,不掛在整個半球上', () => {
  const css = read('gashapon/css/style.css');
  const urHalf = /\.capsule\[data-rarity="UR"\] \.capsule__half\s*\{([^}]*)\}/.exec(css);
  assert.ok(!urHalf || !/animation:/.test(urHalf[1]), '半球本身不能有 shimmer(會把花紋跟描邊一起轉色)');
  assert.match(css, /\.capsule\[data-rarity="UR"\] \.capsule__tint\s*\{[^}]*animation:\s*shimmer/);
  assert.equal((read('gashapon/index.html').match(/class="capsule__tint"/g) ?? []).length, 2, '上下兩半各一層');
  assert.match(read('gashapon/js/patterns.js'), /capsule__tint/);
});
