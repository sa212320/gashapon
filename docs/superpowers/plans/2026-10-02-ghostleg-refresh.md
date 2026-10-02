# 阿彌陀籤改版 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 阿彌陀籤整頁換成冰雪風 —— 冰板 + 雪路 + 緞帶軌跡、6 種染色動物立牌、3 級獎品圖與亂飛、結果卡 / 空狀態 / 設定選擇器、開跑前鏡頭拉近,最後換首頁卡片插畫。

**Architecture:** 資料層在 `ladder.js` / `store.js` 加 `animal`、`tier` 兩個欄位;純計算(緞帶折線、名牌字色、亂飛偏移、鏡頭構圖)放在不 import three 的模組,node 測得到;three 物件建在 `scene-parts.js`,由 `track.js` 組裝,對 `main.js` 的介面不變。素材由 `tools/mascot-gen/ghostleg.py` 產生、蓋 `?v=` 雜湊、進預載清單。

**Tech Stack:** 原生 ES modules、three.js(`vendor/three.module.min.js`,importmap `three`)、`node --test`(零依賴)、Python 3 + numpy + Pillow + cwebp(`tools/mascot-gen/.venv`)、ComfyUI(`COMFY_URL=http://192.168.68.53:8188`)。

**Spec:** `docs/superpowers/specs/2026-10-02-ghostleg-refresh-design.md`

## 確認過的模型(原文,不要改寫)

- **實體**:`Player { id, name, color, animal }`(animal ∈ `snowman / rabbit / penguin / reindeer / cat / dog / bear / seal / owl / hamster`,2026-10-02 檢查點 3 改成 10 種);`GhostPrize { id, name, count, tier }`(tier ∈ `plain / chest / deluxe`);`Slot { prizeId | null, name }`(null = 銘謝惠顧)
- **數量**:Setup 1:N Player、1:N GhostPrize;Player 1:1 animal(存在 Player,可重複);GhostPrize 1:1 tier(存在 prize);GhostPrize 1:N Slot(依 count 展開)
- **看到 vs 存下**:立牌(動物原色 + 玩家色戰棋底座)/ 名牌 / 結果小圖都由 animal+color 或 tier 即時畫,不存圖;**動物本身不染色**(2026-10-02 檢查點 3:使用者選吉祥物畫風 B,玩家色只在底座、名牌、緞帶);新增玩家自動配最少用的動物;舊資料照順序補動物、tier 補 plain;結果卡依等級排序只是顯示,不改存檔順序
- **三個最可能的錯(錯誤版本,看到就要警覺)**:
  - ❌「動物每局依車道 / 順序重新分配」—— 動物存在玩家身上,跟著人走
  - ❌「等級從 count 或清單順序推算」—— tier 是每個獎項手動選的欄位,預設 plain
  - ❌「銘謝惠顧是 tier = 雪球的獎項」—— 它是 `prizeId: null` 的空格,永遠是雪球,不能選

**執行中如果發現程式跟這個模型衝突,那是計畫的 bug —— 停下來回報,不要自己就地改模型。**

## Global Constraints

- 全站平塗、不打光:three 一律 `MeshBasicMaterial` / `SpriteMaterial`,不加光源(`ghostleg/js/track.js` 開頭註解)
- 美術方向:冰雪風(冰藍 / 淡紫 / 白),不要聖誕元素;例外:一般獎盒子上的冰藍蝴蝶結是使用者明確允許的
- 外框色 `#574239`(`--ink`);玩家色只來自 `PALETTE`(`ghostleg/js/ladder.js`)
- 名字才是識別,顏色是加分(既有註解,約 8% 男生紅綠色覺辨異)—— 名牌永遠顯示名字
- 人數上限 `MAX_PLAYERS = 40`;40 人時 `laneWidth = 0.34`
- 圖片網址一律帶 `?v=<sha1 前 8 碼>`(`gashapon_art.stamp` / `content_hash`);新圖都要進 `gashapon/img/preload.json`(`gashapon.py write_preload_manifest()`)+ 頁內 warm-up
- 設定對話框在 390 寬時每一列不能撐出對話框(`.edit-list` `minmax(0,1fr)`、`.edit-row__name` `width:0`,e3168f3)
- 點擊區 ≥ 44px;選擇器是 `<button>` + `aria-label`
- 程式碼、識別字、commit message 用英文;註解照 repo 習慣用中文
- commit 結尾兩行:`Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>` 與 `Claude-Session: https://claude.ai/code/session_01SemYkQLkTmSDDeYUKQcPZG`
- 測試:repo 根目錄 `node --test test/*.test.js`;Python:`tools/mascot-gen/.venv/bin/python -m unittest discover tools/mascot-gen`
- 本機預覽:repo 根目錄 `python3 -m http.server 8765`;390 寬用同源 iframe 包;claude-in-chrome 背景分頁 rAF 不跑 → 動畫用假時鐘逐格擷取(覆寫 iframe 的 `performance.now` / `requestAnimationFrame`)
- 瀏覽器會快取舊的 module:驗證前 `fetch(url, {cache:'reload'})` 重抓改過的 js / css

## Review Focus

1. **舊存檔**(沒有 `animal` / `tier`,或值被手改成怪東西)→ 讀得進來、照順序補動物、tier 補 plain、不白畫面(Task 2 測)
2. **40 人**:雪路、緞帶、名牌要跟著車道寬縮,名牌交錯不疊成一排,每格重建緞帶不卡(Task 5、6、7 測寬度與交錯;Checkpoint 2 實看 40 人)
3. **閒置動畫迴圈跟演出迴圈打架**:按開始時閒置迴圈一定要停,不然兩個 rAF 同時畫、獎品抖;分頁切走再回來不能卡住(Task 9 測 `createIdleLoop` 的 stop)
4. **圖還沒載完 / 載入失敗**:立牌、設定小圖要退回暫代圖,不能空白或丟例外(Task 3 測 `tintedAnimal` 在 img 為 null 時回暫代)
5. **長名字(10 字)**:名牌與結果卡不能撐爆;名牌縮字(Task 7 測 `tagFontSize`)

---

## 檔案結構

| 檔案 | 責任 | 新 / 改 |
|---|---|---|
| `ghostleg/js/ladder.js` | `ANIMALS` / `pickAnimal` / `TIERS` / `createPlayer` / `createGhostPrize` / `bottomSlots` 帶 tier / `sortResults` | 改 |
| `ghostleg/js/store.js` | 正規化舊資料;`sanitizeSetup` 匯出給測試 | 改 |
| `ghostleg/js/art.js` | 素材網址表(帶 `?v=`)、`loadArt()` warm-up、`ANIMAL_LABEL` / `TIER_LABEL` | 新 |
| `ghostleg/js/tint.js` | `tintedAnimal(img, color, size)` 快取 + 暫代圖;`textColorFor(hex)` | 新 |
| `ghostleg/js/ribbon.js` | 緞帶折線純函式:`offsetRoute` / `roundCorners` / `cutAt` / `stripData`;`snowWidth` / `ribbonWidth` | 新 |
| `ghostleg/js/labels.js` | 名牌純函式:`tagLift` / `tagFontSize` | 新 |
| `ghostleg/js/prize-motion.js` | 亂飛偏移 `wanderOffset`;閒置迴圈 `createIdleLoop` | 新 |
| `ghostleg/js/camera-script.js` | `idleFrame` 開跑前構圖;SHOW 段從 idleFrame 出發 | 改 |
| `ghostleg/js/scene-parts.js` | three 物件:冰板、雪路、立牌、名牌、獎品 sprite、緞帶 BufferGeometry | 新 |
| `ghostleg/js/track.js` | 組裝;介面不變,`setPrizeFly(k, tSec)` 多一個時間參數 | 改 |
| `ghostleg/js/main.js` | 設定選擇器、結果卡、空狀態、閒置迴圈、`await loadArt()` | 改 |
| `ghostleg/index.html` / `ghostleg/css/ghostleg.css` | 結果卡、空狀態、選擇器樣式 | 改 |
| `tools/mascot-gen/ghostleg.py` / `ghostleg_art.py` / `ghostleg_prompts.json` / `test_ghostleg_art.py` | 生成、挑選、輸出素材 | 新 |
| `tools/mascot-gen/gashapon.py` | `write_preload_manifest()` 加阿彌陀籤 | 改 |
| `test/preload-manifest.test.js` | 同步加阿彌陀籤 | 改 |
| `test/ladder.test.js` / `test/ghostleg-store.test.js` / `test/ghostleg-scene.test.js` / `test/ghostleg-art.test.js` | 測試 | 改 / 新 |

---

## 階段一:資料層 + 設定選擇器

### Task 1: 資料欄位 animal / tier 與結果排序

**Files:**
- Modify: `ghostleg/js/ladder.js`
- Test: `test/ladder.test.js`

**Interfaces:**
- Produces:
  - `ANIMALS: readonly string[]` = `['snowman','rabbit','penguin','reindeer','cat','dog']`
  - `TIERS: readonly string[]` = `['plain','chest','deluxe']`
  - `pickAnimal(existing: {animal}[]) → string`
  - `createPlayer({ name?, color?, animal? }) → { id, name, color, animal }`
  - `createGhostPrize({ name?, count?, tier? }) → { id, name, count, tier }`
  - `bottomSlots(prizes, n, rng)` 的每格:`{ prizeId, name, tier }`;空格:`{ prizeId: null, name: '銘謝惠顧' }`(**沒有 tier 屬性**)
  - `sortResults(results: {playerId, slotIndex, slot}[]) → 新陣列`

- [ ] **Step 1: 寫失敗的測試**(加在 `test/ladder.test.js` 尾端,import 行補上 `ANIMALS, TIERS, pickAnimal, sortResults`)

```js
/* ---------- 動物與獎品等級(2026-10-02 改版) ---------- */

test('ANIMALS / TIERS 是定案的那幾個', () => {
  assert.deepEqual([...ANIMALS], ['snowman', 'rabbit', 'penguin', 'reindeer', 'cat', 'dog']);
  assert.deepEqual([...TIERS], ['plain', 'chest', 'deluxe']);
});

test('pickAnimal 挑目前最少人用的,同票照清單順序', () => {
  assert.equal(pickAnimal([]), 'snowman');
  assert.equal(pickAnimal([{ animal: 'snowman' }]), 'rabbit');
  const all = ANIMALS.map(animal => ({ animal }));
  assert.equal(pickAnimal([...all, { animal: 'snowman' }, { animal: 'rabbit' }]), 'penguin');
});

test('createPlayer 預設配一隻動物;給了就用給的', () => {
  assert.ok(ANIMALS.includes(createPlayer().animal));
  assert.equal(createPlayer({ animal: 'cat' }).animal, 'cat');
});

test('createGhostPrize 預設 tier 是 plain;不合法的 tier 也變 plain', () => {
  assert.equal(createGhostPrize().tier, 'plain');
  assert.equal(createGhostPrize({ tier: 'deluxe' }).tier, 'deluxe');
  assert.equal(createGhostPrize({ tier: 'gold' }).tier, 'plain');
});

test('tier 不從 count 或清單順序推算(模型錯誤 #2)', () => {
  const a = createGhostPrize({ name: 'A', count: 1 });
  const b = createGhostPrize({ name: 'B', count: 9 });
  assert.equal(a.tier, 'plain');
  assert.equal(b.tier, 'plain');
});

test('bottomSlots 把 tier 帶進每格;銘謝惠顧格沒有 tier(模型錯誤 #3)', () => {
  const list = [createGhostPrize({ name: '頭', count: 1, tier: 'deluxe' })];
  const slots = bottomSlots(list, 3, seeded(5));
  const won = slots.filter(s => s.prizeId !== null);
  const empty = slots.filter(s => s.prizeId === null);
  assert.equal(won.length, 1);
  assert.equal(won[0].tier, 'deluxe');
  assert.equal(empty.length, 2);
  for (const s of empty) assert.ok(!('tier' in s));
});

test('動物跟著人走:lineup 洗過之後每個人的 animal 不變(模型錯誤 #1)', () => {
  const ps = ['a', 'b', 'c', 'd'].map((name, i) => createPlayer({ name, animal: ANIMALS[i] }));
  const before = new Map(ps.map(p => [p.id, p.animal]));
  for (const p of lineup(ps, seeded(9))) assert.equal(p.animal, before.get(p.id));
});

test('sortResults:頭獎 → 大獎 → 一般 → 銘謝惠顧,同級保持原順序;不改原陣列', () => {
  const r = (id, slot) => ({ playerId: id, slotIndex: 0, slot });
  const input = [
    r('e1', { prizeId: null, name: '銘謝惠顧' }),
    r('p1', { prizeId: 'a', name: '一般A', tier: 'plain' }),
    r('d1', { prizeId: 'b', name: '頭', tier: 'deluxe' }),
    r('c1', { prizeId: 'c', name: '大', tier: 'chest' }),
    r('p2', { prizeId: 'd', name: '一般B', tier: 'plain' }),
  ];
  const copy = input.slice();
  assert.deepEqual(sortResults(input).map(x => x.playerId), ['d1', 'c1', 'p1', 'p2', 'e1']);
  assert.deepEqual(input, copy);
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `node --test test/ladder.test.js`
Expected: FAIL —— `ANIMALS` / `pickAnimal` 等不存在(SyntaxError: does not provide an export named)

- [ ] **Step 3: 實作**(`ghostleg/js/ladder.js`)

在 `pickColor` 後面加:

```js
// 玩家的動物(2026-10-02 改版)。存在玩家身上、跟著人走 —— 小孩會認「我是兔子」,
// 每局換來換去就沒意義了。6 種給最多 40 人用,會重複,名字才是識別。
export const ANIMALS = Object.freeze(['snowman', 'rabbit', 'penguin', 'reindeer', 'cat', 'dog']);

