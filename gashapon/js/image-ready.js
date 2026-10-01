// 揭曉卡片的外框圖要在卡片出現之前就畫得出來(2026-10-01:網路慢時看到過沒有框、或只畫出半張框的卡片)。
// 網址從元素實際套用的 CSS 取(含 ?v=),跟畫面用的是同一份快取。

export function cssUrl(value) {
  const m = /url\(\s*["']?([^"')]+)["']?\s*\)/.exec(value || '');
  return m ? m[1] : null;
}

function decodeUrl(url) {
  const img = new Image();
  img.src = url;
  return img.decode();
}

// 等圖解碼好;等不到(timeout、404)就放行,演出不能因為一張圖卡住。回傳是否真的好了。
export function waitForImage(url, { decode = decodeUrl, timeout = 2000 } = {}) {
  if (!url) return Promise.resolve(true);
  return new Promise(resolve => {
    const timer = setTimeout(() => resolve(false), timeout);
    decode(url).then(() => { clearTimeout(timer); resolve(true); }, () => { clearTimeout(timer); resolve(false); });
  });
}
