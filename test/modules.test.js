// 每一個 JS 模組都要能被解析。
//
// 為什麼需要這條:這個 repo 沒有 package.json,所以 `node --check` 會用 CommonJS 的
// 規則去看 .js —— 對 ES module 的檢查結果不可靠,曾經放行過一個多餘的 `}`,
// 直到在瀏覽器裡整頁掛掉才發現。
//
// 這裡用 `node --input-type=module` 真的去解析每一支。引用 three 的那幾支在 Node 裡
// 解析得過、但解析不到 'three',那是預期的;只有**語法錯誤**才算失敗。
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function collect(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === 'vendor' || name === '.git' || name === 'docs') continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) collect(full, out);
    else if (name.endsWith('.js')) out.push(full);
  }
  return out;
}

test('每一支模組都解析得過', () => {
  const files = collect(root).filter(f => !f.includes('/test/'));
  assert.ok(files.length > 10, `只找到 ${files.length} 支 js,收集邏輯壞了`);

  const broken = [];
  for (const file of files) {
    try {
      execFileSync(process.execPath, ['--input-type=module', '--eval', readFileSync(file, 'utf8')], {
        stdio: 'pipe',
        cwd: dirname(file),
      });
    } catch (err) {
      const msg = String(err.stderr ?? err.message);
      // 解析不到 'three' 或相對路徑是預期的(Node 沒有 importmap);語法錯誤才是問題
      if (/SyntaxError/.test(msg)) broken.push(`${file.replace(root, '')}: ${msg.split('\n').find(l => l.includes('SyntaxError'))}`);
    }
  }
  assert.deepEqual(broken, [], `有模組語法壞掉:\n${broken.join('\n')}`);
});
