// 逐格圖的載入與繪製。從 mascot.js 拆出來,是為了不靠真的 canvas / 網路
// 也測得到:loadImage 與 ctx 都由呼叫端注入。
//
// 預載順序照「使用者實際會先碰到什麼」排(spec §2):待機 → 開始抽 →
// 揭曉 → 關面板,罕見的排最後。一段一段依序載,不同時開十幾個請求
// 搶頻寬 —— 搶的結果是最需要的 idle-loop 反而最晚到。

export const PRELOAD_ORDER = Object.freeze([
  'idle-loop', 'idle-watch', 'watch-loop', 'watch-cheer', 'watch-aww',
  'cheer-loop', 'aww-loop', 'cheer-idle', 'aww-idle',
]);

export function createSheets({ manifest, baseURL, loadImage, warn = console.warn }) {
  const sheets = new Map();
  const keys = new Map();
  let warned = false;
  const url = (p) => new URL(p, baseURL).href;
  const warnOnce = (what, err) => {
    if (warned) return;
    warned = true;
    warn(`[mascot] 素材載入失敗,改用關鍵圖保底:${what}`, err);
  };

  const keyJobs = Object.entries(manifest.keyframes).map(([pose, p]) =>
    loadImage(url(p)).then(img => { keys.set(pose, img); }, err => warnOnce(p, err)));

  const byId = new Map(manifest.segments.map(s => [s.id, s]));
  const order = [
    ...PRELOAD_ORDER.filter(id => byId.has(id)),
    ...manifest.segments.map(s => s.id).filter(id => !PRELOAD_ORDER.includes(id)),
  ];

  const segJob = (async () => {
    for (const id of order) {
      const s = byId.get(id);
      try {
        sheets.set(id, await loadImage(url(s.sheet)));
      } catch (err) {
        warnOnce(s.sheet, err);
      }
    }
  })();

  return {
    isLoaded: (id) => sheets.has(id),
    sheet: (id) => sheets.get(id),
    key: (pose) => keys.get(pose),
    done: Promise.all([...keyJobs, segJob]).then(() => {}),
  };
}

export function frameRect(seg, index, frame) {
  const col = index % seg.cols;
  const row = Math.floor(index / seg.cols);
  return { sx: col * frame.w, sy: row * frame.h, sw: frame.w, sh: frame.h };
}

export function draw(ctx, view, { manifest, sheets }) {
  const { w, h } = manifest.frame;
  const byId = new Map(manifest.segments.map(s => [s.id, s]));
  ctx.clearRect(0, 0, w, h);
  for (const layer of view.layers) {
    if (layer.kind === 'seg') {
      const img = sheets.sheet(layer.id);
      if (!img) continue;
      const r = frameRect(byId.get(layer.id), layer.index, manifest.frame);
      ctx.globalAlpha = layer.alpha;
      ctx.drawImage(img, r.sx, r.sy, r.sw, r.sh, 0, 0, w, h);
    } else {
      const img = sheets.key(layer.pose);
      if (!img) continue;
      ctx.globalAlpha = layer.alpha;
      ctx.drawImage(img, 0, 0, w, h);
    }
  }
  ctx.globalAlpha = 1;
}
