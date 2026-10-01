// 吉祥物的逐格播放器。純狀態機:不碰 DOM、不碰計時器,呼叫端每一格
// 呼叫一次 step(),再用 view() 拿到要畫的圖層。這樣測試可以一格一格
// 推進,不用假時鐘。
//
// 規則(docs/superpowers/specs/2026-09-30-mascot-video-segments-design.md §2):
// - pending 只有一格,新的覆蓋舊的 —— 不是佇列
// - 過渡段一定播完,只在最後一格之後看 pending
// - 循環與小動作任何一格都能離開:往最近的關鍵圖(第 0 格或最後一格)快轉,
//   每格跳 SEEK_STEP 格,到了再接下一段。任何時刻都只畫一層 —— 原本用
//   兩層交叉淡入,尾巴擺動幅度大,疊起來會有錯位的殘影(2026-10-01 修訂)
// - 片段交界的兩格是同一張關鍵圖,所以接下一段、循環繞回都從第 1 格開始
// - 下一段還沒載入:目標關鍵圖淡入保底,at 直接跳到目標

import { POSES, route, loopOf, fidgetsOf } from './mascot-route.js';

export const SEEK_STEP = 3;
export const FALLBACK_FRAMES = 5;      // 素材是 12fps,約 417ms
export const FIDGET_GAP_SEC = [4, 9];

export function createPlayer({ manifest, isLoaded = () => true, rng = Math.random }) {
  const segs = new Map(manifest.segments.map(s => [s.id, s]));
  const fps = manifest.segments[0].fps;

  let at = 'idle';
  let pending = null;
  let path = [];          // 目前這段之後還要播的 segment id
  let cur = null;         // { id, index };null 代表正在顯示 at 的關鍵圖
  let fade = null;        // { under: Layer, k, total } 保底時疊在底下的舊畫面
  let fidgetAllowed = true;
  let idleFrames = 0;
  let gap = pickGap();

  function pickGap() {
    const [a, b] = FIDGET_GAP_SEC;
    return Math.round((a + rng() * (b - a)) * fps);
  }

  function currentLayer() {
    return cur
      ? { kind: 'seg', id: cur.id, index: cur.index, alpha: 1 }
      : { kind: 'key', pose: at, alpha: 1 };
  }


  function enterLoop(pose, index) {
    const loop = loopOf(manifest, pose);
    cur = isLoaded(loop.id) ? { id: loop.id, index } : null;
  }

  function fallback(pose) {
    const under = currentLayer();
    fade = { under, k: 1, total: FALLBACK_FRAMES };
    at = pose;
    path = [];
    cur = null;
  }

  // 開始播 id;沒載入就走保底到整條路徑的終點。
  function begin(id, index, finalPose) {
    if (!isLoaded(id)) { fallback(finalPose); return false; }
    cur = { id, index };
    return true;
  }

  // 消化 pending,從目前所在的關鍵圖出發走新路徑。回傳「是否已經處理掉這一格」。
  function startRoute(index) {
    const p = pending;
    pending = null;
    if (p === at) return false;
    const ids = route(manifest, at, p);
    if (!begin(ids[0], index, p)) return true;
    path = ids.slice(1);
    return true;
  }

  // 循環 / 小動作要離開:還沒到關鍵圖就往比較近的那一端快轉一步;
  // 到了就接上新路徑(關鍵圖 = 新片段第 0 格,所以從第 1 格開始)。
  function seek(s) {
    const last = s.frames - 1;
    if (cur.index === 0 || cur.index === last) {
      if (!startRoute(1)) advanceNormally(s);
      return;
    }
    cur.index = cur.index <= last - cur.index
      ? Math.max(0, cur.index - SEEK_STEP)
      : Math.min(last, cur.index + SEEK_STEP);
  }

  function onSegmentEnd(s) {
    if (s.kind === 'transition') {
      at = s.to;
      if (pending !== null) {
        const p = pending;
        pending = null;
        path = route(manifest, at, p);
      }
      if (path.length) {
        const next = path.shift();
        const finalPose = segs.get(path.at(-1) ?? next).to;
        begin(next, 1, finalPose);
      } else {
        enterLoop(at, 1);
      }
      return;
    }
    if (s.kind === 'fidget') {
      enterLoop('idle', 1);
      return;
    }
    // 循環繞回點:idle 且允許時,看要不要插播小動作
    if (at === 'idle' && fidgetAllowed && idleFrames >= gap) {
      const ready = fidgetsOf(manifest).filter(f => isLoaded(f.id));
      if (ready.length) {
        const pick = ready[Math.min(ready.length - 1, Math.floor(rng() * ready.length))];
        cur = { id: pick.id, index: 1 };
        idleFrames = 0;
        gap = pickGap();
        return;
      }
    }
    cur.index = 1;
  }

  function advanceFade() {
    if (!fade) return;
    fade.k += 1;
    if (fade.k > fade.total) fade = null;
  }

  function advanceNormally(s) {
    if (s.id === loopOf(manifest, 'idle').id) idleFrames += 1;
    if (cur.index < s.frames - 1) {
      cur.index += 1;
      return;
    }
    onSegmentEnd(s);
  }

  function step() {
    advanceFade();

    if (cur === null) {
      // 正在顯示關鍵圖:它就是新片段的第 0 格,直接從第 0 格開始
      if (pending !== null && startRoute(0)) return;
      enterLoop(at, 1);
      return;
    }

    const s = segs.get(cur.id);
    if (s.kind !== 'transition' && pending !== null) {
      if (pending === at) pending = null;
      else { seek(s); return; }
    }
    advanceNormally(s);
  }

  function view() {
    const topLayer = currentLayer();
    if (!fade) return { layers: [topLayer] };
    return { layers: [fade.under, { ...topLayer, alpha: fade.k / fade.total }] };
  }

  function target() {
    if (pending !== null) return pending;
    if (path.length) return segs.get(path.at(-1)).to;
    if (cur && segs.get(cur.id).kind === 'transition') return segs.get(cur.id).to;
    return at;
  }

  // 一開始:idle-loop 第 0 格(載好了的話),不然 idle 關鍵圖
  enterLoop('idle', 0);

  return {
    request(pose) { if (POSES.includes(pose)) pending = pose; },
    step,
    view,
    target,
    at: () => at,
    setFidgetAllowed(v) { fidgetAllowed = Boolean(v); },
  };
}
