// 一番賞、阿彌陀籤、大亂鬥跟扭蛋機一樣:音效、設定在右上角,回首頁在左上角,一律手繪 SVG 圖示。
// 設定是給大人用的,放在「開始」旁邊小孩很容易按到(2026-10-01 扭蛋機定案,2026-10-02 其他模式跟上)。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = p => readFileSync(join(root, p), 'utf8');
const between = (s, open, close) => {
  const i = s.indexOf(open);
  return i < 0 ? '' : s.slice(i, s.indexOf(close, i));
};

for (const mode of ['ichiban', 'ghostleg', 'smash']) {
  test(`${mode}:音效、設定在右上角,用 SVG 圖示`, () => {
    const html = read(`${mode}/index.html`);
    const corner = between(html, '<div class="corner-tools"', '</div>');
    assert.match(corner, /id="soundBtn"/);
    assert.match(corner, /id="settingsBtn"/);
    assert.match(corner, /<use id="soundIcon" href="\.\.\/shared\/img\/icons\.svg#sound-on"/);
    assert.match(corner, /icons\.svg#settings/);
  });

  test(`${mode}:回首頁在左上角,不是文字箭頭`, () => {
    const html = read(`${mode}/index.html`);
    assert.match(html, /<a class="home-link home-link--corner" href="\.\.\/"[^>]*>\s*<svg[^>]*><use href="\.\.\/shared\/img\/icons\.svg#home"/);
    assert.ok(!/>←</.test(html), '回首頁不能再是文字箭頭');
  });

  test(`${mode}:頁面上沒有 emoji 圖示,工具列裡不再有音效/設定`, () => {
    const html = read(`${mode}/index.html`);
    assert.ok(!/🔊|🔇|⚙/u.test(html), '不能再有 emoji 圖示');
    const toolbar = between(html, '<footer class="toolbar">', '</footer>');
    assert.ok(!/id="soundBtn"|id="settingsBtn"/.test(toolbar), '工具列裡不該再有音效/設定');
  });

  test(`${mode}:音效圖示切換 SVG 的 href,不是換 emoji 文字`, () => {
    const js = read(`${mode}/js/main.js`);
    assert.match(js, /\$\('soundIcon'\)\.setAttribute\('href'/);
    assert.ok(!/soundIcon'\)\.textContent/.test(js));
  });
}

test('一番賞的底部工具列已經空了,整個拿掉', () => {
  assert.ok(!/<footer class="toolbar">/.test(read('ichiban/index.html')));
});
