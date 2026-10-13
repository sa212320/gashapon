// 大亂鬥道具圖示與特效的網址(tools/mascot-gen/smash.py build 產生,不要手改)。
// 帶 ?v= 內容雜湊:Pages 會快取 10 分鐘,換圖不換網址的話小孩會看到舊圖。
export const ITEM_URLS = {
  dash: new URL('../img/items/dash.webp?v=09fb34fc', import.meta.url).href,
  freeze: new URL('../img/items/freeze.webp?v=996fdc7c', import.meta.url).href,
  vortex: new URL('../img/items/vortex.webp?v=3108f449', import.meta.url).href,
  meteor: new URL('../img/items/meteor.webp?v=dedadd24', import.meta.url).href,
};

// 特效逐格動畫(撞擊火花、冰隕石砸開):一列 frames 格的橫條,照時間一格一格換
export const FX_URLS = {
  impact: { url: new URL('../img/fx/impact.webp?v=63bd8260', import.meta.url).href, frames: 17 },
  shatter: { url: new URL('../img/fx/shatter.webp?v=d4156fb7', import.meta.url).href, frames: 17 },
  shock: { url: new URL('../img/fx/shock.webp?v=6f03a024', import.meta.url).href, frames: 17 },
};
