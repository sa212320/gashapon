// 動物圓片:爬格子的動物圖是全身站姿,圓片只要頭(含耳朵、角)。
// 每隻動物的頭位置不一樣(兔子耳朵長、臉在比較下面),所以每隻各自一組圓心與半徑。
import test from 'node:test';
import assert from 'node:assert/strict';
import { chipCrop, CHIP_CROPS } from '../smash/js/chip.js';
import { ANIMALS } from '../smash/js/beys.js';

test('10 隻動物都有自己的裁切', () => {
  assert.deepEqual(Object.keys(CHIP_CROPS).sort(), [...ANIMALS].sort());
});

test('裁出來的是包住圓片的正方形,圓心在頭上', () => {
  for (const animal of ANIMALS) {
    const { sx, sy, size } = chipCrop(animal, 180, 256);
    const [cx, cy, r] = CHIP_CROPS[animal];
    assert.ok(Math.abs(size - 2 * r * 256) < 1e-9);
    assert.ok(Math.abs(sx + size / 2 - cx * 180) < 1e-9);
    assert.ok(Math.abs(sy + size / 2 - cy * 256) < 1e-9);
    assert.ok(cy < 0.5, `${animal} 的圓心跑到身體上了`);
  }
});

test('不認得的動物用預設值,不會壞', () => {
  const { size } = chipCrop('dragon', 200, 256);
  assert.ok(size > 0);
});
