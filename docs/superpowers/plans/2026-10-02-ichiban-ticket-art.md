# 一番賞票卡美術 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 一番賞票卡兩面換成冰雪紙質美術(號碼、白章角色頭、冷色底、徽章),桌面改成一張 canvas 依張數自動縮放,點哪張就抽走哪張。

**Architecture:** 資料層 ticket 多一個固定 `no`,`drawTicket` 用「互換 prizeId」讓點到的那張就是被抽走的那張。`card-art.js` 的 `drawFace` 多 `orientation / w / h`,大卡(curl 貼圖)與桌上小卡(直放)共用同一支。桌面 = 一張墊在底下、只畫可見範圍的 canvas + 一層透明按鈕(點擊 / 焦點 / 無障礙 / 飛出起點)。紙紋與兩顆角色頭由 `tools/mascot-gen/ichiban.py` 用 ComfyUI 生成,使用者挑選後烘成 webp。

**Tech Stack:** 原生 ES modules(零建置、沒有 package.json)、Canvas 2D、three.js(只有 curl 撕開,不動)、`node --test`、Python(numpy / Pillow / cwebp)+ ComfyUI z_image。

**Spec:** `docs/superpowers/specs/2026-10-02-ichiban-ticket-art-design.md`

## 模型(spec 原文;實作與此矛盾 = plan bug,停下回報,不要就地改模型)

- **實體**:`ticket { no, prizeId, drawn }`(`no` 新增);`drawFace({ color, no, critter, orientation, w, h })` 大小卡共用;`critter ∈ { fox, ermine }`(最後一抽賞 `both`);`DESK_COLORS` 7 冷色。
- **對應**:setup 1:N ticket;ticket 1:1 `no`(重建時重編);color / critter / tilt 都由 `no` 推算,**不存**。
- **看到 vs 存的**:只存 `no` / `prizeId` / `drawn`;外觀全在繪製時推算。點 7 號撕開 → 隨機挑一張剩下的與 7 號互換 `prizeId` → 標 7 號 drawn;存的 `prizeId` 在撕開前沒有意義。舊 localStorage 沒 `no` → 讀取時依陣列順序補。
- **最可能的錯(以下都是錯誤版本)**:
  1. color / critter / tilt 依「剩下的第幾張」算 —— 錯,依固定 `no`,否則補位時變臉
  2. 桌上小卡另外用 CSS 畫一份 —— 錯,是同一支 `drawFace`,`orientation: 'portrait'`
  3. 獎項面印號碼 / 角色,或 A 賞徽章比較華麗 —— 錯,獎項面只有共用徽章版型 + 字母 + 賞別色 + 獎品名

## Global Constraints

- 零建置:不加 package.json、bundler、npm 依賴。測試 `node --test`(repo 根目錄),目前基準 427 pass。
- Python 工具測試:`tools/mascot-gen/.venv/bin/python -m unittest discover tools/mascot-gen`
- 程式註解、UI 文字用繁體中文;識別字、commit message 英文。
- 墨色 `INK = '#574239'`;卡片比例 34:15(`CARD_W = 1020`、`CARD_H = 450`)。
- 蓋著那面**不透明**、**不得用賞別色**(撕開前不能洩漏賞別)。
- 素材網址帶 `?v=<sha1 前 8 碼>`(`gashapon_art.stamp`);新圖進首頁 `gashapon/img/preload.json`(`write_preload_manifest`)+ 一番賞頁啟動時預熱(`loadCardArt()`)。
- 驗證寬度:手機 390、桌機 1440。候選與成品截圖用 SendUserFile 傳給使用者(使用者用手機看)。
- 已封閉的決策表(spec)不得重新討論;spec 沒寫到的才問。
- commit 結尾:
  ```
  Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01SemYkQLkTmSDDeYUKQcPZG
  ```

## Review Focus

1. **舊存檔**(localStorage 裡沒有 `no`、或 `no` 重複 / 非整數)打開頁面不能白畫面,號碼要依陣列順序補 —— Task 1 測試釘住。
2. **欄數是 7 的倍數**時同一欄上下同色,相鄰分不出來 —— Task 2 `layoutDesk` 避開並測試。
3. **捲動中**(150 張)canvas 上的卡要跟透明按鈕對齊,點到看到的那張 —— Task 4 用按鈕 `offsetLeft/Top` 當唯一位置來源,Task 7 實機截圖。
4. **素材還沒載入**(慢網路 / 404)時桌面與大卡照樣畫得出來,載好後重畫 —— Task 3 測試(無素材不丟錯)、Task 6 測試(載入後 drawImage 有被呼叫)。
5. **三位數號碼**(100+ 張)在 28px 小卡上不能溢出號碼圈 —— Task 3 `drawNumber` 依位數縮字並測試。

---

## File Structure

| 檔案 | 動作 | 職責 |
|---|---|---|
| `ichiban/js/ichiban.js` | 改 | `buildTickets` 給 `no`;`normalizeTicketNos`;`drawTicket(setup, rng, pickedNo)` 互換 |
| `ichiban/js/store.js` | 改 | `sanitizeSetup` 保留 / 補 `no` |
| `ichiban/js/desk-layout.js` | **新** | `DESK_COLORS`、`faceColorFor`、`critterFor`、`tiltFor`、`layoutDesk`(純函式) |
| `ichiban/js/card-art.js` | 改 | `drawFace`(orientation)、`traceTicket`、`drawPrize`(徽章)、`useCardArt`、`loadCardArt` |
| `ichiban/js/curl.js` | 改 | `setCard` 參數 |
| `ichiban/js/ui.js` | 改 | `createDeskView` 改 canvas + 透明按鈕;`hold` / `cancelReturn` / `playBonus` 參數與旋轉飛入 |
| `ichiban/js/main.js` | 改 | 接線:`no`、`origin`、桌面 canvas、`loadCardArt` |
| `ichiban/index.html` | 改 | `#desk` id、`#deskCanvas` |
| `ichiban/css/ichiban.css` | 改 | `.desk-canvas`、`.pile` 格狀、透明 `.ticket` |
| `tools/mascot-gen/ichiban.py` | **新** | 生成 / review / pick / build 紙紋與角色頭 |
| `tools/mascot-gen/ichiban_prompts.json` | **新** | prompts + picks |
| `tools/mascot-gen/ichiban_art.py` | **新** | `paper_from_gray`、`stamp_from_gray`(純函式) |
| `tools/mascot-gen/test_ichiban_art.py` | **新** | 上面兩支的測試 |
| `tools/mascot-gen/gashapon.py` | 改 | `write_preload_manifest` 加掃 `ichiban/js/card-art.js` |
| `tools/mascot-gen/review/ichiban.html` | **新**(工具,gitignore 狀態照 review/ 現況) | 候選圖畫在冷色卡上的比較頁 |
| `ichiban/img/{paper,fox,ermine}.webp` | **新** | 素材 |
| `gashapon/img/preload.json` | 重產 | |
| `test/ichiban.test.js`、`test/ichiban-desk.test.js`(新)、`test/ichiban-card-art.test.js`(新)、`test/ichiban-reveal.test.js`、`test/preload-manifest.test.js` | 改 / 新 | |

---

### Task 1: 票卡號碼與「點哪張抽哪張」

**Files:**
- Modify: `ichiban/js/ichiban.js:32-65`
- Modify: `ichiban/js/store.js:23-43`
- Test: `test/ichiban.test.js`

**Interfaces:**
- Produces: `buildTickets(prizes) → { no, prizeId, drawn }[]`(no = 1..N);`normalizeTicketNos(tickets) → tickets`;`drawTicket(setup, rng = Math.random, pickedNo?) → { ticket, prize, tickets, isLastOne, lastOnePrize } | null`

- [ ] **Step 1: 寫失敗測試**(加在 `test/ichiban.test.js` 尾端;import 行補上 `normalizeTicketNos`)

