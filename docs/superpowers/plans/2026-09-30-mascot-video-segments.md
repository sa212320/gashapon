# 吉祥物影片片段 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把吉祥物從「每個姿勢一張獨立生成的圖」換成「ComfyUI 預先生成、canvas 逐格播放的影片片段」,讓換姿勢連續不跳、待機會眨眼會動。

**Architecture:** 素材端是 `tools/mascot-gen/`(Python,呼叫使用者的 ComfyUI),分三輪生成、每輪使用者挑選,最後輸出 `shared/img/mascot/segments.json` + 逐格圖。前端拆成三個純邏輯單元 —— `mascot-route.js`(路由與 manifest 驗證)、`mascot-player.js`(逐格狀態機)、`mascot-sheets.js`(載入與繪製)—— 由 `mascot.js` 接到 DOM/canvas,對外 API 不變。

**Tech Stack:** 瀏覽器端:原生 ES module、canvas 2D、零建置零依賴;測試 `node --test`。工具端:Python 3 + numpy + Pillow(venv)、`cwebp`、ComfyUI HTTP API(Wan 2.2 i2v 14B fp8 + lightx2v 4 步 LoRA)。

**Spec:** `docs/superpowers/specs/2026-09-30-mascot-video-segments-design.md`

## Global Constraints

- 網站零建置:沒有 package.json、沒有 bundler、`node --test` 零依賴。`tools/mascot-gen/` 是開發工具,網站不載入它,它的依賴只裝在 `tools/mascot-gen/.venv/`
- 對外 API 不變:`mountMascots({ home, fidget, timers, rng, doc })` 回傳 `{ el, getState, setPose, flyTo, home, stop }`;`POSES` 仍從 `shared/js/mascot.js` 匯出,值為 `['idle','watch','cheer','aww','empty']`
- 五個模式與首頁的呼叫端**不改**(`gashapon/js/main.js:81`、`gashapon3d/js/main.js:41`、`ichiban/js/main.js:15`、`ghostleg/js/main.js:25`、`smash/js/main.js:32`、`index.html:53`)
- 吉祥物層維持 `pointer-events: none`、`aria-hidden="true"`、`position: fixed`、不進入任何模式的 DOM
- 吉祥物**不讀** `prefers-reduced-motion`(使用者的決定)
- CSS 動作效果只留飛行位移 + 傾斜
- ComfyUI 位址讀 `COMFY_URL`,預設 `http://192.168.68.53:8188`
- 每格暫定 480×432、16fps;Task 10 量完大小後才定案
- 所有工作在分支 `feat/mascot-segments` 上做;Task 10 通過使用者驗收前**不併回 main**(Task 4 之後、素材到位之前,main 上的吉祥物會是空白)
- commit message 用中文、conventional 前綴,結尾加:
  ```
  Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01SemYkQLkTmSDDeYUKQcPZG
  ```

## 確認過的模型(實作若與此牴觸,是計畫的 bug —— 停下來反映,不要就地改模型)

- **Entities**:`Pose`(idle / watch / cheer / aww / empty;對外 `setPose` / `flyTo` / `home` API 不變);`Keyframe`(每個 Pose 一張停止格,生成用 + 保底用);`Segment {id, kind: 'transition'|'loop'|'fidget', from, to, frames, fps, sheet}`;`Player`(目前片段、第幾格、單格 `pending`)
- **Cardinality**:Pose↔Keyframe 1:1;Pose↔loop 1:1;idle→fidget 1:N;過渡片段**剛好 10 條邊**(idle↔watch/cheer/aww/empty 共 8 條 + watch→cheer、watch→aww)
- **Seen vs stored**:呼叫端看到 5 個姿勢;存的是約 18 段逐格圖;doze 是 idle 的小動作不是 Pose;畫面上的 idle 是解碼後的影格,不是 `idle.webp` 原圖
- **最可能的 3 個錯誤(錯誤版本)**:
  1. ❌「換一次姿勢 = 播一段片段」—— 可能是多段(cheer→idle→empty),也可能是從循環淡出接出去
  2. ❌「pending 是佇列」—— 只有一格,新的覆蓋舊的
  3. ❌「循環只能在最後一格離開、過渡段可被打斷」—— 剛好相反

## Review Focus

1. **揭曉時片段還沒載完**(一進頁面立刻按抽獎)—— 預期交叉淡入到目標關鍵圖,抽獎流程完全不受影響。→ Task 2「未載入走保底」+ Task 4「manifest 還沒到時 setPose 不遺失」
2. **manifest 抓不到或不合法**(部署漏檔、手改壞 JSON)—— 預期吉祥物空白、console 一次警告、抽獎照常,不丟未捕捉例外。→ Task 4「manifest 載入失敗只警告」
3. **多段路徑途中又換目標**(cheer→idle→empty 播到一半,使用者又抽一次)—— 預期在目前過渡段結束時改走新目標的路徑,丟掉舊的剩餘路徑。→ Task 2「多段路徑中途換目標」
4. **循環接回第 0 格時卡一格**(最後一格 = 第 0 格,連播兩次會頓一下)—— 預期循環繞回、過渡接下一段時都從第 1 格開始。→ Task 2「循環繞回從第 1 格」
5. **`stop()` 之後還在畫**(模式頁重新掛載、測試殘留計時器)—— 預期 `stop()` 後沒有任何計時器、canvas 不再被畫。→ Task 4「stop() 清掉逐格時鐘」

---

## 檔案結構

| 檔案 | 動作 | 責任 |
|---|---|---|
| `shared/js/mascot-route.js` | 新建 | `POSES`、`REQUIRED_TRANSITIONS`、`validate()`、`route()`、`loopOf()`、`fidgetsOf()` —— 純函式 |
| `shared/js/mascot-player.js` | 新建 | `createPlayer()` —— 逐格狀態機,不碰 DOM、不碰計時器 |
| `shared/js/mascot-sheets.js` | 新建 | `createSheets()`(依序預載、失敗警告一次)、`frameRect()`、`draw()` |
| `shared/js/mascot.js` | 重寫內部 | DOM、canvas、逐格時鐘、飛行;接上前三者 |
| `shared/css/mascot.css` | 改 | 拿掉呼吸/擠壓/彈跳/reduced-motion/img 樣式,改成 canvas |
| `test/mascot-route.test.js` `test/mascot-player.test.js` `test/mascot-sheets.test.js` | 新建 | |
| `test/mascot.test.js` | 改 | 保留狀態與飛行的斷言,換掉圖片版與 doze 的斷言 |
| `tools/mascot-gen/post.py` | 新建 | 去背、接縫、拼逐格圖、重取樣 —— 純函式 |
| `tools/mascot-gen/test_post.py` | 新建 | `unittest` |
| `tools/mascot-gen/comfy.py` | 新建 | ComfyUI API 客戶端與 Wan workflow 圖 |
| `tools/mascot-gen/gen.py` | 新建 | CLI:`run` / `sheet` / `review` / `pick` / `build` |
| `tools/mascot-gen/prompts.json` | 新建 | 18 段的提示詞、長度、seed、挑選結果 |
| `tools/mascot-gen/requirements.txt` | 新建 | `numpy` `Pillow` |
| `.gitignore` | 改 | 加 `tools/mascot-gen/out/`、`tools/mascot-gen/.venv/`、`__pycache__/` |
| `shared/img/mascot/segments.json` `key/*.webp` `seg/*.webp` | Task 10 產生 | |
| `shared/img/mascot/{idle,watch,cheer,aww,empty,doze}.webp` | Task 10 刪除 | |

(相對 spec 多了 `mascot-sheets.js`:把「載入與繪製」從 `mascot.js` 拆出來才能不靠真的 canvas 測。這是檔案切分,不是模型變動。)

---

### Task 0: 開分支

- [ ] **Step 1: 開分支**

```bash
cd /Users/willian/github/gashapon
git switch -c feat/mascot-segments
```

---

### Task 1: 路由與 manifest 驗證

**Files:**
- Create: `shared/js/mascot-route.js`
- Test: `test/mascot-route.test.js`

**Interfaces:**
- Produces:
  - `POSES: readonly string[]` = `['idle','watch','cheer','aww','empty']`
  - `REQUIRED_TRANSITIONS: readonly [from, to][]`(10 條)
  - `validate(manifest) → manifest`,不合法時 `throw Error`,訊息列出每一個問題
  - `route(manifest, at, target) → string[]`(segment id)
  - `loopOf(manifest, pose) → Segment`
  - `fidgetsOf(manifest) → Segment[]`
- Manifest 形狀:`{ frame: {w,h}, keyframes: {<pose>: path}, segments: [{id, kind, from, to, frames, fps, sheet, cols}] }`

- [ ] **Step 1: 寫失敗的測試**

`test/mascot-route.test.js`:

```js
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
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `node --test test/mascot-route.test.js`
Expected: FAIL,`Cannot find module '.../shared/js/mascot-route.js'`

- [ ] **Step 3: 寫 `shared/js/mascot-route.js`**

```js
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
```

- [ ] **Step 4: 跑測試確認通過**

Run: `node --test test/mascot-route.test.js`
Expected: PASS(15 tests)

- [ ] **Step 5: 證明測試會咬**

暫時把 `REQUIRED_TRANSITIONS` 的 `['watch', 'aww']` 刪掉,跑 `node --test test/mascot-route.test.js`,確認「剛好 10 條」與「10 條直連邊」至少兩條 FAIL。改回來,再跑一次確認全 PASS。

- [ ] **Step 6: Commit**

```bash
git add shared/js/mascot-route.js test/mascot-route.test.js
git commit -m "feat(mascot): 片段路由與 manifest 驗證"
```

---

### Task 2: 逐格播放器

**Files:**
- Create: `shared/js/mascot-player.js`
- Test: `test/mascot-player.test.js`

**Interfaces:**
- Consumes: `route`, `loopOf`, `fidgetsOf`, `POSES` from `shared/js/mascot-route.js`;測試用 `makeManifest` from `test/mascot-route.test.js`
- Produces:
  - `createPlayer({ manifest, isLoaded = () => true, rng = Math.random }) → Player`
  - `Player.request(pose)`:寫進單格 pending;不認得的 pose 直接忽略
  - `Player.step()`:前進一格
  - `Player.view() → { layers: Layer[] }`,由下往上畫;`Layer = { kind: 'seg', id, index, alpha } | { kind: 'key', pose, alpha }`
  - `Player.target() → pose`:`pending ?? 路徑終點 ?? at`
  - `Player.at() → pose`
  - `Player.setFidgetAllowed(bool)`
  - 常數 `CROSSFADE_FRAMES = 4`、`FALLBACK_FRAMES = 5`、`FIDGET_GAP_SEC = [4, 9]`

**播放器規則(照 spec §2,寫程式前先讀)**:
- 過渡段只在**最後一格之後**看 pending;循環與小動作**任何一格**有 pending 就離開
- 片段交界:前一段最後一格 = 下一段第 0 格(接縫已經混合成同一張關鍵圖),所以接下一段、循環繞回都從**第 1 格**開始,不然會頓一格
- 從循環/小動作離開:新路徑第一段從第 0 格開始播,舊片段在底下繼續往前 4 格,新片段 alpha 1/4 → 4/4 疊在上面
- 下一段還沒載入:舊畫面凍結在底下,目標姿勢的關鍵圖 alpha 1/5 → 5/5 疊上去,`at = target`,丟掉剩餘路徑;之後那個姿勢的循環載好了就從第 1 格接上
- 小動作:只在 `at === 'idle'`、目前是 `idle-loop`、`setFidgetAllowed(true)`、而且累積的 idle 格數到了隨機間隔,才會在**循環繞回的那一格**插播一段隨機小動作(只從已載入的挑)

- [ ] **Step 1: 寫失敗的測試**

`test/mascot-player.test.js`:

```js
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
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `node --test test/mascot-player.test.js`
Expected: FAIL,`Cannot find module '.../shared/js/mascot-player.js'`

