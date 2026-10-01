// 全站不能縮放(2026-10-02 使用者指定)。CSS 的 touch-action 跟 viewport 的 user-scalable=no
// 擋得住大部分瀏覽器,但 iOS Safari 為了無障礙會無視 user-scalable=no,
// 雙指縮放要另外攔它自己的 gesture 事件。一般 script(不是 module),在 <head> 就生效。
for (const type of ['gesturestart', 'gesturechange', 'gestureend']) {
  document.addEventListener(type, e => e.preventDefault(), { passive: false });
}
