// 逐格播放器。模型裡最容易做錯的三件事全在這裡釘死:
// (1) 換一次姿勢可能是好幾段 (2) pending 只有一格 (3) 循環可隨時離開、
// 過渡段不可打斷。
import test from 'node:test';
import assert from 'node:assert/strict';

import { createPlayer, CROSSFADE_FRAMES, FALLBACK_FRAMES } from '../shared/js/mascot-player.js';
import { makeManifest } from './mascot-route.test.js';

// 過渡 4 格、循環 6 格、小動作 3 格,fps 16。
const M = makeManifest();

function top(p) { return p.view().layers.at(-1); }
function steps(p, n) { for (let i = 0; i < n; i++) p.step(); }

test('一開始在 idle-loop 第 0 格,target 是 idle', () => {
  const p = createPlayer({ manifest: M });
  assert.deepEqual(p.view().layers, [{ kind: 'seg', id: 'idle-loop', index: 0, alpha: 1 }]);
  assert.equal(p.target(), 'idle');
  assert.equal(p.at(), 'idle');
});

test('idle-loop 還沒載入時先顯示 idle 關鍵圖,載好了下一格接上循環', () => {
  let ready = false;
  const p = createPlayer({ manifest: M, isLoaded: () => ready });
  assert.deepEqual(p.view().layers, [{ kind: 'key', pose: 'idle', alpha: 1 }]);
  p.step();
  assert.equal(top(p).kind, 'key', '還沒載入就繼續停在關鍵圖');
  ready = true;
  p.step();
  assert.deepEqual(top(p), { kind: 'seg', id: 'idle-loop', index: 1, alpha: 1 });
});

test('循環繞回從第 1 格開始(最後一格 = 第 0 格,連播會頓一格)', () => {
  const p = createPlayer({ manifest: M });
  p.setFidgetAllowed(false);
  steps(p, 5);   // 0 → 5(最後一格)
  assert.equal(top(p).index, 5);
  p.step();
  assert.equal(top(p).index, 1);
});

test('循環途中 request → 當格就離開:新片段第 0 格疊在舊循環上淡入', () => {
  const p = createPlayer({ manifest: M });
  steps(p, 2);                 // idle-loop 第 2 格
  p.request('watch');
  p.step();
  const [under, over] = p.view().layers;
  assert.deepEqual(under, { kind: 'seg', id: 'idle-loop', index: 3, alpha: 1 });
  assert.deepEqual(over, { kind: 'seg', id: 'idle-watch', index: 0, alpha: 1 / CROSSFADE_FRAMES });
});

test('交叉淡入 4 格後只剩新片段', () => {
  // 過渡段要比淡入長,不然淡入還沒結束過渡就播完了
  const p = createPlayer({ manifest: makeManifest({ frames: { transition: 8 } }) });
  p.request('watch');
  p.step();                                   // 淡入第 1/4
  steps(p, CROSSFADE_FRAMES - 1);             // 2/4, 3/4, 4/4
  assert.equal(p.view().layers.length, 2);
  assert.equal(top(p).alpha, 1);
  p.step();
  assert.equal(p.view().layers.length, 1);
  assert.equal(top(p).id, 'idle-watch');
});

test('交叉淡入時底下的舊循環也在往前走,而且會繞回第 1 格', () => {
  const p = createPlayer({ manifest: M });
  p.setFidgetAllowed(false);
  steps(p, 4);                 // idle-loop 第 4 格
  p.request('watch');
  p.step();                    // 底下 5
  p.step();                    // 底下繞回 1
  assert.deepEqual(p.view().layers[0], { kind: 'seg', id: 'idle-loop', index: 1, alpha: 1 });
});

