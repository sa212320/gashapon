// 吉祥物片段的路由與 manifest 驗證。純函式,不碰 DOM。
//
// 過渡只有 10 條邊(見 docs/superpowers/specs/2026-09-30-mascot-video-segments-design.md
// 「確認過的模型」):idle 進出四個姿勢,加上揭曉那一刻的 watch→cheer、
// watch→aww 直連。其他組合一律經過 idle。validate() 把「剛好 10 條」
// 變成載入時的硬檢查 —— 少一條、多一條都丟錯,不讓壞素材靜默走錯路。

export const POSES = Object.freeze(['idle', 'watch', 'cheer', 'aww', 'empty']);

export const REQUIRED_TRANSITIONS = Object.freeze([
  ['idle', 'watch'], ['watch', 'idle'],
  ['idle', 'cheer'], ['cheer', 'idle'],
  ['idle', 'aww'], ['aww', 'idle'],
  ['idle', 'empty'], ['empty', 'idle'],
  ['watch', 'cheer'], ['watch', 'aww'],
].map(e => Object.freeze(e)));

const KINDS = ['transition', 'loop', 'fidget'];
const FIELDS = ['frames', 'fps', 'sheet', 'cols'];

function isRequired(from, to) {
  return REQUIRED_TRANSITIONS.some(([f, t]) => f === from && t === to);
}

export function validate(manifest) {
  const segs = manifest?.segments;
  if (!Array.isArray(segs)) throw new Error('segments.json 不合法:缺 segments 陣列');
  const errs = [];
  const seen = new Set();
  const positive = (v) => typeof v === 'number' && v > 0;
  if (!positive(manifest.frame?.w) || !positive(manifest.frame?.h)) errs.push('frame.w / frame.h 要是正數');

  for (const s of segs) {
    if (seen.has(s.id)) errs.push(`${s.id}: id 重複`);
    seen.add(s.id);
    for (const k of FIELDS) if (s[k] == null) errs.push(`${s.id}: 缺 ${k}`);
    if (!KINDS.includes(s.kind)) errs.push(`${s.id}: kind 不合法 (${s.kind})`);
    if (!POSES.includes(s.from) || !POSES.includes(s.to)) errs.push(`${s.id}: from/to 不是 Pose`);
    if ((s.kind === 'loop' || s.kind === 'fidget') && s.from !== s.to) errs.push(`${s.id}: ${s.kind} 的 from 必須等於 to`);
    if (s.kind === 'fidget' && s.from !== 'idle') errs.push(`${s.id}: fidget 只能掛在 idle`);
    if (s.kind === 'transition' && !isRequired(s.from, s.to)) errs.push(`${s.id}: 不在模型的 10 條過渡邊裡`);
    if (s.frames != null && s.frames < 2) errs.push(`${s.id}: frames 至少要 2`);
    // fps=0 會讓逐格時鐘變成 setTimeout(tick, Infinity),瀏覽器當成約 0ms,空轉吃滿 CPU
    if (s.fps != null && !positive(s.fps)) errs.push(`${s.id}: fps 要是正數`);
  }

  const fpsSet = new Set(segs.map(s => s.fps).filter(v => v != null));
  if (fpsSet.size > 1) errs.push(`各段 fps 不一致 (${[...fpsSet].join(', ')})`);

  for (const [f, t] of REQUIRED_TRANSITIONS) {
    if (!segs.some(s => s.kind === 'transition' && s.from === f && s.to === t)) errs.push(`缺過渡 ${f}-${t}`);
  }
  for (const p of POSES) {
    if (segs.filter(s => s.kind === 'loop' && s.from === p).length !== 1) errs.push(`${p}-loop: 每個姿勢要剛好一段循環`);
    if (!manifest.keyframes?.[p]) errs.push(`缺關鍵圖 ${p}`);
  }

  if (errs.length) throw new Error(`segments.json 不合法:\n${errs.join('\n')}`);
  return manifest;
}

function transition(manifest, from, to) {
  return manifest.segments.find(s => s.kind === 'transition' && s.from === from && s.to === to);
}

// at === target → [];有直連邊 → [直連];否則經過 idle。
// 只對 validate() 過的 manifest 呼叫,所以經過 idle 的兩段一定存在。
export function route(manifest, at, target) {
  if (at === target) return [];
  const direct = transition(manifest, at, target);
  if (direct) return [direct.id];
  return [transition(manifest, at, 'idle').id, transition(manifest, 'idle', target).id];
}

export function loopOf(manifest, pose) {
  return manifest.segments.find(s => s.kind === 'loop' && s.from === pose);
}

export function fidgetsOf(manifest) {
  return manifest.segments.filter(s => s.kind === 'fidget');
}