```js
test('buildTickets 依序給號碼 1..N', () => {
  const prizes = [
    createIchibanPrize({ name: '模型', tier: 'A', count: 1 }),
    createIchibanPrize({ name: '吊飾', tier: 'C', count: 3 }),
  ];
  assert.deepEqual(buildTickets(prizes).map(t => t.no), [1, 2, 3, 4]);
});

test('refillSetup 重建時重新編號', () => {
  const setup = createIchibanSetup({ prizes: [createIchibanPrize({ name: 'x', tier: 'A', count: 3 })] });
  const r = drawTicket(setup, seeded(9), 2);
  const refilled = refillSetup({ ...setup, tickets: r.tickets });
  assert.deepEqual(refilled.tickets.map(t => t.no), [1, 2, 3]);
  assert.ok(refilled.tickets.every(t => !t.drawn));
});

test('drawTicket 帶 pickedNo:被點的那張一定被抽走', () => {
  const setup = createIchibanSetup({
    prizes: [
      createIchibanPrize({ name: '大獎', tier: 'A', count: 1 }),
      createIchibanPrize({ name: '小獎', tier: 'G', count: 5 }),
    ],
  });
  for (let seed = 1; seed <= 30; seed++) {
    const r = drawTicket(setup, seeded(seed), 4);
    assert.equal(r.ticket.no, 4);
    assert.equal(r.tickets.find(t => t.no === 4).drawn, true);
    assert.equal(r.tickets.filter(t => t.drawn).length, 1);
    assert.equal(r.prize.id, r.ticket.prizeId);
  }
});

test('drawTicket 互換不會改變各獎項的張數', () => {
  const setup = createIchibanSetup({
    prizes: [
      createIchibanPrize({ name: '大獎', tier: 'A', count: 2 }),
      createIchibanPrize({ name: '小獎', tier: 'G', count: 5 }),
    ],
  });
  const tally = ts => ts.reduce((m, t) => ({ ...m, [t.prizeId]: (m[t.prizeId] ?? 0) + 1 }), {});
  const r = drawTicket(setup, seeded(5), 7);
  assert.deepEqual(tally(r.tickets), tally(setup.tickets));
  assert.deepEqual(r.tickets.map(t => t.no), setup.tickets.map(t => t.no), '號碼不能動');
});

test('drawTicket 帶 pickedNo:機率仍然只看 count', () => {
  const setup = createIchibanSetup({
    prizes: [
      createIchibanPrize({ name: '大獎', tier: 'A', count: 1 }),
      createIchibanPrize({ name: '小獎', tier: 'G', count: 3 }),
    ],
  });
  const rng = seeded(42);
  let a = 0;
  const N = 4000;
  for (let i = 0; i < N; i++) if (drawTicket(setup, rng, 1).prize.tier === 'A') a++;
  // 1 號在陣列裡本來就是大獎;如果點哪張就給哪張的獎,這裡會是 100%
  assert.ok(Math.abs(a / N - 0.25) < 0.03, `A 賞比例 ${a / N}`);
});

test('drawTicket:pickedNo 不在剩下的籤裡就退回隨機那張', () => {
  let setup = createIchibanSetup({ prizes: [createIchibanPrize({ name: 'x', tier: 'A', count: 3 })] });
  setup = { ...setup, tickets: drawTicket(setup, seeded(1), 2).tickets };
  const r = drawTicket(setup, seeded(2), 2);
  assert.notEqual(r.ticket.no, 2);
  assert.equal(r.tickets.filter(t => t.drawn).length, 2);
});

test('normalizeTicketNos:缺號碼、重複、非整數都整組依順序重編', () => {
  const t = (no) => ({ no, prizeId: 'p', drawn: false });
  assert.deepEqual(normalizeTicketNos([t(undefined), t(undefined)]).map(x => x.no), [1, 2]);
  assert.deepEqual(normalizeTicketNos([t(3), t(3)]).map(x => x.no), [1, 2]);
  assert.deepEqual(normalizeTicketNos([t(1.5), t(2)]).map(x => x.no), [1, 2]);
  assert.deepEqual(normalizeTicketNos([t(5), t(2)]).map(x => x.no), [5, 2], '合法就不動(抽走後號碼本來就不連續)');
});
```

在 `test/storage.test.js` 或 `test/ichiban.test.js` 加舊存檔測試(用 store 的 sanitize;找現有 ichiban store 測試的寫法 —— `grep -n "ichiban.v1" test/*.js`;若沒有現成,直接測 `store.load()` 搭配假的 localStorage,照 `test/shared-storage.test.js` 的替身寫法):

```js
test('舊存檔沒有 no:讀進來依陣列順序補號碼,不回種子資料', async () => {
  const saved = globalThis.localStorage;
  const data = {};
  globalThis.localStorage = {
    getItem: k => data[k] ?? null, setItem: (k, v) => { data[k] = String(v); }, removeItem: k => { delete data[k]; },
  };
  try {
    data['ichiban.v1'] = JSON.stringify({ schema: 1, data: {
      activeSetupId: 's1',
      setups: [{ id: 's1', name: '舊的', lastOnePrize: '', prizes: [{ id: 'p1', name: 'x', tier: 'A', count: 2 }],
        tickets: [{ prizeId: 'p1', drawn: true }, { prizeId: 'p1', drawn: false }] }],
    } });
    const { store } = await import('../ichiban/js/store.js');
    const s = store.load().setups[0];
    assert.equal(s.name, '舊的');
    assert.deepEqual(s.tickets.map(t => [t.no, t.drawn]), [[1, true], [2, false]]);
  } finally {
    globalThis.localStorage = saved;
  }
});
```

(存檔外層格式以 `shared/js/storage.js` 的 `createStore` 實際寫法為準:先 `sed -n 1,80p shared/js/storage.js` 看 save 寫進去的 JSON 形狀,照抄成上面的 `data['ichiban.v1']`。)

- [ ] **Step 2: 跑測試確認失敗**

Run: `node --test test/ichiban.test.js`
Expected: FAIL(`normalizeTicketNos` 不存在 / `no` 是 undefined)

- [ ] **Step 3: 實作**

`ichiban/js/ichiban.js`:

```js
// 每張籤一個固定號碼(2026-10-02):小孩可以喊「我要 7 號」。抽走後其他號碼不重編,
// 只有重建(補籤、改獎項)才從 1 重新編。顏色、角色、歪斜都由號碼推算,不存。
export function buildTickets(prizes) {
  return expand(prizes, prize => ({ prizeId: prize.id, drawn: false }))
    .map((t, i) => ({ no: i + 1, ...t }));
}

// 存檔讀回來的號碼不可信:缺、重複、不是正整數 → 整組依陣列順序重編。
// 合法的就不動 —— 抽走一些之後號碼本來就不連續。
export function normalizeTicketNos(tickets) {
  const seen = new Set();
  const valid = tickets.every(t => Number.isInteger(t.no) && t.no > 0 && !seen.has(t.no) && seen.add(t.no));
  return valid ? tickets : tickets.map((t, i) => ({ ...t, no: i + 1 }));
}
```

(`expand` 回傳的物件順序就是陣列順序;若 `expand` 回傳的不是新陣列而是會被重用的物件,改成在 factory 裡用計數器給 `no`。先 `sed -n 1,40p shared/js/roster.js` 確認。)

`drawTicket` 換成:

```js
// 抽一張。機率只由 count 決定 —— 每張籤機會均等,賞別從不參與計算。
// pickedNo(2026-10-02):使用者點的那張。隨機挑出的那張 j 跟它互換 prizeId,
// 再把點的那張標成 drawn —— 桌上消失的就是點的那張,而各獎的機率完全不變
// (prizeId 在撕開前沒有意義,互換不改變任何一張「被抽到什麼」的分布)。
export function drawTicket(setup, rng = Math.random, pickedNo) {
  const candidates = [];
  setup.tickets.forEach((ticket, index) => { if (!ticket.drawn) candidates.push(index); });
  if (candidates.length === 0) return null;

  const j = candidates[Math.floor(rng() * candidates.length)];
  const picked = setup.tickets.findIndex(t => !t.drawn && t.no === pickedNo);
  const index = picked === -1 ? j : picked;
  const prizeId = setup.tickets[j].prizeId;
  const tickets = setup.tickets.map((t, i) => {
    if (i === index) return { ...t, prizeId, drawn: true };
    if (i === j) return { ...t, prizeId: setup.tickets[index].prizeId };
    return t;
  });
  const ticket = tickets[index];
  const prize = setup.prizes.find(p => p.id === prizeId);

  const bonus = (setup.lastOnePrize ?? '').trim();
  const wasLast = candidates.length === 1 && bonus !== '';

  return { ticket, prize, tickets, isLastOne: wasLast, lastOnePrize: wasLast ? bonus : null };
}
```

`ichiban/js/store.js`:import 補 `normalizeTicketNos`;`tickets:` 那行改成

```js
    tickets: ok
      ? normalizeTicketNos(raw.tickets.map(t => ({ no: t.no, prizeId: t.prizeId, drawn: t.drawn === true })))
      : buildTickets(prizes),
```

- [ ] **Step 4: 跑測試**

Run: `node --test`
Expected: 全部 PASS(含舊的 `buildTickets 依數量展開`、`抽走最後一張才觸發最後一抽賞`)

- [ ] **Step 5: Commit**

```bash
git add ichiban/js/ichiban.js ichiban/js/store.js test/ichiban.test.js
git commit -m "feat(ichiban): fixed ticket numbers; the picked ticket is the one drawn (prize swapped in)"
```

---

### Task 2: 桌面推算函式與版面計算(desk-layout.js)

**Files:**
- Create: `ichiban/js/desk-layout.js`
- Create: `test/ichiban-desk.test.js`

**Interfaces:**
- Produces:
  - `DESK_COLORS: readonly string[7]`
  - `faceColorFor(no: number) → string`
  - `critterFor(no: number) → 'fox' | 'ermine'`
  - `tiltFor(no: number) → number`(度,-4 ~ 4)
  - `MIN_CARD_W = 28`、`MAX_CARD_W = 56`、`CARD_ASPECT = 34 / 15`
  - `layoutDesk({ count, width, height }) → { cardW, cardH, gap, cols, rows }`

- [ ] **Step 1: 寫失敗測試** `test/ichiban-desk.test.js`

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DESK_COLORS, faceColorFor, critterFor, tiltFor, layoutDesk, MIN_CARD_W, MAX_CARD_W, CARD_ASPECT,
} from '../ichiban/js/desk-layout.js';

test('7 個冷色,互不相同', () => {
  assert.equal(DESK_COLORS.length, 7);
  assert.equal(new Set(DESK_COLORS).size, 7);
});

test('顏色 / 角色 / 歪斜只看號碼:同一個號碼永遠一樣', () => {
  for (const no of [1, 7, 8, 99, 150]) {
    assert.equal(faceColorFor(no), faceColorFor(no));
    assert.equal(critterFor(no), critterFor(no));
    assert.equal(tiltFor(no), tiltFor(no));
  }
  assert.equal(faceColorFor(1), DESK_COLORS[0]);
  assert.equal(faceColorFor(8), DESK_COLORS[0]);
  assert.equal(faceColorFor(7), DESK_COLORS[6]);
});

test('角色兩隻都會出現,歪斜在 ±4 度內', () => {
  const kinds = new Set();
  for (let no = 1; no <= 20; no++) {
    kinds.add(critterFor(no));
    assert.ok(Math.abs(tiltFor(no)) <= 4);
  }
  assert.deepEqual([...kinds].sort(), ['ermine', 'fox']);
});

test('layoutDesk:張數少就用最大卡', () => {
  const l = layoutDesk({ count: 5, width: 358, height: 500 });
  assert.equal(l.cardW, MAX_CARD_W);
  assert.equal(l.cardH, Math.round(MAX_CARD_W * CARD_ASPECT));
});