test('過渡段途中 request 不會打斷,播到最後一格才轉向', () => {
  const p = createPlayer({ manifest: M });
  p.request('watch');
  p.step();                    // idle-watch 0
  p.step();                    // idle-watch 1
  p.request('cheer');
  p.step();                    // idle-watch 2
  assert.equal(top(p).id, 'idle-watch');
  p.step();                    // idle-watch 3(最後一格)
  assert.equal(top(p).id, 'idle-watch');
  p.step();                    // 轉向:watch-cheer 從第 1 格
  assert.deepEqual(top(p), { kind: 'seg', id: 'watch-cheer', index: 1, alpha: 1 });
});

test('pending 只有一格:連續三次 request 只有最後一次生效', () => {
  const p = createPlayer({ manifest: M });
  p.request('watch');
  p.request('cheer');
  p.request('aww');
  assert.equal(p.target(), 'aww');
  p.step();
  assert.equal(top(p).id, 'idle-aww');
});

test('過渡段途中連續 request,轉向時只看最後一個', () => {
  const p = createPlayer({ manifest: M });
  p.request('watch');
  p.step();                    // idle-watch 0
  p.request('cheer');
  p.request('empty');
  steps(p, 4);                 // 播完 idle-watch,轉向
  assert.equal(top(p).id, 'watch-idle', 'watch→empty 沒有直連,要先回 idle');
});

test('多段路徑:cheer → empty 走 cheer-idle 再 idle-empty,最後進 empty-loop', () => {
  const p = createPlayer({ manifest: M });
  p.request('cheer');
  steps(p, 1 + 4);             // idle-cheer 播完,進 cheer-loop
  assert.equal(top(p).id, 'cheer-loop');
  p.request('empty');
  p.step();                    // cheer-idle 0
  assert.equal(top(p).id, 'cheer-idle');
  steps(p, 3);                 // cheer-idle 1, 2, 3(最後一格)
  assert.equal(top(p).id, 'cheer-idle');
  p.step();                    // idle-empty 從第 1 格
  assert.deepEqual(top(p), { kind: 'seg', id: 'idle-empty', index: 1, alpha: 1 });
  steps(p, 3);                 // idle-empty 2, 3, 然後進 empty-loop
  assert.equal(top(p).id, 'empty-loop');
  assert.equal(p.at(), 'empty');
});

test('多段路徑中途換目標:在目前過渡段結束時改走新路徑,舊的剩餘路徑丟掉', () => {
  const p = createPlayer({ manifest: M });
  p.request('cheer');
  steps(p, 5);                 // 在 cheer-loop
  p.request('empty');
  p.step();                    // cheer-idle 0,剩餘路徑 [idle-empty]
  p.request('watch');
  steps(p, 3);                 // cheer-idle 播到最後一格
  assert.equal(top(p).id, 'cheer-idle');
  p.step();
  assert.equal(top(p).id, 'idle-watch', '改走 idle→watch,不是原本剩下的 idle-empty');
  assert.equal(p.target(), 'watch');
});

test('target():pending ?? 路徑終點 ?? at', () => {
  const p = createPlayer({ manifest: M });
  assert.equal(p.target(), 'idle');
  p.request('cheer');
  assert.equal(p.target(), 'cheer', 'pending');
  steps(p, 5);
  p.request('empty');
  p.step();                    // cheer-idle 播放中,pending 已消化成路徑
  assert.equal(p.target(), 'empty', '路徑終點');
});

test('request 目前所在的姿勢:清掉 pending,不離開循環', () => {
  const p = createPlayer({ manifest: M });
  p.request('idle');
  p.step();
  assert.equal(top(p).id, 'idle-loop');
  assert.equal(p.view().layers.length, 1);
});

test('不認得的姿勢被忽略,doze 也是', () => {
  const p = createPlayer({ manifest: M });
  p.request('nope');
  p.request('doze');
  assert.equal(p.target(), 'idle');
});

