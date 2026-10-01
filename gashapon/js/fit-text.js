// 揭曉卡片的名字自動縮字(2026-10-01):卡片固定比例、外框是一整張圖,所以名字不能撐大卡片,
// 只能縮字。從 max 開始每次縮 step,放得下就停;到 min 還放不下就停在 min(這時靠換行,
// 外面的 CSS 限制最多 3 行)。fits(size) 由呼叫端量實際 DOM。
export function fitFontSize(fits, { max = 40, min = 18, step = 2 } = {}) {
  for (let size = max; size > min; size -= step) {
    if (fits(size)) return size;
  }
  return min;
}

// 套到實際元素上:名字要塞進 box(名字那一格)裡,寬高都不能溢出
export function fitText(el, box, opts) {
  const size = fitFontSize(s => {
    el.style.fontSize = `${s}px`;
    return el.scrollWidth <= box.clientWidth && el.scrollHeight <= box.clientHeight;
  }, opts);
  el.style.fontSize = `${size}px`;
  return size;
}