test('layoutDesk:縮到剛好放得下', () => {
  const l = layoutDesk({ count: 40, width: 358, height: 500 });
  assert.ok(l.cardW < MAX_CARD_W && l.cardW >= MIN_CARD_W);
  assert.ok(l.rows * l.cardH + (l.rows - 1) * l.gap <= 500);
  assert.ok(l.cols * l.rows >= 40);
  // 桌面變矮,卡只會變小或一樣,不會變大
  assert.ok(layoutDesk({ count: 40, width: 358, height: 380 }).cardW <= l.cardW);
});

test('layoutDesk:太多張就停在最小卡寬,改捲動', () => {
  const l = layoutDesk({ count: 400, width: 358, height: 500 });
  assert.equal(l.cardW, MIN_CARD_W);
  assert.ok(l.rows * l.cardH > 500);
});

test('layoutDesk:欄數不會是 7 的倍數(否則同一欄上下同色)', () => {
  for (let width = 200; width <= 1400; width += 7) {
    for (const count of [30, 90, 300]) {
      const l = layoutDesk({ count, width, height: 600 });
      if (count > l.cols) assert.notEqual(l.cols % 7, 0, `width ${width} count ${count} cols ${l.cols}`);
    }
  }
});

test('layoutDesk:0 張、極窄都不會爆', () => {
  assert.equal(layoutDesk({ count: 0, width: 358, height: 500 }).rows, 0);
  assert.ok(layoutDesk({ count: 10, width: 10, height: 500 }).cols >= 1);
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `node --test test/ichiban-desk.test.js`
Expected: FAIL(找不到模組)

- [ ] **Step 3: 實作** `ichiban/js/desk-layout.js`

```js
// 桌上籤紙的外觀推算與版面計算。全部是純函式。
//
// 外觀(顏色 / 角色 / 歪斜)只看籤的固定號碼 no,不看「剩下的第幾張」——
// 抽走一張,後面的往前補位,但每張的長相不變(2026-10-02 grill 定案)。

// 冷色 7 色(使用者選 C,2026-10-02;第 1/4/5 與 3/6 原本太接近,在冷色範圍內拉開)。
// 顏色的用途是讓相鄰兩張一眼分得出不同張。故意跟 TIER_META 無關 —— 撕開前不能洩漏賞別。
export const DESK_COLORS = Object.freeze([
  '#A9D2F5', // 天空藍
  '#C8B6EE', // 薰衣草
  '#9FE0DA', // 水綠
  '#EEF3FA', // 冰白
  '#B3BCF0', // 長春花藍
  '#C2EBCF', // 薄荷
  '#E8C9EE', // 霜紫粉
]);

export const MIN_CARD_W = 28;
export const MAX_CARD_W = 56;
export const CARD_ASPECT = 34 / 15; // 直放:高 / 寬

// 同一個號碼永遠得到同一個值(sine hash),不用 Math.random()。
function pseudoRandom(seed) {
  const h = Math.sin(seed * 12.9898 + 4.1414) * 43758.5453;
  return h - Math.floor(h);
}

export function faceColorFor(no) {
  return DESK_COLORS[(no - 1) % DESK_COLORS.length];
}

export function critterFor(no) {
  return pseudoRandom(no * 7 + 5) < 0.5 ? 'fox' : 'ermine';
}

// 小幅歪斜:自動縮放後卡片排得很密,歪太多會互疊。
export function tiltFor(no) {
  return Math.round((pseudoRandom(no * 3 + 1) * 8 - 4) * 10) / 10;
}

// 依張數在桌面可見範圍內找「一次放得下全部」的最大卡寬;放不下就停在 MIN_CARD_W 改捲動。
export function layoutDesk({ count, width, height }) {
  const fit = cardW => {
    const cardH = Math.round(cardW * CARD_ASPECT);
    const gap = Math.max(6, Math.round(cardW * 0.22));
    let cols = Math.max(1, Math.floor((width + gap) / (cardW + gap)));
    // 顏色 7 個一輪:欄數是 7 的倍數時同一欄上下同色,相鄰就分不出來了
    if (count > cols && cols > 1 && cols % DESK_COLORS.length === 0) cols -= 1;
    const rows = Math.ceil(count / cols);
    return { cardW, cardH, gap, cols, rows };
  };
  for (let w = MAX_CARD_W; w > MIN_CARD_W; w--) {
    const l = fit(w);
    if (l.rows * l.cardH + Math.max(0, l.rows - 1) * l.gap <= height) return l;
  }
  return fit(MIN_CARD_W);
}
```

- [ ] **Step 4: 跑測試**

Run: `node --test test/ichiban-desk.test.js && node --test`
Expected: 全部 PASS

- [ ] **Step 5: Commit**

```bash
git add ichiban/js/desk-layout.js test/ichiban-desk.test.js
git commit -m "feat(ichiban): desk layout + per-number colour/critter/tilt (cold palette)"
```

---

### Task 3: 票卡繪圖(card-art.js)+ 大卡接線(curl.js / ui.js revealer)

**Files:**
- Modify: `ichiban/js/card-art.js`(整支換掉 `drawFace` / `drawPrize`,保留 `shapePoints` / `PTS` / `traceShape` / `traceRoundRect` / `makeCardCanvas` / `CARD_W` / `CARD_H`)
- Modify: `ichiban/js/curl.js:105-112`(`setCard`)
- Modify: `ichiban/js/ui.js`(`drawStatic`、`hold`、`playBonus`、`playHold`、`cancelReturn`)
- Create: `test/ichiban-card-art.test.js`
- Modify: `test/ichiban-reveal.test.js`

**Interfaces:**
- Consumes: `faceColorFor`、`critterFor`(Task 2)
- Produces:
  - `drawFace(ctx, { color, no, critter, orientation = 'landscape', w = CARD_W, h = CARD_H })` —— **不清畫布**,畫在 (0,0,w,h)
  - `traceTicket(ctx, { orientation, w, h })` —— 只建路徑(桌面畫影子用)
  - `drawPrize(ctx, { color, letter, name, bonus })` —— 會先 `clearRect` 整張(只給 CARD_W×CARD_H 畫布用)
  - `useCardArt({ paper?, fox?, ermine? })`、`loadCardArt(load?) → Promise`
  - revealer:`hold({ tier, name, no }, origin)`、`cancelReturn(origin)`,`origin = { rect, tilt } | null`
  - curl:`setCard({ faceColor, no, critter, color, letter, name, bonus })`

- [ ] **Step 1: 寫失敗測試** `test/ichiban-card-art.test.js`

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { drawFace, drawPrize, traceTicket, useCardArt, CARD_W, CARD_H } from '../ichiban/js/card-art.js';

// 記下每一次呼叫,沒定義的方法一律當成可呼叫的 noop。
function recCtx() {
  const calls = [];
  const target = { calls, measureText: s => ({ width: String(s).length * 30 }) };
  return new Proxy(target, {
    get: (t, k) => (k in t ? t[k] : (...a) => { calls.push([k, ...a]); }),
    set: (t, k, v) => { calls.push(['set:' + String(k), v]); return true; },
  });
}
const texts = ctx => ctx.calls.filter(c => c[0] === 'fillText').map(c => c[1]);

test('drawFace 橫 / 直都畫出號碼', () => {
  for (const orientation of ['landscape', 'portrait']) {
    const ctx = recCtx();
    drawFace(ctx, { color: '#A9D2F5', no: 7, critter: 'fox', orientation, w: orientation === 'portrait' ? 30 : CARD_W, h: orientation === 'portrait' ? 68 : CARD_H });
    assert.ok(texts(ctx).includes('7'), orientation);
  }
});

test('drawFace 不清畫布(桌面一張 canvas 上畫很多張)', () => {
  const ctx = recCtx();
  drawFace(ctx, { color: '#A9D2F5', no: 1, critter: 'fox' });
  assert.equal(ctx.calls.filter(c => c[0] === 'clearRect').length, 0);
});

test('drawFace 的底色是傳進來的裝飾色(不是賞別色)', () => {
  const ctx = recCtx();
  drawFace(ctx, { color: '#ABCDEF', no: 1, critter: 'fox' });
  assert.ok(ctx.calls.some(c => c[0] === 'set:fillStyle' && c[1] === '#ABCDEF'));
});

test('三位數號碼縮字', () => {
  const sizes = no => {
    const ctx = recCtx();
    drawFace(ctx, { color: '#fff', no, critter: 'fox', orientation: 'portrait', w: 28, h: 63 });
    const f = ctx.calls.filter(c => c[0] === 'set:font').map(c => parseFloat(c[1].match(/(\d+(\.\d+)?)px/)[1]));
    return Math.max(...f);
  };
  assert.ok(sizes(123) < sizes(12));
});

test('最後一抽賞:號碼位置畫 🌟', () => {
  const ctx = recCtx();
  drawFace(ctx, { color: '#FFD24C', no: '★', critter: 'both' });
  assert.ok(texts(ctx).includes('🌟'));
});

test('素材沒載入時照樣畫得完,不呼叫 drawImage', () => {
  useCardArt({ paper: null, fox: null, ermine: null });
  const ctx = recCtx();
  drawFace(ctx, { color: '#fff', no: 3, critter: 'ermine' });
  drawPrize(ctx, { color: '#FF6F91', letter: 'A', name: '大獎' });
  assert.equal(ctx.calls.filter(c => c[0] === 'drawImage').length, 0);
});

test('素材載入後:背面畫紙紋 + 角色頭,獎項面只畫紙紋', () => {
  const paper = { id: 'paper' }, fox = { id: 'fox' }, ermine = { id: 'ermine' };
  useCardArt({ paper, fox, ermine });
  const face = recCtx();
  drawFace(face, { color: '#fff', no: 3, critter: 'ermine' });
  const imgs = face.calls.filter(c => c[0] === 'drawImage').map(c => c[1]);
  assert.ok(imgs.includes(paper) && imgs.includes(ermine) && !imgs.includes(fox));

  const prize = recCtx();
  drawPrize(prize, { color: '#FF6F91', letter: 'A', name: '大獎' });
  const pimgs = prize.calls.filter(c => c[0] === 'drawImage').map(c => c[1]);
  assert.deepEqual(pimgs, [paper], '獎項面不印角色');
  useCardArt({ paper: null, fox: null, ermine: null });
});

test('獎項面:字母 + 獎品名,沒有號碼', () => {
  const ctx = recCtx();
  drawPrize(ctx, { color: '#FF6F91', letter: 'A', name: '大獎' });
  assert.deepEqual(texts(ctx), ['A', '大獎']);
});

test('獎項名太長會縮字', () => {
  const font = name => {
    const ctx = recCtx();
    drawPrize(ctx, { color: '#FF6F91', letter: 'A', name });
    return ctx.calls.filter(c => c[0] === 'set:font').map(c => c[1]).at(-1);
  };
  assert.notEqual(font('短'), font('這是一個非常非常非常長的獎品名字二十字'));
});

test('traceTicket 只建路徑,不填色', () => {
  const ctx = recCtx();
  traceTicket(ctx, { orientation: 'portrait', w: 30, h: 68 });
  assert.equal(ctx.calls.filter(c => c[0] === 'fill' || c[0] === 'stroke').length, 0);
  assert.ok(ctx.calls.some(c => c[0] === 'lineTo'));
});
```

`test/ichiban-reveal.test.js` 改呼叫方式(其餘不動):

```js
    await revealer.hold({ tier: 'A', name: '大獎', no: 7 }, { rect: { left: 10, top: 20, width: 60, height: 84 }, tilt: 2 });
```
```js
    await revealer.hold({ tier: 'G', name: '銘謝惠顧', no: 1 }, null);
```
```js
    const origin = { rect: { left: 5, top: 5, width: 60, height: 84 }, tilt: -3 };
    await revealer.hold({ tier: 'C', name: '三獎', no: 3 }, origin);
    await revealer.cancelReturn(origin);
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `node --test test/ichiban-card-art.test.js`
Expected: FAIL(`traceTicket` / `useCardArt` 不存在)

- [ ] **Step 3: 實作 card-art.js**

把檔案開頭註解後、`export const CARD_W` 之前不動;`traceRoundRect` 之後的 `INK`、`drawFace`、`drawPrize` 全部換成:

```js
const INK = '#574239';
const FACE = 'system-ui, -apple-system, "PingFang TC", "Noto Sans TC", sans-serif';

/* ---------- 素材(紙紋、角色頭) ---------- */
// 由 tools/mascot-gen/ichiban.py build 產生;網址的 ?v= 由工具蓋章。
// 載不到也照畫 —— 少了紙紋跟頭而已,不能讓小孩抽不到籤。
const ART_URLS = {};   // Task 6 填入 paper / fox / ermine
const art = { paper: null, fox: null, ermine: null };

export function useCardArt(images) {
  Object.assign(art, images);
}

function loadImage(url) {
  if (typeof Image === 'undefined') return Promise.reject(new Error('no Image'));
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}

let loading = null;
// 一番賞頁一開始就呼叫(預熱);桌面與大卡在它 resolve 後重畫一次。
export function loadCardArt(load = loadImage) {
  loading ??= Promise.all(Object.entries(ART_URLS).map(([key, url]) =>
    load(url).then(img => { art[key] = img; }, err => {
      if (typeof Image !== 'undefined') console.warn('[ichiban] 票卡素材載不到', key, err);
    })));
  return loading;
}

/* ---------- 共用座標 ---------- */
// 票卡的一切都畫在「橫式票卡座標」(CARD_W×CARD_H)裡,再對應進呼叫者給的 w×h 框。
// portrait = 順時針轉 90°:左緣的半圓耳轉到上面。w:h 必須是 15:34(直)或 34:15(橫),
// 兩軸縮放才會一致 —— desk-layout 的 CARD_ASPECT 保證這件事。
function enterCardSpace(ctx, orientation, w, h) {
  if (orientation === 'portrait') {
    ctx.translate(w, 0);
    ctx.rotate(Math.PI / 2);
    ctx.scale(h / CARD_W, w / CARD_H);
  } else {
    ctx.scale(w / CARD_W, h / CARD_H);
  }
}

// 只建路徑(路徑在建立時就套用了當下的變換,restore 之後還在)。桌面拿它畫影子。
export function traceTicket(ctx, { orientation = 'landscape', w = CARD_W, h = CARD_H } = {}) {
  ctx.save();
  enterCardSpace(ctx, orientation, w, h);
  traceShape(ctx);
  ctx.restore();
}

function paperOver(ctx) {
  if (!art.paper) return;
  ctx.globalCompositeOperation = 'multiply';
  ctx.drawImage(art.paper, 0, 0, CARD_W, CARD_H);
  ctx.globalCompositeOperation = 'source-over';
}

function snowflake(ctx, x, y, r) {
  ctx.beginPath();
  for (let i = 0; i < 3; i++) {
    const a = (i * Math.PI) / 3;
    ctx.moveTo(x - r * Math.cos(a), y - r * Math.sin(a));
    ctx.lineTo(x + r * Math.cos(a), y + r * Math.sin(a));
  }
  ctx.stroke();
}

// 印在紙上的白色雪花 + 一圈虛線框。紙不是冰:不做透明、亮面(2026-10-02 定案)。
function snowPrint(ctx) {
  ctx.strokeStyle = 'rgba(255,255,255,.55)';
  ctx.lineWidth = 5;
  ctx.lineCap = 'round';
  for (let y = 40, row = 0; y < CARD_H; y += 70, row++) {
    for (let x = 30 + (row % 2) * 45; x < CARD_W; x += 90) snowflake(ctx, x, y, 14);
  }
  ctx.setLineDash([22, 16]);
  ctx.lineWidth = 7;
  ctx.strokeStyle = 'rgba(255,255,255,.9)';
  traceRoundRect(ctx, CARD_W * 0.14, CARD_H * 0.2, CARD_W * 0.76, CARD_H * 0.6, 30);
  ctx.stroke();
  ctx.setLineDash([]);
}

function drawNumber(ctx, no, x, y, r) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = '#fff';
  ctx.fill();
  ctx.lineWidth = Math.max(1, r * 0.14);
  ctx.strokeStyle = INK;
  ctx.stroke();
  const text = no === '★' ? '🌟' : String(no);
  const size = r * (text.length >= 3 ? 0.78 : 1.1);
  ctx.fillStyle = INK;
  ctx.font = `900 ${size.toFixed(1)}px ${FACE}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x, y + size * 0.05);
  ctx.restore();
}