- [ ] **Step 3: 寫 `shared/js/mascot-player.js`**

```js
// 吉祥物的逐格播放器。純狀態機:不碰 DOM、不碰計時器,呼叫端每一格
// 呼叫一次 step(),再用 view() 拿到要畫的圖層。這樣測試可以一格一格
// 推進,不用假時鐘。
//
// 規則(docs/superpowers/specs/2026-09-30-mascot-video-segments-design.md §2):
// - pending 只有一格,新的覆蓋舊的 —— 不是佇列
// - 過渡段一定播完,只在最後一格之後看 pending
// - 循環與小動作任何一格都能離開,用 CROSSFADE_FRAMES 格交叉淡入
// - 片段交界的兩格是同一張關鍵圖,所以接下一段、循環繞回都從第 1 格開始
// - 下一段還沒載入:目標關鍵圖淡入保底,at 直接跳到目標

import { POSES, route, loopOf, fidgetsOf } from './mascot-route.js';

export const CROSSFADE_FRAMES = 4;
export const FALLBACK_FRAMES = 5;      // 約 300ms @ 16fps
export const FIDGET_GAP_SEC = [4, 9];

export function createPlayer({ manifest, isLoaded = () => true, rng = Math.random }) {
  const segs = new Map(manifest.segments.map(s => [s.id, s]));
  const fps = manifest.segments[0].fps;

  let at = 'idle';
  let pending = null;
  let path = [];          // 目前這段之後還要播的 segment id
  let cur = null;         // { id, index };null 代表正在顯示 at 的關鍵圖
  let fade = null;        // { under: Layer, k, total, advance } 疊在底下的舊畫面
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

  // 片段的下一格;最後一格之後繞回第 1 格(第 0 格 = 最後一格)。
  function nextIndex(id, index) {
    return index < segs.get(id).frames - 1 ? index + 1 : 1;
  }

  function enterLoop(pose, index) {
    const loop = loopOf(manifest, pose);
    cur = isLoaded(loop.id) ? { id: loop.id, index } : null;
  }

  function fallback(pose) {
    const under = currentLayer();
    fade = { under, k: 1, total: FALLBACK_FRAMES, advance: false };
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

  // 從循環 / 小動作 / 關鍵圖離開,朝 pending 走。
  function leave() {
    const p = pending;
    pending = null;
    if (p === at) return false;
    const ids = route(manifest, at, p);
    const wasSeg = cur !== null;
    // 舊片段在底下「繼續往前」:這一格它本來會走到下一格
    const under = wasSeg
      ? { kind: 'seg', id: cur.id, index: nextIndex(cur.id, cur.index), alpha: 1 }
      : currentLayer();
    if (!begin(ids[0], 0, p)) return true;
    path = ids.slice(1);
    fade = { under, k: 1, total: CROSSFADE_FRAMES, advance: wasSeg };
    return true;
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
    if (fade.advance && fade.under.kind === 'seg') {
      fade.under = { ...fade.under, index: nextIndex(fade.under.id, fade.under.index) };
    }
    if (fade.k > fade.total) fade = null;
  }

  function step() {
    advanceFade();

    if (cur === null) {
      if (pending !== null && leave()) return;
      enterLoop(at, 1);
      return;
    }

    const s = segs.get(cur.id);
    if (s.kind !== 'transition' && pending !== null && leave()) return;
    if (s.id === loopOf(manifest, 'idle').id) idleFrames += 1;

    if (cur.index < s.frames - 1) {
      cur.index += 1;
      return;
    }
    onSegmentEnd(s);
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
```

- [ ] **Step 4: 跑測試確認通過**

Run: `node --test test/mascot-player.test.js`
Expected: PASS(22 tests)。若有測試的格數算錯(例如「多段路徑」那條的 `steps` 次數),先用 `console.log(p.view())` 逐格印出來比對規則,**修的是測試的格數而不是規則**;規則若真的跟 spec §2 牴觸,停下來反映。

- [ ] **Step 5: 證明測試會咬**

逐一暫時改壞下面三處,每次跑 `node --test test/mascot-player.test.js` 確認對應的測試 FAIL,再改回來:
1. `request()` 改成 `pending ??= pose`(變成「第一個贏」)→「pending 只有一格」FAIL
2. `step()` 裡 `s.kind !== 'transition' &&` 拿掉(過渡段可被打斷)→「過渡段途中 request 不會打斷」FAIL
3. `onSegmentEnd` 最後的 `cur.index = 1` 改成 `0` →「循環繞回從第 1 格開始」FAIL

- [ ] **Step 6: Commit**

```bash
git add shared/js/mascot-player.js test/mascot-player.test.js
git commit -m "feat(mascot): 逐格播放器:單格 pending、循環可隨時淡出、過渡段不可打斷"
```

---

### Task 3: 逐格圖載入與繪製

**Files:**
- Create: `shared/js/mascot-sheets.js`
- Test: `test/mascot-sheets.test.js`

**Interfaces:**
- Consumes: manifest 形狀(Task 1);`Layer`(Task 2)
- Produces:
  - `PRELOAD_ORDER: readonly string[]`
  - `createSheets({ manifest, baseURL, loadImage, warn = console.warn }) → { isLoaded(id), sheet(id), key(pose), done: Promise<void> }`
  - `frameRect(seg, index, frame) → { sx, sy, sw, sh }`
  - `draw(ctx, view, { manifest, sheets })`

- [ ] **Step 1: 寫失敗的測試**

