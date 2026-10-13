// 場上道具圖示的大小:桌機照原本的 ITEM_SIZE(世界單位),手機上整個盤子很小,
// 圖示至少要有 ITEM_MIN_PX 像素,不然四個冰藍色圖示只剩 10 像素、分不出來。
import test from 'node:test';
import assert from 'node:assert/strict';
import { itemSize, ITEM_SIZE, ITEM_MIN_PX } from '../smash/js/item-size.js';

test('桌機(一單位好幾像素):照原本的大小', () => {
  assert.equal(itemSize(4), ITEM_SIZE);
});

test('手機(一單位不到一像素):放大到至少 ITEM_MIN_PX 像素', () => {
  const px = 0.6;
  assert.ok(itemSize(px) * px >= ITEM_MIN_PX - 1e-9);
  assert.ok(itemSize(px) > ITEM_SIZE);
});

test('量不到(0 或壞值)就用原本的大小', () => {
  assert.equal(itemSize(0), ITEM_SIZE);
  assert.equal(itemSize(NaN), ITEM_SIZE);
});
