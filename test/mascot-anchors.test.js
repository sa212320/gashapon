// 揭曉錨點的位置規則:吉祥物要站在獲勝卡片「旁邊」,不能蓋住卡片內容。
// 2026-10-01 放大吉祥物之後,阿彌陀籤的結果卡前兩列獎項被蓋住;實測各模式
// 有 18%~36% 的吉祥物範圍壓在卡片上。做法是每個模式都把 #revealAnchor 放進
// 卡片元素裡,用共用的 .mascot-anchor--beside 定位到卡片右側外面
// (shared/css/mascot.css)。這條測試防止之後有人把錨點搬回卡片外、
// 或拿掉 class 改回各模式自己的座標。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const CARDS = {
  gashapon: 'prizeCard',
  gashapon3d: 'prizeCard',
  ichiban: 'tearCard',
  ghostleg: 'results',
  smash: 'winner',
};

// 從 id="<cardId>" 那個開標籤往後數 <div / <section 與對應的結束標籤,
// 找到這個元素的範圍。這些頁面都是手寫的簡單 HTML,夠用。
function elementSpan(html, id) {
  const open = html.search(new RegExp(`<(div|section)\\b[^>]*\\bid="${id}"`));
  assert.ok(open >= 0, `找不到 #${id}`);
  const tag = html.slice(open + 1).match(/^(div|section)/)[1];
  const re = new RegExp(`<${tag}\\b|</${tag}>`, 'g');
  re.lastIndex = open;
  let depth = 0;
  for (let m; (m = re.exec(html)); ) {
    depth += m[0].startsWith('</') ? -1 : 1;
    if (depth === 0) return [open, re.lastIndex];
  }
  throw new Error(`#${id} 沒有結束標籤`);
}

for (const [mode, cardId] of Object.entries(CARDS)) {
  test(`${mode}:#revealAnchor 在 #${cardId} 裡面,而且帶 mascot-anchor--beside`, () => {
    const html = readFileSync(join(root, mode, 'index.html'), 'utf8');
    const [start, end] = elementSpan(html, cardId);
    const at = html.indexOf('id="revealAnchor"');
    assert.ok(at > start && at < end, `#revealAnchor 不在 #${cardId} 裡`);
    const tag = html.slice(html.lastIndexOf('<', at), html.indexOf('>', at) + 1);
    assert.match(tag, /\bmascot-anchor--beside\b/, tag);
  });
}