`test/mascot-sheets.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';

import { PRELOAD_ORDER, createSheets, frameRect, draw } from '../shared/js/mascot-sheets.js';
import { makeManifest } from './mascot-route.test.js';

const BASE = 'https://example.test/shared/img/mascot/segments.json';

// loadImage 的假版本:每次呼叫都記下網址,回傳一個由測試決定何時 resolve 的 promise。
function fakeLoader({ fail = [] } = {}) {
  const calls = [];
  const loadImage = (url) => {
    calls.push(url);
    if (fail.some(f => url.includes(f))) return Promise.reject(new Error('404'));
    return Promise.resolve({ url });
  };
  return { calls, loadImage };
}

test('關鍵圖先載,片段照 PRELOAD_ORDER 一段一段載,其餘排在後面', async () => {
  const m = makeManifest();
  const { calls, loadImage } = fakeLoader();
  const sheets = createSheets({ manifest: m, baseURL: BASE, loadImage });
  await sheets.done;

  const keyCalls = calls.slice(0, 5);
  assert.ok(keyCalls.every(u => u.includes('/key/')), keyCalls.join('\n'));
  const segIds = calls.slice(5).map(u => u.match(/seg\/(.+)\.webp/)[1]);
  assert.deepEqual(segIds.slice(0, PRELOAD_ORDER.length), [...PRELOAD_ORDER]);
  assert.equal(new Set(segIds).size, m.segments.length, '每段都載一次,不重複');
});

test('網址相對於 segments.json 解析', async () => {
  const { calls, loadImage } = fakeLoader();
  const sheets = createSheets({ manifest: makeManifest(), baseURL: BASE, loadImage });
  await sheets.done;
  assert.ok(calls.includes('https://example.test/shared/img/mascot/seg/idle-loop.webp'), calls[5]);
});

test('載好之前 isLoaded 是 false,載好之後是 true', async () => {
  const sheets = createSheets({ manifest: makeManifest(), baseURL: BASE, loadImage: fakeLoader().loadImage });
  assert.equal(sheets.isLoaded('idle-loop'), false);
  await sheets.done;
  assert.equal(sheets.isLoaded('idle-loop'), true);
  assert.deepEqual(sheets.sheet('idle-loop'), { url: 'https://example.test/shared/img/mascot/seg/idle-loop.webp' });
  assert.ok(sheets.key('watch'));
});

test('載入失敗:那段維持未載入、繼續載後面的、只警告一次', async () => {
  const warns = [];
  const { loadImage } = fakeLoader({ fail: ['idle-watch', 'watch-loop', 'key/aww'] });
  const sheets = createSheets({ manifest: makeManifest(), baseURL: BASE, loadImage, warn: (...a) => warns.push(a) });
  await sheets.done;
  assert.equal(sheets.isLoaded('idle-watch'), false);
  assert.equal(sheets.isLoaded('watch-cheer'), true, '失敗之後還要繼續載');
  assert.equal(sheets.key('aww'), undefined);
  assert.equal(warns.length, 1, `應該只警告一次,實際 ${warns.length}`);
});

test('frameRect:照 cols 換行', () => {
  const seg = { cols: 5 };
  const frame = { w: 48, h: 43 };
  assert.deepEqual(frameRect(seg, 0, frame), { sx: 0, sy: 0, sw: 48, sh: 43 });
  assert.deepEqual(frameRect(seg, 4, frame), { sx: 192, sy: 0, sw: 48, sh: 43 });
  assert.deepEqual(frameRect(seg, 7, frame), { sx: 96, sy: 43, sw: 48, sh: 43 });
});

function fakeCtx() {
  const ops = [];
  return {
    ops,
    set globalAlpha(v) { ops.push(['alpha', v]); },
    clearRect: (...a) => ops.push(['clear', ...a]),
    drawImage: (img, ...a) => ops.push(['draw', img.url, ...a]),
  };
}

test('draw:先清畫布,由下往上畫每一層,各自套 alpha,最後把 alpha 設回 1', async () => {
  const m = makeManifest();
  const sheets = createSheets({ manifest: m, baseURL: BASE, loadImage: fakeLoader().loadImage });
  await sheets.done;
  const ctx = fakeCtx();
  draw(ctx, { layers: [
    { kind: 'seg', id: 'idle-loop', index: 6 - 1, alpha: 1 },
    { kind: 'key', pose: 'watch', alpha: 0.4 },
  ] }, { manifest: m, sheets });

  assert.deepEqual(ctx.ops[0], ['clear', 0, 0, 48, 43]);
  assert.deepEqual(ctx.ops[1], ['alpha', 1]);
  assert.deepEqual(ctx.ops[2], ['draw', 'https://example.test/shared/img/mascot/seg/idle-loop.webp', 0, 43, 48, 43, 0, 0, 48, 43]);
  assert.deepEqual(ctx.ops[3], ['alpha', 0.4]);
  assert.deepEqual(ctx.ops[4], ['draw', 'https://example.test/shared/img/mascot/key/watch.webp', 0, 0, 48, 43]);
  assert.deepEqual(ctx.ops.at(-1), ['alpha', 1]);
});

test('draw:圖還沒載到的層直接跳過,不丟錯', () => {
  const m = makeManifest();
  const sheets = { sheet: () => undefined, key: () => undefined };
  const ctx = fakeCtx();
  draw(ctx, { layers: [{ kind: 'seg', id: 'idle-loop', index: 0, alpha: 1 }] }, { manifest: m, sheets });
  assert.ok(!ctx.ops.some(o => o[0] === 'draw'));
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `node --test test/mascot-sheets.test.js`
Expected: FAIL,`Cannot find module`

- [ ] **Step 3: 寫 `shared/js/mascot-sheets.js`**

```js
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
```

注意:`draw` 每次重建 `byId` 在每秒 16 次的呼叫下成本可忽略(18 段);不要為它提前做快取。

- [ ] **Step 4: 跑測試確認通過**

Run: `node --test test/mascot-sheets.test.js`
Expected: PASS(7 tests)

- [ ] **Step 5: Commit**

```bash
git add shared/js/mascot-sheets.js test/mascot-sheets.test.js
git commit -m "feat(mascot): 逐格圖依序預載與 canvas 繪製"
```

---

### Task 4: `mascot.js` 接上播放器,換成 canvas

**Files:**
- Modify: `shared/js/mascot.js`(整個重寫內部;`flyTo` / `home` / `measureHome` / `moveTo` 的邏輯與註解原樣保留)
- Modify: `shared/css/mascot.css`
- Modify: `test/mascot.test.js`

**Interfaces:**
- Consumes: `POSES`, `validate` (Task 1);`createPlayer` (Task 2);`createSheets`, `draw` (Task 3)
- Produces:`mountMascots({ home, fidget, timers, rng, doc, manifest, loadManifest, loadImage })`
  - `manifest`:測試直接注入(同步);沒給就呼叫 `loadManifest()`(預設 `fetch` `segments.json`)
  - `loadImage(url) → Promise<ImageLike>`:預設用 `new Image()` + `decode()`
  - 回傳值與現在相同:`{ el, getState, setPose, flyTo, home, stop }`

- [ ] **Step 1: 改測試(先讓它紅)**

在 `test/mascot.test.js`:

1. 開頭的註解段改成:

```js
// 吉祥物。沿用 test/dialog.test.js 那套假 DOM。
//
// 最要釘死的一句:**pose 屬於這一對,不屬於個別動物**。
//
// 修訂二(2026-09-30):素材改成 canvas 逐格播放的影片片段
// (docs/superpowers/specs/2026-09-30-mascot-video-segments-design.md)。
// 播放規則在 test/mascot-player.test.js 測;這裡只測 mascot.js 自己的事:
// 狀態、飛行、接線、時鐘、stop()。
//
// 每個 mountMascots() 都要走 mount() 這個 helper:它注入 manifest 與
// 假時鐘。沒注入的話逐格時鐘會用真的 setTimeout 一直重排,node --test
// 永遠不會結束。
```

2. `import` 改成:

```js
import { POSES, mountMascots } from '../shared/js/mascot.js';
import { makeManifest } from './mascot-route.test.js';
```

3. `fakeDoc()` 的 `make()` 裡,`el` 物件加上 canvas 需要的欄位(放在 `alt: '',` 下一行):

```js
      width: 0,
      height: 0,
      __ctx: null,
      getContext(kind) {
        if (kind !== '2d') return null;
        el.__ctx ??= {
          ops: [],
          set globalAlpha(v) { this.ops.push(['alpha', v]); },
          clearRect(...a) { this.ops.push(['clear', ...a]); },
          drawImage(img, ...a) { this.ops.push(['draw', img.url, ...a]); },
        };
        return el.__ctx;
      },
```

4. `fakeTimers()` 之後加上 helper:

```js
// 所有素材一律「立刻載好」:回傳帶網址的假圖。
const instantImage = (url) => Promise.resolve({ url });

function mount(opts = {}) {
  const timers = opts.timers ?? fakeTimers();
  const m = mountMascots({
    doc: fakeDoc(),
    manifest: makeManifest(),
    loadImage: instantImage,
    timers,
    ...opts,
  });
  return Object.assign(m, { timers });
}

// 讓 createSheets 那串 promise 跑完(每段一個 await)。
async function settle() {
  for (let i = 0; i < 50; i++) await Promise.resolve();
}

function canvasOf(m) { return m.el.children.find(c => c.getContext); }
```

5. 把檔案裡**所有** `mountMascots({ doc: fakeDoc(), fidget: false })` 換成 `mount()`,`mountMascots({ doc: fakeDoc(), home: true, fidget: false })` 換成 `mount({ home: true })`。

6. 刪掉這些測試(圖片版與 doze 的規則已經不存在):`'只有 idle 在一開始就有 src —— 其餘五張延後載入'`、`'fidget: false 時不排任何計時器 —— 不然 node --test 不會結束'`、`'排程時間到,切到 doze;getState().pose 仍然是 idle(doze 不是 pose)'`、`'doze 停留 1.6 秒後,自己切回 idle'`、`'doze 期間換了姿勢,回切計時器到期時不會搶回 idle'`、`'doze 期間呼叫 stop(),往後推進時間不會再有任何變化'`,以及 `visibleSrc()` helper。保留 `'doze 不是 pose,setPose 擋掉它'`。

7. 檔案最後加上:

```js
/* ---------- canvas 與逐格時鐘 ---------- */

test('掛上一張 canvas,尺寸照 manifest.frame', () => {
  const m = mount();
  const c = canvasOf(m);
  assert.ok(c, '應該有一張 canvas');
  assert.equal(c.width, 48);
  assert.equal(c.height, 43);
  assert.equal(m.el.style.getPropertyValue('--mascot-aspect'), '48 / 43');
});

test('時鐘每 1000/fps 毫秒前進一格並重畫', async () => {
  const m = mount();
  await settle();
  const ctx = canvasOf(m).__ctx;
  ctx.ops.length = 0;
  m.timers.tick(1000 / 16);
  assert.ok(ctx.ops.some(o => o[0] === 'draw' && o[1].includes('seg/idle-loop.webp')), JSON.stringify(ctx.ops));
});

test('setPose 交給播放器:幾格之後畫的是 idle-watch', async () => {
  const m = mount();
  await settle();
  m.setPose('watch');
  assert.equal(m.getState().pose, 'watch', 'getState 立刻回報最後一次要求的目標');
  const ctx = canvasOf(m).__ctx;
  ctx.ops.length = 0;
  m.timers.tick(1000 / 16);
  assert.ok(ctx.ops.some(o => o[0] === 'draw' && o[1].includes('seg/idle-watch.webp')), JSON.stringify(ctx.ops));
});

test('home() 之後立刻 setPose(watch):watch 贏(pending 只有一格)', () => {
  const m = mount();
  m.flyTo(anchorAt(300, 200), { pose: 'cheer' });
  m.home();
  m.setPose('watch');
  assert.deepEqual(m.getState(), { pose: 'watch', placement: 'corner' });
});

test('stop() 清掉逐格時鐘:之後推進時間不再畫、不留計時器', async () => {
  const m = mount();
  await settle();
  m.stop();
  const ctx = canvasOf(m).__ctx;
  ctx.ops.length = 0;
  m.timers.tick(100_000);
  assert.equal(ctx.ops.length, 0);
  assert.equal(m.timers.pending, 0);
});

test('manifest 還沒到時 setPose 不遺失:到了之後播放器從那個目標出發', async () => {
  let resolve;
  const m = mount({ manifest: null, loadManifest: () => new Promise(r => { resolve = r; }) });
  m.setPose('cheer');
  assert.equal(m.getState().pose, 'cheer');
  resolve(makeManifest());
  await settle();
  const ctx = canvasOf(m).__ctx;
  ctx.ops.length = 0;
  m.timers.tick(1000 / 16);
  assert.ok(ctx.ops.some(o => o[0] === 'draw' && o[1].includes('seg/idle-cheer.webp')), JSON.stringify(ctx.ops));
});

test('manifest 載入失敗只警告,不丟錯、不排時鐘', async () => {
  const warns = [];
  const origWarn = console.warn;
  console.warn = (...a) => warns.push(a);
  try {
    const m = mount({ manifest: null, loadManifest: () => Promise.reject(new Error('404')) });
    await settle();
    m.setPose('cheer');
    assert.equal(m.getState().pose, 'cheer');
    assert.equal(m.timers.pending, 0);
    assert.equal(warns.length, 1);
  } finally {
    console.warn = origWarn;
  }
});

test('不合法的 manifest 同樣只警告(部署漏檔不能讓整頁掛掉)', async () => {
  const warns = [];
  const origWarn = console.warn;
  console.warn = (...a) => warns.push(a);
  try {
    const bad = makeManifest({ drop: ['watch-cheer'] });
    const m = mount({ manifest: null, loadManifest: () => Promise.resolve(bad) });
    await settle();
    assert.equal(m.timers.pending, 0);
    assert.match(String(warns[0]), /watch-cheer/);
  } finally {
    console.warn = origWarn;
  }
});

test('小動作只在角落時允許:飛到揭曉區就關掉,回家再打開', async () => {
  const m = mount({ rng: () => 0 });
  await settle();
  m.flyTo(anchorAt(300, 200));           // 不換姿勢,只飛
  const ctx = canvasOf(m).__ctx;
  ctx.ops.length = 0;
  m.timers.tick(1000 / 16 * 200);
  assert.ok(!ctx.ops.some(o => o[0] === 'draw' && o[1].includes('idle-ear')), '揭曉區不插播');
  m.home();
  ctx.ops.length = 0;
  m.timers.tick(1000 / 16 * 200);
  assert.ok(ctx.ops.some(o => o[0] === 'draw' && o[1].includes('idle-ear')), '回到角落要插播');
});

