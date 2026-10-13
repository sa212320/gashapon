// 大亂鬥道具圖示與特效的網址(tools/mascot-gen/smash.py build 產生,不要手改)。
// 帶 ?v= 內容雜湊:Pages 會快取 10 分鐘,換圖不換網址的話小孩會看到舊圖。
export const ITEM_URLS = {
  attack: new URL('../img/items/attack.webp?v=09fb34fc', import.meta.url).href,
  shield: new URL('../img/items/shield.webp?v=996fdc7c', import.meta.url).href,
  spin: new URL('../img/items/spin.webp?v=ee65c7cb', import.meta.url).href,
  missile: new URL('../img/items/missile.webp?v=4e2d0c94', import.meta.url).href,
};

// 特效逐格動畫(撞擊火花、飛彈爆炸):一列 frames 格的橫條,照時間一格一格換
export const FX_URLS = {
  impact: { url: new URL('../img/fx/impact.webp?v=63bd8260', import.meta.url).href, frames: 17 },
  cloud: { url: new URL('../img/fx/cloud.webp?v=7f199ec1', import.meta.url).href, frames: 17 },
  shock: { url: new URL('../img/fx/shock.webp?v=6f03a024', import.meta.url).href, frames: 17 },
};