export function pickAnimal(existing) {
  const used = new Map(ANIMALS.map(a => [a, 0]));
  for (const p of existing) if (used.has(p.animal)) used.set(p.animal, used.get(p.animal) + 1);
  const least = Math.min(...used.values());
  return ANIMALS.find(a => used.get(a) === least);
}

// 獎品等級。每個獎項手動選、存在獎項上 —— 不能從 count 或清單順序猜(會猜錯)。
// 銘謝惠顧不是一個等級,它是沒有獎項的空格(prizeId: null),永遠畫雪球。
export const TIERS = Object.freeze(['plain', 'chest', 'deluxe']);
```

把 `createPlayer` 換成:

```js
export function createPlayer({ name = '玩家', color = null, animal = null } = {}) {
  return {
    id: newId('pl'),
    name,
    color: color ?? PALETTE[0],
    animal: ANIMALS.includes(animal) ? animal : pickAnimal([]),
  };
}
```

`createGhostPrize` 的參數加 `tier = 'plain'`,回傳物件加一行:

```js
    tier: TIERS.includes(tier) ? tier : 'plain',
```

`bottomSlots` 的 expand 改成:

```js
  const filled = shuffle(expand(prizes, p => ({ prizeId: p.id, name: p.name, tier: p.tier })), rng);