// 白色印章頭(素材本身就是白色 + 透明,工具烘好的)。both = 最後一抽賞兩隻並排。
function drawHead(ctx, critter, x, y, size) {
  if (critter === 'both') {
    if (!art.fox || !art.ermine) return;
    const s = size * 0.75;
    ctx.drawImage(art.fox, x - s * 1.05, y - s / 2, s, s);
    ctx.drawImage(art.ermine, x + s * 0.05, y - s / 2, s, s);
    return;
  }
  const img = art[critter];
  if (img) ctx.drawImage(img, x - size / 2, y - size / 2, size, size);
}

/* ---------- 蓋著的那一面 ---------- */
// 桌上小卡(portrait)跟大卡(landscape)共用這一支 —— 兩邊長一樣,只差比例。
// 不清畫布:桌面是一張 canvas 畫很多張。整面不透明,底下的獎項不能透出來。
// 號碼跟頭不跟著轉,永遠正立:直卡上下排、橫卡左右排。
export function drawFace(ctx, { color, no, critter, orientation = 'landscape', w = CARD_W, h = CARD_H }) {
  ctx.save();
  enterCardSpace(ctx, orientation, w, h);
  traceShape(ctx);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.save();
  ctx.clip();
  paperOver(ctx);
  snowPrint(ctx);
  ctx.restore();
  traceShape(ctx);
  ctx.lineJoin = 'round';
  ctx.lineWidth = 16;
  ctx.strokeStyle = INK;
  ctx.stroke();
  ctx.restore();

  const portrait = orientation === 'portrait';
  const s = Math.min(w, h);
  const [nx, ny] = portrait ? [w * 0.5, h * 0.34] : [w * 0.36, h * 0.5];
  const [hx, hy] = portrait ? [w * 0.5, h * 0.66] : [w * 0.66, h * 0.5];
  drawNumber(ctx, no, nx, ny, s * 0.27);
  drawHead(ctx, critter, hx, hy, s * 0.5);
}

