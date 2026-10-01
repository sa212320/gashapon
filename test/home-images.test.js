// 首頁引用的每一張圖都要真的存在 —— 部署漏了檔,卡片上會是一個破圖示,
// 而這種錯在本機(檔案都在)永遠看不出來。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function refs() {
  const html = readFileSync(join(root, 'index.html'), 'utf8');
  const css = readFileSync(join(root, 'css', 'home.css'), 'utf8');
  const fromHtml = [...html.matchAll(/<img\b[^>]*\bsrc="([^"]+)"/g)].map(m => m[1]);
  // home.css 的 url() 相對於 css/,換算成相對於 repo 根目錄
  const fromCss = [...css.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/g)].map(m => join('css', m[1]));
  return [...fromHtml, ...fromCss].filter(p => !/^(data:|https?:)/.test(p));
}

// 卡片插畫延到各模式的 issue(#2~#6)一起做,這一輪首頁只有標題木牌
test('首頁標題有用到木牌插畫', () => {
  assert.ok(refs().some(p => p.endsWith('img/home/sign.webp')), refs().join('\n'));
});

test('首頁引用的每一張圖都存在', () => {
  for (const p of refs()) assert.ok(existsSync(join(root, p)), `找不到 ${p}`);
});
