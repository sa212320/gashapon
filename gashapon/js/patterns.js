// 扭蛋殼的花紋貼圖(灰階,由 CSS 用 multiply 疊在稀有度色上)。
// 2026-10-01 起球本身由 CSS 畫,圖只是花紋:沒載入時蛋還是看得到,只是素面。
// 預載只是為了第一次升階時花紋不要慢半拍才出現。
import { RARITIES } from './constants.js';

export const PATTERN_URLS = Object.freeze(RARITIES.map(r => `img/pattern-${r}.webp`));

function decodeImage(url) {
  const img = new Image();
  img.src = url;
  return img.decode();
}

export async function preloadImages(urls, load = decodeImage) {
  const results = await Promise.allSettled(urls.map(u => load(u)));
  return results.every(r => r.status === 'fulfilled');
}
