// 盤子造型照 Nick__Furry 在 MakerWorld 的復刻檔量出來(CC BY-NC),頁面上要註明來源。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('大亂鬥頁面註明盤子造型的來源與授權', () => {
  const html = readFileSync(new URL('../smash/index.html', import.meta.url), 'utf8');
  assert.match(html, /Nick__Furry/);
  assert.match(html, /CC BY-NC/);
  assert.match(html, /makerworld\.com\/en\/models\/1147551/);
});
