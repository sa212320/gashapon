// 即時合成的音效,沒有任何音檔。
// AudioContext 要等使用者第一次互動才能開,所以一律走 ensure()。
let ctx = null;
let enabled = true;

// iOS 的 WebKit 只承認 click / touchend 這類手勢,touchstart 跟 pointerdown 都不算;
// 而且光是 resume() 還不夠,要真的推一段(無聲的)聲音出去,它才算真的醒過來。
export function unlock() {
  const ac = ensure();
  if (!ac) return;
  try {
    const src = ac.createBufferSource();
    src.buffer = ac.createBuffer(1, 1, 22050);
    src.connect(ac.destination);
    src.start(0);
  } catch { /* 解鎖失敗不該讓整個 App 掛掉 */ }
}

export function setEnabled(value) {
  enabled = value;
  if (!enabled && ctx) ctx.suspend();
}

function ensure() {
  if (!enabled) return null;
  if (!ctx) {
    const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

function tone({ freq, to = freq, dur = 0.15, type = 'sine', gain = 0.2, delay = 0 }) {
  const ac = ensure();
  if (!ac) return;
  const t0 = ac.currentTime + delay;
  const osc = ac.createOscillator();
  const amp = ac.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (to !== freq) osc.frequency.exponentialRampToValueAtTime(Math.max(1, to), t0 + dur);
  amp.gain.setValueAtTime(0.0001, t0);
  amp.gain.exponentialRampToValueAtTime(gain, t0 + 0.01);
  amp.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(amp).connect(ac.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

function noise({ dur = 0.2, gain = 0.15, from = 3000, to = 400, delay = 0 }) {
  const ac = ensure();
  if (!ac) return;
  const t0 = ac.currentTime + delay;
  const frames = Math.floor(ac.sampleRate * dur);
  const buffer = ac.createBuffer(1, frames, ac.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < frames; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / frames);
  const src = ac.createBufferSource();
  src.buffer = buffer;
  const filter = ac.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(from, t0);
  filter.frequency.exponentialRampToValueAtTime(to, t0 + dur);
  const amp = ac.createGain();
  amp.gain.setValueAtTime(gain, t0);
  amp.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(filter).connect(amp).connect(ac.destination);
  src.start(t0);
}

// 每升一階音就更高一點,小孩一聽就知道情況不妙(好的那種)
const UPGRADE_SCALE = [523.25, 659.25, 783.99, 1046.5];

// 診斷用:讓 check.html 看得到音效模組真正的狀態
export function audioState() {
  return { enabled, created: !!ctx, state: ctx ? ctx.state : 'no context', currentTime: ctx ? ctx.currentTime : null };
}

export const sfx = {
  crank() {
    for (let i = 0; i < 5; i++) {
      tone({ freq: 160 + i * 12, dur: 0.05, type: 'square', gain: 0.08, delay: i * 0.055 });
    }
  },
  drop() {
    tone({ freq: 220, to: 70, dur: 0.22, type: 'sine', gain: 0.3 });
    noise({ dur: 0.12, gain: 0.08, from: 1200, to: 200 });
  },
  shake(tension = 0) {
    const base = 300 + tension * 90;
    tone({ freq: base, dur: 0.05, type: 'triangle', gain: 0.1 });
    tone({ freq: base * 1.2, dur: 0.05, type: 'triangle', gain: 0.08, delay: 0.09 });
  },
  upgrade(step = 0) {
    const f = UPGRADE_SCALE[Math.min(step, UPGRADE_SCALE.length - 1)];
    tone({ freq: f, to: f * 1.5, dur: 0.3, type: 'sine', gain: 0.25 });
    tone({ freq: f * 2, to: f * 3, dur: 0.3, type: 'sine', gain: 0.1, delay: 0.02 });
  },
  crack() {
    noise({ dur: 0.18, gain: 0.25, from: 6000, to: 800 });
    tone({ freq: 900, to: 300, dur: 0.12, type: 'square', gain: 0.1 });
  },
  burst(level = 0) {
    noise({ dur: 0.5, gain: 0.2, from: 8000, to: 300 });
    const root = 392;
    [0, 4, 7, 12].slice(0, 2 + level).forEach((semi, i) => {
      tone({ freq: root * 2 ** (semi / 12), dur: 0.6, type: 'sine', gain: 0.14, delay: i * 0.07 });
    });
  },
  clunk() {
    tone({ freq: 180, to: 90, dur: 0.14, type: 'triangle', gain: 0.22 });
    noise({ dur: 0.1, gain: 0.1, from: 900, to: 150 });
  },
  empty() {
    tone({ freq: 300, to: 160, dur: 0.35, type: 'sine', gain: 0.18 });
  },
};
