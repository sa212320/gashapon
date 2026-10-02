// 阿彌陀籤存檔正規化(2026-10-02 加 animal / tier)。舊存檔沒有這兩個欄位,或被手改成怪東西。
import test from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeSetup, seedState } from '../ghostleg/js/store.js';
import { ANIMALS } from '../ghostleg/js/ladder.js';

const raw = (players, prizes = []) => ({ id: 'gs1', name: 'x', players, prizes });

test('舊存檔沒有 animal:照順序補 ANIMALS[i % ANIMALS.length]', () => {
  const n = ANIMALS.length + 2;
  const s = sanitizeSetup(raw(Array.from({ length: n }, (_, i) => ({ id: `p${i}`, name: `n${i}`, color: '#E4572E' }))));
  assert.deepEqual(s.players.map(p => p.animal), [...ANIMALS, ANIMALS[0], ANIMALS[1]]);
});

test('animal 不合法:同樣照順序補;合法的保留', () => {
  const s = sanitizeSetup(raw([
    { id: 'a', name: 'a', color: '#E4572E', animal: 'dragon' },
    { id: 'b', name: 'b', color: '#E4572E', animal: 'cat' },
  ]));
  assert.deepEqual(s.players.map(p => p.animal), ['snowman', 'cat']);
});

test('舊存檔沒有 tier 或 tier 不合法:補 plain;合法的保留', () => {
  const s = sanitizeSetup(raw([], [
    { id: 'x', name: '頭', count: 1 },
    { id: 'y', name: '二', count: 1, tier: 'gold' },
    { id: 'z', name: '三', count: 2, tier: 'chest' },
  ]));
  assert.deepEqual(s.prizes.map(p => p.tier), ['plain', 'plain', 'chest']);
});

test('種子資料:6 個人各配一種不同的動物,獎項都是 plain', () => {
  const setup = seedState().setups[0];
  assert.deepEqual(setup.players.map(p => p.animal), ANIMALS.slice(0, 6));
  assert.ok(setup.prizes.every(p => p.tier === 'plain'));
});

// 2026-10-02 使用者:「阿彌陀籤可以幫我改名叫爬格子嗎,小孩比較好懂」
import { readFileSync } from 'node:fs';
const read = p => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

test('畫面上的名字是「爬格子」(頁面標題、標題列、設定、首頁卡片)', () => {
  const page = read('ghostleg/index.html');
  assert.match(page, /<title>爬格子<\/title>/);
  assert.match(page, /<h2>爬格子設定<\/h2>/);
  assert.match(page, /placeholder="我的爬格子"/);
  assert.match(read('index.html'), /<span class="card__name">爬格子<\/span>/);
  for (const f of ['ghostleg/index.html', 'index.html', 'ghostleg/js/main.js', 'ghostleg/js/store.js', 'ghostleg/js/ladder.js']) {
    // 註解、以及 store.js 把舊預設名字換掉的那一行(本來就要寫著舊名字才比對得到)不算
    const visible = read(f).split('\n').filter(l => !/^\s*(\/\/|\*|\/\*|<!--)/.test(l) && !/!== '我的阿彌陀籤'/.test(l)).join('\n');
    assert.ok(!/['">]阿彌陀籤|我的阿彌陀籤/.test(visible), `${f} 還有舊名字`);
  }
});

test('種子資料叫「我的爬格子」;舊存檔還叫預設的「我的阿彌陀籤」就換成新名字,自己取的名字不動', () => {
  assert.equal(seedState().setups[0].name, '我的爬格子');
  assert.equal(sanitizeSetup({ id: 'a', name: '我的阿彌陀籤', players: [], prizes: [] }).name, '我的爬格子');
  assert.equal(sanitizeSetup({ id: 'b', name: '三年二班', players: [], prizes: [] }).name, '三年二班');
});
