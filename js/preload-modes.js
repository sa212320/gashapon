// 首頁趁空閒把扭蛋機頁的圖先下載進瀏覽器快取(2026-10-01)。小孩點進去時圖直接從快取拿,
// 揭曉卡片的外框不會再晚一步出現。清單由 tools/mascot-gen/gashapon.py 產生,網址含 ?v=,
// 必須跟扭蛋機頁引用的一字不差,快取才對得上(test/preload-manifest.test.js 會檢查)。
// 只是加速:任何一步失敗都安靜放棄,扭蛋機頁自己還有等待與保底外觀。

// 圖片之後再預載的大檔:three.js(687KB,立體扭蛋機、一番賞、阿彌陀籤、大亂鬥都用)。
// 排在最後,不跟扭蛋機的圖搶頻寬。各模式自己的小 JS 不預載(很小、網址沒有版本號)。
export const EXTRA_URLS = Object.freeze(['vendor/three.module.min.js']);

export function shouldPreload(nav = globalThis.navigator ?? {}) {
  return !nav.connection?.saveData;
}

export async function preloadAll(urls, fetchOne) {
  let ok = 0;
  // 一張一張來:不要跟首頁自己的圖搶頻寬
  for (const url of urls) {
    try { await fetchOne(url); ok++; } catch { /* 下一張 */ }
  }
  return ok;
}

function whenIdle(fn) {
  const go = () => (globalThis.requestIdleCallback ? requestIdleCallback(fn, { timeout: 3000 }) : setTimeout(fn, 1000));
  if (document.readyState === 'complete') go();
  else addEventListener('load', go, { once: true });
}

export function startPreload() {
  if (!shouldPreload()) return;
  whenIdle(async () => {
    try {
      const list = await (await fetch('gashapon/img/preload.json')).json();
      await preloadAll([...list, ...EXTRA_URLS], url => fetch(url, { priority: 'low' }).then(r => r.blob()));
    } catch { /* 清單拿不到就算了 */ }
  });
}

if (typeof document !== 'undefined') startPreload();
