// 首頁會趁空閒把扭蛋機頁的圖先下載進快取(2026-10-01)。快取靠網址比對,
// 所以清單裡的網址必須跟扭蛋機頁實際引用的一字不差(含 ?v= 內容雜湊)。
// 換圖後忘了重產清單,這裡會紅:跑 tools/mascot-gen/gashapon.py manifest。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = p => readFileSync(join(root, p), 'utf8');

// 扭蛋機頁實際用到的圖,換算成相對於網站根目錄的路徑(保留 ?v=)
function gashaponRefs() {
  const out = new Set();
  const add = (base, url) => { if (!/^(data:|https?:|#)/.test(url) && /\.(webp|png|svg)/.test(url)) out.add(normalize(join(base, url))); };
  for (const m of read('gashapon/index.html').matchAll(/<img\b[^>]*\bsrc="([^"]+)"/g)) add('gashapon', m[1]);
  for (const m of read('ichiban/index.html').matchAll(/<img\b[^>]*\bsrc="([^"]+)"/g)) add('ichiban', m[1]);
  for (const [css, base] of [['gashapon/css/style.css', 'gashapon/css'], ['shared/css/prize-frame.css', 'shared/css']]) {
    for (const m of read(css).matchAll(/url\(\s*["']?([^"')#]+)["']?\s*\)/g)) add(base, m[1]);
  }
  // 一番賞票卡的角色頭(2026-10-02):網址寫在 card-art.js 的 new URL('../img/x.webp?v=…')
  for (const m of read('ichiban/js/card-art.js').matchAll(/['"](\.\.\/img\/[^'"]+\.webp\?v=[0-9a-f]{8})['"]/g)) add('ichiban/js', m[1]);
  // 阿彌陀籤(2026-10-02):網址寫在 ghostleg/js/art.js
  for (const m of read('ghostleg/js/art.js').matchAll(/['"](\.\.\/img\/[^'"]+\.webp\?v=[0-9a-f]{8})['"]/g)) add('ghostleg/js', m[1]);
  return out;
}

test('preload.json 跟扭蛋機頁、一番賞票卡實際引用的圖一字不差(含 ?v=)', () => {
  const manifest = JSON.parse(read('gashapon/img/preload.json'));
  assert.deepEqual(new Set(manifest), gashaponRefs());
  for (const u of manifest) assert.ok(existsSync(join(root, u.split('?')[0])), u);
});

test('首頁會載入預載腳本', () => {
  assert.match(read('index.html'), /<script type="module" src="js\/preload-modes\.js/);
});

import { preloadAll, shouldPreload } from '../js/preload-modes.js';

test('preloadAll:一張一張下載,有一張失敗也繼續、不丟例外', async () => {
  const seen = [];
  const n = await preloadAll(['a', 'b', 'c'], async u => { seen.push(u); if (u === 'b') throw new Error('404'); });
  assert.deepEqual(seen, ['a', 'b', 'c']);
  assert.equal(n, 2);
});

test('shouldPreload:開了「節省數據」就不預載', () => {
  assert.equal(shouldPreload({ connection: { saveData: true } }), false);
  assert.equal(shouldPreload({ connection: { saveData: false } }), true);
  assert.equal(shouldPreload({}), true);
});

import { EXTRA_URLS } from '../js/preload-modes.js';

test('three.js 也預載(四個模式都用),而且檔案真的存在、跟 importmap 指的是同一支', () => {
  assert.ok(EXTRA_URLS.includes('vendor/three.module.min.js'));
  for (const u of EXTRA_URLS) assert.ok(existsSync(join(root, u)), u);
  assert.match(read('gashapon3d/index.html'), /"three":"\.\.\/vendor\/three\.module\.min\.js"/);
});