/* ---------- 獎項那一面 ---------- */
// 7 賞同一個徽章版型(真一番賞都長一樣;等級感交給撕開演出的 level)。
// 外框染賞別色(功能色,程式上色),中間白底大字母。
function drawBadge(ctx, x, y, r, color, letter) {
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.beginPath();
  for (let i = 0; i < 24; i++) {
    const a = (Math.PI * i) / 12;
    const rr = i % 2 ? r : r * 1.18;
    ctx.lineTo(x + rr * Math.cos(a), y + rr * Math.sin(a));
  }
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
  ctx.lineWidth = 8;
  ctx.strokeStyle = INK;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(x, y, r * 0.78, 0, Math.PI * 2);
  ctx.fillStyle = '#fff';
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(x, y, r * 0.66, 0, Math.PI * 2);
  ctx.setLineDash([10, 8]);
  ctx.lineWidth = 5;
  ctx.strokeStyle = color;
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = INK;
  ctx.font = `900 ${Math.round(r)}px ${FACE}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(letter, x, y + r * 0.05);
  ctx.restore();
}

// 齒孔 → 賞別色帶 → 一條淺色細線 → 深色卡身 → 灰底帶 → 齒孔。
// 色帶不能壓在齒孔的範圍上,不然看起來像黏了一條鋸齒膠帶。
export function drawPrize(ctx, { color, letter, name, bonus = false }) {
  ctx.clearRect(0, 0, CARD_W, CARD_H);
  ctx.save();
  traceShape(ctx);
  ctx.clip();

  const body = bonus ? '#4A3A1E' : '#2E2A28';
  const bands = [
    [0, .13, '#5A4A42'], [.13, .25, color], [.25, .28, '#FFFFFF'],
    [.28, .80, body], [.80, .87, '#6B625C'], [.87, 1, '#5A4A42'],
  ];
  for (const [a, b, fill] of bands) {
    ctx.fillStyle = fill;
    ctx.fillRect(0, a * CARD_H, CARD_W, (b - a) * CARD_H);
  }
  paperOver(ctx);

  const bx = CARD_W * 0.25;
  const by = CARD_H * 0.54;      // 深色卡身(28%~80%)的中央
  const br = CARD_H * 0.21;
  drawBadge(ctx, bx, by, br, color, letter);

  const x0 = bx + br * 1.18 + 36;
  const maxW = CARD_W * 0.9 - x0;
  let size = 64;
  ctx.font = `800 ${size}px ${FACE}`;
  while (size > 30 && ctx.measureText(name).width > maxW) {
    size -= 4;
    ctx.font = `800 ${size}px ${FACE}`;
  }
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(name, x0, by + 4);
  ctx.restore();
}
```

- [ ] **Step 4: curl.js `setCard`**

```js
    // faceColor 是蓋著那一面的裝飾色(由號碼推算),跟 color(賞別色)是兩回事 ——
    // 蓋著的那面用賞別色的話,撕開之前就知道中了什麼。
    setCard({ faceColor, no, critter, color, letter, name, bonus }) {
      faceCtx.clearRect(0, 0, CARD_W, CARD_H);
      drawFace(faceCtx, { color: faceColor, no, critter });
      drawPrize(prizeCtx, { color, letter, name, bonus });
      faceTex.needsUpdate = true;
      prizeTex.needsUpdate = true;
      backMat.color.set(darken(faceColor));
    },
```

- [ ] **Step 5: ui.js revealer**

import 加:

```js
import { faceColorFor, critterFor } from './desk-layout.js';
import { loadCardArt } from './card-art.js';
```

(ui.js 原本對 card-art 是動態 import —— 是為了沒有 three 時的退路,card-art 本身不依賴 three,所以靜態 import 沒問題;`drawStatic` 裡的動態 import 保留不動也可以。)

`loadStage()` 開頭先等素材(最多 1.5 秒,不讓慢網路卡住拿起動畫):

```js
  function loadStage() {
    const art = Promise.race([loadCardArt(), new Promise(r => setTimeout(r, 1500))]);
    if (!stageReady) {
      stageReady = import('./curl.js')
        .then(m => { stage = m.createCurlStage(els.canvas); })
        .catch(err => {
          console.warn('[ichiban] 捲曲演出載不起來,改用靜態獎項卡', err);
          stage = null;
        });
    }
    return Promise.all([stageReady, art]);
  }
```

`originOffset(originRect)` 不變。`playHold` 的飛入關鍵影格改成從桌上那張的角度與大小出發(桌上是直的,轉 90° + 該張歪斜):

```js
  // 桌上那張是直放的(轉 90°)而且歪了 tilt 度;飛到中央時轉回橫的、放到全尺寸。
  function liftFrom(origin) {
    if (!origin) return { x: 0, y: 0, scale: 0.4, rot: -8 };
    const { x, y } = originOffset(origin.rect);
    const full = els.tearCard.offsetWidth || 340;
    const scale = Math.max(origin.rect.width, origin.rect.height) / full;
    return { x, y, scale, rot: 90 + (origin.tilt ?? 0) };
  }
```

`playHold({ level, color, glow, card }, origin)`:把 `const offset = originOffset(originRect);` 與 tearCard 的 animate 換成

```js
      const from = liftFrom(origin);
      ...
        animate(els.tearCard, [
          { transform: `translate(${from.x}px, ${from.y}px) scale(${from.scale}) rotate(${from.rot}deg)`, opacity: .6 },
          { transform: 'translate(0,0) scale(1) rotate(0deg)', opacity: 1 },
        ], 420 + level * 30, { easing: 'cubic-bezier(.34,1.2,.64,1)' }),
```

`cancelReturn(origin)`:

```js
      const to = liftFrom(origin);
      await animate(els.tearCard, [
        { transform: 'translate(0,0) scale(1) rotate(0deg)', opacity: 1 },
        { transform: `translate(${to.x}px, ${to.y}px) scale(${to.scale}) rotate(${origin ? to.rot : 8}deg)`, opacity: 0 },
      ], 320, { easing: 'cubic-bezier(.4,0,.2,1)' });
```

`hold`:

```js
    hold({ tier, name, no }, origin) {
      const rank = TIERS.indexOf(tier);
      const level = TIERS.length - 1 - (rank === -1 ? TIERS.length - 1 : rank);
      const meta = TIER_META[tier] ?? TIER_META.G;
      const letter = TIER_META[tier] ? tier : 'G';
      // 獎項在這時候就畫進貼圖了,但它在蓋著的那一面底下,撕開之前看不到。
      els.cardBadge.textContent = meta.label;
      els.cardName.textContent = name;
      return playHold({
        level, color: meta.color, glow: meta.glow,
        card: {
          faceColor: faceColorFor(no ?? 1), no: no ?? 1, critter: critterFor(no ?? 1),
          color: meta.color, letter, name, bonus: false,
        },
      }, origin);
    },
```

`playBonus` 的 card:

```js
        card: { faceColor: GOLD.color, no: '★', critter: 'both', color: GOLD.color, letter: '🌟', name, bonus: true },
```

刪掉 ui.js 裡的 `DESK_COLORS` 常數(搬到 desk-layout.js 了;`createDeskView` 在 Task 4 重寫,這一步先讓它改用 `faceColorFor(i + 1)` 暫時編譯得過 —— Task 4 會整段換掉)。

- [ ] **Step 6: 跑測試**

Run: `node --test`
Expected: 全部 PASS(含 `ichiban-reveal` 四個煙霧測試)

- [ ] **Step 7: Commit**

```bash
git add ichiban/js/card-art.js ichiban/js/curl.js ichiban/js/ui.js test/ichiban-card-art.test.js test/ichiban-reveal.test.js
git commit -m "feat(ichiban): paper ticket art — numbered snow-print face (portrait/landscape), shared tier badge"
```

---

### Task 4: 桌面改成一張 canvas + 透明按鈕

**Files:**
- Modify: `ichiban/index.html`(stage 區塊)
- Modify: `ichiban/css/ichiban.css:31-85`、`:345-347`
- Modify: `ichiban/js/ui.js`(`createDeskView` 整段、刪掉 `jitter` / `pseudoRandom`)
- Modify: `ichiban/js/main.js`(`createDeskView` 呼叫、`doDraw`)
- Test: `test/ichiban-desk.test.js`(加桌面煙霧測試)

**Interfaces:**
- Consumes: `layoutDesk`、`tiltFor`、`faceColorFor`、`critterFor`(Task 2);`drawFace`、`traceTicket`、`loadCardArt`(Task 3);`drawTicket(setup, rng, pickedNo)`(Task 1);revealer `hold({tier,name,no}, origin)` / `cancelReturn(origin)`(Task 3)
- Produces: `createDeskView({ deskEl, pileEl, canvasEl, emptyStateEl, onPick }) → { render(setup), redraw() }`;按鈕 `dataset.no`、`aria-label="抽 N 號籤"`

- [ ] **Step 1: 寫失敗測試**(加進 `test/ichiban-desk.test.js`)

```js
function el(extra = {}) {
  const e = {
    style: { _v: {}, setProperty(k, v) { this._v[k] = v; }, transform: '' },
    dataset: {}, attrs: {}, children: [], hidden: false,
    setAttribute(k, v) { e.attrs[k] = v; },
    replaceChildren(...k) { e.children = k; },
    addEventListener() {},
    getContext() { return new Proxy({}, { get: () => () => {}, set: () => true }); },
    offsetLeft: 0, offsetTop: 0, clientWidth: 390, clientHeight: 540, scrollTop: 0,
    ...extra,
  };
  return e;
}

test('桌面:只為還沒抽的籤建按鈕,號碼與歪斜跟著號碼走', async () => {
  const saved = { ...globalThis };
  globalThis.document = { createElement: () => el() };
  globalThis.window = { devicePixelRatio: 2 };
  globalThis.getComputedStyle = () => ({ paddingLeft: '16px', paddingRight: '16px', paddingTop: '14px', paddingBottom: '28px' });
  globalThis.requestAnimationFrame = fn => { fn(); return 1; };
  globalThis.ResizeObserver = class { observe() {} };
  try {
    const { createDeskView } = await import('../ichiban/js/ui.js');
    const pileEl = el();
    const desk = createDeskView({ deskEl: el(), pileEl, canvasEl: el(), emptyStateEl: el(), onPick() {} });
    desk.render({ tickets: [1, 2, 3, 4, 5].map(no => ({ no, prizeId: 'p', drawn: no === 2 })) });
    assert.deepEqual(pileEl.children.map(b => b.dataset.no), ['1', '3', '4', '5']);
    assert.equal(pileEl.children[1].attrs['aria-label'], '抽 3 號籤');
    assert.equal(pileEl.children[1].style.transform, `rotate(${tiltFor(3)}deg)`);
  } finally {
    for (const k of ['document', 'window', 'getComputedStyle', 'requestAnimationFrame', 'ResizeObserver']) globalThis[k] = saved[k];
  }
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `node --test test/ichiban-desk.test.js`
Expected: FAIL(`deskEl` 參數 / `dataset.no` 不存在)

- [ ] **Step 3: HTML**

`ichiban/index.html` 的 `<main class="stage">` 開頭改成:

```html
<main class="stage" id="stage">
  <!-- 桌上的籤全部畫在這一張 canvas 上(只畫看得到的那幾排),大小 = 桌面可見範圍。
       點擊、焦點、螢幕閱讀器交給疊在上面的透明按鈕(#pile)。 -->
  <canvas class="desk-canvas" id="deskCanvas" aria-hidden="true"></canvas>
  <div class="desk" id="desk">
    <div class="pile" id="pile"></div>
```

- [ ] **Step 4: CSS**

`ichiban/css/ichiban.css`:`.desk` 加 `position: relative; z-index: 1;`(讓按鈕的 `offsetParent` 是 `.desk`,而且疊在 canvas 上)。`.pile`、`.ticket`、`.ticket:active`、`.ticket { background… }`、`.ticket__mark` 全部換成:

```css
/* 桌上的籤畫在 .desk-canvas 上(js/ui.js createDeskView);這裡的按鈕是透明的,
   只負責點擊、焦點跟飛出去的起點。大小與欄數由 layoutDesk 算好塞進 CSS 變數。 */
.desk-canvas {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
}
.pile {
  display: grid;
  grid-template-columns: repeat(var(--cols, 5), var(--card-w, 56px));
  grid-auto-rows: var(--card-h, 127px);
  gap: var(--gap, 12px);
  justify-content: center;
  align-content: start;
}
.ticket {
  width: 100%;
  height: 100%;
  padding: 0;
  border: 0;
  border-radius: 12% / 5%;
  background: transparent;
  cursor: pointer;
}
.ticket:focus-visible { outline: 3px solid var(--ink); outline-offset: 3px; }
```

刪掉檔尾 `@media (max-width: 380px) { .ticket { … } }`。

- [ ] **Step 5: ui.js `createDeskView`**

刪掉 `pseudoRandom`、`jitter`;import 補 `layoutDesk, tiltFor`(desk-layout)與 `drawFace, traceTicket`(card-art)。整段換成:

```js
/* ---------- 桌面:一張 canvas + 透明按鈕 ---------- */
// 按鈕負責排版(CSS grid)、點擊、焦點、飛出起點;canvas 只照著按鈕的位置畫,
// 而且只畫捲動後看得到的那幾排 —— canvas 永遠只有一個桌面大,張數再多也不會撐爆
// Safari 的 canvas 像素上限。
export function createDeskView({ deskEl, pileEl, canvasEl, emptyStateEl, onPick }) {
  let setup = null;
  let layout = null;
  let slots = [];      // { no, el, x, y }
  let frame = 0;

  function inner() {
    const cs = getComputedStyle(deskEl);
    return {
      width: deskEl.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight),
      height: deskEl.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom),
    };
  }

  function render(next) {
    setup = next;
    const undrawn = setup.tickets.filter(t => !t.drawn);
    layout = layoutDesk({ count: undrawn.length, ...inner() });
    pileEl.style.setProperty('--cols', String(layout.cols));
    pileEl.style.setProperty('--card-w', `${layout.cardW}px`);
    pileEl.style.setProperty('--card-h', `${layout.cardH}px`);
    pileEl.style.setProperty('--gap', `${layout.gap}px`);
    const buttons = undrawn.map(ticket => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'ticket';
      btn.dataset.no = String(ticket.no);
      btn.setAttribute('aria-label', `抽 ${ticket.no} 號籤`);
      // 跟 canvas 上畫的角度一樣,飛出去的起點才對得上
      btn.style.transform = `rotate(${tiltFor(ticket.no)}deg)`;
      return btn;
    });
    pileEl.replaceChildren(...buttons);
    slots = undrawn.map((t, i) => ({ no: t.no, el: buttons[i] }));
    pileEl.hidden = undrawn.length === 0;
    emptyStateEl.hidden = undrawn.length > 0;
    redraw();
  }

  function draw() {
    frame = 0;
    if (!layout) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    const w = deskEl.clientWidth;
    const h = deskEl.clientHeight;
    if (canvasEl.width !== Math.round(w * dpr) || canvasEl.height !== Math.round(h * dpr)) {
      canvasEl.width = Math.round(w * dpr);
      canvasEl.height = Math.round(h * dpr);
    }
    const ctx = canvasEl.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const { cardW, cardH } = layout;
    const top = deskEl.scrollTop;
    for (const s of slots) {
      // offsetLeft/Top 是排版位置(不含 rotate),相對於 .desk(position: relative)
      const y = s.el.offsetTop - top;
      if (y + cardH * 1.1 < 0 || y - cardH * 0.1 > h) continue;
      ctx.save();
      ctx.translate(s.el.offsetLeft + cardW / 2, y + cardH / 2);
      ctx.rotate((tiltFor(s.no) * Math.PI) / 180);
      ctx.translate(-cardW / 2, -cardH / 2);
      // 跟以前 box-shadow 一樣的下方實影
      ctx.save();
      ctx.translate(0, Math.max(1.5, cardW * 0.05));
      traceTicket(ctx, { orientation: 'portrait', w: cardW, h: cardH });
      ctx.fillStyle = 'rgba(87, 66, 57, .35)';
      ctx.fill();
      ctx.restore();
      drawFace(ctx, {
        color: faceColorFor(s.no), no: s.no, critter: critterFor(s.no),
        orientation: 'portrait', w: cardW, h: cardH,
      });
      ctx.restore();
    }
  }

  function redraw() {
    if (!frame) frame = requestAnimationFrame(draw);
  }

  deskEl.addEventListener('scroll', redraw, { passive: true });
  new ResizeObserver(() => { if (setup) render(setup); }).observe(deskEl);
  loadCardArt().then(redraw);

  pileEl.addEventListener('click', e => {
    const btn = e.target.closest('.ticket');
    if (btn) onPick(btn);
  });

  return { render, redraw };
}
```

import 行一併補 `faceColorFor, critterFor`(Task 3 已加)。

- [ ] **Step 6: main.js 接線**

```js
import { tiltFor } from './desk-layout.js';
...
const desk = createDeskView({
  deskEl: $('desk'),
  pileEl: $('pile'),
  canvasEl: $('deskCanvas'),
  emptyStateEl: $('emptyState'),
  onPick: ticketEl => doDraw(ticketEl),
});
```

`doDraw`:

```js
  const setup = getActive(state);
  const no = Number(ticketEl.dataset.no);
  // 動畫要從「使用者點的那張籤紙」飛出去(直放 + 歪斜),所以先量好它的位置;
  // 等一下桌面重繪之後這個 DOM 節點就不見了,rect 量不到。
  const origin = { rect: ticketEl.getBoundingClientRect(), tilt: tiltFor(no) };

  // 結果先決定,但先不寫進 state —— 使用者按「取消」的話這個結果就直接丟掉。
  // 傳 no:點哪張就抽走哪張(獎項在 drawTicket 裡隨機互換進來)。
  const result = drawTicket(setup, Math.random, no);
