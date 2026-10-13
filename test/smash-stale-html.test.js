// Pages 會快取 HTML 約 10 分鐘:新版剛上線時,舊的 smash/index.html 可能配上新的 main.js。
// 新版才有的元素(倒數字、道具開關)找不到時不能丟例外 —— 不然整頁卡在「載入中」。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('../smash/js/main.js', import.meta.url), 'utf8');

test('main.js 取 #countdown 一律防空值(const x = $(...); 下一句就是 if (x))', () => {
  const all = [...src.matchAll(/\$\('countdown'\)/g)].length;
  const guarded = [...src.matchAll(/const (\w+) = \$\('countdown'\);\s*if \(\1\)/g)].length;
  assert.ok(all > 0);
  assert.equal(guarded, all, `${all - guarded} 處沒防空值`);
});
