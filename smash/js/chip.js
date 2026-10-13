// 動物圓片的裁切。爬格子的動物圖是全身站姿,圓片只要頭(含耳朵、鹿角、兔耳)。
// 每隻的頭位置不一樣 —— 兔子耳朵長、臉在比較下面,雪人的頭比較小 ——
// 所以每隻各自一組:圓心(以圖寬、圖高的比例)與半徑(以圖高的比例),照圓形的樣子逐隻調過。
// 純函式,Node 測得到。
export const CHIP_CROPS = Object.freeze({
  bear: [0.5, 0.31, 0.36],
  cat: [0.5, 0.3, 0.37],
  dog: [0.5, 0.31, 0.4],
  hamster: [0.5, 0.3, 0.37],
  owl: [0.49, 0.34, 0.4],
  penguin: [0.5, 0.33, 0.38],
  rabbit: [0.5, 0.45, 0.42],
  reindeer: [0.5, 0.37, 0.4],
  seal: [0.5, 0.28, 0.34],
  snowman: [0.5, 0.29, 0.35],
});
const FALLBACK = [0.5, 0.32, 0.37];

// 回傳包住那個圓的正方形(畫到畫布上再用圓形裁)
export function chipCrop(animal, w, h) {
  const [cx, cy, r] = CHIP_CROPS[animal] ?? FALLBACK;
  const size = 2 * r * h;
  return { sx: cx * w - size / 2, sy: cy * h - size / 2, size };
}
