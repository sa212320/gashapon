// 揭曉要用到的圖(扭蛋花紋、外框)預先載入。
// 不自己組網址:CSS 裡的網址帶內容雜湊 ?v=…,自己組的網址不同就是另一份快取,等於沒預載。
// 做法是放一排看不到的元素,套上跟正式畫面一樣的 class 與 data-rarity,讓瀏覽器照 CSS 下載。
import { RARITIES } from './constants.js';

export function mountPreloadRack(doc = document) {
  const rack = doc.createElement('div');
  rack.className = 'preload-rack';
  rack.setAttribute('aria-hidden', 'true');
  for (const r of RARITIES) {
    const frame = doc.createElement('div');
    frame.className = 'prize-card prize-frame';
    frame.dataset.rarity = r;
    const capsule = doc.createElement('div');
    capsule.className = 'capsule';
    capsule.dataset.rarity = r;
    for (const half of ['top', 'bottom']) {
      const h = doc.createElement('span');
      h.className = `capsule__half capsule__half--${half}`;
      const tint = doc.createElement('span');
      tint.className = 'capsule__tint';   // UR 的彩虹底色層
      h.appendChild(tint);
      capsule.appendChild(h);
    }
    rack.append(frame, capsule);
  }
  doc.body.appendChild(rack);
  return rack;
}
