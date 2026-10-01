// 路由與 manifest 驗證。模型說過渡「剛好 10 條邊」—— 這裡就是把那句話
// 變成會咬人的程式:少一條、多一條都要在載入時就爆,不能等到執行期
// 某次抽獎才靜默走錯路。
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  POSES, REQUIRED_TRANSITIONS, validate, route, loopOf, fidgetsOf,
} from '../shared/js/mascot-route.js';

function seg(id, kind, from, to, frames = 5) {
  return { id, kind, from, to, frames, fps: 16, sheet: `seg/${id}.webp`, cols: 5 };
}

export function makeManifest({ drop = [], extra = [], frames = {} } = {}) {
  const segs = [
    ...POSES.map(p => seg(`${p}-loop`, 'loop', p, p, frames.loop ?? 6)),
    ...REQUIRED_TRANSITIONS.map(([f, t]) => seg(`${f}-${t}`, 'transition', f, t, frames.transition ?? 4)),
    seg('idle-ear', 'fidget', 'idle', 'idle', frames.fidget ?? 3),
    seg('idle-doze', 'fidget', 'idle', 'idle', frames.fidget ?? 3),
    ...extra,
  ].filter(s => !drop.includes(s.id));
  return {
    frame: { w: 48, h: 43 },
    keyframes: Object.fromEntries(POSES.map(p => [p, `key/${p}.webp`])),
    segments: segs,
  };
}

test('REQUIRED_TRANSITIONS 剛好 10 條:idle 進出四個姿勢 + watch 直連 cheer/aww', () => {
  assert.equal(REQUIRED_TRANSITIONS.length, 10);
  const ids = REQUIRED_TRANSITIONS.map(([f, t]) => `${f}-${t}`).sort();
  assert.deepEqual(ids, [
    'aww-idle', 'cheer-idle', 'empty-idle', 'idle-aww', 'idle-cheer',
    'idle-empty', 'idle-watch', 'watch-aww', 'watch-cheer', 'watch-idle',
  ]);
});

test('完整的 manifest 通過驗證', () => {
  const m = makeManifest();
  assert.equal(validate(m), m);
});

test('少一條過渡邊 → 丟錯,訊息寫出是哪一條', () => {
  assert.throws(() => validate(makeManifest({ drop: ['watch-cheer'] })), /watch-cheer/);
});

test('多一條不在模型裡的過渡邊 → 丟錯(模型說剛好 10 條)', () => {
  const extra = [seg('cheer-aww', 'transition', 'cheer', 'aww')];
  assert.throws(() => validate(makeManifest({ extra })), /cheer-aww/);
});

test('少一段循環 → 丟錯', () => {
  assert.throws(() => validate(makeManifest({ drop: ['empty-loop'] })), /empty-loop/);
});

test('loop 的 from ≠ to → 丟錯', () => {
  const m = makeManifest();
  m.segments.find(s => s.id === 'cheer-loop').to = 'idle';
  assert.throws(() => validate(m), /cheer-loop/);
});

test('fidget 不掛在 idle → 丟錯', () => {
  const extra = [seg('cheer-wiggle', 'fidget', 'cheer', 'cheer')];
  assert.throws(() => validate(makeManifest({ extra })), /cheer-wiggle/);
});

test('缺 frames / sheet / cols / fps 任一欄 → 丟錯', () => {
  for (const key of ['frames', 'sheet', 'cols', 'fps']) {
    const m = makeManifest();
    delete m.segments.find(s => s.id === 'idle-watch')[key];
    assert.throws(() => validate(m), new RegExp(`idle-watch.*${key}`), key);
  }
});

test('各段 fps 不一致 → 丟錯(播放器只有一個時鐘)', () => {
  const m = makeManifest();
  m.segments.find(s => s.id === 'idle-watch').fps = 12;
  assert.throws(() => validate(m), /fps/);
});

test('少一張關鍵圖 → 丟錯', () => {
  const m = makeManifest();
  delete m.keyframes.aww;
  assert.throws(() => validate(m), /aww/);
});

test('多個問題一次全部列出來,不是遇到第一個就停', () => {
  let msg = '';
  try { validate(makeManifest({ drop: ['watch-cheer', 'empty-loop'] })); } catch (e) { msg = e.message; }
  assert.match(msg, /watch-cheer/);
  assert.match(msg, /empty-loop/);
});

test('route:同一個姿勢 → 空路徑', () => {
  assert.deepEqual(route(makeManifest(), 'cheer', 'cheer'), []);
});

test('route:10 條直連邊各自回傳單一段', () => {
  const m = makeManifest();
  for (const [f, t] of REQUIRED_TRANSITIONS) {
    assert.deepEqual(route(m, f, t), [`${f}-${t}`], `${f}→${t}`);
  }
});

test('route:沒有直連邊就經過 idle', () => {
  const m = makeManifest();
  assert.deepEqual(route(m, 'cheer', 'empty'), ['cheer-idle', 'idle-empty']);
  assert.deepEqual(route(m, 'aww', 'watch'), ['aww-idle', 'idle-watch']);
  assert.deepEqual(route(m, 'empty', 'cheer'), ['empty-idle', 'idle-cheer']);
});

test('loopOf / fidgetsOf', () => {
  const m = makeManifest();
  assert.equal(loopOf(m, 'watch').id, 'watch-loop');
  assert.deepEqual(fidgetsOf(m).map(s => s.id), ['idle-ear', 'idle-doze']);
});

// 審查發現:validate() 沒檢查 frame 與 fps 的值。少了 frame,mascot.js 的
// start() 會在 .then() 裡丟 TypeError(沒人接);fps=0 時 setTimeout(tick, Infinity)
// 在瀏覽器裡約等於 0ms,逐格時鐘會空轉吃滿 CPU。
test('frame 缺漏或寬高不是正數 → 丟錯', () => {
  for (const frame of [undefined, {}, { w: 0, h: 43 }, { w: 48, h: -1 }, { w: '48', h: 43 }]) {
    const m = makeManifest();
    m.frame = frame;
    assert.throws(() => validate(m), /frame/, JSON.stringify(frame));
  }
});

test('fps 不是正數 → 丟錯', () => {
  for (const fps of [0, -12, '12']) {
    const m = makeManifest();
    for (const s of m.segments) s.fps = fps;
    assert.throws(() => validate(m), /fps/, String(fps));
  }
});

