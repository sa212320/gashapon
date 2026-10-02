# 一番賞手指撕籤 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 一番賞拿起籤之後可以用手指(或滑鼠)往右拉慢慢撕開;「撕開」按鈕照舊可用。

**Architecture:** 拖曳規則(進度、3% commit、8% 撕紙聲、70% 自動)放在純函式模組 `tear-drag.js`(node 測得到);`curl.js` 加 `show(p)` / `playFrom(p, ms)`;`ui.js` 的 revealer 新增 `waitForTear()` 接 pointer 事件、取代 main.js 的 `waitForChoice`;金卡改成 `holdBonus` + 同一個 `waitForTear`。

**Tech Stack:** 原生 ES modules、three.js(curl.js)、Web Audio(shared/js/sound.js)、`node --test`。

**Spec:** `docs/superpowers/specs/2026-10-02-ichiban-touch-tear-design.md`

## 確認過的模型(原文,不要改寫)

- **Entities**:`Ticket { no, prizeId, drawn }`(沿用、不新增欄位);`TearState { progress 0~1, committed, auto }` 只在畫面上,不存檔
- **Cardinality**:一次抽 1:1 一張籤 1:1 一個撕開流程;最後一抽賞時後面再 1 個金卡撕開流程
- **Seen vs stored**:撕到一半的進度不存;commit 時機 = 按「撕開」或手指往右拉 > 3%;之後取消消失,拉回 0% 也算抽走;≥ 70% 或按撕開後自動撕完、不能再拉
- **三個錯誤版本(看到就要警覺)**:
  - ❌「放開手指紙彈回去」—— 錯,停在原地
  - ❌「拉回 0% 可以取消」—— 錯,> 3% 就算抽走,取消鈕已經消失
  - ❌「金卡維持自動撕開」—— 錯,金卡也手撕,只是沒有取消

**執行中如果發現程式跟這個模型衝突,那是計畫的 bug —— 停下來回報。**

**跟 spec 的一處落差(計畫的決定):** spec 寫 `waitForTear` resolve `'cancel' | 'commit' | 'button'`;實際上 commit 之後還要繼續追手指到 70%,所以改成 `waitForTear({ cancellable, onCommit })` → resolve `'cancel'` 或 `{ from }`(自動撕完的起點),`onCommit` 在第一次 commit 時同步呼叫一次。行為與模型完全一致。

## Global Constraints

- `COMMIT_AT = 0.03`、`AUTO_AT = 0.7`、`RIP_STEP = 0.08`
- progress = 往右拉的距離 / 籤寬;放開停在原地;可以往回拉;auto 之後拖曳無效
- 單點(沒拉動)不算撕、不觸發跳過(卡片上的 click 一律 stopPropagation)
- 音效開關照舊(sfx 本來就看 `setEnabled`)
- commit message 英文,結尾兩行 `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>` / `Claude-Session: https://claude.ai/code/session_01SemYkQLkTmSDDeYUKQcPZG`
- 測試:`node --test test/*.test.js`

## Review Focus

1. **手指拉的時候頁面跟著捲動 / iOS 拉出返回手勢** → `.tear` 要 `touch-action: none` 並 `setPointerCapture`(Task 3 靜態測試)
2. **commit 後切到背景 / 關分頁** → 已存檔,回來那張籤是 drawn;不能出現「存了但沒看到獎項」以外的錯誤狀態(Task 4 靜態測試:存檔在 onCommit 裡)
3. **快速連點「撕開」或撕到 70% 的同時按「撕開」** → 只 resolve 一次、只播一次(Task 3 測試)
4. **three.js 載不起來(靜態退路)** → 拖曳不能丟例外,按鈕仍可撕開(Task 3:stage 為 null 時 show 不呼叫)
5. **拿起後還沒拉就按取消** → 照舊飛回桌上、不存檔(Task 3、4)

---

### Task 1: `tear-drag.js` 拖曳規則