```

`revealer.hold({ tier: result.prize.tier, name: result.prize.name, no }, origin)`;`revealer.cancelReturn(origin)`(原本傳 `originRect` 的兩處都換)。刪掉 `faceColor: ticketEl.dataset.color` 那段註解與欄位。

- [ ] **Step 7: 跑測試 + 實機看一眼**

Run: `node --test`
Expected: 全部 PASS

```bash
python3 -m http.server 8765 --directory /Users/willian/github/gashapon >/dev/null 2>&1 &
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless --disable-gpu --hide-scrollbars --force-device-scale-factor=2 --window-size=390,844 --screenshot=<scratchpad>/desk-390.png http://localhost:8765/ichiban/
```

用 Read 看截圖:卡是直的齒孔票卡、號碼正立、顏色依號碼、沒有超出桌面。(素材還沒做,沒有紙紋與頭是正常的。)用 chrome 擴充(claude-in-chrome)點一張 → 確認飛出、轉正、撕開、關掉後那個號碼消失、其他號碼外觀不變。

- [ ] **Step 8: Commit**

```bash
git add ichiban/index.html ichiban/css/ichiban.css ichiban/js/ui.js ichiban/js/main.js test/ichiban-desk.test.js
git commit -m "feat(ichiban): desk drawn on one viewport-sized canvas, auto-fit; transparent buttons carry ticket numbers"
```

---

### Task 5: 7 色確認(使用者檢查點)

**Files:** 可能改 `ichiban/js/desk-layout.js` 的 `DESK_COLORS`

- [ ] **Step 1:** 本機開 `http://localhost:8765/ichiban/`,在設定裡把獎項加到約 30 張,390 寬截圖;再把 7 色並排(1~7 號)裁一張。用 SendUserFile 傳給使用者,問:「冷色 7 色這樣分得開嗎?」
- [ ] **Step 2:** 依回覆調 `DESK_COLORS`(只在冷色範圍內),重截圖直到使用者說 OK。
- [ ] **Step 3: Commit**(有改才 commit)

```bash
git add ichiban/js/desk-layout.js
git commit -m "style(ichiban): tune cold desk palette after review"
```

---

### Task 6: 紙紋與角色頭素材(ComfyUI)+ 預載

**Files:**
- Create: `tools/mascot-gen/ichiban_art.py`、`tools/mascot-gen/test_ichiban_art.py`
- Create: `tools/mascot-gen/ichiban.py`、`tools/mascot-gen/ichiban_prompts.json`
- Create: `tools/mascot-gen/review/ichiban.html`
- Modify: `tools/mascot-gen/gashapon.py:391-410`(`write_preload_manifest`)
- Modify: `test/preload-manifest.test.js`(`gashaponRefs` 加一番賞)
- Modify: `ichiban/js/card-art.js`(`ART_URLS`)、`ichiban/js/main.js`(啟動預熱)
- Create: `ichiban/img/paper.webp`、`ichiban/img/fox.webp`、`ichiban/img/ermine.webp`