test('下一段還沒載入 → 關鍵圖淡入保底,at 直接變成目標', () => {
  const loaded = new Set(['idle-loop']);
  const p = createPlayer({ manifest: M, isLoaded: id => loaded.has(id) });
  p.request('watch');
  p.step();
  const [under, over] = p.view().layers;
  assert.equal(under.id, 'idle-loop');
  assert.deepEqual(over, { kind: 'key', pose: 'watch', alpha: 1 / FALLBACK_FRAMES });
  assert.equal(p.at(), 'watch');
  steps(p, FALLBACK_FRAMES);
  assert.deepEqual(p.view().layers, [{ kind: 'key', pose: 'watch', alpha: 1 }]);
  loaded.add('watch-loop');
  p.step();
  assert.deepEqual(top(p), { kind: 'seg', id: 'watch-loop', index: 1, alpha: 1 });
});

test('多段路徑的第二段沒載入 → 在第一段結束時走保底', () => {
  const loaded = new Set(['idle-loop', 'idle-cheer', 'cheer-loop', 'cheer-idle']);
  const p = createPlayer({ manifest: M, isLoaded: id => loaded.has(id) });
  p.request('cheer');
  steps(p, 5);
  p.request('empty');
  p.step();                    // cheer-idle 0
  steps(p, 4);                 // cheer-idle 1, 2, 3,然後 idle-empty 沒載入 → 保底
  assert.deepEqual(top(p), { kind: 'key', pose: 'empty', alpha: 1 / FALLBACK_FRAMES });
  assert.equal(p.at(), 'empty');
});

test('停在保底關鍵圖時 request,從關鍵圖出發走新路徑', () => {
  const loaded = new Set(['idle-loop', 'watch-cheer']);
  const p = createPlayer({ manifest: M, isLoaded: id => loaded.has(id) });
  p.request('watch');
  steps(p, 1 + FALLBACK_FRAMES);      // 停在 watch 關鍵圖
  p.request('cheer');
  p.step();
  const [under, over] = p.view().layers;
  assert.deepEqual(under, { kind: 'key', pose: 'watch', alpha: 1 });
  assert.equal(over.id, 'watch-cheer');
});

/* ---------- 小動作 ---------- */

// rng 固定回 0:間隔 = 4 秒 × 16fps = 64 格;小動作挑第 0 個(idle-ear)。
// idle-loop 6 格,第一次繞回在第 6 步。64 格之後的第一個繞回點是第 66 步。
test('idle 且允許時,間隔到了就在循環繞回點插播小動作', () => {
  const p = createPlayer({ manifest: M, rng: () => 0 });
  steps(p, 65);
  assert.equal(top(p).id, 'idle-loop');
  p.step();
  assert.deepEqual(top(p), { kind: 'seg', id: 'idle-ear', index: 1, alpha: 1 });
  steps(p, 2);                 // 播完小動作
  assert.deepEqual(top(p), { kind: 'seg', id: 'idle-loop', index: 1, alpha: 1 });
});

test('setFidgetAllowed(false) 時永遠不插播', () => {
  const p = createPlayer({ manifest: M, rng: () => 0 });
  p.setFidgetAllowed(false);
  for (let i = 0; i < 500; i++) {
    p.step();
    assert.equal(top(p).id, 'idle-loop', `第 ${i} 步`);
  }
});

test('不在 idle 時不插播', () => {
  const p = createPlayer({ manifest: M, rng: () => 0 });
  p.request('cheer');
  for (let i = 0; i < 500; i++) {
    p.step();
    assert.notEqual(top(p).id, 'idle-ear', `第 ${i} 步`);
  }
});

test('小動作途中 request → 當格離開(小動作跟循環一樣可打斷)', () => {
  const p = createPlayer({ manifest: M, rng: () => 0 });
  steps(p, 66);                // 進入 idle-ear 第 1 格
  p.request('watch');
  p.step();
  const [under, over] = p.view().layers;
  assert.equal(under.id, 'idle-ear');
  assert.equal(over.id, 'idle-watch');
});

test('小動作只從已載入的挑;一段都沒載入就不插播', () => {
  const p = createPlayer({ manifest: M, rng: () => 0, isLoaded: id => id === 'idle-loop' });
  for (let i = 0; i < 500; i++) p.step();
  assert.equal(top(p).id, 'idle-loop');
});