**Files:** Create `ichiban/js/tear-drag.js`;Test `test/ichiban-tear-drag.test.js`

**Interfaces:** Produces `createTearDrag()` → `{ down(x), move(x), up(), button(), progress, committed, auto, active }`;`x` 以「籤寬」為單位(clientX / 籤寬);`move` / `button` 回傳 `{ progress, events }`,events ⊂ `['commit', 'rip', 'auto']`;常數 `COMMIT_AT`、`AUTO_AT`、`RIP_STEP`。

- [ ] **Step 1: 失敗的測試** —— `test/ichiban-tear-drag.test.js`

```js
// 一番賞手指撕籤的規則(2026-10-02 grill 定案)。
import test from 'node:test';
import assert from 'node:assert/strict';
import { createTearDrag, COMMIT_AT, AUTO_AT, RIP_STEP } from '../ichiban/js/tear-drag.js';

test('常數是定案的值', () => {
  assert.deepEqual([COMMIT_AT, AUTO_AT, RIP_STEP], [0.03, 0.7, 0.08]);
});

test('單點(沒拉動)不算撕', () => {
  const d = createTearDrag();
  d.down(0.5); d.up();
  assert.equal(d.progress, 0);
  assert.equal(d.committed, false);
});

test('往右拉的距離 / 籤寬 = 進度;超過 3% 才 commit,只 commit 一次', () => {
  const d = createTearDrag();
  d.down(0.2);
  assert.deepEqual(d.move(0.22).events, []);
  const r = d.move(0.24);
  assert.ok(Math.abs(r.progress - 0.04) < 1e-9);
  assert.deepEqual(r.events, ['commit']);
  assert.ok(!d.move(0.25).events.includes('commit'));
});

test('放開停在原地,下一次從目前進度接著拉', () => {
  const d = createTearDrag();
  d.down(0.1); d.move(0.4); d.up();
  assert.ok(Math.abs(d.progress - 0.3) < 1e-9);
  d.down(0.6); d.move(0.7);
  assert.ok(Math.abs(d.progress - 0.4) < 1e-9);
});

test('可以往回拉,進度會減少,但 committed 不會變回 false(模型錯誤 #2)', () => {
  const d = createTearDrag();
  d.down(0); d.move(0.3); d.move(-0.5);
  assert.equal(d.progress, 0);
  assert.equal(d.committed, true);
});

test('撕紙聲:往前每 8% 一聲,往回不出聲,再往前又會響', () => {
  const d = createTearDrag();
  d.down(0);
  const rips = x => d.move(x).events.filter(e => e === 'rip').length;
  assert.equal(rips(0.05), 0);
  assert.equal(rips(0.09), 1);
  assert.equal(rips(0.30), 1, '一次跨過好幾段也只響一聲');
  assert.equal(rips(0.10), 0, '往回不出聲');
  assert.equal(rips(0.20), 1);
});

test('到 70% 自動撕完;之後拖曳無效', () => {
  const d = createTearDrag();
  d.down(0);
  const r = d.move(0.71);
  assert.ok(r.events.includes('auto') && r.events.includes('commit'));
  assert.equal(d.auto, true);
  assert.deepEqual(d.move(0.1).events, []);
  assert.ok(Math.abs(d.progress - 0.71) < 1e-9);
});

test('按「撕開」:任何進度都直接 auto(還沒 commit 的也一起 commit);只算一次', () => {
  const d = createTearDrag();
  assert.deepEqual(d.button().events, ['commit', 'auto']);
  assert.deepEqual(d.button().events, []);
  const e = createTearDrag();
  e.down(0); e.move(0.3);
  assert.deepEqual(e.button().events, ['auto']);
  assert.ok(Math.abs(e.button().progress - 0.3) < 1e-9);
});

test('沒有 down 的 move 不算數(手指從籤外面滑進來)', () => {
  const d = createTearDrag();
  assert.deepEqual(d.move(0.5).events, []);
  assert.equal(d.progress, 0);
});
```

