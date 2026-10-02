// 阿彌陀籤的素材網址(含 ?v= 內容雜湊,由 tools/mascot-gen/ghostleg.py build 蓋上)。
// 首頁的 preload.json 從這支檔案抓網址,所以網址要寫成 new URL('../img/…?v=…', import.meta.url) 的字面值。
export const ANIMAL_URLS = {

};
export const PRIZE_URLS = {
  plain: new URL('../img/prizes/plain.webp?v=b85adb1b', import.meta.url).href,
  chest: new URL('../img/prizes/chest.webp?v=751b799b', import.meta.url).href,
  deluxe: new URL('../img/prizes/deluxe.webp?v=80310a54', import.meta.url).href,
  snow: new URL('../img/prizes/snow.webp?v=d1afd51e', import.meta.url).href,
};
export const BOARD_URL = new URL('../img/board.webp?v=7c49e668', import.meta.url).href;

export const ANIMAL_LABEL = {
  snowman: '雪人', rabbit: '兔子', penguin: '企鵝', reindeer: '馴鹿', cat: '貓',
  dog: '狗', bear: '北極熊', seal: '海豹', owl: '雪鴞', hamster: '倉鼠',
};
export const TIER_LABEL = { plain: '一般', chest: '大獎', deluxe: '頭獎' };

let loaded = { animals: {}, prizes: {}, board: null };

function loadImage(url) {
  return new Promise(resolve => {
    if (!url) return resolve(null);
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);   // 載不到就用暫代圖,絕不卡住整頁
    img.src = url;
  });
}

// 進頁面先把全部素材載好(頁內 warm-up):第一次開跑、打開設定時都不必再等下載
export async function loadArt() {
  const entries = async table => Object.fromEntries(
    await Promise.all(Object.entries(table).map(async ([k, u]) => [k, await loadImage(u)])));
  loaded = { animals: await entries(ANIMAL_URLS), prizes: await entries(PRIZE_URLS), board: await loadImage(BOARD_URL) };
  return loaded;
}

export function getArt() {
  return loaded;
}
