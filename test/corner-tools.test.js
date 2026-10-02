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

// 2026-10-02 使用者:「功能內標題是不是也都統一拔了?」「一番賞小字感覺沒用,可以拔了」
// 跟扭蛋機、立體扭蛋機一樣:沒有標題列;人數那行小字變成開始鈕旁的 remain-tag(一番賞不要)
for (const mode of ['ichiban', 'ghostleg', 'smash']) {
  test(`${mode}:沒有標題列`, () => {
    const html = read(`${mode}/index.html`);
    assert.ok(!/class="topbar"/.test(html));
    assert.ok(!/id="setupName"|id="remaining"/.test(html));
    assert.ok(!/\$\('setupName'\)|\$\('remaining'\)/.test(read(`${mode}/js/main.js`)));
  });
}

for (const mode of ['smash']) {
  test(`${mode}:人數小字是開始鈕旁的 remain-tag`, () => {
    const toolbar = between(read(`${mode}/index.html`), '<footer class="toolbar">', '</footer>');
    assert.match(toolbar, /<p class="remain-tag" id="remainTag">/);
    assert.match(read(`${mode}/js/main.js`), /\$\('remainTag'\)\.textContent = /);
  });
}

test('一番賞、爬格子不顯示人數 / 張數小字(使用者:「小字沒用」「爬格子小字也不用」)', () => {
  for (const mode of ['ichiban', 'ghostleg']) {
    assert.ok(!/remainTag|remain-tag/.test(read(`${mode}/index.html`)), mode);
    assert.ok(!/remainTag/.test(read(`${mode}/js/main.js`)), mode);
  }
});