- [ ] **Step 2: 跑 → FAIL**(`node --test test/ichiban-tear-drag.test.js`,模組不存在)

- [ ] **Step 3: 實作** —— `ichiban/js/tear-drag.js`

```js
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
    if (progress >= AUTO_AT) { auto = true; events.push('auto'); }
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
```

- [ ] **Step 4: 跑 → PASS**;`node --test test/*.test.js` 全過
- [ ] **Step 5: Commit** `feat(ichiban): tear drag rules — 3% commits, 8% rip steps, 70% auto, button any time`

### Task 2: `curl.js` 從任意進度畫 / 播 + `sfx.rip`

**Files:** Modify `ichiban/js/curl.js`、`shared/js/sound.js`;Test `test/ichiban-tear-drag.test.js`(靜態)

**Interfaces:** Produces `stage.show(p)`、`stage.playFrom(p, ms)` → `{ finished, finish }`;`play(ms)` 不變(= `playFrom(0, ms)`);`sfx.rip()`。

- [ ] **Step 1: 失敗的測試**(加在 `test/ichiban-tear-drag.test.js`)

```js
import { readFileSync } from 'node:fs';
const read = p => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

test('curl.js 可以畫到任意進度、從任意進度接著播', () => {
  const src = read('ichiban/js/curl.js');
  assert.match(src, /show\(p\) \{/);
  assert.match(src, /playFrom\(from, ms\) \{/);
  assert.match(src, /play\(ms\) \{\s*return this\.playFrom\(0, ms\);/);
});

test('音效庫有短撕紙聲 rip', async () => {
  const { sfx } = await import('../shared/js/sound.js');
  assert.equal(typeof sfx.rip, 'function');
});
```

- [ ] **Step 2: FAIL**
- [ ] **Step 3: 實作**
  - `curl.js` 回傳物件裡,`play(ms)` 改成 `playFrom(from, ms)`:`t0` 同,`p = from + (1 - from) * Math.min(1, (now - t0) / ms)`;新增 `show(p) { resize(); setProgress(Math.min(1, Math.max(0, p))); }`;`play(ms) { return this.playFrom(0, ms); }`(物件要用一般方法語法讓 `this` 有效)
  - `sound.js` 的 `sfx` 加:

```js
  // 手指撕籤時每往前一段的短撕紙聲(2026-10-02)。要很短,連續幾下才不會糊在一起
  rip() {
    noise({ dur: 0.06, gain: 0.12, from: 5000, to: 1500 });
  },
```

- [ ] **Step 4: PASS**;全套過
- [ ] **Step 5: Commit** `feat(ichiban): curl can show or play from any progress; sfx.rip`

### Task 3: revealer `waitForTear` + 提示 + 金卡拆成 `holdBonus`

**Files:** Modify `ichiban/js/ui.js`、`ichiban/index.html`(`#tearHint`)、`ichiban/css/ichiban.css`;Test `test/ichiban-reveal.test.js`

**Interfaces:**
- Consumes:`createTearDrag`(Task 1)、`stage.show` / `stage.playFrom`(Task 2)、`sfx.rip`
- Produces:
  - `createRevealer(els)` 的 els 多 `ticketActions`、`holdCancelBtn`、`tearBtn`、`tearHint`
  - `revealer.waitForTear({ cancellable = true, onCommit })` → `Promise<'cancel' | { from: number }>`
  - `revealer.tear(from = 0)`:從 `from` 自動撕完 + 既有獎項演出
  - `revealer.holdBonus(name)`:金卡飛上來(原本 playBonus 的前半);`playBonus` 刪掉

