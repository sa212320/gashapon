// 九宮格外框的上色:灰階 → 稀有度色(效果等於 multiply,alpha 原樣保留)。
import test from 'node:test';
import assert from 'node:assert/strict';
import { colorToMatrix, tintColorFor, mountTintFilters } from '../shared/js/tint.js';
import { RARITIES, RARITY_META } from '../gashapon/js/constants.js';

test('colorToMatrix:白色 → 單位矩陣(灰階原樣)', () => {
  assert.deepEqual(colorToMatrix('#FFFFFF'), [1,0,0,0,0, 0,1,0,0,0, 0,0,1,0,0, 0,0,0,1,0]);
});

test('colorToMatrix:黑色 → RGB 全 0,alpha 保留', () => {
  assert.deepEqual(colorToMatrix('#000000'), [0,0,0,0,0, 0,0,0,0,0, 0,0,0,0,0, 0,0,0,1,0]);
});

test('colorToMatrix:#5FD68A 的對角係數', () => {
  const m = colorToMatrix('#5FD68A');
  assert.equal(m[0].toFixed(4), (0x5F / 255).toFixed(4));
  assert.equal(m[6].toFixed(4), (0xD6 / 255).toFixed(4));
  assert.equal(m[12].toFixed(4), (0x8A / 255).toFixed(4));
});

test('tintColorFor:UR 的哨兵值 rainbow 改用 edge', () => {
  assert.equal(tintColorFor(RARITY_META.UR), '#8B5CF6');
  assert.equal(tintColorFor(RARITY_META.R), '#5FD68A');
});

test('mountTintFilters:每個稀有度一個 filter,重複呼叫不會疊兩份', () => {
  const doc = fakeDoc();
  mountTintFilters(RARITY_META, doc);
  mountTintFilters(RARITY_META, doc);
  assert.equal(doc.body.children.length, 1);
  const ids = doc.body.children[0].children.map(f => f.attrs.id);
  assert.deepEqual(ids, RARITIES.map(r => `tint-${r}`));
});

function fakeDoc() {
  const make = tag => ({
    tag, attrs: {}, children: [],
    setAttribute(k, v) { this.attrs[k] = v; },
    appendChild(c) { this.children.push(c); return c; },
    replaceWith(n) { const i = doc.body.children.indexOf(this); doc.body.children[i] = n; },
  });
  const doc = {
    body: make('body'),
    createElementNS: (_, tag) => make(tag),
    getElementById: id => doc.body.children.find(c => c.attrs.id === id) ?? null,
  };
  return doc;
}