test('fidget: false 時永遠不插播小動作', async () => {
  const m = mount({ rng: () => 0, fidget: false });
  await settle();
  const ctx = canvasOf(m).__ctx;
  m.timers.tick(1000 / 16 * 500);
  assert.ok(!ctx.ops.some(o => o[0] === 'draw' && o[1].includes('idle-ear')));
});

test('根元素不再帶 squash / bounce class', async () => {
  const m = mount();
  m.setPose('cheer');
  m.flyTo(anchorAt(300, 200), { pose: 'cheer' });
  assert.ok(!/squash|bounce/.test(m.el.className), m.el.className);
});
```

注意 `fakeTimers().tick(ms)` 一次只跑「到期的那一批」:逐格時鐘在 callback 裡重排下一格,同一次 `tick` 不會連跑。所以 `tick(1000/16*200)` 只會前進**一格**。把 `fakeTimers` 的 `tick` 改成「跑到沒有到期的 job 為止」:

```js
    tick(ms) {
      now += ms;
      for (;;) {
        const due = [...jobs].filter(([, j]) => j.at <= now).sort((a, b) => a[1].at - b[1].at);
        if (!due.length) break;
        const [i, j] = due[0];
        jobs.delete(i);
        j.fn();
      }
    },
```

(舊的 doze 測試依賴「新排的 job 不在同一次 tick 裡觸發」,那些測試在第 6 點已經刪掉。)

- [ ] **Step 2: 跑測試確認新的斷言失敗**

Run: `node --test test/mascot.test.js`
Expected: FAIL —— canvas 相關、`mount()` 注入 manifest 相關的測試都失敗(`canvasOf(m)` 是 `undefined`)

- [ ] **Step 3: 重寫 `shared/js/mascot.js`**

保留原檔開頭「最關鍵的結構決定」「pose 屬於這一對」兩段註解,把「修訂一」那段之後加上修訂二:

```js
// 修訂二(2026-09-30):換圖改成 canvas 逐格播放預先生成的影片片段
// (docs/superpowers/specs/2026-09-30-mascot-video-segments-design.md)。
// 換圖會跳,是因為六張圖是分開生成的六隻不同的角色;片段全部從同一張
// idle 圖繁衍,接縫共用關鍵圖。路由在 mascot-route.js、播放規則在
// mascot-player.js、載入與繪製在 mascot-sheets.js —— 這支只剩 DOM、
// 時鐘與飛行。擠壓拉伸與 cheer 彈跳拿掉(影片自己在動,再疊外框的
// 形變會跟影片打架),reduced-motion 分支也拿掉(使用者的決定)。
```

然後整個 `mountMascots` 之前與之內換成下面這份(`measureHome` / `moveTo` / `flyTo` / `home` 的註解從原檔原樣搬過來,這裡為了篇幅標成 `/* 原註解 */`,**實作時要貼回原文**):

```js
import { POSES, validate } from './mascot-route.js';
import { createPlayer } from './mascot-player.js';
import { createSheets, draw } from './mascot-sheets.js';

export { POSES };

// 五個模式跟首頁在檔案樹裡的深度不一樣,用 import.meta.url 算。
const MANIFEST_URL = new URL('../img/mascot/segments.json', import.meta.url).href;

const FLY_TILT_DEG = 5;
const FLY_TILT_LEVEL_MS = 260;

async function defaultLoadManifest() {
  const res = await fetch(MANIFEST_URL);
  if (!res.ok) throw new Error(`segments.json ${res.status}`);
  return res.json();
}

function defaultLoadImage(url) {
  const img = new Image();
  img.src = url;
  return img.decode().then(() => img);
}

export function mountMascots({
  home = false,
  fidget = true,
  timers = { set: (fn, ms) => setTimeout(fn, ms), clear: (id) => clearTimeout(id) },
  rng = Math.random,
  doc = globalThis.document,
  manifest = null,
  loadManifest = defaultLoadManifest,
  loadImage = defaultLoadImage,
} = {}) {
  let wanted = 'idle';          // manifest 還沒到之前,記住最後一次要求的姿勢
  let placement = 'corner';
  let player = null;
  let sheets = null;
  let ready = null;             // validate 過的 manifest
  let clockTimer = 0;
  let tiltTimer = 0;
  let stopped = false;
  let lastFlyX = 0;
  let lastFlyY = 0;

  const el = doc.createElement('div');
  el.setAttribute('aria-hidden', 'true');
  const canvas = doc.createElement('canvas');
  canvas.className = 'mascots__canvas';
  el.append(canvas);
  doc.body.append(el);
  const ctx = canvas.getContext?.('2d') ?? null;

  /* 原註解:homeRect / measureHome */
  let homeRect = null;
  function measureHome() {
    const r = el.getBoundingClientRect?.();
    if (r && (r.width || r.height)) homeRect = r;
    return homeRect;
  }
  measureHome();

  let onResize = null;
  if (typeof globalThis.addEventListener === 'function') {
    onResize = () => measureHome();
    globalThis.addEventListener('resize', onResize);
  }

  function pose() {
    return player ? player.target() : wanted;
  }

  function paint() {
    el.className = [
      'mascots',
      `mascots--${pose()}`,
      `mascots--at-${placement}`,
      home ? 'mascots--home' : '',
    ].filter(Boolean).join(' ');
    player?.setFidgetAllowed(fidget && placement === 'corner');
  }

  function tick() {
    if (stopped) return;
    player.step();
    if (ctx) draw(ctx, player.view(), { manifest: ready, sheets });
    clockTimer = timers.set(tick, 1000 / ready.segments[0].fps);
  }

  function start(m) {
    if (stopped) return;
    try {
      ready = validate(m);
    } catch (err) {
      console.warn('[mascot] segments.json 不合法,吉祥物不顯示', err);
      return;
    }
    canvas.width = ready.frame.w;
    canvas.height = ready.frame.h;
    el.style.setProperty('--mascot-aspect', `${ready.frame.w} / ${ready.frame.h}`);
    sheets = createSheets({ manifest: ready, baseURL: MANIFEST_URL, loadImage });
    player = createPlayer({ manifest: ready, isLoaded: sheets.isLoaded, rng });
    if (wanted !== 'idle') player.request(wanted);
    paint();
    if (ctx) draw(ctx, player.view(), { manifest: ready, sheets });
    clockTimer = timers.set(tick, 1000 / ready.segments[0].fps);
  }

  if (manifest) {
    start(manifest);
  } else {
    loadManifest().then(start, (err) => {
      console.warn('[mascot] 抓不到 segments.json,吉祥物不顯示', err);
    });
  }

  /* 原註解:moveTo */
  function moveTo(nx, ny) {
    const dx = nx - lastFlyX;
    el.style.setProperty('--fly-x', `${nx}px`);
    el.style.setProperty('--fly-y', `${ny}px`);
    if (Math.abs(dx) > 1) {
      el.style.setProperty('--fly-tilt', `${dx > 0 ? FLY_TILT_DEG : -FLY_TILT_DEG}deg`);
      timers.clear(tiltTimer);
      tiltTimer = timers.set(() => {
        el.style.setProperty('--fly-tilt', '0deg');
      }, FLY_TILT_LEVEL_MS);
    }
    lastFlyX = nx;
    lastFlyY = ny;
  }

  function applyPose(next) {
    if (!POSES.includes(next)) return;   // 這一關順便擋掉 'doze'
    wanted = next;
    player?.request(next);
    paint();
  }

  paint();

  return {
    el,
    getState: () => ({ pose: pose(), placement }),
    setPose: applyPose,

    flyTo(anchor, { pose: next } = {}) {
      /* 原 flyTo 內容與註解原樣保留,只有一處不同:
         不再有 pulseSquash / pulseBounce(applyPose 已經不呼叫它們) */
    },

    home({ pose: next = 'idle' } = {}) {
      moveTo(0, 0);
      placement = 'corner';
      applyPose(next);
      paint();
    },

    stop() {
      stopped = true;
      timers.clear(clockTimer);
      timers.clear(tiltTimer);
      if (onResize) globalThis.removeEventListener('resize', onResize);
    },
  };
}
```

`flyTo` 的內容從原檔 `shared/js/mascot.js`(`flyTo(anchor, { pose: next } = {}) {` 到它的結尾 `},`)整段搬過來,不改。刪掉:`SRC`、`assetURL`、`DOZE*`、`SQUASH_MS`、`BOUNCE_MS`、`reduceMotion`、兩張 `<img>`、`crossfadeTo`、`pulseSquash`、`pulseBounce`、`scheduleFidget`、`transitionend` 監聽、`squashTimer` / `bounceTimer` / `fidgetTimer` / `dozeTimer`。

- [ ] **Step 4: 改 `shared/css/mascot.css`**

1. 檔頭註解最後加一段:

```css
/* 修訂三(2026-09-30):改成 canvas 逐格播放影片片段。呼吸、擠壓拉伸、
   cheer 彈跳全部拿掉 —— 影片自己在動,外框再形變會跟影片打架。
   只留飛行位移 + 傾斜。reduced-motion 區塊也拿掉:吉祥物一律照播
   (使用者的決定;雪花有自己的處理,不受影響)。 */
```

2. `.mascots` 規則:`aspect-ratio: 11 / 10;` 與它上面那段「六張素材的寬度不一致」註解換成 `aspect-ratio: var(--mascot-aspect, 10 / 9);`;刪掉 `animation: m-breathe 3.4s ease-in-out infinite;`。
3. `.mascots--at-reveal` 上面的註解改成:`/* 飛到揭曉區時放大一點,因為那是主角時刻。 */`
4. `.mascots__img` 與 `.mascots__img--visible` 兩條規則換成:

```css
.mascots__canvas {
  display: block;
  width: 100%;
  height: 100%;
}
```

5. 刪掉 `m-breathe`、`m-squash-stretch`、`.mascots--squash`、`m-cheer-bounce`、`.mascots--bounce` 以及它們的註解區塊,與整個 `@media (prefers-reduced-motion: reduce)` 區塊。`.mascot-anchor` 保留。

- [ ] **Step 5: 跑全部測試**

Run: `node --test`
Expected: 全部 PASS。`test/modules.test.js` 會解析三支新模組;`test/snow.test.js` 不受影響。

- [ ] **Step 6: 證明「stop() 清時鐘」會咬**

暫時把 `stop()` 裡的 `timers.clear(clockTimer);` 與 `stopped = true;` 註解掉,跑 `node --test test/mascot.test.js`,確認 `'stop() 清掉逐格時鐘'` FAIL。改回來。

- [ ] **Step 7: Commit**

```bash
git add shared/js/mascot.js shared/css/mascot.css test/mascot.test.js
git commit -m "feat(mascot): 改用 canvas 逐格播放,拿掉換圖、擠壓、彈跳與 reduced-motion 分支"
```

此時網站上的吉祥物是空白(還沒有 `segments.json`)—— 這就是為什麼整個計畫在分支上做。

---

### Task 5: 生成工具的後處理(純函式)

**Files:**
- Create: `tools/mascot-gen/post.py`, `tools/mascot-gen/test_post.py`, `tools/mascot-gen/requirements.txt`
- Modify: `.gitignore`

**Interfaces:**
- Produces(全部吃/吐 `numpy.ndarray`,uint8):
  - `key_green(rgb: HxWx3) → HxWx4`
  - `blend_seam(frames: list[HxWx4], start_key: HxWx4, end_key: HxWx4) → list[HxWx4]`
  - `resample(frames: list, src_fps: int, dst_fps: int) → list`(保留第一格與最後一格)
  - `make_sheet(frames: list[HxWx4], cols: int) → (rows*H)x(cols*W)x4`

- [ ] **Step 1: 建 venv 與依賴**

```bash
cd /Users/willian/github/gashapon
printf 'numpy\nPillow\n' > tools/mascot-gen/requirements.txt
python3 -m venv tools/mascot-gen/.venv
tools/mascot-gen/.venv/bin/pip install -q -r tools/mascot-gen/requirements.txt
printf 'tools/mascot-gen/out/\ntools/mascot-gen/.venv/\n__pycache__/\n' >> .gitignore
```

- [ ] **Step 2: 寫失敗的測試**

`tools/mascot-gen/test_post.py`:

```python
"""後處理純函式的測試。跑法:tools/mascot-gen/.venv/bin/python -m unittest discover tools/mascot-gen"""
import unittest

