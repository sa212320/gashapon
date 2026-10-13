// 道具圖示:四張都要存在、網址帶內容雜湊、而且雜湊跟檔案內容一致(換圖沒重跑 build 會紅)。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ITEM_URLS } from '../smash/js/art.js';
import { ITEM_TYPES } from '../smash/js/items.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

test('每種道具都有圖示', () => {
  assert.deepEqual(Object.keys(ITEM_URLS).sort(), [...ITEM_TYPES].sort());
});

test('圖示檔案存在,網址的 ?v= 跟內容一致', () => {
  for (const [type, url] of Object.entries(ITEM_URLS)) {
    const m = url.match(/smash\/img\/items\/(\w+)\.webp\?v=([0-9a-f]{8})$/);
    assert.ok(m, url);
    assert.equal(m[1], type);
    const path = join(root, 'smash', 'img', 'items', `${type}.webp`);
    assert.ok(existsSync(path), path);
    const digest = createHash('sha1').update(readFileSync(path)).digest('hex').slice(0, 8);
    assert.equal(m[2], digest, `${type} 換了圖沒重跑 build`);
  }
});

test('特效逐格動畫:撞擊、冰隕石兩層(冰晶爆開、衝擊波)都有,網址的 ?v= 跟內容一致,格數對得上圖寬', async () => {
  const { FX_URLS } = await import('../smash/js/art.js');
  assert.deepEqual(Object.keys(FX_URLS ?? {}).sort(), ['impact', 'shatter', 'shock']);
  for (const [name, { url, frames }] of Object.entries(FX_URLS)) {
    const m = url.match(/smash\/img\/fx\/(\w+)\.webp\?v=([0-9a-f]{8})$/);
    assert.ok(m, url);
    assert.equal(m[1], name);
    const buf = readFileSync(join(root, 'smash', 'img', 'fx', `${name}.webp`));
    assert.equal(m[2], createHash('sha1').update(buf).digest('hex').slice(0, 8), `${name} 換了圖沒重跑 build`);
    // WebP VP8X 標頭:畫布寬高(各 24 bit,存的是減 1)
    const w = buf.readUIntLE(24, 3) + 1;
    const h = buf.readUIntLE(27, 3) + 1;
    assert.equal(w / h, frames);
  }
});
