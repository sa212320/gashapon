// 全站共用的 CSS / JS 網址要帶內容雜湊,改了檔案手機馬上抓新的(GitHub Pages 快取 10 分鐘)。
// 紅了就跑 python3 tools/stamp-shared.py。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = p => readFileSync(join(root, p));
const PAGES = ['index.html', 'gashapon/index.html', 'gashapon3d/index.html', 'ichiban/index.html', 'ghostleg/index.html', 'smash/index.html'];

for (const asset of ['shared/css/tokens.css', 'shared/js/no-zoom.js']) {
  test(`${asset} 的網址帶著跟內容一致的雜湊`, () => {
    const v = createHash('sha1').update(read(asset)).digest('hex').slice(0, 8);
    for (const page of PAGES) {
      assert.ok(read(page).toString().includes(`${asset}?v=${v}`), `${page} 引用的 ${asset} 雜湊不對(跑 python3 tools/stamp-shared.py)`);
    }
  });
}