**Interfaces:**
- Consumes: `useCardArt`、`loadCardArt`、`drawFace`、`drawPrize`(Task 3);`gashapon_art.content_hash / stamp / to_white_pattern`;`gashapon.webp / write_preload_manifest`;`comfy.run / graph_t2i / fetch`
- Produces: `ichiban_art.paper_from_gray(gray) → uint8[h,w]`、`ichiban_art.stamp_from_gray(gray, size=256) → uint8[size,size,4]`

- [ ] **Step 1: 寫失敗測試** `tools/mascot-gen/test_ichiban_art.py`

```python
"""ichiban_art 純函式。跑法:tools/mascot-gen/.venv/bin/python -m unittest discover tools/mascot-gen"""
import unittest

import numpy as np

from ichiban_art import paper_from_gray, stamp_from_gray


class Paper(unittest.TestCase):
    def test_light_and_subtle(self):
        g = np.random.default_rng(1).integers(60, 200, (64, 64)).astype(np.uint8)
        p = paper_from_gray(g)
        # multiply 上去只能讓底色暗一點點:最暗不低於 215,平均接近 245
        self.assertGreaterEqual(int(p.min()), 215)
        self.assertLessEqual(int(p.max()), 255)
        self.assertAlmostEqual(float(p.mean()), 245, delta=3)

    def test_flat_input_stays_white(self):
        p = paper_from_gray(np.full((8, 8), 128, np.uint8))
        self.assertTrue((p == 255).all())


class Stamp(unittest.TestCase):
    def test_black_glyph_becomes_opaque_white_white_bg_transparent(self):
        g = np.full((100, 100), 255, np.uint8)
        g[30:70, 30:70] = 0          # 黑色頭
        g[45:50, 40:45] = 255        # 白色眼睛(鏤空)
        s = stamp_from_gray(g, size=64)
        self.assertEqual(s.shape, (64, 64, 4))
        self.assertTrue((s[..., :3] == 255).all(), '印章一律白色')
        self.assertEqual(int(s[0, 0, 3]), 0, '白底透明')
        self.assertEqual(int(s[32, 32, 3]), 255, '頭不透明')

    def test_cropped_to_glyph_and_square(self):
        g = np.full((100, 200), 255, np.uint8)
        g[10:30, 150:190] = 0
        s = stamp_from_gray(g, size=32)
        # 裁到頭的範圍再置中補成正方形:上下會有透明邊,左右貼齊(含 4% 邊距)
        self.assertGreater(int(s[16, 3, 3]), 0)
        self.assertEqual(int(s[2, 16, 3]), 0)
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `tools/mascot-gen/.venv/bin/python -m unittest discover tools/mascot-gen`
Expected: FAIL(`No module named 'ichiban_art'`)

- [ ] **Step 3: 實作** `tools/mascot-gen/ichiban_art.py`

```python
"""一番賞票卡素材的純函式(2026-10-02)。"""
import numpy as np
from PIL import Image


def paper_from_gray(gray, mean=245, floor=215):
    """紙纖維 → 給 canvas multiply 用的淡灰階:平均約 mean、最暗不低於 floor。
    紙紋只能讓底色暗一點點,太深會把冷色底弄髒。"""
    g = gray.astype(np.float32)
    span = g.max() - g.min()
    if span < 1:
        return np.full(gray.shape, 255, np.uint8)
    t = (g - g.min()) / span                      # 0..1
    out = floor + t * (255 - floor)
    out += mean - out.mean()
    return np.clip(np.round(out), floor, 255).astype(np.uint8)


def stamp_from_gray(gray, size=256, margin=0.04):
    """黑色印章圖(白底)→ 白色 + 透明度:黑的地方不透明白、白的地方(含鏤空的眼睛)透明。
    裁到圖形範圍、置中補成正方形、縮到 size。"""
    a = (255 - gray.astype(np.int32)).clip(0, 255).astype(np.uint8)
    ys, xs = np.nonzero(a > 40)
    a = a[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
    h, w = a.shape
    side = int(round(max(h, w) * (1 + 2 * margin)))
    sq = np.zeros((side, side), np.uint8)
    y0, x0 = (side - h) // 2, (side - w) // 2
    sq[y0:y0 + h, x0:x0 + w] = a
    alpha = np.asarray(Image.fromarray(sq).resize((size, size), Image.LANCZOS))
    out = np.empty((size, size, 4), np.uint8)
    out[..., :3] = 255
    out[..., 3] = alpha
    return out
```

- [ ] **Step 4: 跑測試**

Run: `tools/mascot-gen/.venv/bin/python -m unittest discover tools/mascot-gen`
Expected: PASS

- [ ] **Step 5: prompts 與生成腳本**

`tools/mascot-gen/ichiban_prompts.json`:

```json
{
  "paper": "macro photo texture of plain matte drawing paper, soft visible paper fibers and fine grain, very light gray, evenly lit, completely flat, no objects, no shadows, no text, no border",
  "paper_negative": "text, letters, objects, folds, creases, stains, color, border, frame, vignette, shadow",
  "stamp_style": "simple flat rubber stamp icon, one solid pure black shape on a plain pure white background, bold chunky rounded shapes, cute chibi style, centered, front view, only the head, no body, no outline color, no gray shading",
  "fox": "a cute chibi fox head, big pointed ears, cheek fluff, eyes and nose and inner ears and cheek tuft lines as white cutouts inside the black shape, mouth closed, not talking",
  "ermine": "a cute chibi ermine (white stoat) head, round face, small round ears, eyes and nose and inner ears as white cutouts inside the black shape, mouth closed, not talking",
  "stamp_negative": "text, letters, numbers, body, paws, tail, gray, gradient, color, shading, frame, border, circle background, open mouth, teeth, tongue, talking",
  "picks": {}
}
```

`tools/mascot-gen/ichiban.py`(照 `gashapon.py` 的寫法):

```python
"""一番賞票卡素材:紙紋 + 白色印章角色頭(2026-10-02,issue #2)。z_image 文字生圖。

在 repo 根目錄執行(先 export COMFY_URL=http://<ComfyUI 那台的 IP>:8188):
  PY=tools/mascot-gen/.venv/bin/python
  $PY tools/mascot-gen/ichiban.py gen paper|fox|ermine   # 各 3 個 seed → out/ichiban/<name>/s{1,2,3}.png
  $PY tools/mascot-gen/ichiban.py review                  # 烘出候選 → review/ichiban/,開 review/ichiban.html 看
  $PY tools/mascot-gen/ichiban.py pick fox 2
  $PY tools/mascot-gen/ichiban.py build                   # 輸出 ichiban/img/*.webp、蓋 ?v=、重產 preload.json
"""
import argparse
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image

import comfy
from gashapon import webp, write_preload_manifest
from gashapon_art import content_hash, stamp
from ichiban_art import paper_from_gray, stamp_from_gray

ROOT = Path(__file__).resolve().parents[2]
HERE = Path(__file__).resolve().parent
OUT = HERE / 'out' / 'ichiban'
REVIEW = HERE / 'review' / 'ichiban'
CFG = HERE / 'ichiban_prompts.json'
IMG = ROOT / 'ichiban' / 'img'
CARD_ART = ROOT / 'ichiban' / 'js' / 'card-art.js'
SEEDS = [11, 22, 33]
NAMES = ['paper', 'fox', 'ermine']


def load_cfg():
    return json.loads(CFG.read_text())


def save_cfg(cfg):
    CFG.write_text(json.dumps(cfg, ensure_ascii=False, indent=2) + '\n')


def prompt_for(cfg, name):
    if name == 'paper':
        return cfg['paper'], cfg['paper_negative'], 1024, 448
    return f'{cfg["stamp_style"]}, {cfg[name]}', cfg['stamp_negative'], 768, 768


def cmd_gen(args):
    cfg = load_cfg()
    prompt, neg, w, h = prompt_for(cfg, args.name)
    d = OUT / args.name
    d.mkdir(parents=True, exist_ok=True)
    for n, seed in enumerate(SEEDS, 1):
        imgs = comfy.run(comfy.graph_t2i(prompt, neg, w, h, seed, f'ichiban_{args.name}_s{n}'))
        (d / f's{n}.png').write_bytes(comfy.fetch(imgs[0]))
        print(f'{args.name} s{n} seed={seed}', flush=True)


def bake(name, src):
    gray = np.asarray(Image.open(src).convert('L'))
    if name == 'paper':
        return Image.fromarray(paper_from_gray(gray))
    return Image.fromarray(stamp_from_gray(gray), 'RGBA')


def cmd_review(args):
    # 每個候選烘成跟正式版一樣的格式,review/ichiban.html 把它們畫在冷色票卡上比較
    for name in NAMES:
        for src in sorted((OUT / name).glob('s*.png')):
            dst = REVIEW / name / f'{src.stem}.png'
            dst.parent.mkdir(parents=True, exist_ok=True)
            bake(name, src).save(dst)
    print(f'開 http://localhost:8765/tools/mascot-gen/review/ichiban.html(先在 repo 根目錄 python3 -m http.server 8765)')


def cmd_pick(args):
    cfg = load_cfg()
    cfg.setdefault('picks', {})[args.name] = {'n': args.n}
    save_cfg(cfg)


def cmd_build(args):
    picks = load_cfg().get('picks', {})
    missing = [n for n in NAMES if n not in picks]
    if missing:
        sys.exit(f'還沒 pick:{", ".join(missing)}')
    IMG.mkdir(parents=True, exist_ok=True)
    text = CARD_ART.read_text()
    for name in NAMES:
        path = IMG / f'{name}.webp'
        webp(bake(name, OUT / name / f's{picks[name]["n"]}.png'), path, q=78)
        text = stamp(text, f'../img/{name}.webp', content_hash(path))
    CARD_ART.write_text(text)
    write_preload_manifest()
    print('ichiban art done')


COMMANDS = {'gen': cmd_gen, 'review': cmd_review, 'pick': cmd_pick, 'build': cmd_build}


def main():
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest='cmd', required=True)
    g = sub.add_parser('gen'); g.add_argument('name', choices=NAMES)
    sub.add_parser('review')
    p = sub.add_parser('pick'); p.add_argument('name', choices=NAMES); p.add_argument('n', type=int)
    sub.add_parser('build')
    args = ap.parse_args()
    COMMANDS[args.cmd](args)


