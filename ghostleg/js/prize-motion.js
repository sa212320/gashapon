// 獎品開跑前在上空亂飛(2026-10-02:使用者要的是「亂飛」,不是只有上下浮)。
// 每個獎品用自己的一組頻率,所以不會排隊一起動。飛向終點時由 track.js 把幅度乘上 (1 − 進度)。
export function wanderOffset(i, tSec, spanX) {
  const s = i * 1.7 + 0.3;
  return {
    x: Math.sin(tSec * (0.7 + (i % 3) * 0.23) + s) * spanX * 0.6,
    y: Math.sin(tSec * (1.3 + (i % 2) * 0.4) + s * 2) * 0.6,
    z: Math.cos(tSec * (0.9 + (i % 4) * 0.17) + s) * 0.9,
    rot: Math.sin(tSec * 1.1 + s) * 0.35,
  };
}

// 閒置時的繪製迴圈。開跑時一定要 stop —— 兩條 rAF 同時畫,獎品會一格在亂飛、一格在飛向終點,看起來在抖。
// 分頁切到背景時瀏覽器本來就會暫停 rAF,不用另外處理。
// raf / caf 每次都去找全域的(不在建立時就綁死),測試或錄影時換掉 window.requestAnimationFrame 才有效
export function createIdleLoop(step, raf = cb => requestAnimationFrame(cb), caf = id => cancelAnimationFrame(id)) {
  let id = 0;
  const loop = {
    running: false,
    start() {
      if (loop.running) return;
      loop.running = true;
      const tick = now => {
        if (!loop.running) return;
        step(now / 1000);
        id = raf(tick);
      };
      id = raf(tick);
    },
    stop() {
      loop.running = false;
      caf(id);
    },
  };
  return loop;
}
