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