if __name__ == '__main__':
    main()
```

(`webp()` 會依 Image 的 mode 自動存 L / RGBA;先 `sed -n 53,58p tools/mascot-gen/gashapon.py` 確認它接受 L mode —— 不接受的話 paper 先 `.convert('RGB')`。)

- [ ] **Step 6: card-art.js 填 `ART_URLS`**

```js
const ART_URLS = {
  paper: new URL('../img/paper.webp', import.meta.url).href,
  fox: new URL('../img/fox.webp', import.meta.url).href,
  ermine: new URL('../img/ermine.webp', import.meta.url).href,
};
```

(build 會把 `'../img/paper.webp'` 蓋成 `'../img/paper.webp?v=xxxxxxxx'`。)

- [ ] **Step 7: 預載清單掃一番賞**

`tools/mascot-gen/gashapon.py` `write_preload_manifest()` 在 `for css, base in …` 迴圈後加:

```python
    # 一番賞票卡素材(2026-10-02):網址寫在 card-art.js 的 new URL('../img/x.webp?v=…')
    for m in re.finditer(r"""['"](\.\./img/[^'"]+\.webp\?v=[0-9a-f]{8})['"]""", (ROOT / 'ichiban' / 'js' / 'card-art.js').read_text()):
        add('ichiban/js', m.group(1))
```

`test/preload-manifest.test.js` 的 `gashaponRefs()` 在 css 迴圈後加同樣的掃描(改名不必):

```js
  for (const m of read('ichiban/js/card-art.js').matchAll(/['"](\.\.\/img\/[^'"]+\.webp\?v=[0-9a-f]{8})['"]/g)) add('ichiban/js', m[1]);
```

`add` 的 `normalize(join(base, url))` 會把 `?v=` 留著(`join` 不碰 query),與 Python 的 `posixpath.normpath` 結果一致。

- [ ] **Step 8: 一番賞頁啟動預熱**

`ichiban/js/main.js` 頂端 import `loadCardArt`,在 `render();` 之前加:

```js
// 紙紋與角色頭先下載(首頁也預載過的話會直接中快取);桌面在它好了之後自己重畫。
loadCardArt();
```

- [ ] **Step 9: 比較頁** `tools/mascot-gen/review/ichiban.html`

```html
<!doctype html><meta charset="utf-8"><title>一番賞素材候選</title>
<style>body{margin:0;padding:12px;background:#BFE1F7;font:15px system-ui}h3{margin:14px 0 6px}canvas{margin:4px}</style>
<body><script type="module">
import { drawFace, drawPrize, useCardArt, makeCardCanvas, CARD_W, CARD_H } from '../../../ichiban/js/card-art.js';
import { DESK_COLORS } from '../../../ichiban/js/desk-layout.js';
const img = src => new Promise(r => { const i = new Image(); i.onload = () => r(i); i.onerror = () => r(null); i.src = src; });
const s = [1, 2, 3];
const papers = await Promise.all(s.map(n => img(`ichiban/paper/s${n}.png`)));
const foxes = await Promise.all(s.map(n => img(`ichiban/fox/s${n}.png`)));
const ermines = await Promise.all(s.map(n => img(`ichiban/ermine/s${n}.png`)));
function row(title, sets) {
  document.body.insertAdjacentHTML('beforeend', `<h3>${title}</h3>`);
  for (const [label, art, critter] of sets) {
    useCardArt(art);
    const small = document.createElement('canvas');
    small.width = 3 * 44 * 2; small.height = 100 * 2; small.style.width = `${3 * 44}px`;
    const ctx = small.getContext('2d'); ctx.scale(2, 2);
    [0, 1, 2].forEach(i => { ctx.save(); ctx.translate(i * 44 + 2, 0); drawFace(ctx, { color: DESK_COLORS[i * 2], no: i + 7, critter, orientation: 'portrait', w: 40, h: 91 }); ctx.restore(); });
    const big = makeCardCanvas(); big.style.width = '300px';
    drawFace(big.getContext('2d'), { color: DESK_COLORS[1], no: 7, critter });
    const prize = makeCardCanvas(); prize.style.width = '300px';
    drawPrize(prize.getContext('2d'), { color: '#FF6F91', letter: 'A', name: '大獎' });
    document.body.insertAdjacentHTML('beforeend', `<div>${label}</div>`);
    document.body.append(small, big, prize);
  }
}
row('紙紋 s1 / s2 / s3(角色用 s1)', s.map((n, i) => [`paper s${n}`, { paper: papers[i], fox: foxes[0], ermine: ermines[0] }, 'fox']));
row('狐狸 s1 / s2 / s3', s.map((n, i) => [`fox s${n}`, { paper: papers[0], fox: foxes[i], ermine: ermines[0] }, 'fox']));
row('白鼬 s1 / s2 / s3', s.map((n, i) => [`ermine s${n}`, { paper: papers[0], fox: foxes[0], ermine: ermines[i] }, 'ermine']));
</script>
```

- [ ] **Step 10: 生成 → 候選截圖給使用者挑(使用者檢查點)**

```bash
export COMFY_URL=http://192.168.68.53:8188
PY=tools/mascot-gen/.venv/bin/python
$PY tools/mascot-gen/ichiban.py gen paper && $PY tools/mascot-gen/ichiban.py gen fox && $PY tools/mascot-gen/ichiban.py gen ermine
$PY tools/mascot-gen/ichiban.py review
```

先自己用 Read 看 `out/ichiban/*/s*.png`:頭要是正面、只有頭、黑色單一形狀、眼鼻是白色鏤空、嘴巴閉著;不合格就改 prompt 重生(不要把爛圖丟給使用者)。headless Chrome 截 `review/ichiban.html`(390 與 1440 寬各一張),SendUserFile 傳給使用者,問:紙紋、狐狸、白鼬各選哪一版。

- [ ] **Step 11: pick + build**

```bash
$PY tools/mascot-gen/ichiban.py pick paper <n>
$PY tools/mascot-gen/ichiban.py pick fox <n>
$PY tools/mascot-gen/ichiban.py pick ermine <n>
$PY tools/mascot-gen/ichiban.py build
ls -la ichiban/img && grep -n "webp" ichiban/js/card-art.js && cat gashapon/img/preload.json
```

Expected:三張 webp 存在(各應 < 40KB);card-art.js 三個網址都帶 `?v=`;preload.json 多了 `ichiban/img/*.webp?v=…` 三筆。

- [ ] **Step 12: 跑測試**

Run: `node --test && tools/mascot-gen/.venv/bin/python -m unittest discover tools/mascot-gen`
Expected: 全部 PASS(`preload.json 跟扭蛋機頁實際引用的圖一字不差` 現在也涵蓋一番賞)

- [ ] **Step 13: Commit**

```bash
git add tools/mascot-gen/ichiban.py tools/mascot-gen/ichiban_prompts.json tools/mascot-gen/ichiban_art.py tools/mascot-gen/test_ichiban_art.py tools/mascot-gen/gashapon.py tools/mascot-gen/review/ichiban.html ichiban/img ichiban/js/card-art.js ichiban/js/main.js gashapon/img/preload.json test/preload-manifest.test.js
git commit -m "feat(ichiban): paper texture + white stamp fox/ermine heads (ComfyUI), preloaded from home"
```

(`review/` 若在 .gitignore 裡,`review/ichiban.html` 照現況不 commit,從 add 清單拿掉。)

---

### Task 7: 實機驗證與最後一抽賞(使用者檢查點)

**Files:** 依使用者回饋可能小改 `card-art.js` / `ichiban.css`

- [ ] **Step 1:** 本機 server,用 claude-in-chrome(先 `tabs_context_mcp`、開新分頁)在 390×844 與 1440×900 兩種寬度截圖:
  - 桌面 20 張、80 張、150 張(捲到中段)—— 150 張時點捲動後的一張,確認飛出的是看到的那張
  - 拿起(轉正中)、撕開途中、獎項面(A 賞、G 賞、長名字)
  - 最後一抽賞(設定 lastOnePrize,抽到最後一張)
  - 開 DevTools 停用 WebGL(或 `chrome://flags`)看靜態退路有畫出獎項面
- [ ] **Step 2:** 用 Read 自己先看一輪:號碼正立、28px 卡號碼不溢出、canvas 卡與按鈕對齊(focus 外框套在卡上)、沒有白邊 / 捲動錯位。有問題先修。
- [ ] **Step 3:** SendUserFile 傳截圖給使用者,特別問最後一抽賞(spec 寫「做出來看效果再調」)。提醒:GitHub Pages 的 HTML 快取 10 分鐘,推上去後實機要等或重開分頁。
- [ ] **Step 4:** 依回饋修正、`node --test` 全綠、commit:

```bash
git add -A ichiban
git commit -m "fix(ichiban): ticket art polish after review"
```

- [ ] **Step 5:** 使用者確認後,更新記憶 `art-direction-frozen.md`(一番賞已套用、印章頭 / 紙紋的做法),並在 issue #2 留言摘要後關閉(先問使用者要不要關)。