import numpy as np

from post import key_green, blend_seam, resample, make_sheet


def px(rgb):
    return np.array([[rgb]], dtype=np.uint8)


class KeyGreen(unittest.TestCase):
    def test_pure_green_is_transparent(self):
        self.assertEqual(key_green(px((0, 255, 0)))[0, 0, 3], 0)

    def test_white_ermine_stays_opaque_and_unchanged(self):
        self.assertEqual(key_green(px((255, 255, 255)))[0, 0].tolist(), [255, 255, 255, 255])

    def test_orange_fox_stays_opaque_and_unchanged(self):
        self.assertEqual(key_green(px((240, 140, 60)))[0, 0].tolist(), [240, 140, 60, 255])

    def test_dark_outline_stays_opaque(self):
        self.assertEqual(key_green(px((80, 50, 40)))[0, 0, 3], 255)

    def test_edge_mix_is_partial_and_despilled(self):
        r, g, b, a = key_green(px((128, 191, 0)))[0, 0].tolist()
        self.assertTrue(0 < a < 255, a)
        self.assertLessEqual(g, max(r, b), '綠色溢色要壓到不超過 max(r, b)')


class BlendSeam(unittest.TestCase):
    def setUp(self):
        self.frames = [np.full((2, 2, 4), 100, np.uint8) for _ in range(5)]
        self.start = np.full((2, 2, 4), 0, np.uint8)
        self.end = np.full((2, 2, 4), 200, np.uint8)

    def test_boundary_frames_equal_keys_exactly(self):
        out = blend_seam(self.frames, self.start, self.end)
        self.assertTrue((out[0] == self.start).all())
        self.assertTrue((out[-1] == self.end).all())

    def test_second_frames_are_half_blended(self):
        out = blend_seam(self.frames, self.start, self.end)
        self.assertEqual(int(out[1][0, 0, 0]), 50)
        self.assertEqual(int(out[-2][0, 0, 0]), 150)

    def test_middle_untouched_and_input_not_mutated(self):
        out = blend_seam(self.frames, self.start, self.end)
        self.assertEqual(int(out[2][0, 0, 0]), 100)
        self.assertEqual(int(self.frames[0][0, 0, 0]), 100)


class Resample(unittest.TestCase):
    def test_same_fps_is_identity(self):
        self.assertEqual(resample(list(range(49)), 16, 16), list(range(49)))

    def test_16_to_12_keeps_first_and_last(self):
        out = resample(list(range(49)), 16, 12)
        self.assertEqual(out[0], 0)
        self.assertEqual(out[-1], 48)
        self.assertEqual(len(out), 37)


class MakeSheet(unittest.TestCase):
    def test_layout_and_padding(self):
        frames = [np.full((3, 4, 4), i, np.uint8) for i in range(7)]
        sheet = make_sheet(frames, cols=5)
        self.assertEqual(sheet.shape, (6, 20, 4))
        self.assertEqual(int(sheet[0, 4 * 4, 0]), 4)       # 第 4 格在第一列最後
        self.assertEqual(int(sheet[3, 4 * 1, 0]), 6)       # 第 6 格在第二列第 2 個
        self.assertEqual(int(sheet[3, 4 * 3, 3]), 0)       # 空格是透明的


if __name__ == '__main__':
    unittest.main()
```

- [ ] **Step 3: 跑測試確認失敗**

Run: `cd tools/mascot-gen && .venv/bin/python -m unittest test_post -v; cd -`
Expected: FAIL,`ModuleNotFoundError: No module named 'post'`

- [ ] **Step 4: 寫 `tools/mascot-gen/post.py`**

```python
"""生成片段的後處理:去背、接縫、重取樣、拼逐格圖。純函式,不碰檔案。"""
import numpy as np

# 綠色比其他兩色多出 LO 以下 → 完全不透明;多出 HI 以上 → 完全透明。
# 角色是橘、白、深棕,這三種顏色 g - max(r, b) 都 <= 0,不會被吃掉。
LO = 40.0
HI = 120.0


def key_green(rgb):
    f = rgb.astype(np.float32)
    r, g, b = f[..., 0], f[..., 1], f[..., 2]
    rb = np.maximum(r, b)
    dom = g - rb
    alpha = 1.0 - np.clip((dom - LO) / (HI - LO), 0.0, 1.0)
    g = np.minimum(g, rb)          # 綠色溢色:壓到不超過另外兩色
    out = np.stack([r, g, b, alpha * 255.0], axis=-1)
    return np.clip(np.rint(out), 0, 255).astype(np.uint8)


def _mix(a, b, t):
    return np.rint(a.astype(np.float32) * (1 - t) + b.astype(np.float32) * t).astype(np.uint8)


def blend_seam(frames, start_key, end_key):
    """頭尾各 2 格往關鍵圖混合:邊界格 100%、第 2 格 50%。"""
    out = [f.copy() for f in frames]
    out[0] = start_key.copy()
    out[1] = _mix(out[1], start_key, 0.5)
    out[-1] = end_key.copy()
    out[-2] = _mix(out[-2], end_key, 0.5)
    return out


def resample(frames, src_fps, dst_fps):
    if src_fps == dst_fps:
        return list(frames)
    duration = (len(frames) - 1) / src_fps
    n = int(round(duration * dst_fps)) + 1
    return [frames[int(round(i * (len(frames) - 1) / (n - 1)))] for i in range(n)]


