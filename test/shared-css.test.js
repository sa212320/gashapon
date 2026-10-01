// 2D 跟 3D 共用的樣式只能住在 shared/ —— 留在 gashapon/css 的話,立體扭蛋機讀到的會是舊值
// (2026-10-01 發現:tokens.css 的 --rainbow 是調整前的鮮豔版、也沒有 --gold)。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = p => readFileSync(join(root, p), 'utf8');

test('稀有度色只定義在 tokens.css,而且是 2D 調過的值', () => {
  const tokens = read('shared/css/tokens.css');
  const style = read('gashapon/css/style.css');
  for (const v of ['--gold:', '--rainbow:', '--rainbow-conic:', '--r-SSR-a:', '--r-SSR-b:']) {
    assert.ok(tokens.includes(v), `tokens.css 少了 ${v}`);
    assert.ok(!style.includes(v), `gashapon/css/style.css 不該再定義 ${v}`);
  }
  assert.match(tokens, /--r-SSR-a:\s*#FFD54A/);
  assert.match(tokens, /#FFA3B1 0%/);
});

test('角落圖示、剩餘膠囊、稀有度標籤、shimmer 都在 shared/', () => {
  const tokens = read('shared/css/tokens.css');
  const frame = read('shared/css/prize-frame.css');
  const style = read('gashapon/css/style.css');
  for (const sel of ['.home-link--corner', '.corner-tools', '.remain-tag']) {
    assert.ok(tokens.includes(sel), `tokens.css 少了 ${sel}`);
    assert.ok(!style.includes(`${sel} {`), `style.css 還留著 ${sel}`);
  }
  assert.ok(frame.includes('.prize-card__badge[data-rarity="UR"]'));
  assert.ok(frame.includes('@keyframes shimmer'));
  assert.ok(!read('gashapon/css/animations.css').includes('@keyframes shimmer'));
  assert.ok(frame.includes('.preload-rack'));
  assert.ok(!style.includes('.preload-rack {'));
});

// 全站不能縮放、不能反白(2026-10-02 使用者指定):手機上連點會觸發雙擊放大、長按會反白文字,
// 小孩玩的時候整頁就亂掉。代價是不能放大頁面(使用者知道並決定這樣做)。
const PAGES = ['index.html', 'gashapon/index.html', 'gashapon3d/index.html', 'ichiban/index.html', 'ghostleg/index.html', 'smash/index.html'];

test('全站不能縮放:viewport 鎖住、CSS 只留捲動、iOS 的縮放手勢被攔下', () => {
  const tokens = read('shared/css/tokens.css');
  assert.match(tokens, /html\s*\{[^}]*touch-action:\s*pan-x pan-y/);
  for (const page of PAGES) {
    const html = read(page);
    assert.match(html, /name="viewport"[^>]*maximum-scale=1[^>]*user-scalable=no/, `${page} 的 viewport 沒鎖縮放`);
    assert.match(html, /<script src="(\.\.\/)?shared\/js\/no-zoom\.js"><\/script>/, `${page} 沒載 no-zoom.js`);
  }
  assert.match(read('shared/js/no-zoom.js'), /gesturestart/);
});

test('全站不能反白,但輸入框還是可以選字', () => {
  const tokens = read('shared/css/tokens.css');
  assert.match(tokens, /html\s*\{[^}]*user-select:\s*none/);
  assert.match(tokens, /input,\s*textarea,\s*select\s*\{[^}]*user-select:\s*text/);
});