- [ ] **Step 1: 失敗的測試**(`test/ichiban-reveal.test.js`)
  - `stubEl` 加 `hidden: false`、`offsetWidth: 340`、`addEventListener(type, fn, opts)`(記到 `el._l[type]`,支援 `opts.signal` 的 abort 移除)、`setPointerCapture() {}`、`dispatch(type, ev)`(呼叫該 type 的所有 listener,`ev` 帶 `stopPropagation() {}`、`clientX`、`pointerId: 1`)
  - `EL_KEYS` 加 `'ticketActions', 'holdCancelBtn', 'tearBtn', 'tearHint'`

```js
const tearEls = () => Object.fromEntries(EL_KEYS.map(k => [k, stubEl()]));
const ev = (clientX = 0) => ({ clientX, pointerId: 1, stopPropagation() {}, preventDefault() {} });

test('waitForTear:手指拉超過 3% 呼叫 onCommit 一次、收起取消;拉到 70% resolve { from }', async () => {
  await withDomStubs(async () => {
    const { createRevealer } = await import('../ichiban/js/ui.js');
    const els = tearEls();
    const r = createRevealer(els);
    await r.hold({ tier: 'C', name: '三獎', no: 3 }, null);
    let commits = 0;
    const p = r.waitForTear({ onCommit: () => commits++ });
    assert.equal(els.tearHint.hidden, false);
    assert.equal(els.holdCancelBtn.hidden, false);
    els.tearCard.dispatch('pointerdown', ev(0));
    els.tearCard.dispatch('pointermove', ev(340 * 0.05));
    assert.equal(commits, 1);
    assert.equal(els.holdCancelBtn.hidden, true);
    assert.equal(els.tearHint.hidden, true);
    els.tearCard.dispatch('pointermove', ev(340 * 0.75));
    const res = await p;
    assert.ok(Math.abs(res.from - 0.75) < 1e-9);
    assert.equal(commits, 1);
    await r.tear(res.from);
  });
});

test('waitForTear:沒拉就按取消 → resolve cancel、不 commit', async () => {
  await withDomStubs(async () => {
    const { createRevealer } = await import('../ichiban/js/ui.js');
    const els = tearEls();
    const r = createRevealer(els);
    await r.hold({ tier: 'C', name: '三獎', no: 3 }, null);
    let commits = 0;
    const p = r.waitForTear({ onCommit: () => commits++ });
    els.holdCancelBtn.dispatch('click', ev());
    assert.equal(await p, 'cancel');
    assert.equal(commits, 0);
  });
});

test('waitForTear:撕到一半按撕開 → 從目前進度;連按、70% 同時按都只 resolve 一次', async () => {
  await withDomStubs(async () => {
    const { createRevealer } = await import('../ichiban/js/ui.js');
    const els = tearEls();
    const r = createRevealer(els);
    await r.hold({ tier: 'C', name: '三獎', no: 3 }, null);
    let commits = 0;
    const p = r.waitForTear({ onCommit: () => commits++ });
    els.tearCard.dispatch('pointerdown', ev(0));
    els.tearCard.dispatch('pointermove', ev(340 * 0.3));
    els.tearBtn.dispatch('click', ev());
    els.tearBtn.dispatch('click', ev());
    els.tearCard.dispatch('pointermove', ev(340 * 0.9));
    const res = await p;
    assert.ok(Math.abs(res.from - 0.3) < 1e-9);
    assert.equal(commits, 1);
  });
});

test('waitForTear:金卡(cancellable: false)看不到取消', async () => {
  await withDomStubs(async () => {
    const { createRevealer } = await import('../ichiban/js/ui.js');
    const els = tearEls();
    const r = createRevealer(els);
    await r.holdBonus('最後一抽大獎');
    const p = r.waitForTear({ cancellable: false });
    assert.equal(els.holdCancelBtn.hidden, true);
    els.tearBtn.dispatch('click', ev());
    assert.deepEqual(await p, { from: 0 });
    await r.tear(0);
    assert.equal(els.cardBadge.textContent, '🌟 最後一抽賞');
  });
});

test('撕籤區塊不讓瀏覽器拿去捲動 / 返回手勢', () => {
  const css = readFileSync(new URL('../ichiban/css/ichiban.css', import.meta.url), 'utf8');
  const rule = css.slice(css.indexOf('.tear {'), css.indexOf('}', css.indexOf('.tear {')));
  assert.match(rule, /touch-action: none;/);
});
```

  把舊的「最後一抽賞:hold + tear 一次跑完」測試改成 `await revealer.holdBonus(...)` + `await revealer.tear(0)`;檔頭補 `import { readFileSync } from 'node:fs';`。