def make_sheet(frames, cols):
    h, w, c = frames[0].shape
    rows = -(-len(frames) // cols)
    sheet = np.zeros((rows * h, cols * w, c), np.uint8)
    for i, f in enumerate(frames):
        r, col = divmod(i, cols)
        sheet[r * h:(r + 1) * h, col * w:(col + 1) * w] = f
    return sheet
```

- [ ] **Step 5: 跑測試確認通過**

Run: `cd tools/mascot-gen && .venv/bin/python -m unittest test_post -v; cd -`
Expected: PASS(11 tests)

- [ ] **Step 6: Commit**

```bash
git add .gitignore tools/mascot-gen/requirements.txt tools/mascot-gen/post.py tools/mascot-gen/test_post.py
git commit -m "feat(mascot-gen): 去背、接縫、重取樣、拼逐格圖"
```

---

### Task 6: ComfyUI 客戶端、提示詞與 CLI

**Files:**
- Create: `tools/mascot-gen/comfy.py`, `tools/mascot-gen/gen.py`, `tools/mascot-gen/prompts.json`

**Interfaces:**
- Consumes: `post.py`(Task 5)
- Produces CLI(都在 repo 根目錄執行,`PY=tools/mascot-gen/.venv/bin/python`):
  - `$PY tools/mascot-gen/gen.py run <round> [--only <id>]`:生成該輪每段 3 個 seed → `out/<id>/s<n>/NNN.png`(綠底原始影格)
  - `$PY tools/mascot-gen/gen.py sheet <round>`:每個候選一張逐格縮圖 `out/<id>/s<n>.jpg`,給 Claude 看
  - `$PY tools/mascot-gen/gen.py review <round>`:產生 `tools/mascot-gen/review/index.html`
  - `$PY tools/mascot-gen/gen.py pick <id> <n>`:記錄挑選;round 0/1 同時輸出關鍵圖到 `out/keys/<pose>.png`(綠底原始)
  - `$PY tools/mascot-gen/gen.py build [--w 480] [--h 432] [--fps 16]`:輸出 `shared/img/mascot/{segments.json,key/*.webp,seg/*.webp}` 並印出總大小
- `out/<id>/notes.json`:`{"s1": "淘汰原因", ...}`,由 Claude 在看縮圖後手寫;review 頁會顯示

- [ ] **Step 1: 寫 `tools/mascot-gen/prompts.json`**

```json
{
  "style": "2D flat cartoon animation, cute chibi orange fox sitting and hugging a small white ermine in its arms, thick dark brown outlines, flat colors, solid pure green background, static camera, the fox and the ermine stay in exactly the same place and size, the ermine stays in the fox's arms the whole time",
  "negative": "色调艳丽,过曝,细节模糊不清,字幕,风格,作品,画作,整体发灰,最差质量,低质量,JPEG压缩残留,丑陋的,残缺的,多余的手指,画得不好的手部,画得不好的脸部,畸形的,毁容的,形态畸形的肢体,手指融合,杂乱的背景,三条腿,镜头移动,背景变化,photorealistic,3d render,camera zoom,the ermine leaves",
  "src_fps": 16,
  "segments": [
    { "id": "idle-loop", "kind": "loop", "from": "idle", "to": "idle", "round": 0, "length": 49,
      "prompt": "the fox breathes gently and blinks once slowly, the ermine blinks, calm and cozy, tiny idle motion only" },

    { "id": "idle-watch", "kind": "transition", "from": "idle", "to": "watch", "round": 1, "length": 25,
      "prompt": "the fox and the ermine turn their heads slightly to the side and look curiously, ears perk up, eyes wide with anticipation, then hold that curious look still" },
    { "id": "idle-cheer", "kind": "transition", "from": "idle", "to": "cheer", "round": 1, "length": 33,
      "prompt": "the fox happily raises one paw high and cheers with a big open smile, the ermine bounces with joy in the fox's arms, then they hold the happy cheering pose still" },
    { "id": "idle-aww", "kind": "transition", "from": "idle", "to": "aww", "round": 1, "length": 33,
      "prompt": "the fox and the ermine look a little disappointed, ears droop down, small pout, the fox gently pats the ermine, then they hold that slightly sad pose still" },
    { "id": "idle-empty", "kind": "transition", "from": "idle", "to": "empty", "round": 1, "length": 33,
      "prompt": "the fox and the ermine look around and find nothing, ears droop low, tired sleepy sad eyes, then they hold that droopy pose still" },

    { "id": "watch-loop", "kind": "loop", "from": "watch", "to": "watch", "round": 2, "length": 33,
      "prompt": "the fox and the ermine keep watching curiously with wide eyes, ears twitch slightly, tiny anticipation motion" },
    { "id": "cheer-loop", "kind": "loop", "from": "cheer", "to": "cheer", "round": 2, "length": 33,
      "prompt": "the fox keeps cheering and waving the raised paw, the ermine keeps bouncing happily in the fox's arms" },
    { "id": "aww-loop", "kind": "loop", "from": "aww", "to": "aww", "round": 2, "length": 33,
      "prompt": "the fox and the ermine stay a little sad with drooped ears, the fox slowly pats the ermine, small sigh" },
    { "id": "empty-loop", "kind": "loop", "from": "empty", "to": "empty", "round": 2, "length": 49,
      "prompt": "the fox and the ermine stay droopy and sleepy, slow blinks, ears hang low, very small motion" },
    { "id": "watch-idle", "kind": "transition", "from": "watch", "to": "idle", "round": 2, "length": 25,
      "prompt": "the fox and the ermine relax and turn back to the calm cozy idle pose" },
    { "id": "cheer-idle", "kind": "transition", "from": "cheer", "to": "idle", "round": 2, "length": 25,
      "prompt": "the fox lowers the paw and settles back into the calm cozy hugging pose, still smiling" },
    { "id": "aww-idle", "kind": "transition", "from": "aww", "to": "idle", "round": 2, "length": 25,
      "prompt": "the fox and the ermine cheer up, ears rise back, and settle into the calm cozy hugging pose" },
    { "id": "empty-idle", "kind": "transition", "from": "empty", "to": "idle", "round": 2, "length": 25,
      "prompt": "the fox and the ermine perk up, ears rise, and settle into the calm cozy hugging pose" },
    { "id": "watch-cheer", "kind": "transition", "from": "watch", "to": "cheer", "round": 2, "length": 17,
      "prompt": "the fox suddenly raises one paw high and cheers with a big open smile, the ermine bounces with joy, quick happy reaction" },
    { "id": "watch-aww", "kind": "transition", "from": "watch", "to": "aww", "round": 2, "length": 17,
      "prompt": "the fox and the ermine suddenly look a little disappointed, ears droop, small pout, quick reaction" },
    { "id": "idle-ear", "kind": "fidget", "from": "idle", "to": "idle", "round": 2, "length": 25,
      "prompt": "the fox twitches one ear quickly twice, then back to calm" },
    { "id": "idle-nuzzle", "kind": "fidget", "from": "idle", "to": "idle", "round": 2, "length": 33,
      "prompt": "the ermine nuzzles its head against the fox's chest affectionately, the fox smiles, then back to calm" },
    { "id": "idle-doze", "kind": "fidget", "from": "idle", "to": "idle", "round": 2, "length": 41,
      "prompt": "the fox slowly closes its eyes and nods off, head dipping a little, then wakes up with a small start and opens its eyes" }
  ]
}
```

每段的 `seeds` 與 `pick` 欄位由 `gen.py` 寫入(預設 seeds `[11, 22, 33]`)。Wan 的 `length` 必須是 4n+1。

- [ ] **Step 2: 寫 `tools/mascot-gen/comfy.py`**

```python
"""ComfyUI HTTP API 客戶端 + Wan 2.2 i2v 工作流圖。只用標準函式庫。"""
import io
import json
import os
import time
import urllib.parse
import urllib.request
import uuid

HOST = os.environ.get('COMFY_URL', 'http://192.168.68.53:8188').rstrip('/')
W, H = 640, 576


def upload(png_bytes, name):
    boundary = uuid.uuid4().hex
    body = (
        f'--{boundary}\r\nContent-Disposition: form-data; name="overwrite"\r\n\r\ntrue\r\n'
        f'--{boundary}\r\nContent-Disposition: form-data; name="image"; filename="{name}"\r\n'
        f'Content-Type: image/png\r\n\r\n'
    ).encode() + png_bytes + f'\r\n--{boundary}--\r\n'.encode()
    req = urllib.request.Request(f'{HOST}/upload/image', body,
                                 {'Content-Type': f'multipart/form-data; boundary={boundary}'})
    return json.load(urllib.request.urlopen(req))['name']


def graph(prompt, negative, start, length, seed, prefix, end=None):
    g = {
        '1': {'class_type': 'UNETLoader', 'inputs': {'unet_name': 'wan2.2_i2v_high_noise_14B_fp8_scaled.safetensors', 'weight_dtype': 'default'}},
        '2': {'class_type': 'UNETLoader', 'inputs': {'unet_name': 'wan2.2_i2v_low_noise_14B_fp8_scaled.safetensors', 'weight_dtype': 'default'}},
        '3': {'class_type': 'LoraLoaderModelOnly', 'inputs': {'model': ['1', 0], 'lora_name': 'wan2.2_i2v_lightx2v_4steps_lora_v1_high_noise.safetensors', 'strength_model': 1.0}},
        '4': {'class_type': 'LoraLoaderModelOnly', 'inputs': {'model': ['2', 0], 'lora_name': 'wan2.2_i2v_lightx2v_4steps_lora_v1_low_noise.safetensors', 'strength_model': 1.0}},
        '5': {'class_type': 'ModelSamplingSD3', 'inputs': {'model': ['3', 0], 'shift': 5.0}},
        '6': {'class_type': 'ModelSamplingSD3', 'inputs': {'model': ['4', 0], 'shift': 5.0}},
        '7': {'class_type': 'CLIPLoader', 'inputs': {'clip_name': 'umt5_xxl_fp8_e4m3fn_scaled.safetensors', 'type': 'wan', 'device': 'default'}},
        '8': {'class_type': 'VAELoader', 'inputs': {'vae_name': 'wan_2.1_vae.safetensors'}},
        '9': {'class_type': 'LoadImage', 'inputs': {'image': start}},
        '10': {'class_type': 'CLIPTextEncode', 'inputs': {'clip': ['7', 0], 'text': prompt}},
        '11': {'class_type': 'CLIPTextEncode', 'inputs': {'clip': ['7', 0], 'text': negative}},
        '13': {'class_type': 'KSamplerAdvanced', 'inputs': {'model': ['5', 0], 'add_noise': 'enable', 'noise_seed': seed, 'steps': 4, 'cfg': 1.0, 'sampler_name': 'euler', 'scheduler': 'simple', 'positive': ['12', 0], 'negative': ['12', 1], 'latent_image': ['12', 2], 'start_at_step': 0, 'end_at_step': 2, 'return_with_leftover_noise': 'enable'}},
        '14': {'class_type': 'KSamplerAdvanced', 'inputs': {'model': ['6', 0], 'add_noise': 'disable', 'noise_seed': seed, 'steps': 4, 'cfg': 1.0, 'sampler_name': 'euler', 'scheduler': 'simple', 'positive': ['12', 0], 'negative': ['12', 1], 'latent_image': ['13', 0], 'start_at_step': 2, 'end_at_step': 10000, 'return_with_leftover_noise': 'disable'}},
        '15': {'class_type': 'VAEDecode', 'inputs': {'samples': ['14', 0], 'vae': ['8', 0]}},
        '16': {'class_type': 'SaveImage', 'inputs': {'images': ['15', 0], 'filename_prefix': prefix}},
    }
    common = {'positive': ['10', 0], 'negative': ['11', 0], 'vae': ['8', 0], 'width': W, 'height': H, 'length': length, 'batch_size': 1}
    if end:
        g['17'] = {'class_type': 'LoadImage', 'inputs': {'image': end}}
        g['12'] = {'class_type': 'WanFirstLastFrameToVideo', 'inputs': {**common, 'start_image': ['9', 0], 'end_image': ['17', 0]}}
    else:
        g['12'] = {'class_type': 'WanImageToVideo', 'inputs': {**common, 'start_image': ['9', 0]}}
    return g


def run(g, timeout=900):
    body = json.dumps({'prompt': g, 'client_id': uuid.uuid4().hex}).encode()
    req = urllib.request.Request(f'{HOST}/prompt', body, {'Content-Type': 'application/json'})
    pid = json.load(urllib.request.urlopen(req))['prompt_id']
    t0 = time.time()
    while time.time() - t0 < timeout:
        hist = json.load(urllib.request.urlopen(f'{HOST}/history/{pid}'))
        if pid in hist:
            status = hist[pid]['status']
            if status.get('status_str') == 'error':
                raise RuntimeError(json.dumps(status)[:2000])
            return [img for out in hist[pid]['outputs'].values() for img in out.get('images', [])]
        time.sleep(3)
    raise TimeoutError(f'ComfyUI prompt {pid} 超過 {timeout}s')


def fetch(img):
    q = urllib.parse.urlencode({'filename': img['filename'], 'subfolder': img['subfolder'], 'type': img['type']})
    return urllib.request.urlopen(f'{HOST}/view?{q}').read()
```

- [ ] **Step 3: 寫 `tools/mascot-gen/gen.py`**

```python
"""吉祥物片段生成 CLI。規格:docs/superpowers/specs/2026-09-30-mascot-video-segments-design.md §3

在 repo 根目錄執行:
  PY=tools/mascot-gen/.venv/bin/python
  $PY tools/mascot-gen/gen.py run 0            # 生成第 0 輪(每段 3 個 seed)
  $PY tools/mascot-gen/gen.py sheet 0          # 每個候選一張逐格縮圖,給 Claude 過濾
  $PY tools/mascot-gen/gen.py review 0         # 產生比較頁
  $PY tools/mascot-gen/gen.py pick idle-loop 2 # 記錄使用者的挑選
  $PY tools/mascot-gen/gen.py build            # 輸出正式素材
"""
import argparse
import io
import json
import subprocess
import sys
from pathlib import Path

import numpy as np
from PIL import Image

import comfy
from post import key_green, blend_seam, resample, make_sheet

ROOT = Path(__file__).resolve().parents[2]
HERE = Path(__file__).resolve().parent
OUT = HERE / 'out'
KEYS = OUT / 'keys'
PROMPTS = HERE / 'prompts.json'
SRC_IDLE = ROOT / 'shared/img/mascot/idle.webp'
ASSETS = ROOT / 'shared/img/mascot'
DEFAULT_SEEDS = [11, 22, 33]


def load_cfg():
    return json.loads(PROMPTS.read_text())


def save_cfg(cfg):
    PROMPTS.write_text(json.dumps(cfg, ensure_ascii=False, indent=2) + '\n')


def seg_cfg(cfg, sid):
    for s in cfg['segments']:
        if s['id'] == sid:
            return s
    sys.exit(f'沒有這一段:{sid}')


def idle_on_green():
    """把原始 idle.webp 置中貼到 640x576 綠底上(round 0 的起點)。"""
    im = Image.open(SRC_IDLE).convert('RGBA')
    bg = Image.new('RGBA', (comfy.W, comfy.H), (0, 255, 0, 255))
    bg.alpha_composite(im, ((comfy.W - im.width) // 2, (comfy.H - im.height) // 2))
    return bg.convert('RGB')


def png_bytes(im):
    buf = io.BytesIO()
    im.save(buf, 'PNG')
    return buf.getvalue()


def key_path(pose):
    return KEYS / f'{pose}.png'


def need_key(pose):
    p = key_path(pose)
    if not p.exists():
        sys.exit(f'缺關鍵圖 {pose}:前一輪還沒 pick')
    return Image.open(p).convert('RGB')


def frames_of(sid, n):
    d = OUT / sid / f's{n}'
    files = sorted(d.glob('*.png'))
    if not files:
        sys.exit(f'{d} 沒有影格')
    return files


def cmd_run(args):
    cfg = load_cfg()
    todo = [s for s in cfg['segments'] if s['round'] == args.round and (not args.only or s['id'] == args.only)]
    for s in todo:
        s.setdefault('seeds', DEFAULT_SEEDS)
        if args.round == 0:
            start_img = end_img = idle_on_green()
        elif args.round == 1:
            start_img, end_img = need_key('idle'), None
        else:
            start_img, end_img = need_key(s['from']), need_key(s['to'])
        start = comfy.upload(png_bytes(start_img), f'mascot_{s["id"]}_start.png')
        end = comfy.upload(png_bytes(end_img), f'mascot_{s["id"]}_end.png') if end_img else None
        prompt = f'{cfg["style"]}, {s["prompt"]}'
        for n, seed in enumerate(s['seeds'], 1):
            d = OUT / s['id'] / f's{n}'
            d.mkdir(parents=True, exist_ok=True)
            for old in d.glob('*.png'):
                old.unlink()
            imgs = comfy.run(comfy.graph(prompt, cfg['negative'], start, s['length'], seed, f'mascot_{s["id"]}_s{n}', end))
            for i, img in enumerate(imgs):
                (d / f'{i:03d}.png').write_bytes(comfy.fetch(img))
            print(f'{s["id"]} s{n} seed={seed}: {len(imgs)} 格', flush=True)
    save_cfg(cfg)


def cmd_sheet(args):
    cfg = load_cfg()
    for s in cfg['segments']:
        if s['round'] != args.round:
            continue
        for n in range(1, len(s.get('seeds', DEFAULT_SEEDS)) + 1):
            files = frames_of(s['id'], n)
            idx = np.linspace(0, len(files) - 1, 10).round().astype(int)
            thumbs = [Image.open(files[i]).convert('RGB').resize((256, 230)) for i in idx]
            sheet = Image.new('RGB', (256 * 5, 230 * 2), 'white')
            for k, t in enumerate(thumbs):
                sheet.paste(t, ((k % 5) * 256, (k // 5) * 230))
            sheet.save(OUT / s['id'] / f's{n}.jpg', quality=85)
            print(OUT / s['id'] / f's{n}.jpg')


REVIEW_HTML = """<!doctype html>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>吉祥物候選 · 第 {round} 輪</title>
<style>
  body {{ font-family: system-ui, sans-serif; margin: 16px; background: #f4f1ea; color: #3b2f2a; }}
  section {{ margin-bottom: 32px; }}
  .row {{ display: flex; gap: 12px; flex-wrap: wrap; }}
  figure {{ margin: 0; background: url(../../../shared/img/snow-scene.webp) center/cover; border-radius: 12px; padding: 8px; }}
  canvas {{ width: 320px; height: 288px; display: block; }}
  figcaption {{ background: #fffaf2; border-radius: 8px; padding: 4px 8px; margin-top: 6px; }}
  .rejected {{ opacity: .45; }}
  .note {{ color: #b3261e; font-size: 14px; }}
</style>
<h1>第 {round} 輪:每段挑一個(回覆「<code>idle-loop 選 2</code>」)</h1>
<div id="app"></div>
<script>
const DATA = {data};
const FPS = 16;
function key(img) {{
  const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
  const x = c.getContext('2d'); x.drawImage(img, 0, 0);
  const d = x.getImageData(0, 0, c.width, c.height), p = d.data;
  for (let i = 0; i < p.length; i += 4) {{
    const dom = p[i+1] - Math.max(p[i], p[i+2]);
    p[i+3] = 255 * (1 - Math.min(1, Math.max(0, (dom - 40) / 80)));
    p[i+1] = Math.min(p[i+1], Math.max(p[i], p[i+2]));
  }}
  x.putImageData(d, 0, 0); return c;
}}
for (const seg of DATA) {{
  const sec = document.createElement('section');
  sec.innerHTML = `<h2>${{seg.id}}</h2><div class="row"></div>`;
  app.append(sec);
  for (const cand of seg.candidates) {{
    const fig = document.createElement('figure');
    if (cand.note) fig.className = 'rejected';
    const cv = document.createElement('canvas'); cv.width = 640; cv.height = 576;
    fig.append(cv);
    const cap = document.createElement('figcaption');
    cap.innerHTML = `<b>${{cand.n}}</b> seed ${{cand.seed}}` + (cand.note ? `<div class="note">淘汰:${{cand.note}}</div>` : '');
    fig.append(cap);
    sec.querySelector('.row').append(fig);
    Promise.all(cand.frames.map(src => new Promise(r => {{ const i = new Image(); i.onload = () => r(key(i)); i.src = src; }})))
      .then(frames => {{
        const x = cv.getContext('2d'); let k = 0;
        setInterval(() => {{ x.clearRect(0, 0, 640, 576); x.drawImage(frames[k], 0, 0); k = (k + 1) % frames.length; }}, 1000 / FPS);
      }});
  }}
}}
</script>
"""


def cmd_review(args):
    cfg = load_cfg()
    data = []
    for s in cfg['segments']:
        if s['round'] != args.round:
            continue
        notes_file = OUT / s['id'] / 'notes.json'
        notes = json.loads(notes_file.read_text()) if notes_file.exists() else {}
        cands = []
        for n, seed in enumerate(s.get('seeds', DEFAULT_SEEDS), 1):
            files = frames_of(s['id'], n)
            cands.append({'n': n, 'seed': seed, 'note': notes.get(f's{n}'),
                          'frames': [f'../out/{s["id"]}/s{n}/{f.name}' for f in files]})
        data.append({'id': s['id'], 'candidates': cands})
    page = HERE / 'review' / 'index.html'
    page.parent.mkdir(exist_ok=True)
    page.write_text(REVIEW_HTML.format(round=args.round, data=json.dumps(data, ensure_ascii=False)))
    print(page)


def cmd_pick(args):
    cfg = load_cfg()
    s = seg_cfg(cfg, args.id)
    s['pick'] = args.n
    save_cfg(cfg)
    files = frames_of(args.id, args.n)
    KEYS.mkdir(parents=True, exist_ok=True)
    if s['round'] == 0:
        Image.open(files[0]).convert('RGB').save(key_path('idle'))
        print(f'K_idle ← {files[0]}')
    elif s['round'] == 1:
        Image.open(files[-1]).convert('RGB').save(key_path(s['to']))
        print(f'K_{s["to"]} ← {files[-1]}')


def to_rgba(path, w, h):
    rgba = key_green(np.asarray(Image.open(path).convert('RGB')))
    return np.asarray(Image.fromarray(rgba, 'RGBA').resize((w, h), Image.LANCZOS))


def cwebp(png_path, webp_path):
    subprocess.run(['cwebp', '-quiet', '-q', '80', '-alpha_q', '90', '-exact', str(png_path), '-o', str(webp_path)], check=True)


def cmd_build(args):
    cfg = load_cfg()
    missing = [s['id'] for s in cfg['segments'] if not s.get('pick')]
    if missing:
        sys.exit(f'還沒 pick:{", ".join(missing)}')
    (ASSETS / 'key').mkdir(exist_ok=True)
    (ASSETS / 'seg').mkdir(exist_ok=True)
    tmp = OUT / 'build'
    tmp.mkdir(exist_ok=True)

    keys = {}
    for pose in ['idle', 'watch', 'cheer', 'aww', 'empty']:
        keys[pose] = to_rgba(need_key_path(pose), args.w, args.h)
        png = tmp / f'key-{pose}.png'
        Image.fromarray(keys[pose], 'RGBA').save(png)
        cwebp(png, ASSETS / 'key' / f'{pose}.webp')

    cols = 8
    manifest = {'frame': {'w': args.w, 'h': args.h},
                'keyframes': {p: f'key/{p}.webp' for p in keys},
                'segments': []}
    for s in cfg['segments']:
        files = frames_of(s['id'], s['pick'])
        frames = [to_rgba(f, args.w, args.h) for f in files]
        frames = resample(frames, cfg['src_fps'], args.fps)
        frames = blend_seam(frames, keys[s['from']], keys[s['to']])
        png = tmp / f'{s["id"]}.png'
        Image.fromarray(make_sheet(frames, cols), 'RGBA').save(png)
        cwebp(png, ASSETS / 'seg' / f'{s["id"]}.webp')
        manifest['segments'].append({'id': s['id'], 'kind': s['kind'], 'from': s['from'], 'to': s['to'],
                                     'frames': len(frames), 'fps': args.fps,
                                     'sheet': f'seg/{s["id"]}.webp', 'cols': cols})
    (ASSETS / 'segments.json').write_text(json.dumps(manifest, indent=2) + '\n')

    total = sum(p.stat().st_size for p in [*(ASSETS / 'seg').glob('*.webp'), *(ASSETS / 'key').glob('*.webp')])
    first = sum((ASSETS / 'seg' / f'{i}.webp').stat().st_size for i in ['idle-loop', 'idle-watch', 'watch-loop', 'watch-cheer', 'watch-aww'])
    print(f'總大小 {total / 1024:.0f} KB;揭曉前會用到的前 5 段 {first / 1024:.0f} KB')


def need_key_path(pose):
    p = key_path(pose)
    if not p.exists():
        sys.exit(f'缺關鍵圖 {pose}')
    return p


def main():
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest='cmd', required=True)
    r = sub.add_parser('run'); r.add_argument('round', type=int); r.add_argument('--only')
    sh = sub.add_parser('sheet'); sh.add_argument('round', type=int)
    rv = sub.add_parser('review'); rv.add_argument('round', type=int)
    pk = sub.add_parser('pick'); pk.add_argument('id'); pk.add_argument('n', type=int)
    b = sub.add_parser('build'); b.add_argument('--w', type=int, default=480); b.add_argument('--h', type=int, default=432); b.add_argument('--fps', type=int, default=16)
    args = ap.parse_args()
    {'run': cmd_run, 'sheet': cmd_sheet, 'review': cmd_review, 'pick': cmd_pick, 'build': cmd_build}[args.cmd](args)


if __name__ == '__main__':
    main()
```

- [ ] **Step 4: 冒煙測試 CLI(不送 ComfyUI)**

```bash
PY=tools/mascot-gen/.venv/bin/python
$PY tools/mascot-gen/gen.py --help
$PY tools/mascot-gen/gen.py pick idle-loop 1; echo "exit=$?"
```
Expected:`--help` 列出 5 個子命令;`pick` 因為還沒有影格而以 `... 沒有影格` 結束(exit 1)。然後 `git checkout tools/mascot-gen/prompts.json` 還原被寫入的 `pick`(若檔案已被改動)。

- [ ] **Step 5: 確認 ComfyUI 連得到**

Run: `curl -s -m 5 "${COMFY_URL:-http://192.168.68.53:8188}/system_stats" | head -c 200`
Expected:JSON,含 `"comfyui_version"`。連不上就停下來請使用者開機器,不要繼續 Task 7。

- [ ] **Step 6: Commit**

```bash
git add tools/mascot-gen/comfy.py tools/mascot-gen/gen.py tools/mascot-gen/prompts.json
git commit -m "feat(mascot-gen): ComfyUI 客戶端、18 段提示詞與生成 CLI"
```

---

### Task 7: 第 0 輪 —— idle 循環(使用者挑選關卡)

**Files:** 只動 `tools/mascot-gen/prompts.json`(pick)與 `tools/mascot-gen/out/`(不進 git)

- [ ] **Step 1: 生成**

Run: `tools/mascot-gen/.venv/bin/python tools/mascot-gen/gen.py run 0`
Expected:`idle-loop s1/s2/s3 ... 49 格`,約 2 分鐘

- [ ] **Step 2: 產生縮圖並逐張看**

Run: `tools/mascot-gen/.venv/bin/python tools/mascot-gen/gen.py sheet 0`,然後用 Read 工具逐張看 `tools/mascot-gen/out/idle-loop/s{1,2,3}.jpg`。

淘汰標準(任一條就淘汰):手指或腳的數量不對、白鼬離開狐狸懷裡或變大變小、角色位置/大小漂移、綠色背景出現非綠色物件、角色身上出現綠色、臉部畸形。第一格跟最後一格差太多(循環會跳)也淘汰。

把淘汰原因寫進 `tools/mascot-gen/out/idle-loop/notes.json`,例如 `{"s2": "白鼬第 30 格右手多一根指頭"}`。沒淘汰的不寫。

- [ ] **Step 3: 產生比較頁給使用者看**

```bash
tools/mascot-gen/.venv/bin/python tools/mascot-gen/gen.py review 0
PORT=$(python3 -c 'import socket; s=socket.socket(); s.bind(("",0)); print(s.getsockname()[1])')
python3 -m http.server "$PORT" >/dev/null 2>&1 &
open "http://localhost:$PORT/tools/mascot-gen/review/"
```

- [ ] **Step 4: 🛑 關卡 —— 等使用者挑**

告訴使用者:比較頁已開、哪些被淘汰及原因、請回「idle-loop 選 N」。**不得自己挑、不得繼續。** 若三個都不行:跟使用者討論改哪裡(提示詞或 seed),改 `prompts.json` 對應段的 `prompt` / `seeds`,用 `gen.py run 0 --only idle-loop` 重跑,回到 Step 2。

- [ ] **Step 5: 記錄挑選**

Run: `tools/mascot-gen/.venv/bin/python tools/mascot-gen/gen.py pick idle-loop <N>`
Expected:`K_idle ← .../idle-loop/s<N>/000.png`

- [ ] **Step 6: Commit**

```bash
git add tools/mascot-gen/prompts.json
git commit -m "chore(mascot-gen): 第 0 輪挑選(idle-loop)"
```

---

### Task 8: 第 1 輪 —— 四個姿勢的進場(使用者挑選關卡)

- [ ] **Step 1: 生成**

Run: `tools/mascot-gen/.venv/bin/python tools/mascot-gen/gen.py run 1`
Expected:`idle-watch / idle-cheer / idle-aww / idle-empty` 各 3 個,約 8 分鐘

- [ ] **Step 2: 縮圖逐張看**,淘汰標準同 Task 7 Step 2,**另加一條**:最後一格必須是「停住」的姿勢(它會變成這個姿勢的關鍵圖);最後幾格還在大動作的淘汰。寫 `notes.json`。

- [ ] **Step 3: 比較頁**:`gen.py review 1`,用 Task 7 Step 3 的方式開新 port 打開。

- [ ] **Step 4: 🛑 關卡 —— 等使用者四段各挑一個。** 提醒使用者:這一輪挑的最後一格就是 watch / cheer / aww / empty 四個姿勢「長什麼樣子」,後面 13 段都會夾在這些圖之間。不行的段用 `--only` 重跑。

- [ ] **Step 5: 記錄挑選**(四次):`gen.py pick idle-watch <N>` … 每次確認印出 `K_<pose> ← ...`

- [ ] **Step 6: Commit**

```bash
git add tools/mascot-gen/prompts.json
git commit -m "chore(mascot-gen): 第 1 輪挑選(四個姿勢的關鍵圖)"
```

---

### Task 9: 第 2 輪 —— 其餘 13 段(使用者挑選關卡)

- [ ] **Step 1: 生成**

Run: `tools/mascot-gen/.venv/bin/python tools/mascot-gen/gen.py run 2`
Expected:13 段 × 3,約 26 分鐘。用 `run_in_background` 跑,完成通知來了再繼續。

- [ ] **Step 2: 縮圖逐張看**(39 張),淘汰標準同 Task 7 Step 2;循環段另加「頭尾差太多」。寫各段 `notes.json`。

- [ ] **Step 3: 比較頁**:`gen.py review 2`,開新 port。

- [ ] **Step 4: 🛑 關卡 —— 等使用者 13 段各挑一個。** 不行的段用 `--only` 重跑。

- [ ] **Step 5: 記錄挑選**(13 次 `gen.py pick`)

- [ ] **Step 6: Commit**

```bash
git add tools/mascot-gen/prompts.json
git commit -m "chore(mascot-gen): 第 2 輪挑選(循環、退場、直連、小動作)"
```

---

### Task 10: 輸出素材、接上網站、驗收

**Files:**
- Create: `shared/img/mascot/segments.json`, `shared/img/mascot/key/*.webp`, `shared/img/mascot/seg/*.webp`
- Delete: `shared/img/mascot/{idle,watch,cheer,aww,empty,doze}.webp`

- [ ] **Step 1: 輸出並量大小**

Run: `tools/mascot-gen/.venv/bin/python tools/mascot-gen/gen.py build`
Expected:印出 `總大小 … KB;揭曉前會用到的前 5 段 … KB`

- [ ] **Step 2: 🛑 關卡 —— 大小決定**

把兩個數字報給使用者。建議門檻:前 5 段 ≤ 1.5 MB、總量 ≤ 5 MB(這是建議,不是 spec 定的,要講清楚)。超過就提出 `--fps 12` 或 `--w 400 --h 360` 的選項重跑 build 比較,由使用者決定。

- [ ] **Step 3: 驗 manifest**

```bash
node --input-type=module -e "
import { validate } from './shared/js/mascot-route.js';
import { readFileSync } from 'node:fs';
validate(JSON.parse(readFileSync('shared/img/mascot/segments.json', 'utf8')));
console.log('segments.json OK');"
```
Expected:`segments.json OK`

- [ ] **Step 4: 刪舊圖**

`idle.webp` 是生成管線的起點(`gen.py` 的 `SRC_IDLE`),但生成已經結束、`K_idle` 已存在 `out/keys/`。刪之前先把它搬進工具目錄保留來源:

```bash
git mv shared/img/mascot/idle.webp tools/mascot-gen/source-idle.webp
git rm shared/img/mascot/{watch,cheer,aww,empty,doze}.webp
```
並把 `gen.py` 的 `SRC_IDLE` 改成 `HERE / 'source-idle.webp'`。

- [ ] **Step 5: 跑全部測試**

Run: `node --test && tools/mascot-gen/.venv/bin/python -m unittest discover tools/mascot-gen`
Expected:全部 PASS

- [ ] **Step 6: 真實頁面冷啟動驗證**

```bash
PORT=$(python3 -c 'import socket; s=socket.socket(); s.bind(("",0)); print(s.getsockname()[1])')
python3 -m http.server "$PORT" >/dev/null 2>&1 &
echo "$PORT"
```

用 Playwright(系統 Chrome,`channel: 'chrome'`,腳本放 scratchpad)對首頁與五個模式:
1. 載入後等 3 秒截圖,確認左下角(首頁是標題旁)有吉祥物、背景透明沒有綠邊
2. 收集 `pageerror` 與 `console` 的 warning,預期為空
3. 扭蛋機:按「轉!」,在揭曉前、揭曉後各截一張,確認姿勢從 watch 變成 cheer 或 aww
4. 阿彌陀籤與大亂鬥:按「開始」/「開打!」跑完一次,揭曉時截圖
5. 錄一段扭蛋機完整流程的影片(Playwright `recordVideo`),給使用者看

逐張用 Read 看截圖。**有綠邊、有空白、有 console 錯誤就停下來修,不要交付。**

- [ ] **Step 7: 🛑 關卡 —— 使用者驗收**

把截圖與錄影給使用者,並講清楚 spec「交付前要誠實講清楚的事」那五條(只測 Chrome、真機沒測、檔案大小、生成品質、Wan 授權沒查)。「夠不夠活」由使用者判斷;不滿意的段回 Task 9 用 `--only` 重生成再 build。

- [ ] **Step 8: Commit**

```bash
git add shared/img/mascot tools/mascot-gen/gen.py tools/mascot-gen/source-idle.webp
git commit -m "feat(mascot): 換上 18 段影片片段素材,淘汰六張舊姿勢圖"
```

- [ ] **Step 9: 收尾**

使用 superpowers:finishing-a-development-branch 決定怎麼併回 main。
