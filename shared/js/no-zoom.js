// 全站不能縮放(2026-10-02 使用者指定)。CSS 的 touch-action 跟 viewport 的 user-scalable=no
// 擋得住大部分瀏覽器,但 iOS Safari 為了無障礙會無視 user-scalable=no,而且 touch-action 在它上面
// 也不一定擋得住雙擊放大(使用者實機:「搖晃按鈕連點兩下還是會縮放」)。這裡再攔兩件事:
//   1. 雙指縮放:iOS 自己的 gesture 事件
//   2. 雙擊放大:300ms 內、差不多同一個位置的第二下 touchend 取消預設 —— 但取消之後那一下的
//      click 也不會發生,所以**自己補發 click**:小孩連點「搖動」,每一下都要算數
// 一般 script(不是 module),在 <head> 就生效;test/no-zoom.test.js 用假的 document 跑它。
(() => {
  for (const type of ['gesturestart', 'gesturechange', 'gestureend']) {
    document.addEventListener(type, e => e.preventDefault(), { passive: false });
  }

  const WINDOW_MS = 300;
  const NEAR_PX = 40;
  let last = null;   // 上一下 touchend 的 { t, x, y }

  document.addEventListener('touchend', e => {
    const p = e.changedTouches?.[0];
    if (!p) return;
    const t = performance.now();
    const quick = last && t - last.t < WINDOW_MS
      && Math.hypot(p.clientX - last.x, p.clientY - last.y) < NEAR_PX;
    last = { t, x: p.clientX, y: p.clientY };
    // 輸入框要能雙擊選字、叫出鍵盤,不攔
    if (!quick || /^(INPUT|TEXTAREA|SELECT)$/.test(e.target?.tagName ?? '')) return;
    e.preventDefault();
    e.target?.dispatchEvent?.(new MouseEvent('click', {
      bubbles: true, cancelable: true, clientX: p.clientX, clientY: p.clientY,
    }));
    last = null;     // 第三下重新算,不要每一下都被當成雙擊
  }, { passive: false });
})();