- [ ] **Step 2: FAIL**
- [ ] **Step 3: 實作**
  - `ui.js`:import `createTearDrag`;`runCurl(ms, from = 0)` 改呼叫 `stage.playFrom(isSkipping() ? 1 : from, ...)`(跳過時直接播完);`playTear(from = 0)` 把 `runCurl(1150 + level * 45, from)` 的時間乘 `(1 - from)` 交給 playFrom 處理(playFrom 已按剩餘比例,傳完整時間即可)
  - `waitForTear({ cancellable = true, onCommit } = {})`:

```js
    waitForTear({ cancellable = true, onCommit } = {}) {
      const drag = createTearDrag();
      const ac = new AbortController();
      const on = (el, type, fn) => el.addEventListener(type, fn, { signal: ac.signal });
      els.holdCancelBtn.hidden = !cancellable;
      els.tearHint.hidden = false;
      els.ticketActions.hidden = false;
      return new Promise(resolve => {
        let done = false;
        const width = () => els.tearCard.offsetWidth || 340;
        const finish = value => {
          if (done) return;
          done = true;
          ac.abort();
          els.ticketActions.hidden = true;
          els.tearHint.hidden = true;
          resolve(value);
        };
        const apply = ({ progress, events }) => {
          for (const e of events) {
            if (e === 'commit') { els.holdCancelBtn.hidden = true; els.tearHint.hidden = true; onCommit?.(); }
            if (e === 'rip') sfx.rip();
          }
          stage?.show(progress);
          if (events.includes('auto')) finish({ from: progress });
        };
        // stopPropagation:overlay 上掛著「播放中就快轉」,卡片上的點擊 / 按鈕不能被它接走
        on(els.tearCard, 'pointerdown', e => {
          e.stopPropagation();
          els.tearCard.setPointerCapture?.(e.pointerId);
          drag.down(e.clientX / width());
        });
        on(els.tearCard, 'pointermove', e => { if (drag.active) apply(drag.move(e.clientX / width())); });
        on(els.tearCard, 'pointerup', () => drag.up());
        on(els.tearCard, 'pointercancel', () => drag.up());
        on(els.tearCard, 'click', e => e.stopPropagation());
        on(els.tearBtn, 'click', e => { e.stopPropagation(); apply(drag.button()); });
        on(els.holdCancelBtn, 'click', e => { e.stopPropagation(); if (!drag.committed) finish('cancel'); });
      });
    },
```

  - `tear(from = 0) { return playTear(from); }`;`holdBonus(name)` = 原 `playBonus` 的 `els.cardBadge… ; await playHold({...}, null)`(不含 wait 與 playTear);刪掉 `playBonus`
  - `index.html`:`.ticket-actions` 裡、`ticket-actions__ask` 換成 `<p class="ticket-actions__ask tear-hint" id="tearHint">→ 往右撕,或按「撕開」</p>`(提示本來就在按鈕上面,沿用位置)
  - `ichiban.css`:`.tear { … touch-action: none; cursor: grab; }`;`.tear-hint[hidden] { visibility: hidden; display: block; }`(收起時保留高度,按鈕不會跳動)
- [ ] **Step 4: PASS**;全套過
- [ ] **Step 5: Commit** `feat(ichiban): drag to tear — revealer.waitForTear with pointer events, hint, bonus card uses the same flow`

### Task 4: main.js 接上

**Files:** Modify `ichiban/js/main.js`;Test `test/ichiban-tear-drag.test.js`(靜態)

