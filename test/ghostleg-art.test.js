// 阿彌陀籤素材的純函式。染色本身要 canvas,在瀏覽器驗;這裡只測不靠 DOM 的部分。
import test from 'node:test';
import assert from 'node:assert/strict';
import { textColorFor } from '../ghostleg/js/tint.js';
import { ANIMAL_LABEL, TIER_LABEL } from '../ghostleg/js/art.js';
import { ANIMALS, TIERS, PALETTE } from '../ghostleg/js/ladder.js';

test('textColorFor:深色底白字、淺色底深棕字', () => {
  assert.equal(textColorFor('#3D7EA6'), '#FFFFFF');
  assert.equal(textColorFor('#8E6BBF'), '#FFFFFF');
  assert.equal(textColorFor('#E8B830'), '#574239');
  assert.equal(textColorFor('#FFFFFF'), '#574239');
});

test('PALETTE 每一色的名牌字都有至少 3:1 的對比', () => {
  const lum = hex => {
    const c = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255)
      .map(v => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  };
  for (const bg of PALETTE) {
    const fg = textColorFor(bg);
    const [a, b] = [lum(bg), lum(fg)].sort((x, y) => y - x);
    assert.ok((a + 0.05) / (b + 0.05) >= 3, `${bg} 配 ${fg}`);
  }
});

test('每種動物、每個等級都有中文標籤', () => {
  for (const a of ANIMALS) assert.ok(ANIMAL_LABEL[a], a);
  for (const t of TIERS) assert.ok(TIER_LABEL[t], t);
  assert.deepEqual(TIER_LABEL, { plain: '一般', chest: '大獎', deluxe: '頭獎' });
});
