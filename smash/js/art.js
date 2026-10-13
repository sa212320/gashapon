// 大亂鬥道具圖示的網址(tools/mascot-gen/smash.py build 產生,不要手改)。
// 帶 ?v= 內容雜湊:Pages 會快取 10 分鐘,換圖不換網址的話小孩會看到舊圖。
export const ITEM_URLS = {
  attack: new URL('../img/items/attack.webp?v=1dee7e98', import.meta.url).href,
  shield: new URL('../img/items/shield.webp?v=d14eaa13', import.meta.url).href,
  spin: new URL('../img/items/spin.webp?v=ee65c7cb', import.meta.url).href,
  missile: new URL('../img/items/missile.webp?v=4e2d0c94', import.meta.url).href,
};