**Interfaces:** Consumes `revealer.waitForTear` / `tear(from)` / `holdBonus`(Task 3)。

- [ ] **Step 1: 失敗的測試**

```js
test('main.js:存檔只在 onCommit 裡(手指 > 3% 或按撕開);金卡不能取消', () => {
  const src = read('ichiban/js/main.js');
  assert.ok(!/waitForChoice/.test(src));
  assert.match(src, /waitForTear\(\{\s*onCommit: \(\) => \{[\s\S]*?persist\(state\);[\s\S]*?\}\s*\}\)/);
  assert.match(src, /holdBonus\(result\.lastOnePrize\)[\s\S]*?waitForTear\(\{ cancellable: false \}\)/);
  assert.ok(!/playBonus/.test(src));
});
```

- [ ] **Step 2: FAIL**
- [ ] **Step 3: 實作**
  - `createRevealer({ … })` 多傳 `ticketActions: $('ticketActions'), holdCancelBtn: $('holdCancelBtn'), tearBtn: $('tearBtn'), tearHint: $('tearHint')`
  - 刪掉 `waitForChoice`(連同那段 stopPropagation 註解,搬到 ui.js 的 waitForTear 註解裡)與 `ticketActions.hidden = …` 兩行
  - hold 之後:

```js
    const choice = await revealer.waitForTear({
      onCommit: () => {
        // 手指拉過 3%(還看不到獎項)或按了撕開:這時才把結果寫進 state、存進 localStorage。
        // 之後就算拉回 0% 也算抽走 —— 不能偷看再取消(2026-10-02 grill)
        state = replaceSetup(state, { ...setup, tickets: result.tickets });
        persist(state);
        desk.render(getActive(state));
      },
    });
    if (choice === 'cancel') {
      await revealer.cancelReturn(origin);
      return;
    }
    skipHint.hidden = false;
    await revealer.tear(choice.from);
```

  - 金卡:`await revealer.holdBonus(result.lastOnePrize); const bonus = await revealer.waitForTear({ cancellable: false }); skipHint.hidden = false; await revealer.tear(bonus.from);`(`skipHint.hidden = false` 從 overlay 打開那行移到這裡)
- [ ] **Step 4: PASS**;全套過
- [ ] **Step 5: 瀏覽器驗證**:localhost 一番賞、假時鐘 harness,用 `dispatchEvent(new PointerEvent(...))` 在 `#tearCard` 上拉到 30% 停 → 往左 → 再拉過 70%;390×760 與 1280×720 各截圖 / 逐格錄;再用 WebKit 工具跑一次(`/private/tmp/claude-501/-Users-willian-github-gashapon/c034e941-ad05-4492-bf06-11ad6c4c03be/scratchpad/wk` 若還在)
- [ ] **Step 6: Commit** `feat(ichiban): draws commit when the finger passes 3% or 撕開 is pressed; the last-one card is torn by hand too`

### Task 5: 爬格子等級選擇器文字被切

**Files:** Modify `ghostleg/css/ghostleg.css`;Test `test/ghostleg-art.test.js`

- [ ] **Step 1: 失敗的測試**

```js
test('等級選擇器:選項裡的小圖縮成 34px,下面的字不會被切掉', () => {
  const css = readFileSync(new URL('../ghostleg/css/ghostleg.css', import.meta.url), 'utf8');
  assert.match(css, /\.picker-row__opt \.edit-row__thumb \{ width: 34px; height: 34px; \}/);
});
```

- [ ] **Step 2: FAIL** → **Step 3:** 在 `.picker-row__label` 後加那一行 → **Step 4: PASS** → **Step 5: Commit** `fix(ghostleg): tier picker labels no longer clipped`

### Task 6: 收尾

- [ ] 全套測試;`git push origin main`(使用者已要求「先發佈」的工作方式,這輪做完照樣推)
- [ ] 傳截圖 / 影片給使用者
