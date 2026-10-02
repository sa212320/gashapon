// 一番賞手指撕籤的規則(2026-10-02 grill 定案)。不碰 DOM、不碰 three,node 測得到。
//   進度 = 往右拉的距離 / 籤寬;放開停在原地,下一次從目前進度接著拉;可以往回拉
//   拉超過 3% 就算抽走(commit,這時還看不到獎項),之後拉回 0% 也一樣 —— 不能偷看再取消
//   往前每 8% 一聲撕紙聲,往回不出聲;到 70% 自動撕完(auto),之後拖曳無效
//   「撕開」按鈕:任何進度都直接 auto
export const COMMIT_AT = 0.03;
export const AUTO_AT = 0.7;
export const RIP_STEP = 0.08;

export function createTearDrag() {
  let progress = 0;
  let committed = false;
  let auto = false;
  let anchor = null;   // { x, base }:按下時的手指位置與當時的進度
  let step = 0;        // 上一次所在的撕紙聲區段

  const clamp = p => Math.min(1, Math.max(0, p));

  function advance(next) {
    const events = [];
    progress = clamp(next);
    if (!committed && progress > COMMIT_AT) { committed = true; events.push('commit'); }
    const s = Math.floor(progress / RIP_STEP);
    if (s > step) events.push('rip');
    step = s;
    if (progress >= AUTO_AT) { auto = true; anchor = null; events.push('auto'); }
    return events;
  }

  return {
    get progress() { return progress; },
    get committed() { return committed; },
    get auto() { return auto; },
    get active() { return anchor !== null && !auto; },
    down(x) { if (!auto) anchor = { x, base: progress }; },
    move(x) {
      if (!anchor || auto) return { progress, events: [] };
      const events = advance(anchor.base + (x - anchor.x));
      return { progress, events };
    },
    up() { anchor = null; },
    button() {
      if (auto) return { progress, events: [] };
      const events = [];
      if (!committed) { committed = true; events.push('commit'); }
      auto = true;
      anchor = null;
      events.push('auto');
      return { progress, events };
    },
  };
}