```

在 `assign` 後面加:

```js
// 結果卡的顯示順序:頭獎 → 大獎 → 一般 → 銘謝惠顧,同級保持原本順序。只給畫面用,不寫回存檔。
const TIER_RANK = { deluxe: 0, chest: 1, plain: 2 };
export function sortResults(results) {
  const rank = r => (r.slot.prizeId === null ? 3 : TIER_RANK[r.slot.tier] ?? 2);
  return results.map((r, i) => [r, i]).sort((a, b) => rank(a[0]) - rank(b[0]) || a[1] - b[1]).map(([r]) => r);
}
```

- [ ] **Step 4: 跑測試確認通過**

Run: `node --test test/ladder.test.js` → PASS;再跑 `node --test test/*.test.js` 全部 PASS

- [ ] **Step 5: Commit**

```bash
git add ghostleg/js/ladder.js test/ladder.test.js
git commit -m "feat(ghostleg): players carry an animal, prizes carry a tier; results sort by tier"
```

### Task 2: 舊資料正規化

**Files:**
- Modify: `ghostleg/js/store.js`
- Create: `test/ghostleg-store.test.js`

**Interfaces:**
- Consumes: `ANIMALS`, `TIERS`, `createPlayer({animal})`(Task 1)
- Produces: `export function sanitizeSetup(raw) → setup | null`;種子資料 6 人依序配 6 種動物

- [ ] **Step 1: 寫失敗的測試**(`test/ghostleg-store.test.js`)

```js
// 阿彌陀籤存檔正規化(2026-10-02 加 animal / tier)。舊存檔沒有這兩個欄位,或被手改成怪東西。
import test from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeSetup, seedState } from '../ghostleg/js/store.js';
import { ANIMALS } from '../ghostleg/js/ladder.js';

const raw = (players, prizes = []) => ({ id: 'gs1', name: 'x', players, prizes });

test('舊存檔沒有 animal:照順序補 ANIMALS[i % 6]', () => {
  const s = sanitizeSetup(raw(Array.from({ length: 8 }, (_, i) => ({ id: `p${i}`, name: `n${i}`, color: '#E4572E' }))));
  assert.deepEqual(s.players.map(p => p.animal), [...ANIMALS, ANIMALS[0], ANIMALS[1]]);
});

test('animal 不合法:同樣照順序補;合法的保留', () => {
  const s = sanitizeSetup(raw([
    { id: 'a', name: 'a', color: '#E4572E', animal: 'dragon' },
    { id: 'b', name: 'b', color: '#E4572E', animal: 'cat' },
  ]));
  assert.deepEqual(s.players.map(p => p.animal), ['snowman', 'cat']);
});

test('舊存檔沒有 tier 或 tier 不合法:補 plain;合法的保留', () => {
  const s = sanitizeSetup(raw([], [
    { id: 'x', name: '頭', count: 1 },
    { id: 'y', name: '二', count: 1, tier: 'gold' },
    { id: 'z', name: '三', count: 2, tier: 'chest' },
  ]));
  assert.deepEqual(s.prizes.map(p => p.tier), ['plain', 'plain', 'chest']);
});

test('種子資料:6 個人各配一種動物,獎項都是 plain', () => {
  const setup = seedState().setups[0];
  assert.deepEqual(setup.players.map(p => p.animal), [...ANIMALS]);
  assert.ok(setup.prizes.every(p => p.tier === 'plain'));
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `node --test test/ghostleg-store.test.js`
Expected: FAIL —— `sanitizeSetup` 沒有匯出

- [ ] **Step 3: 實作**(`ghostleg/js/store.js`)

import 行加 `ANIMALS, TIERS`。`seedState` 的 players 改成:

```js
    players: SEED_PLAYERS.map((name, i) => createPlayer({ name, color: PALETTE[i % PALETTE.length], animal: ANIMALS[i % ANIMALS.length] })),
```

`function sanitizeSetup` 改成 `export function sanitizeSetup`;players 的 map 加:

```js
      animal: ANIMALS.includes(p.animal) ? p.animal : ANIMALS[i % ANIMALS.length],
```

prizes 的 map 加:

```js
      tier: TIERS.includes(p.tier) ? p.tier : 'plain',
```

- [ ] **Step 4: 跑測試確認通過**:`node --test test/*.test.js` 全部 PASS

- [ ] **Step 5: Commit**

```bash
git add ghostleg/js/store.js test/ghostleg-store.test.js
git commit -m "feat(ghostleg): old saves get animals in order and plain tiers"
```

### Task 3: 素材表、染色、字色

**Files:**
- Create: `ghostleg/js/art.js`, `ghostleg/js/tint.js`
- Test: `test/ghostleg-art.test.js`

**Interfaces:**
- Produces:
  - `art.js`:`ANIMAL_URLS: {[animal]: string}`(素材做好前是 `{}`)、`PRIZE_URLS: {plain, chest, deluxe, snow}`(Task 12 填)、`BOARD_URL: string | null`、`ANIMAL_LABEL`、`TIER_LABEL`、`loadArt() → Promise<{ animals: {[animal]: HTMLImageElement|null}, prizes: {...}, board: HTMLImageElement|null }>`、`getArt()` 回傳最近一次 loadArt 的結果(還沒載完時全部 null)
  - `tint.js`:`textColorFor(hex) → '#FFFFFF' | '#574239'`、`tintedAnimal(img|null, color, size) → HTMLCanvasElement`(以 `src|color|size` 快取;img 為 null 時畫暫代小人)

- [ ] **Step 1: 寫失敗的測試**(`test/ghostleg-art.test.js`)

```js
// 阿彌陀籤素材的純函式。染色本身要 canvas,在瀏覽器驗;這裡只測不靠 DOM 的部分。
import test from 'node:test';
import assert from 'node:assert/strict';
import { textColorFor } from '../ghostleg/js/tint.js';
import { ANIMAL_LABEL, TIER_LABEL } from '../ghostleg/js/art.js';
import { ANIMALS, TIERS, PALETTE } from '../ghostleg/js/ladder.js';

test('textColorFor:深色底白字、淺色底深棕字', () => {
  assert.equal(textColorFor('#3D7EA6'), '#FFFFFF');
  assert.equal(textColorFor('#8E6BBF'), '#FFFFFF');
  assert.equal(textColorFor('#E8B830'), '#574239');
  assert.equal(textColorFor('#FFFFFF'), '#574239');
});

test('PALETTE 每一色的名牌字都有至少 3:1 的對比', () => {
  const lum = hex => {
    const c = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255)
      .map(v => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  };
  for (const bg of PALETTE) {
    const fg = textColorFor(bg);
    const [a, b] = [lum(bg), lum(fg)].sort((x, y) => y - x);
    assert.ok((a + 0.05) / (b + 0.05) >= 3, `${bg} 配 ${fg}`);
  }
});

test('每種動物、每個等級都有中文標籤', () => {
  for (const a of ANIMALS) assert.ok(ANIMAL_LABEL[a], a);
  for (const t of TIERS) assert.ok(TIER_LABEL[t], t);
  assert.deepEqual(TIER_LABEL, { plain: '一般', chest: '大獎', deluxe: '頭獎' });
});
```

- [ ] **Step 2: 跑測試確認失敗**:`node --test test/ghostleg-art.test.js` → FAIL(模組不存在)

- [ ] **Step 3: 實作 `ghostleg/js/tint.js`**

```js
// 動物立牌的染色。生成圖是「白身體 + 深棕外框」,multiply 上玩家色之後
// 白的地方變成玩家色、深棕幾乎不變,再用原圖的 alpha 剪回輪廓。
// 同一組 (圖, 顏色, 尺寸) 只畫一次 —— 40 個人、設定小圖、結果卡都共用。
const INK = '#574239';
const cache = new Map();

// WCAG 相對亮度;0.4 以上的底色配深棕字,其餘配白字(PALETTE 每色都測過 ≥ 3:1)
export function textColorFor(hex) {
  const c = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map(v => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  const L = 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  return L > 0.4 ? INK : '#FFFFFF';
}

// 圖還沒載完 / 載不到時的暫代:白色圓頭小人(跟舊版同型),一樣走染色
function placeholder(size) {
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const ctx = c.getContext('2d');
  const s = size / 180;
  ctx.scale(s, s);
  ctx.lineWidth = 9;
  ctx.strokeStyle = INK;
  ctx.fillStyle = '#FFFFFF';
  ctx.beginPath();
  ctx.moveTo(52, 172); ctx.quadraticCurveTo(90, 60, 128, 172); ctx.closePath();
  ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.arc(90, 82, 40, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.fillStyle = INK;
  ctx.beginPath(); ctx.arc(78, 78, 6, 0, Math.PI * 2); ctx.arc(102, 78, 6, 0, Math.PI * 2); ctx.fill();
  return c;
}

export function tintedAnimal(img, color, size = 256) {
  const key = `${img?.src ?? 'placeholder'}|${color}|${size}`;
  if (cache.has(key)) return cache.get(key);
  const src = img ?? placeholder(size);
  const c = document.createElement('canvas');
  const h = size;
  const w = Math.round(size * (src.width / src.height));
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  ctx.drawImage(src, 0, 0, w, h);
  ctx.globalCompositeOperation = 'multiply';
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, w, h);
  ctx.globalCompositeOperation = 'destination-in';
  ctx.drawImage(src, 0, 0, w, h);
  ctx.globalCompositeOperation = 'source-over';
  cache.set(key, c);
  return c;
}
```

- [ ] **Step 4: 實作 `ghostleg/js/art.js`**

```js
// 阿彌陀籤的素材網址(含 ?v= 內容雜湊,由 tools/mascot-gen/ghostleg.py build 蓋上)。
// 首頁的 preload.json 從這支檔案抓網址,所以網址要寫成 new URL('../img/…?v=…', import.meta.url) 的字面值。
export const ANIMAL_URLS = {};
export const PRIZE_URLS = {};
export const BOARD_URL = null;

export const ANIMAL_LABEL = { snowman: '雪人', rabbit: '兔子', penguin: '企鵝', reindeer: '馴鹿', cat: '貓', dog: '狗' };
export const TIER_LABEL = { plain: '一般', chest: '大獎', deluxe: '頭獎' };

let loaded = { animals: {}, prizes: {}, board: null };

function loadImage(url) {
  return new Promise(resolve => {
    if (!url) return resolve(null);
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);   // 載不到就用暫代圖,絕不卡住整頁
    img.src = url;
  });
}

// 進頁面先把全部素材載好(頁內 warm-up):第一次開跑、打開設定時都不必再等下載
export async function loadArt() {
  const entries = async table => Object.fromEntries(
    await Promise.all(Object.entries(table).map(async ([k, u]) => [k, await loadImage(u)])));
  loaded = { animals: await entries(ANIMAL_URLS), prizes: await entries(PRIZE_URLS), board: await loadImage(BOARD_URL) };
  return loaded;
}

export function getArt() {
  return loaded;
}
```

- [ ] **Step 5: 跑測試確認通過**:`node --test test/*.test.js` 全部 PASS

- [ ] **Step 6: Commit**

```bash
git add ghostleg/js/art.js ghostleg/js/tint.js test/ghostleg-art.test.js
git commit -m "feat(ghostleg): art table, tinted animal canvases with a placeholder, name-tag text colour"
```

### Task 4: 設定選擇器(動物 / 等級)

**Files:**
- Modify: `ghostleg/js/main.js`(`renderPlayers`、`renderPrizes`、`addPlayerBtn` 處理、檔尾 `render()` 前 `await loadArt()`)
- Modify: `ghostleg/css/ghostleg.css`(選擇器樣式)
- Test: `test/ghostleg-art.test.js`(加靜態檢查)

**Interfaces:**
- Consumes: `ANIMALS`, `TIERS`, `pickAnimal`(Task 1)、`tintedAnimal`(Task 3)、`getArt`, `loadArt`, `ANIMAL_LABEL`, `TIER_LABEL`, `PRIZE_URLS`(Task 3)
- Produces: 設定裡 `draft.players[i].animal` / `draft.prizes[i].tier` 可被改,經 `applyDraft` 存檔

- [ ] **Step 1: 寫失敗的測試**(加在 `test/ghostleg-art.test.js`)

```js
import { readFileSync } from 'node:fs';
const mainJs = readFileSync(new URL('../ghostleg/js/main.js', import.meta.url), 'utf8');

test('設定:新增玩家時用 pickAnimal 配動物', () => {
  assert.match(mainJs, /createPlayer\(\{[^}]*animal: pickAnimal\(draft\.players\)/);
});

test('設定:動物 / 等級選擇器是有 aria-label 的 button', () => {
  assert.match(mainJs, /className = 'edit-row__pick'/);
  assert.match(mainJs, /b\.setAttribute\('aria-label', label\)/);
  assert.match(mainJs, /pickButton\(`\$\{p\.name \|\| '玩家'\}的動物:\$\{ANIMAL_LABEL\[p\.animal\]\}`/);
  assert.match(mainJs, /pickButton\(`\$\{p\.name \|\| '獎項'\}的等級:\$\{TIER_LABEL\[p\.tier\]\}`/);
});

test('頁面等素材載完才畫第一格', () => {
  assert.match(mainJs, /await loadArt\(\);\s*\n\s*render\(\);\s*$/);
});
```

- [ ] **Step 2: 跑測試確認失敗**:`node --test test/ghostleg-art.test.js` → FAIL

- [ ] **Step 3: 實作 `main.js`**

import 加:

```js
import { ANIMALS, TIERS, pickAnimal, sortResults } from './ladder.js';
import { tintedAnimal } from './tint.js';
import { loadArt, getArt, ANIMAL_LABEL, TIER_LABEL, PRIZE_URLS } from './art.js';
```

(`ANIMALS, TIERS, pickAnimal, sortResults` 併進原本那行 ladder import。)

在 `let draft = null;` 下面加:

```js
// 設定清單裡同一時間只開一個選擇器:{ kind: 'animal' | 'tier', index }
let openPicker = null;

function pickButton(label, child, onClick) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'edit-row__pick';
  b.setAttribute('aria-label', label);
  b.append(child);
  b.addEventListener('click', e => { e.stopPropagation(); onClick(); });
  return b;
}

function animalThumb(animal, color) {
  const c = tintedAnimal(getArt().animals[animal] ?? null, color, 96);
  const img = document.createElement('img');
  img.className = 'edit-row__thumb';
  img.alt = '';
  img.src = c.toDataURL();
  return img;
}

function tierThumb(tier) {
  const img = document.createElement('img');
  img.className = 'edit-row__thumb';
  img.alt = '';
  if (PRIZE_URLS[tier]) img.src = PRIZE_URLS[tier];
  return img;
}

// 展開在那一列下面的一排選項
function pickerRow(options) {
  const li = document.createElement('li');
  li.className = 'picker-row';
  li.append(...options);
  return li;
}

document.addEventListener('click', e => {
  if (!openPicker || e.target.closest('.picker-row, .edit-row__pick')) return;
  openPicker = null;
  renderPlayers();
  renderPrizes();
});
```

`renderPlayers` 的 map 改成回傳陣列(列 + 可能的選擇器列),最後 `.flat()`:

```js
  $('playerList').replaceChildren(...draft.players.flatMap((p, i) => {
    const li = document.createElement('li');
    li.className = 'edit-row';
    const dot = document.createElement('span');
    dot.className = 'edit-row__dot';
    dot.style.background = p.color;
    const pick = pickButton(`${p.name || '玩家'}的動物:${ANIMAL_LABEL[p.animal]}`, animalThumb(p.animal, p.color), () => {
      openPicker = openPicker?.kind === 'animal' && openPicker.index === i ? null : { kind: 'animal', index: i };
      renderPlayers();
    });
    const name = document.createElement('input');
    name.className = 'field__input edit-row__name';
    name.value = p.name;
    name.maxLength = 10;
    name.addEventListener('input', () => { draft.players[i].name = name.value; });
    const del = document.createElement('button');
    del.className = 'chip chip--danger';
    del.type = 'button';
    del.textContent = '刪';
    del.addEventListener('click', () => { draft.players.splice(i, 1); openPicker = null; renderPlayers(); });
    li.append(dot, pick, name, del);
    if (openPicker?.kind !== 'animal' || openPicker.index !== i) return [li];
    return [li, pickerRow(ANIMALS.map(a => {
      const b = pickButton(ANIMAL_LABEL[a], animalThumb(a, p.color), () => {
        draft.players[i].animal = a;
        openPicker = null;
        renderPlayers();
      });
      b.classList.toggle('is-current', a === p.animal);
      return b;
    }))];
  }));
```

`renderPrizes` 同樣改成 `flatMap`,列裡在 `name` 前加等級鈕,選擇器列附文字:

```js
    const pick = pickButton(`${p.name || '獎項'}的等級:${TIER_LABEL[p.tier]}`, tierThumb(p.tier), () => {
      openPicker = openPicker?.kind === 'tier' && openPicker.index === i ? null : { kind: 'tier', index: i };
      renderPrizes();
    });
    // …name / count / del 不變,del 的 click 裡加 openPicker = null…
    li.append(pick, name, count, del);
    if (openPicker?.kind !== 'tier' || openPicker.index !== i) return [li];
    return [li, pickerRow(TIERS.map(t => {
      const label = document.createElement('span');
      label.className = 'picker-row__label';
      label.textContent = TIER_LABEL[t];
      const wrap = document.createElement('span');
      wrap.className = 'picker-row__opt';
      wrap.append(tierThumb(t), label);
      const b = pickButton(TIER_LABEL[t], wrap, () => {
        draft.prizes[i].tier = t;
        openPicker = null;
        renderPrizes();
      });
      b.classList.toggle('is-current', t === p.tier);
      return b;
    }))];
```

`addPlayerBtn` 的 push 改成:

```js
  draft.players.push(createPlayer({ name: `玩家${draft.players.length + 1}`, color: pickColor(draft.players), animal: pickAnimal(draft.players) }));
```

`snapshot()` 開頭加 `openPicker = null;`。檔尾最後一行 `render();` 改成:

```js
await loadArt();
render();
```

(main.js 是 `type="module"`,top-level await 可用;`loadArt` 不會 reject。)

- [ ] **Step 4: 樣式**(`ghostleg/css/ghostleg.css`,接在 `.edit-row__dot` 後面)

```css
/* 動物 / 等級選擇器(2026-10-02):點小圖在那一列下面展開一排選項 */
.edit-row__pick {
  flex: none;
  width: 48px;
  height: 48px;
  padding: 2px;
  display: grid;
  place-items: center;
  border: 3px solid var(--ink);
  border-radius: 12px;
  background: #EAF5FC;
  cursor: pointer;
}
.edit-row__pick.is-current { outline: 3px solid var(--sun); outline-offset: 1px; }
.edit-row__thumb { max-width: 100%; max-height: 100%; object-fit: contain; pointer-events: none; }
.picker-row {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  padding: 6px;
  border-radius: 14px;
  background: var(--cream-deep);
}
.picker-row__opt { display: grid; justify-items: center; gap: 2px; }
.picker-row__label { font-size: 12px; font-weight: 700; }
.picker-row .edit-row__pick:has(.picker-row__opt) { width: 64px; height: 64px; }
```

- [ ] **Step 5: 跑測試確認通過**:`node --test test/*.test.js` 全部 PASS

- [ ] **Step 6: 瀏覽器驗證**

repo 根目錄 `python3 -m http.server 8765`(已開就不用),Chrome 開 `http://localhost:8765/ghostleg/`(先 `fetch(..., {cache:'reload'})` 重抓 `ghostleg/js/*.js`、`ghostleg/css/ghostleg.css`)。
- 設定 →「誰要抽」:每列是 色點 → 暫代小人(玩家色)→ 名字 → 刪;點小人展開 6 個、點一個會換、點外面會收
- 「抽什麼」:每列 等級鈕 → 名稱 → 數量 → 刪;展開三選一有「一般 / 大獎 / 頭獎」字(圖還沒做,先是空框)
- 確定後重開設定,選的動物 / 等級還在;重新整理頁面也還在
- 390 寬 iframe 量:`row.getBoundingClientRect().width <= list.getBoundingClientRect().width`、`.dialog__body` 沒有橫向捲動(`scrollWidth === clientWidth`)
- 新增玩家:第 7 個人拿到的是最少人用的動物

- [ ] **Step 7: Commit**

```bash
git add ghostleg/js/main.js ghostleg/css/ghostleg.css test/ghostleg-art.test.js
git commit -m "feat(ghostleg): pick each player's animal and each prize's tier in settings"
```

### Task 5: ⏸ Checkpoint 1 —— 給使用者看

- [ ] 截圖:390 寬「誰要抽」(展開一個動物選擇器)、「抽什麼」(展開等級選擇器);1440 寬同兩張
- [ ] 用 SendUserFile 傳圖,說明:暫代小人、等級圖之後才換;**停下來等使用者回覆**,有意見先改再往下

---

## 階段二:場景

### Task 6: 緞帶折線與雪路寬度(純函式)

**Files:**
- Create: `ghostleg/js/ribbon.js`
- Test: `test/ghostleg-scene.test.js`

**Interfaces:**
- Produces(座標都是世界 xz,`{x, z}`):
  - `snowWidth(laneW) → laneW * 0.3`、`ribbonWidth(laneW) → laneW * 0.17`
  - `offsetRoute(pts, off) → pts`:水平段(z 相同)依前進方向偏移 —— 往 +x 走的整段 z += off(偏前,靠鏡頭),往 −x 走的 z −= off;頂點跟著相鄰的水平段一起偏
  - `roundCorners(pts, radius, steps = 6) → pts`:每個轉角換成圓弧(半徑不超過相鄰兩段各一半長),起點終點不動
  - `cutAt(pts, dist) → pts`:沿折線只取到 `dist` 為止(最後一點內插)
  - `pathLength(pts) → number`
  - `stripData(pts, width, y) → { position: number[], index: number[] }`:沿折線左右各 width/2 的平面帶子

- [ ] **Step 1: 寫失敗的測試**(`test/ghostleg-scene.test.js`)

```js
// 阿彌陀籤場景的純計算:緞帶折線、名牌、亂飛、鏡頭。three 物件在瀏覽器驗。
import test from 'node:test';
import assert from 'node:assert/strict';
import { snowWidth, ribbonWidth, offsetRoute, roundCorners, cutAt, pathLength, stripData } from '../ghostleg/js/ribbon.js';

const close = (a, b, eps = 1e-6) => Math.abs(a - b) < eps;

test('雪路 / 緞帶寬度跟著車道寬縮放(40 人時 0.34)', () => {
  assert.ok(close(snowWidth(1), 0.3));
  assert.ok(close(snowWidth(0.34), 0.102));
  assert.ok(ribbonWidth(0.34) < snowWidth(0.34));
});

test('offsetRoute:往右走的橫段偏前(+z),往左走的偏後(−z),直段 x 不變', () => {
  const right = offsetRoute([{ x: 0, z: 0 }, { x: 0, z: -2 }, { x: 1, z: -2 }, { x: 1, z: -4 }], 0.1);
  assert.deepEqual(right.map(p => [p.x, +p.z.toFixed(3)]), [[0, 0], [0, -1.9], [1, -1.9], [1, -4]]);
  const left = offsetRoute([{ x: 1, z: 0 }, { x: 1, z: -2 }, { x: 0, z: -2 }, { x: 0, z: -4 }], 0.1);
  assert.deepEqual(left.map(p => [p.x, +p.z.toFixed(3)]), [[1, 0], [1, -2.1], [0, -2.1], [0, -4]]);
});

test('同一根橫槓上兩個人的緞帶分在兩側,不重疊', () => {
  const a = offsetRoute([{ x: 0, z: 0 }, { x: 0, z: -2 }, { x: 1, z: -2 }, { x: 1, z: -4 }], 0.1);
  const b = offsetRoute([{ x: 1, z: 0 }, { x: 1, z: -2 }, { x: 0, z: -2 }, { x: 0, z: -4 }], 0.1);
  assert.ok(Math.abs(a[1].z - b[1].z) >= 0.2 - 1e-9);
});

test('roundCorners:起終點不動,相鄰兩段方向變化每步 < 25°', () => {
  const pts = roundCorners([{ x: 0, z: 0 }, { x: 0, z: -2 }, { x: 1, z: -2 }, { x: 1, z: -4 }], 0.2, 6);
  assert.deepEqual(pts[0], { x: 0, z: 0 });
  assert.deepEqual(pts.at(-1), { x: 1, z: -4 });
  for (let i = 1; i < pts.length - 1; i++) {
    const a = Math.atan2(pts[i].z - pts[i - 1].z, pts[i].x - pts[i - 1].x);
    const b = Math.atan2(pts[i + 1].z - pts[i].z, pts[i + 1].x - pts[i].x);
    let d = Math.abs(b - a); if (d > Math.PI) d = 2 * Math.PI - d;
    assert.ok(d < (25 * Math.PI) / 180, `第 ${i} 點轉了 ${(d * 180 / Math.PI).toFixed(1)}°`);
  }
});

test('roundCorners:半徑不超過相鄰兩段的一半(短橫段不會被圓弧吃穿)', () => {
  const pts = roundCorners([{ x: 0, z: 0 }, { x: 0, z: -1 }, { x: 0.2, z: -1 }, { x: 0.2, z: -2 }], 5, 6);
  for (const p of pts) assert.ok(p.x >= -1e-9 && p.x <= 0.2 + 1e-9);
});

test('cutAt:只取到 dist;dist 0 只剩起點;超過全長就是整條', () => {
  const pts = [{ x: 0, z: 0 }, { x: 0, z: -2 }, { x: 1, z: -2 }];
  assert.ok(close(pathLength(cutAt(pts, 2.5)), 2.5));
  assert.equal(cutAt(pts, 0).length, 1);
  assert.ok(close(pathLength(cutAt(pts, 99)), 3));
});

test('stripData:每點左右各一個頂點,寬度正確', () => {
  const { position, index } = stripData([{ x: 0, z: 0 }, { x: 0, z: -2 }], 0.2, 0.1);
  assert.equal(position.length, 4 * 3);
  assert.equal(index.length, 6);
  assert.ok(close(Math.abs(position[0] - position[3]), 0.2));
  assert.ok(close(position[1], 0.1));
});
```

- [ ] **Step 2: 跑測試確認失敗**:`node --test test/ghostleg-scene.test.js` → FAIL(模組不存在)

- [ ] **Step 3: 實作 `ghostleg/js/ribbon.js`**

```js
// 緞帶軌跡的折線計算(2026-10-02 改版)。不碰 three,node 測得到。
//
// 路線來自 race.js pathOf → track.js toWorld:每段都跟座標軸平行,
// 而且水平段只有一格、不會兩段水平相連(同一列不會有相鄰橫槓)。
// 一根橫槓會被兩個人走過(一個往左、一個往右)—— 依前進方向偏到兩側,緞帶才會並排、不互相蓋掉。

export const snowWidth = laneW => laneW * 0.3;
export const ribbonWidth = laneW => laneW * 0.17;

export function offsetRoute(pts, off) {
  const out = pts.map(p => ({ ...p }));
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    if (a.z !== b.z || a.x === b.x) continue;
    const dz = b.x > a.x ? off : -off;   // 往右偏前(+z,靠鏡頭)、往左偏後
    out[i - 1].z = a.z + dz;
    out[i].z = b.z + dz;
  }
  return out;
}

export function pathLength(pts) {
  let total = 0;
  for (let i = 1; i < pts.length; i++) total += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z);
  return total;
}

export function roundCorners(pts, radius, steps = 6) {
  if (pts.length < 3) return pts.map(p => ({ ...p }));
  const out = [{ ...pts[0] }];
  for (let i = 1; i < pts.length - 1; i++) {
    const p = pts[i - 1];
    const c = pts[i];
    const n = pts[i + 1];
    const l1 = Math.hypot(c.x - p.x, c.z - p.z);
    const l2 = Math.hypot(n.x - c.x, n.z - c.z);
    const r = Math.min(radius, l1 / 2, l2 / 2);
    if (r <= 1e-9) { out.push({ ...c }); continue; }
    const a = { x: c.x + ((p.x - c.x) / l1) * r, z: c.z + ((p.z - c.z) / l1) * r };
    const b = { x: c.x + ((n.x - c.x) / l2) * r, z: c.z + ((n.z - c.z) / l2) * r };
    // 二次貝茲(控制點 = 轉角):直角時就是很接近圓弧的弧線
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      const u = 1 - t;
      out.push({ x: u * u * a.x + 2 * u * t * c.x + t * t * b.x, z: u * u * a.z + 2 * u * t * c.z + t * t * b.z });
    }
  }
  out.push({ ...pts.at(-1) });
  return out;
}

export function cutAt(pts, dist) {
  const out = [{ ...pts[0] }];
  let left = Math.max(0, dist);
  for (let i = 1; i < pts.length && left > 0; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    const len = Math.hypot(b.x - a.x, b.z - a.z);
    if (len <= left) { out.push({ ...b }); left -= len; continue; }
    const k = left / len;
    out.push({ x: a.x + (b.x - a.x) * k, z: a.z + (b.z - a.z) * k });
    left = 0;
  }
  return out;
}

export function stripData(pts, width, y) {
  const position = [];
  const index = [];
  const half = width / 2;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[Math.max(0, i - 1)];
    const b = pts[Math.min(pts.length - 1, i + 1)];
    let dx = b.x - a.x;
    let dz = b.z - a.z;
    const len = Math.hypot(dx, dz) || 1;
    dx /= len; dz /= len;
    // 法線 = 方向轉 90°
    position.push(pts[i].x - dz * half, y, pts[i].z + dx * half, pts[i].x + dz * half, y, pts[i].z - dx * half);
    if (i > 0) {
      const k = (i - 1) * 2;
      index.push(k, k + 1, k + 2, k + 1, k + 3, k + 2);
    }
  }
  return { position, index };
}
```

- [ ] **Step 4: 跑測試確認通過**:`node --test test/*.test.js` 全部 PASS

- [ ] **Step 5: Commit**

```bash
git add ghostleg/js/ribbon.js test/ghostleg-scene.test.js
git commit -m "feat(ghostleg): ribbon path maths — side offsets on shared rungs, rounded corners"
```

### Task 7: 名牌、亂飛、閒置迴圈(純函式)

**Files:**
- Create: `ghostleg/js/labels.js`, `ghostleg/js/prize-motion.js`
- Test: `test/ghostleg-scene.test.js`

**Interfaces:**
- Produces:
  - `tagLift(lane, lanes) → number`:`lanes <= 8` 時 0;否則奇數車道 1、偶數 0(乘上名牌高度由呼叫端決定)
  - `tagFontSize(name) → number`:≤4 字 30、5–7 字 26、8 字以上 22(px,畫在 canvas 上)
  - `wanderOffset(i, tSec, spanX) → { x, y, z, rot }`:每個獎品自己的頻率;|x| ≤ spanX·0.6、|y| ≤ 0.6、|z| ≤ 0.9、|rot| ≤ 0.35
  - `createIdleLoop(step: (tSec) => void, raf = requestAnimationFrame, caf = cancelAnimationFrame) → { start(), stop(), running: boolean }`

- [ ] **Step 1: 寫失敗的測試**(加在 `test/ghostleg-scene.test.js`)

```js
import { tagLift, tagFontSize } from '../ghostleg/js/labels.js';
import { wanderOffset, createIdleLoop } from '../ghostleg/js/prize-motion.js';

test('tagLift:8 人以內不錯開;超過 8 人相鄰一高一低', () => {
  assert.deepEqual([0, 1, 2, 3].map(l => tagLift(l, 8)), [0, 0, 0, 0]);
  assert.deepEqual([0, 1, 2, 3].map(l => tagLift(l, 9)), [0, 1, 0, 1]);
});

test('tagFontSize:名字越長字越小(最多 10 字)', () => {
  assert.equal(tagFontSize('小紅'), 30);
  assert.equal(tagFontSize('五個字名字'), 26);
  assert.equal(tagFontSize('十個字的名字一二三四'), 22);
});

test('wanderOffset:有在動、而且每個獎品不一樣、幅度有上限', () => {
  const a0 = wanderOffset(0, 0, 3), a1 = wanderOffset(0, 1.3, 3), b0 = wanderOffset(1, 0, 3);
  assert.notDeepEqual(a0, a1);
  assert.notDeepEqual(a0, b0);
  for (let t = 0; t < 30; t += 0.37) for (let i = 0; i < 12; i++) {
    const o = wanderOffset(i, t, 3);
    assert.ok(Math.abs(o.x) <= 1.8 + 1e-9 && Math.abs(o.y) <= 0.6 + 1e-9 && Math.abs(o.z) <= 0.9 + 1e-9 && Math.abs(o.rot) <= 0.35 + 1e-9);
  }
});

test('createIdleLoop:start 之後每格呼叫 step;stop 之後不再呼叫(按開始時一定要停)', () => {
  const queue = [];
  const calls = [];
  const loop = createIdleLoop(t => calls.push(t), cb => { queue.push(cb); return queue.length; }, () => { queue.length = 0; });
  loop.start();
  queue.shift()(1000);
  queue.shift()(1100);
  assert.deepEqual(calls, [1, 1.1]);
  loop.stop();
  assert.equal(loop.running, false);
  assert.equal(queue.length, 0);
  loop.start();
  loop.start();   // 重複 start 不會排兩條
  assert.equal(queue.length, 1);
});
```

- [ ] **Step 2: 跑測試確認失敗**:`node --test test/ghostleg-scene.test.js` → FAIL

- [ ] **Step 3: 實作 `ghostleg/js/labels.js`**

```js
// 頭上名牌的排版。名字才是識別(顏色會重複、有人分不出紅綠),所以名牌一定要讀得到。

// 人多的時候車道變窄,名牌會疊成一排 —— 相鄰的一高一低錯開。8 人以內車道寬是固定的,不用錯。
export function tagLift(lane, lanes) {
  return lanes > 8 && lane % 2 === 1 ? 1 : 0;
}

// 名字最多 10 字(設定裡 maxLength = 10),長的縮字,不要撐爆名牌
export function tagFontSize(name) {
  const n = [...name].length;
  return n <= 4 ? 30 : n <= 7 ? 26 : 22;
}
```

- [ ] **Step 4: 實作 `ghostleg/js/prize-motion.js`**

```js
// 獎品開跑前在上空亂飛(2026-10-02:使用者要的是「亂飛」,不是只有上下浮)。
// 每個獎品用自己的一組頻率,所以不會排隊一起動。飛向終點時由 track.js 把幅度乘上 (1 − 進度)。
export function wanderOffset(i, tSec, spanX) {
  const s = i * 1.7 + 0.3;
  return {
    x: Math.sin(tSec * (0.7 + (i % 3) * 0.23) + s) * spanX * 0.6,
    y: Math.sin(tSec * (1.3 + (i % 2) * 0.4) + s * 2) * 0.6,
    z: Math.cos(tSec * (0.9 + (i % 4) * 0.17) + s) * 0.9,
    rot: Math.sin(tSec * 1.1 + s) * 0.35,
  };
}

// 閒置時的繪製迴圈。開跑時一定要 stop —— 兩條 rAF 同時畫,獎品會一格在亂飛、一格在飛向終點,看起來在抖。
// 分頁切到背景時瀏覽器本來就會暫停 rAF,不用另外處理。
export function createIdleLoop(step, raf = requestAnimationFrame, caf = cancelAnimationFrame) {
  let id = 0;
  const loop = {
    running: false,
    start() {
      if (loop.running) return;
      loop.running = true;
      const tick = now => {
        if (!loop.running) return;
        step(now / 1000);
        id = raf(tick);
      };
      id = raf(tick);
    },
    stop() {
      loop.running = false;
      caf(id);
    },
  };
  return loop;
}
```

- [ ] **Step 5: 跑測試確認通過**:`node --test test/*.test.js` 全部 PASS

- [ ] **Step 6: Commit**

```bash
git add ghostleg/js/labels.js ghostleg/js/prize-motion.js test/ghostleg-scene.test.js
git commit -m "feat(ghostleg): name-tag stagger and sizing, prize wander, idle loop"
```

### Task 8: 開跑前的鏡頭構圖

**Files:**
- Modify: `ghostleg/js/camera-script.js`
- Test: `test/ghostleg-scene.test.js`

**Interfaces:**
- Produces: `export function idleFrame({ lanes, laneWidth, rows, rowDepth, aspect, fov = 48 }) → { pos: [x,y,z], look: [x,y,z] }`;`createCameraScript` 的 SHOW 段起點改成 `idleFrame`(所以 `script(0, [])` = 開跑前畫面)
- 冰板寬 = `lanes * laneWidth + 1.8`(跟 Task 9 的 `buildBoard` 同一個式子 —— 改一邊兩邊都要改,兩邊都引用 `boardWidth`)
- 另外匯出 `boardWidth(lanes, laneWidth)` 給 `scene-parts.js` 用

- [ ] **Step 1: 寫失敗的測試**

```js
import { idleFrame, boardWidth } from '../ghostleg/js/camera-script.js';

// 冰板中心那條橫線在畫面上的寬度比例(透視投影,水平視角由垂直 fov 與 aspect 算)
function widthRatio(f, { lanes, laneWidth, aspect, fov = 48 }) {
  const [px, py, pz] = f.pos, [lx, ly, lz] = f.look;
  const d = Math.hypot(lx - px, ly - py, lz - pz);
  const hfov = 2 * Math.atan(Math.tan((fov * Math.PI) / 360) * aspect);
  return boardWidth(lanes, laneWidth) / (2 * d * Math.tan(hfov / 2));
}

for (const [lanes, lw, aspect] of [[6, 1, 390 / 640], [6, 1, 1440 / 700], [40, 0.34, 390 / 640], [40, 0.34, 1440 / 700]]) {
  test(`idleFrame:${lanes} 人、aspect ${aspect.toFixed(2)} 時冰板佔畫面寬約八成`, () => {
    const opts = { lanes, laneWidth: lw, rows: 12, rowDepth: 1.35, aspect };
    const r = widthRatio(idleFrame(opts), opts);
    assert.ok(r > 0.74 && r < 0.86, `佔 ${(r * 100).toFixed(0)}%`);
  });
}

test('idleFrame:鏡頭在起跑線後上方,往前下方看', () => {
  const f = idleFrame({ lanes: 6, laneWidth: 1, rows: 12, rowDepth: 1.35, aspect: 0.6 });
  assert.ok(f.pos[1] > f.look[1]);
  assert.ok(f.pos[2] > f.look[2]);
});
```

- [ ] **Step 2: 跑測試確認失敗**:`node --test test/ghostleg-scene.test.js` → FAIL(沒有 `idleFrame`)

- [ ] **Step 3: 實作**(`camera-script.js`,加在 `easeInOut` 之後)

```js
// 冰板寬度:車道總寬 + 兩側雪邊。scene-parts.js 的 buildBoard 用同一個式子。
export const boardWidth = (lanes, laneWidth) => lanes * laneWidth + 1.8;

// 開跑前的畫面(2026-10-02):鏡頭拉近,冰板約佔畫面寬八成 —— 原本整組縮在畫面中間一小塊。
// 以 35° 俯角看向起跑線前方一點,距離由「冰板寬 / 0.8 要剛好塞滿水平視角」反推。
const IDLE_PITCH = (35 * Math.PI) / 180;
export function idleFrame({ lanes, laneWidth, rowDepth, aspect, fov = 48 }) {
  const hfov = 2 * Math.atan(Math.tan((fov * Math.PI) / 360) * aspect);
  const d = boardWidth(lanes, laneWidth) / 0.8 / (2 * Math.tan(hfov / 2));
  const look = [0, laneWidth * 0.8, -rowDepth * 1.5];
  return { pos: [0, look[1] + d * Math.sin(IDLE_PITCH), look[2] + d * Math.cos(IDLE_PITCH)], look };
}
```

`createCameraScript` 裡 SHOW 段改成從 idleFrame 推到 showPos:

```js
  const idle = () => idleFrame({ lanes: ladder.lanes, laneWidth: w, rowDepth, aspect: camera.aspect });
```

```js
    if (elapsed < SHOW) {
      const k = easeInOut(elapsed / SHOW);
      const f = idle();
      place(between(f.pos, showPos(), k), between(f.look, showLook(), k));
      return { run: 0, fly: 0 };
    }
```

(刪掉原本 `// 開場先微微推近` 那行用的固定起點。)

- [ ] **Step 4: 跑測試確認通過**:`node --test test/*.test.js` 全部 PASS

- [ ] **Step 5: Commit**

```bash
git add ghostleg/js/camera-script.js test/ghostleg-scene.test.js
git commit -m "feat(ghostleg): idle camera frames the ice board at ~80% of the screen width"
```

### Task 9: 場景組裝(冰板、雪路、緞帶、立牌、名牌、獎品亂飛)

**Files:**
- Create: `ghostleg/js/scene-parts.js`
- Modify: `ghostleg/js/track.js`、`ghostleg/js/main.js`(閒置迴圈、`setPrizeFly(k, tSec)`)

**Interfaces:**
- Consumes: Task 3 `tintedAnimal` / `getArt` / `textColorFor`;Task 6 全部;Task 7 全部;Task 8 `boardWidth`
- Produces(`scene-parts.js`,全部回傳 `THREE.Object3D`):
  - `buildBoard({ lanes, laneWidth, rows, rowDepth, image })`(image 為 null 時用平塗冰藍 `#BFE1F7`)
  - `buildSnowPaths(segments: [x0,z0,x1,z1][], laneWidth)`
  - `buildStandee(player, laneWidth, image)`:`Group`,含 `userData.sprite`
  - `buildNameTag(player, laneWidth, lane, lanes)`:`Sprite`,`userData.lift` = 交錯時多抬的高度
  - `buildPrizeSprite(slot, laneWidth, prizes)`:`Sprite`(`prizes` = `getArt().prizes`;空格用 `prizes.snow` 且尺寸 ×0.7)
  - `ribbonGeometry(route, dist, laneWidth) → THREE.BufferGeometry`
- `track.setPrizeFly(k, tSec = 0)`:k 0→1 飛向終點,亂飛幅度 `1 − e`

- [ ] **Step 1: 建 `ghostleg/js/scene-parts.js`**

```js
// 阿彌陀籤場景裡的 three 物件(2026-10-02 改版)。一律平塗、不打光。
// 計算都在 ribbon.js / labels.js / prize-motion.js / camera-script.js(node 測得到),這裡只負責變成網格。
import * as THREE from 'three';
import { snowWidth, ribbonWidth, offsetRoute, roundCorners, cutAt, stripData } from './ribbon.js';
import { tagLift, tagFontSize } from './labels.js';
import { tintedAnimal, textColorFor } from './tint.js';
import { boardWidth } from './camera-script.js';

const INK = 0x574239;
export const SNOW_H = 0.1;
const RIM = 0.07;

const canvasTexture = c => { const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; };
const sprite = (tex, w, h) => {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
  s.scale.set(w, h, 1);
  return s;
};

export function buildBoard({ lanes, laneWidth, rows, rowDepth, image }) {
  const far = -rows * rowDepth;
  const w = boardWidth(lanes, laneWidth);
  const d = -far + 3.2 + rowDepth;
  const mat = image
    ? new THREE.MeshBasicMaterial({ map: (() => { const t = new THREE.Texture(image); t.colorSpace = THREE.SRGBColorSpace; t.needsUpdate = true; return t; })() })
    : new THREE.MeshBasicMaterial({ color: 0xBFE1F7 });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat);
  m.rotation.x = -Math.PI / 2;
  m.position.set(0, -0.02, far / 2 - rowDepth * 0.2);
  m.renderOrder = -2;
  return m;
}

// 雪路:每段梯線兩層 —— 底下深棕外框(寬一圈、矮一點),上面白雪頂(側面淡藍)
export function buildSnowPaths(segments, laneWidth) {
  const g = new THREE.Group();
  const sw = snowWidth(laneWidth);
  const rim = new THREE.MeshBasicMaterial({ color: INK });
  const top = new THREE.MeshBasicMaterial({ color: 0xFFFFFF });
  const side = new THREE.MeshBasicMaterial({ color: 0xDCEBF7 });
  for (const [x0, z0, x1, z1] of segments) {
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    const lx = Math.abs(x1 - x0), lz = Math.abs(z1 - z0);
    const o = new THREE.Mesh(new THREE.BoxGeometry(lx + sw + RIM * 2, SNOW_H * 0.6, lz + sw + RIM * 2), rim);
    o.position.set(cx, SNOW_H * 0.3, cz);
    const t = new THREE.Mesh(new THREE.BoxGeometry(lx + sw, SNOW_H, lz + sw), [side, side, top, side, side, side]);
    t.position.set(cx, SNOW_H / 2, cz);
    g.add(o, t);
  }
  return g;
}

export function ribbonGeometry(route, dist, laneWidth) {
  const rw = ribbonWidth(laneWidth);
  const pts = cutAt(roundCorners(offsetRoute(route.pts, rw * 0.55), laneWidth * 0.15), dist);
  const geo = new THREE.BufferGeometry();
  if (pts.length < 2) return geo;
  const { position, index } = stripData(pts, rw, SNOW_H + 0.02);
  geo.setAttribute('position', new THREE.Float32BufferAttribute(position, 3));
  geo.setIndex(index);
  return geo;
}

// 桌遊立牌:染色動物(billboard)+ 玩家色小圓座(外圈深棕)
export function buildStandee(player, laneWidth, image) {
  const g = new THREE.Group();
  const c = tintedAnimal(image, player.color, 256);
  const h = laneWidth * 1.2;
  const s = sprite(canvasTexture(c), h * (c.width / c.height), h);
  s.center.set(0.5, 0);           // 腳踩在底座上
  s.position.y = SNOW_H + 0.06;
  const r = laneWidth * 0.3;
  const rimDisk = new THREE.Mesh(new THREE.CylinderGeometry(r * 1.12, r * 1.12, 0.05, 28), new THREE.MeshBasicMaterial({ color: INK }));
  rimDisk.position.y = SNOW_H + 0.025;
  const disk = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.06, 28), new THREE.MeshBasicMaterial({ color: new THREE.Color(player.color) }));
  disk.position.y = SNOW_H + 0.04;
  g.add(rimDisk, disk, s);
  g.userData.sprite = s;
  return g;
}

// 名牌:玩家色底、字色依亮度;人多時相鄰一高一低(tagLift)
export function buildNameTag(player, laneWidth, lane, lanes) {
  const c = document.createElement('canvas');
  c.width = 300; c.height = 72;
  const ctx = c.getContext('2d');
  ctx.font = `700 ${tagFontSize(player.name)}px system-ui, -apple-system, "PingFang TC", "Noto Sans TC", sans-serif`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const tw = Math.min(280, ctx.measureText(player.name).width);
  const x = 150 - tw / 2 - 14, w = tw + 28;
  ctx.beginPath(); ctx.roundRect(x, 8, w, 56, 28);
  ctx.fillStyle = player.color; ctx.fill();
  ctx.lineWidth = 6; ctx.strokeStyle = '#574239'; ctx.stroke();
  ctx.fillStyle = textColorFor(player.color);
  ctx.fillText(player.name, 150, 37, 270);
  const s = sprite(canvasTexture(c), laneWidth * 1.3, laneWidth * 0.31);
  s.userData.lift = tagLift(lane, lanes) * laneWidth * 0.34;
  return s;
}

export function buildPrizeSprite(slot, laneWidth, prizes) {
  const empty = slot.prizeId === null;
  const img = empty ? prizes.snow : prizes[slot.tier ?? 'plain'];
  const size = laneWidth * 1.05 * (empty ? 0.7 : 1);
  if (!img) return sprite(new THREE.Texture(), size, size);   // 圖載不到:透明,名字還在名牌上
  const t = new THREE.Texture(img); t.colorSpace = THREE.SRGBColorSpace; t.needsUpdate = true;
  return sprite(t, size * (img.width / img.height), size);
}
```

- [ ] **Step 2: 改 `track.js`**

- import 改成:`import { pathOf } from './race.js'; import { getArt } from './art.js'; import { buildBoard, buildSnowPaths, ribbonGeometry, buildStandee, buildNameTag, buildPrizeSprite, SNOW_H } from './scene-parts.js'; import { wanderOffset } from './prize-motion.js';`
- 刪掉:`TRAIL_W`、`TRAIL_H`、`LINE`、`playerTexture`、`slotTexture`、`trailGeometry`、`roundRect`、`labelled`(名牌改由 `buildNameTag` 畫)
- `build(r)` 裡:
  - 直線與橫槓改成收集 `segments`(`[x0, z0, x1, z1]`),`world.add(buildBoard({ lanes, laneWidth: w, rows: ladder.rows, rowDepth: ROW_D, image: getArt().board }), buildSnowPaths(segments, w))`
  - `r.trails` 每個 mesh 的材質不變(`MeshBasicMaterial({ color: p.color, side: DoubleSide })`)
  - `r.runners = players.map((p, lane) => { const s = buildStandee(p, w, getArt().animals[p.animal] ?? null); s.position.set(laneX(lane, lanes, w), 0, 0); world.add(s); return s; })`
  - `r.tags = players.map((p, lane) => { const t = buildNameTag(p, w, lane, lanes); world.add(t); return t; })`
  - `r.prizes = slots.map(slot => { const s = buildPrizeSprite(slot, w, getArt().prizes); world.add(s); return s; })`
  - 影子保留,半徑 `w * 0.34`
- `setProgress(t)`:`round.trails[i].geometry = ribbonGeometry(route, eased * route.total, laneWidth(round.ladder.lanes))`;立牌 `runners[i].position.x/z = p.x/z`;名牌 `tags[i].position.set(p.x, SNOW_H + w * 1.45 + tags[i].userData.lift, p.z)`(`w = laneWidth(lanes)`)
- `setPrizeFly(k, tSec = 0)`:原本的 lerp + 弧線之後加

```js
      const amp = 1 - e;
      const o = wanderOffset(i, tSec, round.ladder.lanes * laneWidth(round.ladder.lanes) * 0.45);
      sprite.position.x += o.x * amp;
      sprite.position.y += o.y * amp;
      sprite.position.z += o.z * amp;
      sprite.material.rotation = o.rot * amp;
```

- [ ] **Step 3: 改 `main.js` 的閒置迴圈**

import 加 `import { createIdleLoop } from './prize-motion.js';`;在 `let current = null;` 下面:

```js
// 開跑前獎品在上空亂飛,要一直畫。start() 一開始就 stop,不然兩條 rAF 搶著畫。
const idle = createIdleLoop(tSec => { track.setPrizeFly(0, tSec); track.render(); });
```

- `showIdle()` 最後的 `track.setPrizeFly(0); track.render();` 換成 `idle.start();`
- `start()` 第一行 `if (running) return;` 之後加 `idle.stop();`
- `frame` 裡 `track.setPrizeFly(fly);` 改成 `track.setPrizeFly(fly, now / 1000);`
- `render()` 裡 `if (!ready) idle.stop();`(空狀態不用畫)

- [ ] **Step 4: 跑測試**:`node --test test/*.test.js` 全部 PASS(scene-parts.js 不在 node 測,import three)

- [ ] **Step 5: 瀏覽器驗證**(重抓 module 快取)
- 開跑前:冰板佔畫面寬約八成;獎品在上空左右繞、浮、晃;6 個暫代小人(玩家色)站在玩家色小圓座上,頭上玩家色名牌
- 錄一段假時鐘影片(開跑前 3 秒 + 開跑全程,12fps,ffmpeg 合成 mp4):獎品飛向終點時亂飛收斂、不抖;緞帶轉角是圓的;橫槓上兩條緞帶並排
- 40 人(設定裡加到 40):雪路沒有黏成一片、名牌一高一低沒有疊成一排、手機寬度下跑完全程不卡(Performance 面板看掉幀)
- 分頁切走再切回:演出照原本規則直接收尾;開跑前切走切回,亂飛繼續

- [ ] **Step 6: Commit**

```bash
git add ghostleg/js/scene-parts.js ghostleg/js/track.js ghostleg/js/main.js
git commit -m "feat(ghostleg): ice board, snow paths, ribbon trails, standees, name tags, prize wander"
```

### Task 10: ⏸ Checkpoint 2 —— 給使用者看

- [ ] 390 / 1440 各截:開跑前、跑到一半、跑完俯視;40 人開跑前與跑完;影片一支(6 人)
- [ ] SendUserFile 傳,**停下來等使用者回覆**

---

## 階段三:素材

### Task 11: 生成工具 `ghostleg.py`

**Files:**
- Create: `tools/mascot-gen/ghostleg.py`, `tools/mascot-gen/ghostleg_art.py`, `tools/mascot-gen/ghostleg_prompts.json`, `tools/mascot-gen/test_ghostleg_art.py`, `tools/mascot-gen/review/ghostleg.html`(review/ 是 gitignored,不 commit)
- Modify: `tools/mascot-gen/gashapon.py`(`write_preload_manifest`)、`test/preload-manifest.test.js`

**Interfaces:**
- 指令(repo 根目錄、`PY=tools/mascot-gen/.venv/bin/python`、`COMFY_URL=http://192.168.68.53:8188`):
  - `$PY tools/mascot-gen/ghostleg.py gen <animal> [--seeds a,b,c]` → `out/ghostleg/<animal>/s{1,2,3}.png`
  - `$PY tools/mascot-gen/ghostleg.py review` → `review/ghostleg/<animal>/s*.png`(去背 + 用 6 種玩家色各染一份並排)
  - `$PY tools/mascot-gen/ghostleg.py pick <animal> <n>`
  - `$PY tools/mascot-gen/ghostleg.py build` → `ghostleg/img/animals/*.webp`、`ghostleg/img/prizes/*.webp`、`ghostleg/img/board.webp`,把網址蓋進 `ghostleg/js/art.js`,重產 `preload.json`
- `ghostleg_art.cut_white(rgb) → rgba`(白底去背 = `key_border`)、`ghostleg_art.cut_green(rgb) → rgba`(綠幕 = `clear_green_fringe(key_border(rgb))` + `keep_largest`)、`ghostleg_art.fit_height(img, h) → img`(裁到不透明範圍、等比縮到高 h)

- [ ] **Step 1: 寫失敗的 Python 測試**(`tools/mascot-gen/test_ghostleg_art.py`)

```python
"""ghostleg_art 純函式。跑法:tools/mascot-gen/.venv/bin/python -m unittest discover tools/mascot-gen"""
import unittest

import numpy as np
from PIL import Image

from ghostleg_art import cut_white, cut_green, fit_height


def boxed(bg):
    a = np.zeros((100, 100, 3), np.uint8)
    a[:] = bg
    a[20:80, 30:70] = (87, 66, 57)      # 深棕外框
    a[25:75, 35:65] = (255, 255, 255)   # 白身體
    return a


class Cut(unittest.TestCase):
    def test_white_bg_becomes_transparent_but_white_body_inside_outline_stays(self):
        rgba = cut_white(boxed((255, 255, 255)))
        self.assertEqual(int(rgba[2, 2, 3]), 0)
        self.assertEqual(int(rgba[50, 50, 3]), 255, '外框裡的白身體不能被吃掉')

    def test_green_bg_becomes_transparent(self):
        rgba = cut_green(boxed((0, 255, 0)))
        self.assertEqual(int(rgba[2, 2, 3]), 0)
        self.assertEqual(int(rgba[50, 50, 3]), 255)

    def test_fit_height_crops_to_content(self):
        img = fit_height(Image.fromarray(cut_white(boxed((255, 255, 255)))), 120)
        self.assertEqual(img.height, 120)
        self.assertAlmostEqual(img.width / img.height, 40 / 60, delta=0.05)


if __name__ == '__main__':
    unittest.main()
```

- [ ] **Step 2: 跑確認失敗**:`tools/mascot-gen/.venv/bin/python -m unittest discover tools/mascot-gen` → `ModuleNotFoundError: ghostleg_art`

- [ ] **Step 3: 實作 `tools/mascot-gen/ghostleg_art.py`**

```python
"""阿彌陀籤素材的純函式(2026-10-02,issue #3)。"""
import numpy as np
from PIL import Image

from post import key_border, keep_largest
from gashapon_art import clear_green_fringe


def cut_white(rgb):
    """白底去背(z_image 生的獎品圖)。從邊緣往內填,深棕外框擋住,框內的白不會被吃。"""
    return key_border(rgb, tol=28.0)


def cut_green(rgb):
    """綠幕去背(Qwen 生的動物)。去掉綠邊、只留最大一塊。"""
    return keep_largest(clear_green_fringe(key_border(rgb)))


def fit_height(img, h):
    img = img.crop(img.getbbox())
    return img.resize((max(1, round(img.width * h / img.height)), h), Image.LANCZOS)
```

- [ ] **Step 4: 跑確認通過**:同 Step 2 指令 → OK

- [ ] **Step 5: `ghostleg_prompts.json`**

```json
{
  "animal_ref": "shared/img/mascot/key/idle.webp",
  "animal_style": "Draw a brand new character in exactly the same art style as <image1>: flat 2D cartoon, thick dark brown outlines, cute chibi proportions with the head about as big as the body. The whole body, head and limbs are filled with plain pure white, no other body colours, no shading, no blush, no pattern. Small solid dark brown dot eyes, mouth closed, not talking. Full body, standing upright, facing the viewer, centered, isolated on a solid flat bright pure green #00FF00 background. Do not draw the fox or the ermine from <image1>.",
  "snowman": "The character is a cute little snowman made of two round snowballs, a small round head on a bigger round body, two little stick arms, a tiny carrot-shaped nose drawn in white like the rest of the body.",
  "rabbit": "The character is a cute little rabbit with two long upright ears, a round fluffy tail.",
  "penguin": "The character is a cute little penguin with small flippers at its sides and two small feet.",
  "reindeer": "The character is a cute little reindeer with two small branching antlers and small round ears.",
  "cat": "The character is a cute little cat with two pointed ears and a long curled tail.",
  "dog": "The character is a cute little puppy with two floppy ears and a short wagging tail.",
  "picks": {
    "prizes": {"plain": "picked/prize-plain.png", "chest": "picked/prize-chest.png", "deluxe": "picked/prize-deluxe.png", "snow": "picked/prize-snow.png"},
    "board": "picked/board-ice.png"
  }
}
```

(`picked/` 相對於 `tools/mascot-gen/out/ghostleg/`,2026-10-02 已放好原圖。)

- [ ] **Step 6: `tools/mascot-gen/ghostleg.py`**

```python
"""阿彌陀籤素材(2026-10-02,issue #3)。

在 repo 根目錄執行(先 export COMFY_URL=http://<ComfyUI 那台的 IP>:8188):
  PY=tools/mascot-gen/.venv/bin/python
  $PY tools/mascot-gen/ghostleg.py gen rabbit            # Qwen-Image 照吉祥物畫風,3 個 seed → out/ghostleg/rabbit/s{1,2,3}.png
  $PY tools/mascot-gen/ghostleg.py review                # 去背 + 用 6 種玩家色染色並排 → 開 review/ghostleg.html
  $PY tools/mascot-gen/ghostleg.py pick rabbit 2
  $PY tools/mascot-gen/ghostleg.py build                 # 輸出 ghostleg/img/**.webp、蓋 ?v= 到 ghostleg/js/art.js、重產 preload.json
"""
import argparse
import json
import re
import sys
from pathlib import Path

import numpy as np
from PIL import Image

import comfy
from gashapon import webp, write_preload_manifest
from gashapon_art import content_hash
from ghostleg_art import cut_white, cut_green, fit_height

ROOT = Path(__file__).resolve().parents[2]
HERE = Path(__file__).resolve().parent
OUT = HERE / 'out' / 'ghostleg'
REVIEW = HERE / 'review' / 'ghostleg'
CFG = HERE / 'ghostleg_prompts.json'
IMG = ROOT / 'ghostleg' / 'img'
ART_JS = ROOT / 'ghostleg' / 'js' / 'art.js'
ANIMALS = ['snowman', 'rabbit', 'penguin', 'reindeer', 'cat', 'dog']
SEEDS = [11, 22, 33]
REVIEW_COLORS = ['#E4572E', '#4C9F70', '#3D7EA6', '#E8B830', '#8E6BBF', '#D96BA0']


def load_cfg():
    return json.loads(CFG.read_text())


def save_cfg(cfg):
    CFG.write_text(json.dumps(cfg, ensure_ascii=False, indent=2) + '\n')


def cmd_gen(args):
    cfg = load_cfg()
    ref_png = Image.open(ROOT / cfg['animal_ref']).convert('RGBA')
    flat = Image.new('RGB', ref_png.size, (0, 255, 0))
    flat.paste(ref_png, mask=ref_png.split()[3])
    import io
    buf = io.BytesIO(); flat.save(buf, 'PNG')
    ref = comfy.upload(buf.getvalue(), 'ghostleg_ref.png')
    seeds = [int(v) for v in args.seeds.split(',')] if args.seeds else SEEDS
    d = OUT / args.name
    d.mkdir(parents=True, exist_ok=True)
    for n, seed in enumerate(seeds, 1):
        imgs = comfy.run(comfy.graph_edit([ref], f'{cfg["animal_style"]} {cfg[args.name]}', seed, f'ghostleg_{args.name}_s{n}'))
        (d / f's{n}.png').write_bytes(comfy.fetch(imgs[0]))
        print(f'{args.name} s{n} seed={seed}', flush=True)


def tint(rgba, hex_color):
    """跟 ghostleg/js/tint.js 同一套:multiply 上玩家色,alpha 不變。"""
    c = np.array([int(hex_color[i:i + 2], 16) for i in (1, 3, 5)], np.float32) / 255
    out = rgba.copy()
    out[..., :3] = (rgba[..., :3].astype(np.float32) * c).round().astype(np.uint8)
    return out


def animal_cut(src):
    return fit_height(Image.fromarray(cut_green(np.asarray(Image.open(src).convert('RGB')))), 256)


def cmd_review(args):
    rows = []
    for name in ANIMALS:
        for src in sorted((OUT / name).glob('s*.png')):
            cut = np.asarray(animal_cut(src))
            for k, col in enumerate(REVIEW_COLORS):
                dst = REVIEW / name / f'{src.stem}_{k}.png'
                dst.parent.mkdir(parents=True, exist_ok=True)
                Image.fromarray(tint(cut, col)).save(dst)
            rows.append((name, src.stem))
    html = ['<!doctype html><meta charset=utf-8><body style="background:#BFE1F7;font:14px system-ui">']
    for name, stem in rows:
        imgs = ''.join(f'<img src="ghostleg/{name}/{stem}_{k}.png" style="height:120px">' for k in range(len(REVIEW_COLORS)))
        html.append(f'<div><b>{name} {stem}</b><br>{imgs}</div>')
    (REVIEW.parent / 'ghostleg.html').write_text('\n'.join(html))
    print('開 http://localhost:8765/tools/mascot-gen/review/ghostleg.html(先在 repo 根目錄 python3 -m http.server 8765)')


def cmd_pick(args):
    cfg = load_cfg()
    cfg.setdefault('picks', {}).setdefault('animals', {})[args.name] = args.n
    save_cfg(cfg)


def url_line(table, key, rel, digest):
    return f"  {key}: new URL('{rel}?v={digest}', import.meta.url).href,"


def cmd_build(args):
    cfg = load_cfg()
    picks = cfg['picks']
    animals = picks.get('animals', {})
    missing = [a for a in ANIMALS if a not in animals]
    if missing and not args.allow_missing:
        sys.exit(f'還沒 pick:{", ".join(missing)}(只想先輸出獎品 / 冰板就加 --allow-missing)')
    (IMG / 'animals').mkdir(parents=True, exist_ok=True)
    (IMG / 'prizes').mkdir(parents=True, exist_ok=True)
    animal_lines, prize_lines = [], []
    for a in ANIMALS:
        if a not in animals:
            continue
        path = IMG / 'animals' / f'{a}.webp'
        webp(animal_cut(OUT / a / f's{animals[a]}.png'), path, q=80)
        animal_lines.append(url_line('ANIMAL_URLS', a, f'../img/animals/{a}.webp', content_hash(path)))
    for tier, rel in picks['prizes'].items():
        path = IMG / 'prizes' / f'{tier}.webp'
        webp(fit_height(Image.fromarray(cut_white(np.asarray(Image.open(OUT / rel).convert('RGB')))), 256), path, q=80)
        prize_lines.append(url_line('PRIZE_URLS', tier, f'../img/prizes/{tier}.webp', content_hash(path)))
    board = IMG / 'board.webp'
    webp(Image.open(OUT / picks['board']).convert('RGB').resize((512, 896), Image.LANCZOS), board, q=78)
    text = ART_JS.read_text()
    text = re.sub(r'export const ANIMAL_URLS = \{[^}]*\};', 'export const ANIMAL_URLS = {\n' + '\n'.join(animal_lines) + '\n};', text)
    text = re.sub(r'export const PRIZE_URLS = \{[^}]*\};', 'export const PRIZE_URLS = {\n' + '\n'.join(prize_lines) + '\n};', text)
    text = re.sub(r"export const BOARD_URL = [^;]*;", f"export const BOARD_URL = new URL('../img/board.webp?v={content_hash(board)}', import.meta.url).href;", text)
    ART_JS.write_text(text)
    write_preload_manifest()
    print('ghostleg art done')


def main():
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest='cmd', required=True)
    g = sub.add_parser('gen'); g.add_argument('name', choices=ANIMALS); g.add_argument('--seeds')
    sub.add_parser('review')
    p = sub.add_parser('pick'); p.add_argument('name', choices=ANIMALS); p.add_argument('n', type=int)
    b = sub.add_parser('build'); b.add_argument('--allow-missing', action='store_true')
    args = ap.parse_args()
    {'gen': cmd_gen, 'review': cmd_review, 'pick': cmd_pick, 'build': cmd_build}[args.cmd](args)


if __name__ == '__main__':
    main()
```

- [ ] **Step 7: 預載清單加阿彌陀籤**

`tools/mascot-gen/gashapon.py` 的 `write_preload_manifest()`,在一番賞 card-art.js 那段後面加:

```python
    # 阿彌陀籤(2026-10-02):網址寫在 art.js 的 new URL('../img/…?v=…', import.meta.url)
    for m in re.finditer(r"""['"](\.\./img/[^'"]+\.webp\?v=[0-9a-f]{8})['"]""", (ROOT / 'ghostleg' / 'js' / 'art.js').read_text()):
        add('ghostleg/js', m.group(1))
```

`test/preload-manifest.test.js` 的 `gashaponRefs()` 同位置加:

```js
  // 阿彌陀籤(2026-10-02):網址寫在 ghostleg/js/art.js
  for (const m of read('ghostleg/js/art.js').matchAll(/['"](\.\.\/img\/[^'"]+\.webp\?v=[0-9a-f]{8})['"]/g)) add('ghostleg/js', m[1]);
```

並在 `test/ghostleg-art.test.js` 加:

```js
import { existsSync } from 'node:fs';
const artJs = readFileSync(new URL('../ghostleg/js/art.js', import.meta.url), 'utf8');

test('art.js 引用的圖都存在、網址都帶 8 碼雜湊', () => {
  const refs = [...artJs.matchAll(/new URL\('(\.\.\/img\/[^']+)'/g)].map(m => m[1]);
  for (const r of refs) {
    assert.match(r, /\?v=[0-9a-f]{8}$/, r);
    assert.ok(existsSync(new URL(`../ghostleg/js/${r.split('?')[0]}`, import.meta.url)), r);
  }
});
```

- [ ] **Step 8: 先輸出獎品與冰板**

```bash
PY=tools/mascot-gen/.venv/bin/python
$PY tools/mascot-gen/ghostleg.py build --allow-missing
ls -la ghostleg/img/prizes ghostleg/img/board.webp   # 每張 < 80 KB
node --test test/*.test.js                             # 全部 PASS(含 preload-manifest)
$PY -m unittest discover tools/mascot-gen              # OK
```

瀏覽器:設定「抽什麼」的等級鈕出現盒子圖;開跑前上空飛的是三種盒子與雪球(雪球比較小);冰板貼圖出現。

- [ ] **Step 9: Commit**

```bash
git add tools/mascot-gen/ghostleg.py tools/mascot-gen/ghostleg_art.py tools/mascot-gen/ghostleg_prompts.json tools/mascot-gen/test_ghostleg_art.py tools/mascot-gen/gashapon.py test/preload-manifest.test.js test/ghostleg-art.test.js ghostleg/img ghostleg/js/art.js gashapon/img/preload.json
git commit -m "feat(ghostleg): asset tool; prize boxes, snowball and ice board art, preloaded"
```

### Task 12: 生成 6 隻動物

- [ ] **Step 1**:`for a in snowman rabbit penguin reindeer cat dog; do $PY tools/mascot-gen/ghostleg.py gen $a; done`(每隻約 1 分鐘;失敗就單隻重跑)
- [ ] **Step 2**:`$PY tools/mascot-gen/ghostleg.py review`,開 `review/ghostleg.html` 自己先看一輪:畫風像不像吉祥物、身體是不是白的(染色才會對)、有沒有張嘴 / 多畫東西 / 兩條尾巴;不合格的換 seed 重生(`--seeds 44,55,66`)
- [ ] **Step 3**:把 review 頁截成一張圖(每隻 3 個候選 × 6 色)

### Task 13: ⏸ Checkpoint 3 —— 使用者挑動物

- [ ] SendUserFile 傳 review 截圖,請使用者每隻挑一張(例:雪人 2、兔子 1…);**停下來等回覆**
- [ ] 依回覆 `$PY tools/mascot-gen/ghostleg.py pick <animal> <n>` × 6,再 `$PY tools/mascot-gen/ghostleg.py build`
- [ ] `node --test test/*.test.js` PASS;瀏覽器:立牌換成正式動物、設定小圖也換了;`preload.json` 有 6 張動物
- [ ] Commit:

```bash
git add tools/mascot-gen/ghostleg_prompts.json ghostleg/img ghostleg/js/art.js gashapon/img/preload.json
git commit -m "feat(ghostleg): six player animals (user-picked)"
```

---

## 階段四:結果卡、空狀態

### Task 14: 結果卡

**Files:**
- Modify: `ghostleg/js/main.js`(`finish`)、`ghostleg/css/ghostleg.css`、`ghostleg/index.html`(`.results__head` 改成冰牌)
- Test: `test/ghostleg-art.test.js`

**Interfaces:**
- Consumes: `sortResults`(Task 1)、`tintedAnimal`、`getArt`、`PRIZE_URLS`

- [ ] **Step 1: 失敗的測試**

```js
test('結果卡用 sortResults 排序,每列有動物、名字、獎品圖、獎項名稱', () => {
  assert.match(mainJs, /sortResults\(round\.results\)/);
  for (const cls of ['results__animal', 'results__who', 'results__icon', 'results__prize']) assert.match(mainJs, new RegExp(cls));
  assert.match(mainJs, /results__item--deluxe/);
});
```

- [ ] **Step 2: 跑確認失敗**:`node --test test/ghostleg-art.test.js` → FAIL

- [ ] **Step 3: 改 `finish()`**:`const ordered = sortResults(round.results);`(取代原本的 sort),每列:

```js
    const p = byId.get(r.playerId);
    const tier = r.slot.prizeId === null ? 'snow' : r.slot.tier;
    const li = document.createElement('li');
    li.className = 'results__item'
      + (r.slot.prizeId === null ? ' results__item--empty' : '')
      + (tier === 'deluxe' ? ' results__item--deluxe' : '');
    const animal = document.createElement('img');
    animal.className = 'results__animal';
    animal.alt = '';
    animal.src = tintedAnimal(getArt().animals[p.animal] ?? null, p.color, 96).toDataURL();
    const who = document.createElement('span');
    who.className = 'results__who';
    who.textContent = p.name;
    const icon = document.createElement('img');
    icon.className = 'results__icon';
    icon.alt = '';
    if (PRIZE_URLS[tier]) icon.src = PRIZE_URLS[tier];
    const prize = document.createElement('span');
    prize.className = 'results__prize';
    prize.textContent = r.slot.name;
    li.append(animal, who, icon, prize);
    return li;
```

- [ ] **Step 4: 樣式**(取代 `.results` 到 `.results__item--empty` 那段)

```css
/* 結果卡(2026-10-02):冰雪框 + 冰牌標題;依等級排序,頭獎那列微微發光 */
.results {
  position: absolute;
  left: 50%;
  bottom: 0;
  translate: -50% 0;
  width: min(94vw, 440px);
  max-height: 76%;
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 26px 14px max(14px, env(safe-area-inset-bottom));
  box-sizing: border-box;
  border: var(--stroke) solid var(--ink);
  border-bottom: 0;
  border-radius: 26px 26px 0 0;
  background: linear-gradient(#F4FAFE, #DDEFFA);
  box-shadow: inset 0 0 0 4px #fff;
}
.results::before {   /* 框頂的積雪 */
  content: '';
  position: absolute;
  inset: -10px 18px auto;
  height: 22px;
  border: 4px solid var(--ink);
  border-radius: 999px;
  background: #fff;
}
.results__head {
  align-self: center;
  margin: -6px 0 0;
  padding: 4px 22px;
  border: 4px solid var(--ink);
  border-radius: 14px;
  background: #BFE1F7;
  font-size: 18px;
  position: relative;
}
.results__list { margin: 0; padding: 0 2px; list-style: none; overflow-y: auto; display: grid; gap: 6px; }
.results__item {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 48px;
  padding: 4px 10px;
  border-radius: 14px;
  background: #fff;
  border: 3px solid #C9E2F3;
  font-weight: 700;
}
.results__item--deluxe { border-color: #9FD3F5; box-shadow: 0 0 0 3px #fff, 0 0 16px 4px rgba(160, 215, 255, .9); }
.results__animal { flex: none; height: 40px; width: auto; }
.results__who { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.results__icon { flex: none; height: 34px; width: auto; }
.results__prize { flex: none; max-width: 40%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.results__item--empty { background: #F1F5F8; }
.results__item--empty .results__prize { opacity: .55; font-weight: 400; }
```

刪掉 `.results__dot` 規則。

- [ ] **Step 5: 跑測試**:`node --test test/*.test.js` PASS;瀏覽器 390 / 1440 跑完一局:排序對(頭獎在最上)、頭獎列發光、10 字名字不撐爆、40 人可捲動、「再跑一次」在卡片底部看得到

- [ ] **Step 6: Commit**

```bash
git add ghostleg/js/main.js ghostleg/css/ghostleg.css ghostleg/index.html test/ghostleg-art.test.js
git commit -m "feat(ghostleg): icy results card — animal, name, prize art, sorted by tier"
```

### Task 15: 空狀態

**Files:**
- Modify: `ghostleg/index.html`(`.empty-state__icon` 換成 `<div class="empty-scene" id="emptyScene">`)、`ghostleg/js/main.js`(`render()` 空狀態時畫)、`ghostleg/css/ghostleg.css`
- Test: `test/ghostleg-art.test.js`

- [ ] **Step 1: 失敗的測試**

```js
test('空狀態不再用 🪜,改成一塊小冰板 + 一隻立牌 + 一個空位', () => {
  const html = readFileSync(new URL('../ghostleg/index.html', import.meta.url), 'utf8');
  const empty = html.slice(html.indexOf('id="emptyState"'), html.indexOf('</div>', html.indexOf('id="emptyState"')) + 200);
  assert.ok(!/🪜/u.test(empty));
  assert.match(empty, /id="emptyScene"/);
  assert.match(mainJs, /empty-scene__seat--vacant/);
});
```

- [ ] **Step 2: 跑確認失敗**

- [ ] **Step 3: 實作**

`index.html`:`<div class="empty-state__icon">🪜</div>` → `<div class="empty-scene" id="emptyScene" aria-hidden="true"></div>`

`main.js` 的 `render()`,`$('emptyState').hidden = ready;` 之後加:

```js
  if (!ready) {
    // 只有一個人(或沒人):冰板上站一隻,旁邊空一個位置 —— 就是「還缺一個人」
    const p = setup.players[0] ?? { color: PALETTE[0], animal: 'rabbit' };
    const seat = document.createElement('div');
    seat.className = 'empty-scene__seat';
    const img = document.createElement('img');
    img.alt = '';
    img.src = tintedAnimal(getArt().animals[p.animal] ?? null, p.color, 160).toDataURL();
    seat.append(img);
    const vacant = document.createElement('div');
    vacant.className = 'empty-scene__seat empty-scene__seat--vacant';
    $('emptyScene').replaceChildren(seat, vacant);
  }
```

(`PALETTE` 加進 ladder import。)

`ghostleg.css` 取代 `.empty-state__icon`:

```css
/* 空狀態(2026-10-02):小冰板上一隻立牌 + 一個空的虛線圓座 */
.empty-scene {
  display: flex;
  align-items: flex-end;
  justify-content: center;
  gap: 26px;
  width: 220px;
  padding: 16px 0 14px;
  border: 4px solid var(--ink);
  border-radius: 22px;
  background: linear-gradient(#DDF0FB, #BFE1F7);
  box-shadow: inset 0 0 0 5px #fff;
}
.empty-scene__seat { display: grid; justify-items: center; width: 64px; }
.empty-scene__seat img { height: 86px; width: auto; }
.empty-scene__seat::after {
  content: '';
  width: 54px;
  height: 16px;
  border: 4px solid var(--ink);
  border-radius: 50%;
  background: #fff;
}
.empty-scene__seat--vacant::after { border-style: dashed; background: transparent; }
```

- [ ] **Step 4: 跑測試**:PASS;瀏覽器:設定裡刪到剩 1 人、0 人各看一次(390 / 1440)

- [ ] **Step 5: Commit**

```bash
git add ghostleg/index.html ghostleg/js/main.js ghostleg/css/ghostleg.css test/ghostleg-art.test.js
git commit -m "feat(ghostleg): empty state — one standee on a little ice board, one empty seat"
```

### Task 16: ⏸ Checkpoint 4 —— 給使用者看

- [ ] 390 / 1440:開跑前(正式動物 + 盒子亂飛)、跑完結果卡、空狀態;影片一支(6 人全程);40 人跑完的結果卡
- [ ] 確認 DevTools Network:先開首頁等 idle 預載完,再進阿彌陀籤,素材都是 cache hit
- [ ] SendUserFile 傳,**停下來等使用者回覆**

---

## 階段五:首頁卡片

### Task 17: 首頁阿彌陀籤插畫

**Files:**
- Modify: `tools/mascot-gen/home_prompts.json`(`ghostleg` 那句)、`index.html`(阿彌陀籤卡片換 `<img>`)、`test/home-images.test.js`

- [ ] **Step 1: 失敗的測試**(`test/home-images.test.js`,照一番賞那個測試)

```js
test('首頁的阿彌陀籤卡片用了插畫', () => {
  assert.ok(refs().some(p => p.endsWith('img/home/ghostleg.webp')), refs().join('\n'));
});
```

- [ ] **Step 2: 跑確認失敗**

- [ ] **Step 3: 換提示詞**:`home_prompts.json` 的 `ghostleg` 改成

```
"a ladder lottery on a slab of frozen lake ice seen from slightly above: raised white snow paths with dark brown outlines forming vertical lines connected by short staggered horizontal rungs, each rung only connects two neighbouring lines, a few pale icy blue gift boxes and frosty ice treasure chests floating above the far end, a small snowball, soft snow piled on the ice edges, no characters, no people, no animals"
```

- [ ] **Step 4: 生成與自評**:`$PY tools/mascot-gen/home.py cards --only ghostleg` → `$PY tools/mascot-gen/home.py review`;自己先看:橫槓有沒有錯開、只連相鄰兩條(issue #3 留言的坑)、有沒有畫出角色;不合格換 seed

### Task 18: ⏸ Checkpoint 5 —— 使用者挑首頁插畫

- [ ] SendUserFile 傳 3 張候選(放在首頁卡片裡的合成截圖),**停下來等回覆**
- [ ] `$PY tools/mascot-gen/home.py pick ghostleg <n>`;`index.html` 阿彌陀籤卡片的 `<span class="card__art card__art--ghostleg" aria-hidden="true"></span>` 換成 `<img class="card__art card__art--img" src="img/home/ghostleg.webp" alt="" aria-hidden="true">`;`$PY tools/mascot-gen/home.py build-cards --only ghostleg`(會蓋上 `?v=`)
- [ ] `node --test test/*.test.js` PASS;390 / 1440 首頁截圖
- [ ] Commit:

```bash
git add tools/mascot-gen/home_prompts.json index.html img/home/ghostleg.webp test/home-images.test.js
git commit -m "feat(home): ghostleg card illustration (ice board, snow paths, prizes)"
```

### Task 19: 收尾

- [ ] `node --test test/*.test.js`、`$PY -m unittest discover tools/mascot-gen` 全過
- [ ] 刪掉 `ghostleg/css/ghostleg.css` 裡已經沒人用的規則(`.results__dot`、`.empty-state__icon`),`grep -n` 確認 js / html 都沒引用
- [ ] 用 `superpowers:requesting-code-review` 對整個分支做一次 review,修掉 Critical / Important
- [ ] 問使用者:要不要開「阿彌陀籤 3D 獎品(2D 轉 3D,接 #7)」的 issue、要不要 merge 到 main 並 push(上線)—— **兩件都是對外動作,等明確同意**
- [ ] 更新記憶 `ghostleg-refresh.md`:上線狀態、使用者在 checkpoint 改過的決定
