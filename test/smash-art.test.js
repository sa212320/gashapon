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
