# 大亂鬥:戰鬥陀螺對戰盤 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把大亂鬥的米色圓盤 + 八角陀螺,換成 Beyblade X 式的冰藍塑膠對戰盤(坡度、封閉外牆、3 個口袋、加速軌道)與三種類型的戰鬥陀螺(停轉 / 爆裂 / 動物圓片),道具改成劍、盾、補包、飛彈,開場加「3、2、1,Go Shoot!」。

**Architecture:** 新增純函式模組 `stadium.js`(盤子的唯一定義)與 `beys.js`(類型數值、轉速、爆裂),`physics.js` / `items.js` 改吃它們;畫面拆成 `stadium3d.js`(由 `stadium.js` 產生網格)、`bey3d.js`(三種陀螺)、`scene3d.js`(場景、鏡頭、特效)。所有規則都是純函式,`node --test` 直接測;畫面靠預覽頁截圖給使用者確認。

**Tech Stack:** 原生 ES modules、three.js(`vendor/three.module.min.js`,importmap 名稱 `three`)、`node:test`、Python 素材工具(`tools/mascot-gen/`,ComfyUI)。

**Spec:** `docs/superpowers/specs/2026-10-12-smash-beyblade-stadium-design.md`(執行時兩份一起讀)

## 確認過的模型(原文,不要改寫)

**任何 task 發現實作跟下面矛盾 = 這份計畫寫錯了。停下來向使用者提出,不要就地改模型。**

- **Setup**(存檔):`items` 開關 = `{ attack, shield, spin, missile }`。舊存檔 `speed` → `spin`、`bomb` → `missile`;`shield` 預設開;`giant` 丟掉。存檔 schema 版本不升。
- **Fighter** = 隊伍 `{ id, name, color, count }`,**不改**,沒有動物欄位。
- **Combatant**(只在比賽中):開打時隨機 `animal`(10 選 1)與 `beyType`(`attack | defense | stamina`),**兩者各自獨立、完全隨機**;另有 `spin`(0..1,轉速 = 命)、`outBy`(`ringout | spinout | burst`)、`buffs: { attack: [剩餘秒數…], shield: [剩餘秒數…] }`。
- **Stadium**:一份常數 + 純函式,**物理與畫面共用** —— 照真的 Xtreme 盤(兩張 Nick__Furry 復刻照 + 官方照):圓形對戰碗(軌道中線直徑 = 盤寬 83%)、碗緣一圈**立起來的加速軌道**(整圈連續,正後方往內凹一個梯形台階)、軌道外是一圈**平台**、最外面是**切角(近八角)的外牆**。陀螺要夠快才跳得過軌道上平台;平台微微往碗裡斜。出局:兩個前角平台上的**深方槽**(掉進去)、前側中間的**弧形斜坡**(要夠快、**飛過前牆**才算)。〔2026-10-13 使用者看過照片後兩度修改:原本是「圓角方形、外牆整圈封閉、3 個口袋」→「圓碗、碗緣是牆」→ 現在這版〕
- **MissileStrike**(只在比賽中):`{ id, fighterId(發射隊伍), x, y(準星), fuse }`。
- **數量**:Setup 1:N Fighter;Fighter 1:N Combatant(= count);Combatant 1:1 animal、1:1 beyType。
- **看到 vs 存下**:動物與陀螺類型看得到但**從不存檔**、每場重抽;存檔只有隊名 / 色 / 人數 / 道具開關。只靠隊伍色分隊。
- **最可能做錯的(錯誤版本,看到就要警覺)**:
  - ❌「動物是隊伍的屬性 `Fighter.animal`」—— 動物屬於每一顆陀螺,每場隨機,不存檔
  - ❌「陀螺造型是純裝飾,或跟著動物走」—— 造型 = 類型、有強弱,跟動物各自獨立
  - ❌「飛彈追蹤敵人、只炸敵隊」—— 鎖定最近敵人**當下的位置**從天空落下、不追蹤;圈內敵我都炸
  - ❌「盤子模型與物理的牆 / 口袋 / 坡度各自定義」—— 兩邊都從 `stadium.js` 來

## Global Constraints

- 單位沿用物理的:盤子半寬 `HALF = 100`、陀螺基本半徑 `8`;物理 `(x, y)` = three.js `(x, z)`,**+y 是靠鏡頭那一側**(口袋在這邊)。
- 3D 一律平塗 `MeshBasicMaterial`、**不放光源**、深色描邊殼(`INK = 0x574239`),沿用 `scene3d.js` 的 `outlinable()` / `part()` 與「由遠到近、每組先描邊再本體」的排序。
- 全站冰雪主題(冰藍 / 淡紫 / 白),**不能有聖誕元素**;盤子:底很淡冰藍、牆深一階、軌道白、口袋內側深色。
- 功能色(隊伍色、準星的發射隊伍色)由程式上色;道具圖示是彩色生成圖。
- 物理模組全部是純函式、回傳新 world、不就地改動輸入(現有測試 `step 不就地改動傳進來的 world` 要一直過)。
- 新圖網址一律帶 `?v=<content_hash 8 碼>`,加進 `gashapon/img/preload.json`(由 `tools/mascot-gen/gashapon.py manifest` 產生)並在頁內預先載入。
- 這個 repo 沒有 package.json;測試指令 `node --test test/`(只跑大亂鬥:`node --test test/smash*.test.js`)。`test/modules.test.js` 會解析每一支 js —— import `three` 的模組在 Node 解析不到 `three` 是預期的,所以**要在 Node 測的邏輯不能 import three**。
- 畫面截圖要 390(用 iframe 包住,headless 直接截 390 會被撐成 ~500)與 1440 兩種寬度;claude-in-chrome 錄動畫前確認 `document.visibilityState === 'visible'`(背景分頁 rAF 不跑)。
- 註解與 UI 文字用繁體中文、跟現有程式同樣的密度與語氣;識別字與 commit message 用英文;commit 結尾加兩行:`Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>` 與 `Claude-Session: https://claude.ai/code/session_01LNLSWiSiChBUCCGJ6VrC4D`。
- 分支:`smash-beyblade`。

## Review Focus

1. **高速穿牆**:飛彈把輕的耐久型炸出 775 單位/秒,一格就能跑 25 單位 —— 除了口袋,陀螺**永遠不能出現在盤子外面**(Task 3 的「隨機高速也不會穿牆」測試)。
2. **角落誤判成口袋**:前側的圓角(|x| > 70)不是口袋,陀螺在 (85, 85) 附近要被牆擋回來,不是出局(Task 1 `pocketAt` 測試)。
3. **人很多**:10 隊 × 12 人 = 120 顆,全部要生在盤內、彼此不重疊太多,而且一場一樣會在 `MAX_TIME` 內結束(Task 3 / Task 4 測試)。
4. **舊存檔與壞存檔**:`items` 是 `null`、字串、或只有 `{ giant: false }` 時,讀進來要是四個開關都有值的物件,不能白畫面(Task 6 測試)。
5. **飛彈的邊角情況**:吃到時場上沒有敵人 → 不發射;目標在落下前被撞走或出局 → 照樣在原準星位置炸;發射者自己站在圈裡 → 自己也被炸(Task 5 測試)。

---

## 檔案地圖

| 檔案 | 動作 | 責任 |
|---|---|---|
| `smash/js/stadium.js` | 新 | 盤子參數 + 純函式:`wallDistance`、`wallNormal`、`pocketAt`、`heightAt`、`slopeAccel`、`onRail`、`railAccel`、`pocketRest`、`randomSpot`、`wallPath` |
| `smash/js/beys.js` | 新 | `ANIMALS`、`BEY_TYPES`、`TYPE_STATS`、`statsOf`、`HIT_POWER`/`HIT_FULL`、`beyRadius`、`rollBey`、`hitStrength`、`burstChance`、`decaySpin`、`layers` |
| `smash/js/physics.js` | 改 | `createWorld` 用 stadium + beys;`step` 接坡度 / 軌道 / 牆 / 口袋 / 轉速 / 爆裂;`think` 減弱、拿掉躲邊緣;刪 `shrink` |
| `smash/js/items.js` | 改 | `attack`/`shield` 時效疊加、`spin` 補包、`missile` 空襲(取代炸彈)、`tickBuffs`、`explodeMissiles` |
| `smash/js/store.js` | 改 | `items` 開關遷移 |
| `smash/js/opening.js` | 新 | `openingAt(t)`:開場倒數的純函式 |
| `smash/js/main.js` | 改 | 遊戲迴圈、開場、設定分頁、`MAX_TIME = 60` |
| `smash/js/scene3d.js` | 改 | 場景、鏡頭(俯角參數)、排序、火花、爆炸、準星、飛彈 |
| `smash/js/stadium3d.js` | 新 | 由 `stadium.js` 產生盤子網格(盤底、等高線、外牆、口袋、軌道齒) |
| `smash/js/bey3d.js` | 新 | 三種陀螺造型 + 動物圓片、低轉速搖晃、停轉、爆裂零件 |
| `smash/js/art.js` | 新(Task 10) | 道具圖示網址(帶 `?v=`) |
| `smash/index.html`、`smash/css/smash.css` | 改 | 道具開關、開場倒數的大字 |
| `smash/img/items/*.webp` | 新(Task 10) | 劍、盾、補包、飛彈 |
| `tools/mascot-gen/smash.py`、`smash_prompts.json` | 新(Task 10) | 生成 / review / pick / build 道具圖示 |
| `tools/mascot-gen/gashapon.py`、`test/preload-manifest.test.js` | 改(Task 10) | 預載清單納入 `smash/js/art.js` |
| `test/smash-stadium.test.js`、`test/smash-beys.test.js`、`test/smash-opening.test.js` | 新 | 單元測試 |
| `test/smash.test.js`、`test/smash-items.test.js`、`test/smash-match.test.js` | 改 | 跟著新規則改寫 |
| `_probe-smash.html`、`_probe-frame.html`(repo 根目錄) | 新、**不 commit**(`.gitignore` 已有 `_probe*.html`) | 預覽頁 |

---

### Task 1: `stadium.js` —— 盤子的唯一定義

**Files:**
- Create: `smash/js/stadium.js`
- Test: `test/smash-stadium.test.js`

**Interfaces:**
- Consumes: 無
- Produces:
  - 常數:`HALF = 100`、`CORNER = 30`、`DEPTH = 14`、`FLAT = 0.35`、`SLOPE_ACCEL = 140`、`WALL_BOUNCE = 0.7`、`RAIL_WIDTH = 10`、`RAIL_ACCEL = 220`、`RAIL_MAX = 260`、`RAIL_FLING = 0.45`、`POCKET_DEPTH = 16`、`POCKETS`(`[{ id, x0, x1 }]`)
  - `wallDistance(x, y) → number`(盤內為負,牆上為 0)
  - `wallNormal(x, y) → { x, y }`(朝外的單位向量)
  - `pocketAt(x, y) → { id, x0, x1 } | null`(前側、x 落在口袋範圍內)
  - `heightAt(x, y) → number`(中央 0,牆邊 `DEPTH`)
  - `slopeAccel(x, y) → { x, y }`(朝內)
  - `onRail(x, y) → boolean`
  - `railAccel(x, y, vx, vy) → { x, y }`
  - `pocketRest(pocket, x) → { x, y }`
  - `randomSpot(rng, margin) → { x, y }`
  - `wallPath(n) → [{ x, y }]`(沿外牆一圈的點,給畫面用)

- [ ] **Step 1: 寫失敗的測試**

`test/smash-stadium.test.js`:

```js
// 大亂鬥的對戰盤。物理與畫面都從 stadium.js 拿形狀 ——
// 兩邊各自定義的話,遲早會出現「看起來在牆內,其實已經出局」。
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  HALF, CORNER, DEPTH, POCKETS,
  wallDistance, wallNormal, pocketAt, heightAt, slopeAccel,
  onRail, railAccel, pocketRest, randomSpot, wallPath,
} from '../smash/js/stadium.js';

function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

test('牆的距離:中央最深、四邊的牆上是 0、牆外是正的', () => {
  assert.equal(wallDistance(0, 0), -HALF);
  assert.ok(Math.abs(wallDistance(HALF, 0)) < 1e-9);
  assert.ok(Math.abs(wallDistance(0, -HALF)) < 1e-9);
  assert.ok(wallDistance(HALF + 5, 0) > 0);
});

test('圓角:正方形的角落其實在牆外', () => {
  assert.ok(wallDistance(HALF - 1, HALF - 1) > 0, '角落沒有修圓');
  // 圓角的圓心在 (70, 70),半徑 30
  const c = HALF - CORNER;
  const d = wallDistance(c + CORNER * Math.SQRT1_2, c + CORNER * Math.SQRT1_2);
  assert.ok(Math.abs(d) < 1e-9);
});

test('法線一律朝外', () => {
  for (const [x, y] of [[90, 0], [-90, 0], [0, 90], [0, -90], [85, 85], [-85, -85]]) {
    const n = wallNormal(x, y);
    assert.ok(Math.abs(Math.hypot(n.x, n.y) - 1) < 1e-9);
    assert.ok(n.x * x + n.y * y > 0, `(${x},${y}) 的法線朝內`);
  }
});

test('口袋只在靠鏡頭那一側(+y),而且只在三段範圍內', () => {
  assert.equal(pocketAt(0, 98)?.id, 'center');
  assert.equal(pocketAt(-60, 98)?.id, 'left');
  assert.equal(pocketAt(60, 98)?.id, 'right');
  assert.equal(pocketAt(0, -98), null, '後牆不該有口袋');
  assert.equal(pocketAt(30, 98), null, '口袋之間是牆');
  assert.equal(pocketAt(98, 0), null, '側牆不該有口袋');
});

test('前側的圓角不是口袋 —— 角落要把陀螺擋回來', () => {
  assert.equal(pocketAt(85, 85), null);
  assert.equal(pocketAt(-85, 85), null);
});

test('口袋寬度照真盤子的比例:中間大、角落小', () => {
  const w = id => { const p = POCKETS.find(q => q.id === id); return p.x1 - p.x0; };
  assert.ok(w('center') > w('left') * 1.4);
  assert.equal(w('left'), w('right'));
});

test('坡度:中央是平的,往外愈來愈高,牆邊是 DEPTH', () => {
  assert.equal(heightAt(0, 0), 0);
  assert.equal(heightAt(20, 0), 0, '中央 35% 應該是平的');
  assert.ok(heightAt(60, 0) > 0);
  assert.ok(heightAt(80, 0) > heightAt(60, 0));
  assert.ok(Math.abs(heightAt(HALF, 0) - DEPTH) < 1e-9);
});

test('坡度推力永遠朝內,中央沒有推力', () => {
  assert.deepEqual(slopeAccel(0, 0), { x: 0, y: 0 });
  for (const [x, y] of [[80, 0], [0, -80], [-70, 60], [85, 85]]) {
    const a = slopeAccel(x, y);
    assert.ok(a.x * x + a.y * y < 0, `(${x},${y}) 的坡度往外推`);
  }
});

test('加速軌道:貼著外牆的一圈,口袋前面斷開', () => {
  assert.equal(onRail(95, 0), true);
  assert.equal(onRail(0, -95), true);
  assert.equal(onRail(50, 0), false, '場中央不是軌道');
  assert.equal(onRail(0, 95), false, '中間口袋前面要斷開');
  assert.equal(onRail(30, 95), true, '口袋之間的前牆有軌道');
});

test('軌道推力沿著牆的切線,順著原本的方向', () => {
  // 右牆,往 +y 走 → 推力也往 +y
  const a = railAccel(95, 0, 0, 50);
  assert.ok(Math.abs(a.x) < 1e-9);
  assert.ok(a.y > 0);
  // 反方向走 → 推力反過來
  assert.ok(railAccel(95, 0, 0, -50).y < 0);
});

test('沿牆已經夠快時不再加速', () => {
  const a = railAccel(95, 0, 0, 1000);
  assert.deepEqual(a, { x: 0, y: 0 });
});

test('掉進口袋的陀螺停在口袋裡面(牆線外側)', () => {
  const p = POCKETS.find(q => q.id === 'center');
  const r = pocketRest(p, 100);
  assert.ok(r.x >= p.x0 && r.x <= p.x1, '跑出口袋範圍');
  assert.ok(r.y > HALF, '要在前牆線的外側');
});

test('隨機位置一定在盤內,離牆至少 margin', () => {
  const rng = seeded(7);
  for (let i = 0; i < 500; i++) {
    const s = randomSpot(rng, 25);
    assert.ok(wallDistance(s.x, s.y) <= -25, `(${s.x},${s.y}) 太靠牆`);
  }
});

test('wallPath 沿著外牆繞一圈,每個點都在牆上', () => {
  const pts = wallPath(64);
  assert.ok(pts.length >= 64);
  for (const p of pts) assert.ok(Math.abs(wallDistance(p.x, p.y)) < 1e-6);
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `node --test test/smash-stadium.test.js`
Expected: FAIL,`Cannot find module '.../smash/js/stadium.js'`

- [ ] **Step 3: 實作**

`smash/js/stadium.js`:

```js
// 大亂鬥的對戰盤(Beyblade X 式)。**物理與畫面共用這一份** ——
// 牆、口袋、坡度、軌道只在這裡定義;scene 那邊的網格也是從這些函式產生的。
// 兩邊各自寫一套的話,遲早會出現「看起來還在牆內,其實已經出局」。
//
// 座標:物理的 (x, y) 對應畫面的 (x, z),+y 是靠鏡頭那一側 —— 口袋都在這邊,
// 鏡頭從斜前方看下來,陀螺是朝著觀眾被撞進口袋的。

export const HALF = 100;          // 盤子半寬
export const CORNER = 30;         // 圓角半徑
const STRAIGHT = HALF - CORNER;   // 每一邊直線段的半長(70)

export const DEPTH = 14;          // 牆邊比中央高多少(碗的深度)
export const FLAT = 0.35;         // 中央平坦區佔多少(以「離牆距離 / HALF」計)
export const SLOPE_ACCEL = 140;   // 牆邊的坡度推力(往內)
export const WALL_BOUNCE = 0.7;   // 撞牆的反彈係數

export const RAIL_WIDTH = 10;     // 加速軌道的寬度(貼著外牆)
export const RAIL_ACCEL = 220;    // 在軌道上沿切線的加速度
export const RAIL_MAX = 260;      // 沿切線超過這個速度就不再加速
export const RAIL_FLING = 0.45;   // 離開軌道時,往中央甩的比例(乘上當下速度)
const RAIL_GAP = 4;               // 口袋兩側再多斷開多少,免得軌道直接把人送進口袋

export const POCKET_DEPTH = 16;   // 口袋往前牆外側凹多深

// 三個口袋都在前牆的直線段上(|x| ≤ 70)。寬度比例照真盤子:
// Over Zone 12cm(角落)/ Xtreme Zone 19cm(中間)。
export const POCKETS = Object.freeze([
  Object.freeze({ id: 'left', x0: -70, x1: -46 }),
  Object.freeze({ id: 'center', x0: -19, x1: 19 }),
  Object.freeze({ id: 'right', x0: 46, x1: 70 }),
]);

// 圓角方形的距離場:盤內為負,牆上為 0,牆外為正。
export function wallDistance(x, y) {
  const qx = Math.abs(x) - STRAIGHT;
  const qy = Math.abs(y) - STRAIGHT;
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - CORNER;
}

// 離這個點最近的那段牆,朝外的法線。
export function wallNormal(x, y) {
  const qx = Math.abs(x) - STRAIGHT;
  const qy = Math.abs(y) - STRAIGHT;
  const sx = x < 0 ? -1 : 1;
  const sy = y < 0 ? -1 : 1;
  if (qx > 0 && qy > 0) {
    const l = Math.hypot(qx, qy);
    return { x: (sx * qx) / l, y: (sy * qy) / l };
  }
  return qx > qy ? { x: sx, y: 0 } : { x: 0, y: sy };
}

// 這個位置正對著哪一個口袋。只看前牆的直線段 ——
// 圓角那一截是牆,角落的陀螺要被擋回來,不能算掉進口袋。
export function pocketAt(x, y) {
  if (y <= 0 || Math.abs(x) > STRAIGHT) return null;
  if (Math.abs(y) < Math.abs(x)) return null;   // 最近的牆是側牆,不是前牆
  return POCKETS.find(p => x >= p.x0 && x <= p.x1) ?? null;
}

// 0 = 還在平坦區,1 = 牆邊。坡度推力與高度都用這一條。
function slope01(x, y) {
  const s = 1 + wallDistance(x, y) / HALF;
  return Math.min(1, Math.max(0, (s - FLAT) / (1 - FLAT)));
}

// 陀螺站的高度(中央 0)。畫面的盤底網格也用它 —— 推力與凹陷必須是同一條曲線。
export function heightAt(x, y) {
  const t = slope01(x, y);
  return DEPTH * t * t;
}

// 高度是 t² 的碗,斜率跟 t 成正比,所以推力也跟 t 成正比。
export function slopeAccel(x, y) {
  const t = slope01(x, y);
  if (t === 0) return { x: 0, y: 0 };
  const n = wallNormal(x, y);
  return { x: -n.x * SLOPE_ACCEL * t, y: -n.y * SLOPE_ACCEL * t };
}

// 軌道:貼著外牆一圈,口袋前面(含兩側 RAIL_GAP)斷開。
export function onRail(x, y) {
  const d = wallDistance(x, y);
  if (d < -RAIL_WIDTH || d > 0) return false;
  if (y > 0 && Math.abs(y) >= Math.abs(x)) {
    if (POCKETS.some(p => x >= p.x0 - RAIL_GAP && x <= p.x1 + RAIL_GAP)) return false;
  }
  return true;
}

// 順著陀螺原本沿牆移動的方向推;沿切線已經夠快就不推。
export function railAccel(x, y, vx, vy) {
  if (!onRail(x, y)) return { x: 0, y: 0 };
  const n = wallNormal(x, y);
  const tx = -n.y;
  const ty = n.x;
  const along = vx * tx + vy * ty;
  if (Math.abs(along) >= RAIL_MAX) return { x: 0, y: 0 };
  const dir = along >= 0 ? 1 : -1;
  return { x: tx * dir * RAIL_ACCEL, y: ty * dir * RAIL_ACCEL };
}

// 掉進口袋後停在哪裡:口袋範圍內、前牆線外側的中間。
export function pocketRest(pocket, x) {
  return {
    x: Math.min(pocket.x1 - 4, Math.max(pocket.x0 + 4, x)),
    y: HALF + POCKET_DEPTH / 2,
  };
}

// 盤內隨機一點,離牆至少 margin(拒絕取樣;盤子幾乎填滿外接正方形,很快就中)。
export function randomSpot(rng, margin) {
  for (;;) {
    const x = (rng() * 2 - 1) * HALF;
    const y = (rng() * 2 - 1) * HALF;
    if (wallDistance(x, y) <= -margin) return { x, y };
  }
}

// 沿外牆一圈的點(逆時針,從右牆中點開始)。n = 每個圓角切幾段。
export function wallPath(n = 16) {
  const pts = [];
  const corners = [[1, 1], [-1, 1], [-1, -1], [1, -1]];
  for (let k = 0; k < 4; k++) {
    const [sx, sy] = corners[k];
    const start = (k * Math.PI) / 2;
    for (let i = 0; i <= n; i++) {
      const a = start + (i / n) * (Math.PI / 2);
      pts.push({ x: sx * STRAIGHT + Math.cos(a) * CORNER, y: sy * STRAIGHT + Math.sin(a) * CORNER });
    }
  }
  return pts;
}
```

注意 `wallPath` 的角落順序:第 k 個圓角的圓心是 `(sx·70, sy·70)`,角度從 `k·90°` 掃到 `(k+1)·90°`;k=0 是 (+,+) 的 0°→90°、k=1 是 (−,+) 的 90°→180°,依此類推,剛好逆時針接成一圈(直線段由相鄰兩個圓角的端點連起來)。

- [ ] **Step 4: 跑測試確認通過**

Run: `node --test test/smash-stadium.test.js`
Expected: 全部 PASS

- [ ] **Step 5: Commit**

```bash
git add smash/js/stadium.js test/smash-stadium.test.js
git commit -m "feat(smash): stadium.js — the one definition of walls, pockets, slope and rail"
```

---

### Task 2: `beys.js` —— 類型、轉速、爆裂

**Files:**
- Create: `smash/js/beys.js`
- Test: `test/smash-beys.test.js`

**Interfaces:**
- Consumes: 無(**不能** import `physics.js`,不然會循環引用)
- Produces:
  - `ANIMALS`(10 個,跟 `ghostleg/js/art.js` 的 `ANIMAL_URLS` 鍵一致)、`BEY_TYPES = ['attack', 'defense', 'stamina']`
  - `TYPE_STATS[type] = { power, mass, decay, burstDealt, burstTaken }`、`statsOf(c)`
  - `HIT_POWER = 90`、`HIT_FULL = 260`(從 `physics.js` 搬過來,`physics.js` 再 re-export,`scene3d.js` 不用改 import)
  - `BASE_RADIUS = 8`、`beyRadius(total)`
  - `rollBey(rng) → { animal, beyType }`
  - `layers(c, kind) → number`(`c.buffs[kind]` 陣列長度,沒有就 0)
  - `ATTACK_GAIN = 1.9`、`SWORD_BURST = 1.5`、`SHIELD_KNOCK = 0.6`、`SHIELD_BURST = 0.5`
  - `hitStrength(power) → 0..1`
  - `burstChance({ power, attacker, target }) → 0..0.9`(`attacker` 可為 `null`,飛彈用)
  - `SPIN_DECAY = 1/30`、`HIT_SPIN_COST = 0.12`、`WALL_SPIN_COST = 0.01`、`decaySpin(c, dt) → number`

- [ ] **Step 1: 寫失敗的測試**

`test/smash-beys.test.js`:

```js
// 陀螺的類型與轉速。類型是隨機發的,所以「有強弱」必須在數字上看得出來,
// 但又不能強到「抽到攻擊型就穩贏」—— 那一條留給整場的模擬測試。
import test from 'node:test';
import assert from 'node:assert/strict';
import { ANIMAL_URLS } from '../ghostleg/js/art.js';
import {
  ANIMALS, BEY_TYPES, TYPE_STATS, statsOf, HIT_POWER, HIT_FULL,
  beyRadius, rollBey, layers, hitStrength, burstChance, decaySpin, SPIN_DECAY,
} from '../smash/js/beys.js';

function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const bey = (beyType, extra = {}) => ({ beyType, spin: 1, buffs: { attack: [], shield: [] }, ...extra });

test('動物就是爬格子那 10 隻(圖直接共用)', () => {
  assert.deepEqual([...ANIMALS].sort(), Object.keys(ANIMAL_URLS).sort());
});

test('三種類型', () => {
  assert.deepEqual([...BEY_TYPES], ['attack', 'defense', 'stamina']);
});

test('類型有強弱:攻擊撞得兇但轉得短、防禦最重、耐久轉最久', () => {
  const { attack, defense, stamina } = TYPE_STATS;
  assert.ok(attack.power > defense.power);
  assert.ok(attack.decay > stamina.decay);
  assert.ok(defense.mass > attack.mass && defense.mass > stamina.mass);
  assert.ok(stamina.decay < defense.decay);
  assert.ok(stamina.mass < attack.mass, '耐久型要比較輕、容易被撞飛');
});

test('不認得的類型用中性數值,不會變成 NaN', () => {
  const s = statsOf({});
  for (const k of ['power', 'mass', 'decay', 'burstDealt', 'burstTaken']) assert.equal(s[k], 1);
});

test('動物與類型各自隨機,而且每一種都抽得到', () => {
  const rng = seeded(3);
  const animals = new Set();
  const types = new Set();
  for (let i = 0; i < 400; i++) {
    const b = rollBey(rng);
    animals.add(b.animal);
    types.add(b.beyType);
  }
  assert.equal(animals.size, ANIMALS.length);
  assert.equal(types.size, BEY_TYPES.length);
});

test('人多時陀螺縮小,20 人以內維持原尺寸', () => {
  assert.equal(beyRadius(3), 8);
  assert.equal(beyRadius(20), 8);
  assert.ok(beyRadius(80) < 8);
  assert.ok(Math.abs(beyRadius(80) - 8 * Math.sqrt(20 / 80)) < 1e-9);
});

test('layers 數的是陣列長度,沒有 buffs 就是 0', () => {
  assert.equal(layers({ buffs: { attack: [3, 5] } }, 'attack'), 2);
  assert.equal(layers({}, 'shield'), 0);
});

test('撞擊強度:門檻以下是 0,HIT_FULL 以上是 1', () => {
  assert.equal(hitStrength(HIT_POWER - 1), 0);
  assert.equal(hitStrength(HIT_FULL + 100), 1);
});

test('輕輕碰到不會爆裂', () => {
  assert.equal(burstChance({ power: HIT_POWER - 1, attacker: bey('attack'), target: bey('stamina') }), 0);
});

test('最重的一擊大約 25%(耐久對耐久、滿轉速)', () => {
  const p = burstChance({ power: HIT_FULL, attacker: bey('stamina'), target: bey('stamina') });
  assert.ok(Math.abs(p - 0.25) < 1e-9, `${p}`);
});

test('攻擊型與劍讓對方更容易爆;防禦型與盾讓自己比較難爆', () => {
  const base = burstChance({ power: 200, attacker: bey('stamina'), target: bey('stamina') });
  assert.ok(burstChance({ power: 200, attacker: bey('attack'), target: bey('stamina') }) > base);
  assert.ok(burstChance({ power: 200, attacker: bey('stamina', { buffs: { attack: [8], shield: [] } }), target: bey('stamina') }) > base);
  assert.ok(burstChance({ power: 200, attacker: bey('stamina'), target: bey('defense') }) < base);
  assert.ok(burstChance({ power: 200, attacker: bey('stamina'), target: bey('stamina', { buffs: { attack: [], shield: [8] } }) }) < base);
});

test('轉速愈低愈容易爆,但最多兩倍', () => {
  const full = burstChance({ power: 200, attacker: null, target: bey('stamina') });
  const low = burstChance({ power: 200, attacker: null, target: bey('stamina', { spin: 0 }) });
  assert.ok(Math.abs(low - full * 2) < 1e-9);
});

test('機率有上限,三層劍加攻擊型也不會必爆', () => {
  const p = burstChance({
    power: HIT_FULL,
    attacker: bey('attack', { buffs: { attack: [8, 8, 8], shield: [] } }),
    target: bey('stamina', { spin: 0 }),
  });
  assert.ok(p <= 0.9);
});

test('轉速每秒自然下降,耐久型掉得最慢', () => {
  const a = decaySpin(bey('attack'), 1);
  const s = decaySpin(bey('stamina'), 1);
  assert.ok(a < 1 && s < 1);
  assert.ok(s > a);
  assert.ok(Math.abs(decaySpin(bey('defense'), 1) - (1 - SPIN_DECAY)) < 1e-9);
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `node --test test/smash-beys.test.js`
Expected: FAIL,`Cannot find module '.../smash/js/beys.js'`

- [ ] **Step 3: 實作**

`smash/js/beys.js`:

```js
// 戰鬥陀螺的類型、轉速與爆裂。全部是純函式。
//
// 每一顆陀螺(Combatant)開打時**各自隨機**抽一隻動物與一種類型,兩者互相獨立,
// 不存檔、每場重抽 —— 動物不是隊伍的屬性,同一隊只靠隊伍色認。
// 造型就是類型,而且有強弱;轉速只代表「還剩多少命」,**不影響撞擊力**。

export const ANIMALS = Object.freeze(['snowman', 'rabbit', 'penguin', 'reindeer', 'cat', 'dog', 'bear', 'seal', 'owl', 'hamster']);
export const BEY_TYPES = Object.freeze(['attack', 'defense', 'stamina']);

//   power      撞別人時,對方被彈開的力道倍率
//   mass       重量(越重越難被撞飛,炸彈也一樣)
//   decay      轉速衰減倍率
//   burstDealt 撞別人時,對方爆裂機率倍率
//   burstTaken 自己被撞時的爆裂機率倍率
export const TYPE_STATS = Object.freeze({
  attack: Object.freeze({ power: 1.4, mass: 1, decay: 1.5, burstDealt: 1.5, burstTaken: 1 }),
  defense: Object.freeze({ power: 0.8, mass: 1.8, decay: 1, burstDealt: 1, burstTaken: 0.5 }),
  stamina: Object.freeze({ power: 1, mass: 0.8, decay: 0.6, burstDealt: 1, burstTaken: 1 }),
});
const NEUTRAL = Object.freeze({ power: 1, mass: 1, decay: 1, burstDealt: 1, burstTaken: 1 });

export function statsOf(c) {
  return TYPE_STATS[c?.beyType] ?? NEUTRAL;
}

// 多大的一下才算「撞到」(演出、音效、爆裂都用這道門檻)。
// 實測一場平均每秒 15 次碰撞,power 中位數只有 3 —— 那是互相推擠,不是撞擊。
export const HIT_POWER = 90;
// power 到這個值就是最大的演出與最大聲,爆裂機率也到頂
export const HIT_FULL = 260;

export const BASE_RADIUS = 8;
const CROWD = 20;

// 超過 20 人就整體縮小,盤子與鏡頭不動。面積跟人數成反比,所以半徑乘根號。
export function beyRadius(total) {
  return total > CROWD ? BASE_RADIUS * Math.sqrt(CROWD / total) : BASE_RADIUS;
}

export function rollBey(rng = Math.random) {
  return {
    animal: ANIMALS[Math.floor(rng() * ANIMALS.length)],
    beyType: BEY_TYPES[Math.floor(rng() * BEY_TYPES.length)],
  };
}

// 劍 / 盾的層數:buffs.attack / buffs.shield 是「每一層的剩餘秒數」陣列。
export function layers(c, kind) {
  return c?.buffs?.[kind]?.length ?? 0;
}

// 每一層劍:對方彈開力道 = 1 + 層數 × ATTACK_GAIN(沿用原本的加成公式)
export const ATTACK_GAIN = 1.9;
export const SWORD_BURST = 1.5;   // 每一層劍:對方爆裂機率 ×1.5
export const SHIELD_KNOCK = 0.6;  // 每一層盾:自己被彈開 ×0.6
export const SHIELD_BURST = 0.5;  // 每一層盾:自己爆裂機率 ×0.5

export function hitStrength(power) {
  return Math.min(1, Math.max(0, (power - HIT_POWER) / (HIT_FULL - HIT_POWER)));
}

const BURST_BASE = 0.25;   // 最重的一擊、雙方都中性、滿轉速時的爆裂機率
const BURST_CAP = 0.9;     // 再怎麼疊也不會必爆

// target 被 power 這麼重的一下打到時,爆裂的機率。attacker 是 null 代表飛彈。
// 轉速愈低愈脆(轉速 0 時 ×2)—— 這只影響爆裂,不影響撞擊力。
export function burstChance({ power, attacker, target }) {
  const k = hitStrength(power);
  if (k === 0) return 0;
  const dealt = attacker ? statsOf(attacker).burstDealt * SWORD_BURST ** layers(attacker, 'attack') : 1;
  const taken = statsOf(target).burstTaken * SHIELD_BURST ** layers(target, 'shield');
  const fragile = 1 + (1 - Math.min(1, Math.max(0, target.spin ?? 1)));
  return Math.min(BURST_CAP, BURST_BASE * k * dealt * taken * fragile);
}

export const SPIN_DECAY = 1 / 30;   // 中性陀螺每秒掉這麼多(約 30 秒轉完)
export const HIT_SPIN_COST = 0.12;  // 被最重的一擊打到時扣這麼多,依撞擊強度縮放
export const WALL_SPIN_COST = 0.01; // 撞一次牆扣這麼多

export function decaySpin(c, dt) {
  return (c.spin ?? 1) - SPIN_DECAY * statsOf(c).decay * dt;
}
```

- [ ] **Step 4: 跑測試確認通過**

Run: `node --test test/smash-beys.test.js`
Expected: 全部 PASS

- [ ] **Step 5: Commit**

```bash
git add smash/js/beys.js test/smash-beys.test.js
git commit -m "feat(smash): beys.js — random animal and type per bey, spin as life, burst odds"
```

---

### Task 3: 物理接上對戰盤與轉速

把 `physics.js` 從「圓盤 + 場地縮小」換成「stadium + 轉速 + 爆裂」。這一步之後 `main.js` 暫時還在呼叫 `shrink` —— **同一個 task 裡**把 `main.js` 的 `shrink` 與 `arenaRadius` 呼叫拿掉,頁面才不會壞(畫面的暫時調整在 Task 6)。

**Files:**
- Modify: `smash/js/physics.js`(整支改寫)
- Modify: `smash/js/main.js:7`(import)、`:20`(`ARENA`)、`:65`(`createWorld`)、`:114`(`shrink`)
- Test: `test/smash.test.js`(改寫)、`test/smash-match.test.js`(改寫)

**Interfaces:**
- Consumes: Task 1 全部、Task 2 全部
- Produces:
  - `createWorld({ fighters, rng }) → { combatants, items: [], strikes: [], time: 0 }`
  - Combatant 欄位:`{ id, fighterId, x, y, vx, vy, radius, mass, alive, animal, beyType, spin, outBy: null, pocket: null, railing: false, buffs: { attack: [], shield: [] }, healedAt: -Infinity }`
  - `step(world, dt, rng = Math.random) → world`(多回傳 `impacts`,跟現在一樣)
  - `think(world, dt) → world`
  - `aliveOf`、`winnerTeam` 不變;`HIT_POWER`、`HIT_FULL` 由 `beys.js` re-export
  - **刪除** `shrink`

- [ ] **Step 1: 改寫 `test/smash.test.js` 的共用 helper 與受影響的測試**

把檔案開頭的 import 與 `arena` / `at` 換成:

```js
import { createFighter, pickColor, PALETTE } from '../smash/js/fighters.js';
import { createWorld, step, think, aliveOf, winnerTeam, HIT_POWER } from '../smash/js/physics.js';
import { HALF, wallDistance, pocketAt, POCKETS } from '../smash/js/stadium.js';
import { BEY_TYPES, ANIMALS, TYPE_STATS } from '../smash/js/beys.js';

const arena = { items: [], strikes: [], time: 0 };
// 測試用的陀螺:預設耐久型以外的「中性」類型(沒有 beyType)—— 數值全是 1,
// 這樣原本那些撞擊測試的數字不必跟著類型表改。
const at = (fighterId, x, y, vx = 0, vy = 0, extra = {}) => ({
  id: `c_${fighterId}_${x}_${y}`, fighterId, x, y, vx, vy,
  radius: 8, mass: 1, alive: true, spin: 1, outBy: null, pocket: null, railing: false,
  buffs: { attack: [], shield: [] }, healedAt: -Infinity, ...extra,
});
const noRng = () => 0.999;   // 擲骰永遠不中:撞擊測試不要被爆裂干擾
```

接著逐一修改(其餘測試保留原樣):

1. 所有 `step(x, 1 / 60)` 改成 `step(x, 1 / 60, noRng)`。
2. `'同隊撞在一起只會分開,速度不變'`:原本斷言 `na.vx === 50 * 0.995`。中心附近沒有坡度、也不在軌道上,所以照舊成立 —— 保留。
3. `'攻擊道具會讓自己撞出去的力更大'` 與 `'攻擊力是打在對方身上,不是兩邊一起飛'`:`buffed.buffs.attack = 1` 改成 `buffed.buffs.attack = [8]`;`buffs: { attack: 2, speed: 0, giant: 0 }` 改成 `buffs: { attack: [8, 8], shield: [] }`。
4. **刪除** 這幾個測試(規則已經不存在):`'被推出場外就淘汰'`、`'中心一離開圓盤就出局,不能整個人站在盤子外面還活著'`、`'速度道具讓追擊更猛'`、`'站在邊緣時會往場中央閃 —— 追人不能追到把自己送出去'`、`'引信快到的炸彈會被閃開'`、`'引信還久的炸彈不用理 —— 不然整場都在逃命'`、`'距離一樣時,優先挑靠近邊緣的敵人 —— 一撞就出局比較划算'`。
5. 新增下面這些測試(放在 `/* ---------- 出界與勝負 ---------- */` 區塊,取代刪掉的那兩條):

```js
/* ---------- 盤子:牆、口袋 ---------- */

test('撞到牆會彈回來,不會出局', () => {
  const out = step({ ...arena, combatants: [at('red', 95, 0, 300, 0)] }, 1 / 60, noRng);
  const c = out.combatants[0];
  assert.equal(c.alive, true);
  assert.ok(c.vx < 0, `沒有彈回來:vx ${c.vx}`);
  assert.ok(wallDistance(c.x, c.y) + c.radius <= 1e-6, '還卡在牆裡');
});

test('後牆沒有口袋 —— 往後撞只會彈回來', () => {
  const out = step({ ...arena, combatants: [at('red', 0, -95, 0, -300)] }, 1 / 60, noRng);
  assert.equal(out.combatants[0].alive, true);
});

test('衝進口袋就出局,停在口袋裡面', () => {
  let w = { ...arena, combatants: [at('red', 0, 96, 0, 400)] };
  for (let i = 0; i < 10; i++) w = step(w, 1 / 60, noRng);
  const c = w.combatants[0];
  assert.equal(c.alive, false);
  assert.equal(c.outBy, 'ringout');
  assert.equal(c.pocket, 'center');
  assert.ok(c.y > HALF, '要停在口袋裡,不是盤面上');
  assert.equal(c.vx, 0);
  assert.equal(c.vy, 0);
});

test('前側的圓角是牆,不是口袋', () => {
  const out = step({ ...arena, combatants: [at('red', 84, 84, 300, 300)] }, 1 / 60, noRng);
  assert.equal(out.combatants[0].alive, true);
});

test('隨機高速也不會穿牆:除了口袋,永遠不會出現在盤子外面', () => {
  let seed = 1;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  for (let i = 0; i < 400; i++) {
    const a = rnd() * Math.PI * 2;
    const v = 200 + rnd() * 900;
    const c = at('red', (rnd() * 2 - 1) * 60, (rnd() * 2 - 1) * 60, Math.cos(a) * v, Math.sin(a) * v, { radius: 5 });
    let w = { ...arena, combatants: [c] };
    for (let f = 0; f < 30; f++) w = step(w, 0.033, noRng);
    const o = w.combatants[0];
    if (o.outBy === 'ringout') {
      assert.ok(POCKETS.some(p => p.id === o.pocket));
    } else {
      assert.ok(wallDistance(o.x, o.y) <= 1e-6, `#${i} 跑到盤子外面:(${o.x.toFixed(1)}, ${o.y.toFixed(1)})`);
    }
  }
});

/* ---------- 坡度與軌道 ---------- */

test('坡度把靜止在坡上的陀螺往中央拉', () => {
  const out = step({ ...arena, combatants: [at('red', 80, 0)] }, 1 / 60, noRng);
  assert.ok(out.combatants[0].vx < 0);
});

test('軌道上順著牆加速', () => {
  const out = step({ ...arena, combatants: [at('red', 95, 0, 0, 60)] }, 1 / 60, noRng);
  assert.ok(out.combatants[0].vy > 60 * 0.995, '沒有沿牆加速');
});

test('離開軌道的那一格會被往中央甩', () => {
  // 上一格還在軌道上(railing),這一格已經離開 —— 速度要多出朝內的分量
  const c = at('red', 70, -70, 0, 0, { railing: true });   // (70,-70) 離牆 30,不在軌道上
  const out = step({ ...arena, combatants: [{ ...c, vx: 0, vy: 200 }] }, 1 / 60, noRng);
  const o = out.combatants[0];
  assert.ok(o.vx < -20, `沒有往中央甩:vx ${o.vx}`);
  assert.equal(o.railing, false);
});

/* ---------- 轉速 ---------- */

test('轉速會自然下降,歸零就停轉出局', () => {
  const out = step({ ...arena, combatants: [at('red', 0, 0, 0, 0, { spin: 0.001 })] }, 1 / 60, noRng);
  assert.equal(out.combatants[0].alive, false);
  assert.equal(out.combatants[0].outBy, 'spinout');
});

test('被重擊會多扣轉速', () => {
  const calm = step({ ...arena, combatants: [at('red', -40, 0), at('blue', 40, 0)] }, 1 / 60, noRng);
  const hit = step({ ...arena, combatants: [at('red', -7.9, 0, 260, 0), at('blue', 7.9, 0, -260, 0)] }, 1 / 60, noRng);
  assert.ok(hit.combatants[1].spin < calm.combatants[1].spin);
});

test('重擊時擲骰中了就爆裂出局', () => {
  const always = () => 0;
  const out = step({ ...arena, combatants: [at('red', -7.9, 0, 260, 0), at('blue', 7.9, 0, -260, 0)] }, 1 / 60, always);
  assert.ok(out.combatants.some(c => c.outBy === 'burst'));
});

test('同隊再怎麼撞都不會爆裂', () => {
  const always = () => 0;
  const out = step({ ...arena, combatants: [at('red', -7.9, 0, 260, 0), at('red', 7.9, 0, -260, 0)] }, 1 / 60, always);
  assert.ok(out.combatants.every(c => c.alive));
});

test('防禦型比較重,同樣一撞被彈得比較近', () => {
  const light = step({ ...arena, combatants: [at('red', -7.9, 0, 200, 0), at('blue', 7.9, 0, -200, 0, { beyType: 'stamina', mass: TYPE_STATS.stamina.mass })] }, 1 / 60, noRng);
  const heavy = step({ ...arena, combatants: [at('red', -7.9, 0, 200, 0), at('blue', 7.9, 0, -200, 0, { beyType: 'defense', mass: TYPE_STATS.defense.mass })] }, 1 / 60, noRng);
  assert.ok(heavy.combatants[1].vx < light.combatants[1].vx);
});

test('盾讓自己被彈得比較近', () => {
  const plain = step({ ...arena, combatants: [at('red', -7.9, 0, 200, 0), at('blue', 7.9, 0, -200, 0)] }, 1 / 60, noRng);
  const shielded = step({ ...arena, combatants: [at('red', -7.9, 0, 200, 0), at('blue', 7.9, 0, -200, 0, { buffs: { attack: [], shield: [8] } })] }, 1 / 60, noRng);
  assert.ok(shielded.combatants[1].vx < plain.combatants[1].vx);
});

/* ---------- 開場 ---------- */

test('開場:每顆陀螺各自抽動物與類型,生在盤內、轉速滿', () => {
  const fighters = [createFighter({ name: '紅', count: 6 }), createFighter({ name: '藍', count: 6 })];
  let seed = 9;
  const rng = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const w = createWorld({ fighters, rng });
  for (const c of w.combatants) {
    assert.ok(ANIMALS.includes(c.animal));
    assert.ok(BEY_TYPES.includes(c.beyType));
    assert.equal(c.spin, 1);
    assert.equal(c.mass, TYPE_STATS[c.beyType].mass);
    assert.ok(wallDistance(c.x, c.y) < -c.radius);
    assert.deepEqual(c.buffs, { attack: [], shield: [] });
  }
  // Fighter 本身沒有被加上動物欄位
  assert.ok(!('animal' in fighters[0]));
});

test('120 個人也全部生在盤內,而且縮小了', () => {
  const fighters = Array.from({ length: 10 }, (_, i) => createFighter({ name: `隊${i}`, count: 12 }));
  const w = createWorld({ fighters, rng: Math.random });
  assert.equal(w.combatants.length, 120);
  for (const c of w.combatants) {
    assert.ok(c.radius < 8);
    assert.ok(wallDistance(c.x, c.y) < -c.radius);
  }
});
```

把 AI 那一區的 `'會往敵人移動'`、`'不會追著隊友跑'`、`'道具比敵人近的時候會先去撿'` 保留(`think` 不吃 rng),再新增:

```js
test('站在牆邊不再主動往中央閃 —— 要靠坡度,不是靠 AI', () => {
  // 敵人在更右邊:只會追人的話 vx 會是正的。以前的躲邊緣會把它變成負的。
  const out = think({ ...arena, combatants: [at('red', 90, 0), at('blue', 96, 0)] }, 1 / 60);
  assert.ok(out.combatants[0].vx > 0);
});

test('找人的力道比以前弱一半(90 → 45)', () => {
  const out = think({ ...arena, combatants: [at('red', 0, 0), at('blue', 50, 0)] }, 1);
  assert.ok(Math.abs(out.combatants[0].vx - 45) < 1e-6, `${out.combatants[0].vx}`);
});
```

- [ ] **Step 2: 改寫 `test/smash-match.test.js`**

`playMatch` 換成新的迴圈順序(跟 Task 6 的 `main.js` 一致;道具在 Task 5 才改,這裡先只跑沒有道具的版本):

```js
import test from 'node:test';
import assert from 'node:assert/strict';

import { createFighter } from '../smash/js/fighters.js';
import { createWorld, step, think, aliveOf, winnerTeam } from '../smash/js/physics.js';

function seeded(seed) { /* 跟原本一樣,保留 */ }

const MAX_TIME = 60;

function playMatch({ fighters, seed, maxTime = MAX_TIME }) {
  const rng = seeded(seed);
  let world = createWorld({ fighters, rng });
  const dt = 1 / 60;
  while (world.time < maxTime) {
    world = think(world, dt);
    world = step(world, dt, rng);
    const won = winnerTeam(world);
    if (won || aliveOf(world).length === 0) {
      return { winner: won, seconds: world.time, alive: aliveOf(world).length, world };
    }
  }
  return { winner: null, seconds: world.time, alive: aliveOf(world).length, timedOut: true, world };
}

const teams = n => Array.from({ length: n }, (_, i) => createFighter({ name: `隊${i}`, count: 3 }));
```

保留 `'一整場會結束,不會變成互瞪的僵局'`、`'贏的那一隊一定還有人活著'`、`'兩隊都會贏'`、`'人多的隊伍比較有利,但不是穩贏'`、`'只有一隊時立刻算它贏'`(把 `withItems` 參數拿掉)。刪除 `'沒有道具也打得完 —— 結束靠的是場地縮小'` 與 `'場地會縮小 —— 這是終止保證'`,換成:

```js
test('沒有道具也一定打得完 —— 終止保證是停轉,不是場地縮小', () => {
  for (let seed = 0; seed < 30; seed++) {
    const r = playMatch({ fighters: teams(2), seed });
    assert.ok(!r.timedOut, `seed ${seed} 打到 ${MAX_TIME} 秒還沒結束`);
  }
});

test('三種出局方式都會發生', () => {
  const seen = new Set();
  for (let seed = 0; seed < 60 && seen.size < 3; seed++) {
    for (const c of playMatch({ fighters: teams(3), seed }).world.combatants) if (c.outBy) seen.add(c.outBy);
  }
  assert.deepEqual([...seen].sort(), ['burst', 'ringout', 'spinout']);
});

test('出局方式不會一面倒:場外與爆裂加起來至少三成', () => {
  const count = { ringout: 0, spinout: 0, burst: 0 };
  for (let seed = 0; seed < 60; seed++) {
    for (const c of playMatch({ fighters: teams(3), seed }).world.combatants) if (c.outBy) count[c.outBy]++;
  }
  const total = count.ringout + count.spinout + count.burst;
  assert.ok((count.ringout + count.burst) / total >= 0.3, JSON.stringify(count));
});

test('120 個人也打得完', () => {
  const big = Array.from({ length: 10 }, (_, i) => createFighter({ name: `隊${i}`, count: 12 }));
  // 120 顆是 7140 對碰撞 × 每秒 60 格,跑兩場就好,不然整套測試會慢到沒人想跑
  for (let seed = 0; seed < 2; seed++) assert.ok(!playMatch({ fighters: big, seed }).timedOut, `seed ${seed}`);
});
```

- [ ] **Step 3: 跑測試確認失敗**

Run: `node --test test/smash.test.js test/smash-match.test.js`
Expected: FAIL(`createWorld` 還要 `arenaRadius`、沒有 `outBy`、沒有牆)

- [ ] **Step 4: 改寫 `smash/js/physics.js`**

```js
// 大亂鬥的物理。純函式:step 回傳新的 world,不就地改動傳進來的東西。
//
// 這是整個站上**唯一結果不預先決定**的模式 —— 其他模式都是先算好再重播演出,
// 這裡是真的算出來的,所以物理錯了就是結果錯了。
//
// 盤子的形狀只在 stadium.js 定義;陀螺的類型、轉速、爆裂在 beys.js。
// 出局三種:掉進口袋(ringout)、停轉(spinout)、爆裂(burst)。
// 停轉是**終止保證**:每顆陀螺的轉速一定會掉到 0,所以每一場一定會結束。
//
// 同隊之間**只分離、不施加衝量**:他們會互相推開避免穿透,但永遠不會把隊友撞出去或撞爆。
import { newId } from '../../shared/js/ids.js';
import { expand } from '../../shared/js/roster.js';
import {
  HALF, WALL_BOUNCE, RAIL_FLING,
  wallDistance, wallNormal, pocketAt, slopeAccel, railAccel, onRail, pocketRest, randomSpot,
} from './stadium.js';
import {
  HIT_POWER, HIT_FULL, ATTACK_GAIN, SHIELD_KNOCK, HIT_SPIN_COST, WALL_SPIN_COST,
  statsOf, layers, beyRadius, rollBey, hitStrength, burstChance, decaySpin,
} from './beys.js';
import { BLAST_RADIUS } from './items.js';

export { HIT_POWER, HIT_FULL };

const RESTITUTION = 1.15;
const FRICTION = 0.995;
const SPAWN_MARGIN = 30;

export function createWorld({ fighters, rng = Math.random }) {
  const total = fighters.reduce((n, f) => n + (Number.isFinite(f.count) ? Math.max(0, Math.floor(f.count)) : 0), 0);
  const radius = beyRadius(total);
  const combatants = expand(fighters, fighter => {
    const { x, y } = randomSpot(rng, SPAWN_MARGIN);
    const { animal, beyType } = rollBey(rng);
    return {
      id: newId('c'),
      fighterId: fighter.id,
      x, y,
      vx: (rng() - 0.5) * 60,
      vy: (rng() - 0.5) * 60,
      radius,
      mass: statsOf({ beyType }).mass,
      alive: true,
      animal,
      beyType,
      spin: 1,
      outBy: null,
      pocket: null,
      railing: false,
      buffs: { attack: [], shield: [] },
      healedAt: -Infinity,
    };
  });
  return { combatants, items: [], strikes: [], time: 0 };
}

export function aliveOf(world) {
  return world.combatants.filter(c => c.alive);
}

// 只剩一個 fighterId 還有人活著才算分出勝負。全部出局時回 null ——
// 不要硬挑一個出來當贏家。
export function winnerTeam(world) {
  const teams = new Set(aliveOf(world).map(c => c.fighterId));
  return teams.size === 1 ? [...teams][0] : null;
}

function knockOut(c, outBy) {
  c.alive = false;
  c.outBy = outBy;
  c.vx = 0;
  c.vy = 0;
}

export function step(world, dt, rng = Math.random) {
  const next = world.combatants.map(c => ({ ...c, buffs: { attack: [...(c.buffs?.attack ?? [])], shield: [...(c.buffs?.shield ?? [])] } }));
  const impacts = [];

  // 1. 坡度、軌道、移動
  for (const c of next) {
    if (!c.alive) continue;
    const slope = slopeAccel(c.x, c.y);
    const rail = railAccel(c.x, c.y, c.vx, c.vy);
    c.vx += (slope.x + rail.x) * dt;
    c.vy += (slope.y + rail.y) * dt;
    c.x += c.vx * dt;
    c.y += c.vy * dt;
    c.vx *= FRICTION;
    c.vy *= FRICTION;

    // 衝完軌道的那一格,往中央甩 —— 極限衝刺是衝進戰場撞人,不是把自己送進口袋
    const railing = onRail(c.x, c.y);
    if (c.railing && !railing) {
      const n = wallNormal(c.x, c.y);
      const speed = Math.hypot(c.vx, c.vy);
      c.vx -= n.x * speed * RAIL_FLING;
      c.vy -= n.y * speed * RAIL_FLING;
    }
    c.railing = railing;
  }

  // 2. 互撞
  for (let i = 0; i < next.length; i++) {
    for (let j = i + 1; j < next.length; j++) {
      const a = next[i];
      const b = next[j];
      if (!a.alive || !b.alive) continue;

      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const dist = Math.hypot(dx, dy) || 0.0001;
      const overlap = a.radius + b.radius - dist;
      if (overlap <= 0) continue;

      const nx = dx / dist;
      const ny = dy / dist;

      // 先分離 —— 同隊與不同隊都要做,不然會互相穿透
      const push = overlap / 2;
      a.x -= nx * push;
      a.y -= ny * push;
      b.x += nx * push;
      b.y += ny * push;

      // 同隊到此為止:不施加任何衝量,隊友永遠不會把隊友撞出去
      if (a.fighterId === b.fighterId) continue;

      const rvx = b.vx - a.vx;
      const rvy = b.vy - a.vy;
      const along = rvx * nx + rvy * ny;
      if (along > 0) continue; // 已經在分開了,再給衝量會變成吸在一起

      // 加成是**不對稱**的:多出來的力只加在對方身上,自己的後座力維持原樣。
      // 兩邊都乘同一個係數的話,撿到劍的人自己也被彈得一樣遠 —— 玩起來完全沒感覺。
      // 代價是這一撞不守恆動量,但這是給小孩看的卡通碰撞,不是撞球。
      const impulse = (-(1 + RESTITUTION) * along) / (1 / a.mass + 1 / b.mass);
      const onto = (from, to) => statsOf(from).power
        * (1 + layers(from, 'attack') * ATTACK_GAIN)
        * SHIELD_KNOCK ** layers(to, 'shield');
      const ontoA = onto(b, a);
      const ontoB = onto(a, b);
      a.vx -= (impulse * ontoA * nx) / a.mass;
      a.vy -= (impulse * ontoA * ny) / a.mass;
      b.vx += (impulse * ontoB * nx) / b.mass;
      b.vy += (impulse * ontoB * ny) / b.mass;

      // power 取「被推得比較多的那個速度變化」—— 觀眾看到的就是有人飛出去。
      // HIT_POWER 這道門檻是必要的:實測每秒 15 次碰撞,中位數只有 3,那是互相推擠。
      const powerA = (impulse * ontoA) / a.mass;
      const powerB = (impulse * ontoB) / b.mass;
      const power = Math.max(powerA, powerB);
      if (power >= HIT_POWER) {
        impacts.push({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, power });
      }

      // 被打到的一方扣轉速、擲爆裂骰。兩邊各自算 —— 對撞時兩個都可能爆。
      for (const [me, them, p] of [[a, b, powerA], [b, a, powerB]]) {
        me.spin -= HIT_SPIN_COST * hitStrength(p);
        if (p >= HIT_POWER && rng() < burstChance({ power: p, attacker: them, target: me })) {
          knockOut(me, 'burst');
        }
      }
    }
  }

  // 3. 牆與口袋、轉速
  for (const c of next) {
    if (!c.alive) continue;

    const pocket = pocketAt(c.x, c.y);
    if (pocket && c.y > HALF) {
      // 中心越過前牆線、而且正對著口袋 —— 掉進去,停在口袋裡
      knockOut(c, 'ringout');
      c.pocket = pocket.id;
      Object.assign(c, pocketRest(pocket, c.x));
      continue;
    }

    // 口袋開口的地方沒有牆;其他地方一律擋回來。
    // 不管跑出去多遠都直接推回牆內 —— 飛彈能把人炸到一格跑 25 單位,不能讓它穿牆。
    const d = wallDistance(c.x, c.y);
    if (!pocket && d + c.radius > 0) {
      const n = wallNormal(c.x, c.y);
      c.x -= n.x * (d + c.radius);
      c.y -= n.y * (d + c.radius);
      const vn = c.vx * n.x + c.vy * n.y;
      if (vn > 0) {
        c.vx -= (1 + WALL_BOUNCE) * vn * n.x;
        c.vy -= (1 + WALL_BOUNCE) * vn * n.y;
        c.spin -= WALL_SPIN_COST;
      }
    }

    c.spin = decaySpin(c, dt);
    if (c.spin <= 0) {
      c.spin = 0;
      knockOut(c, 'spinout');
    }
  }

  return { ...world, combatants: next, time: world.time + dt, impacts };
}

// 每一格重新決定要往哪裡推。真的陀螺不會思考,所以這支刻意很弱 ——
// 主角是坡度與軌道,這裡只是讓陀螺「微微偏向敵人」,免得人少時各自在角落轉到停。
//
//   1. 躲快落下的飛彈準星 —— 力道很小,不然飛彈永遠炸不到人
//   2. 撿道具 —— 只有在道具比敵人近的時候才繞路
//   3. 追最近的敵人
//
// 不再躲邊緣:躲口袋會讓出局變得很難,也不像陀螺。
const SEEK = 45;
const ITEM_PULL = 60;
const STRIKE_FEAR = 0.8;   // 準星倒數剩幾秒開始偏開
const STRIKE_FORCE = 80;

const add = (v, x, y, k) => { v.x += x * k; v.y += y * k; };

function nearestEnemy(c, alive) {
  let best = null;
  let bestD = Infinity;
  for (const other of alive) {
    if (other === c || other.fighterId === c.fighterId) continue;
    const d = Math.hypot(other.x - c.x, other.y - c.y);
    if (d < bestD) { bestD = d; best = other; }
  }
  return best;
}

export function think(world, dt) {
  const alive = aliveOf(world);
  if (alive.length === 0) return world;

  const combatants = world.combatants.map(c => {
    if (!c.alive) return c;
    const want = { x: 0, y: 0 };

    for (const s of world.strikes ?? []) {
      if (s.fuse > STRIKE_FEAR) continue;
      const dx = c.x - s.x;
      const dy = c.y - s.y;
      const d = Math.hypot(dx, dy) || 1e-4;
      if (d > BLAST_RADIUS) continue;
      add(want, dx / d, dy / d, STRIKE_FORCE * (1 - d / BLAST_RADIUS));
    }

    const target = nearestEnemy(c, alive);
    let item = null;
    let itemDist = Infinity;
    for (const it of world.items ?? []) {
      const d = Math.hypot(it.x - c.x, it.y - c.y);
      if (d < itemDist) { itemDist = d; item = it; }
    }
    const targetDist = target ? Math.hypot(target.x - c.x, target.y - c.y) : Infinity;

    if (item && itemDist < targetDist) {
      const d = itemDist || 1e-4;
      add(want, (item.x - c.x) / d, (item.y - c.y) / d, ITEM_PULL);
    } else if (target) {
      const d = targetDist || 1e-4;
      add(want, (target.x - c.x) / d, (target.y - c.y) / d, SEEK);
    }

    return { ...c, vx: c.vx + want.x * dt, vy: c.vy + want.y * dt };
  });

  return { ...world, combatants };
}
```

`physics.js` 要 import `items.js` 的 `BLAST_RADIUS`:這一步先在 `smash/js/items.js` 把 `const BLAST_RADIUS = 46;` 改成 `export const BLAST_RADIUS = 46;`(其他不動,Task 5 才改寫 items)。`items.js` 不能 import `physics.js`(會循環)。

- [ ] **Step 5: `main.js` 跟著改(只改到頁面不壞)**

`smash/js/main.js`:
- 第 7 行 import 改成 `import { createWorld, step, think, aliveOf, winnerTeam, HIT_POWER, HIT_FULL } from './physics.js';`
- 刪掉第 20 行 `const ARENA = 100;`
- 第 65 行改成 `world = createWorld({ fighters: setup.fighters.filter(f => f.count > 0) });`
- 刪掉第 114 行 `world = shrink(world, dt);`
- `const MAX_TIME = 45;` 改成 `const MAX_TIME = 60;`,註解改成「保險:停轉保證一定會結束,這條只防萬一」

`smash/js/scene3d.js` 的 `draw()` 與 `frameCamera()` 用到 `world.arenaRadius` / `arenaRadius0`:這一步先把它們換成常數(Task 7 會整段重寫):
- `frameCamera` 裡 `const home = world.arenaRadius0 ?? world.arenaRadius;` 改成 `const home = 100 * Math.SQRT2;`(方盤的對角)
- `draw` 裡 `const r = world.arenaRadius;` 改成 `const r = 100;`
- `world.bombs` 一律改成 `(world.strikes ?? [])`(炸彈在 Task 5 變成空襲,先讓它畫不出東西也不會壞)
- `a.spin.rotation.y = ... (c.buffs?.speed ?? 0) * 14` 那一項拿掉
- `setOutline` 裡 `buffs?.attack > 0` 改成 `buffs?.attack?.length > 0`,`buffs?.speed > 0` 那一段刪掉(只剩攻擊會變框)

- [ ] **Step 6: 跑測試確認通過**

Run: `node --test test/smash.test.js test/smash-match.test.js test/smash-stadium.test.js test/smash-beys.test.js test/modules.test.js`
Expected: 全部 PASS。

若 `'沒有道具也一定打得完'` 或 `'出局方式不會一面倒'` 失敗:**只調數值**(`SPIN_DECAY`、`SLOPE_ACCEL`、`RAIL_ACCEL`、`HIT_SPIN_COST`、`BURST_BASE`),不要改規則;把調整前後的出局統計寫進 commit message。`test/smash-items.test.js` 這一步會失敗(還在測舊道具),Task 5 會改寫它 —— 這一步先跑上面列的檔案就好。

- [ ] **Step 7: 實際開頁面看一眼不會壞**

Run: `python3 -m http.server 8765`(repo 根目錄,背景執行),瀏覽器開 `http://localhost:8765/smash/`,按「開打!」—— 陀螺會在原本的米色圓盤上打(畫面還沒改),但要能打到出結果、主控台沒有錯誤。

- [ ] **Step 8: Commit**

```bash
git add smash/js/physics.js smash/js/items.js smash/js/main.js smash/js/scene3d.js test/smash.test.js test/smash-match.test.js
git commit -m "feat(smash): physics on the stadium — slope, closed wall, pockets, rail; spin-out and burst replace the shrinking arena"
```

---

### Task 4: 整場平衡驗證(類型有強弱但不是穩贏)

**Files:**
- Test: `test/smash-match.test.js`

**Interfaces:**
- Consumes: Task 3 的 `playMatch`(同一個測試檔)
- Produces: 無(只有測試與必要時的數值調整)

- [ ] **Step 1: 寫測試**

在 `test/smash-match.test.js` 最後加:

```js
// 類型是隨機發的。如果某一型強到穩贏,誰贏就變成「誰抽到好陀螺」。
// 這裡用一對一、固定類型,看每一型對每一型都不會是 0% 或 100%。
import { TYPE_STATS } from '../smash/js/beys.js';

function duel(typeA, typeB, seeds = 80) {
  const red = createFighter({ name: '紅', count: 1 });
  const blue = createFighter({ name: '藍', count: 1 });
  let redWins = 0;
  let decided = 0;
  for (let seed = 0; seed < seeds; seed++) {
    const rng = seeded(seed);
    let world = createWorld({ fighters: [red, blue], rng });
    world = {
      ...world,
      combatants: world.combatants.map(c => {
        const beyType = c.fighterId === red.id ? typeA : typeB;
        return { ...c, beyType, mass: TYPE_STATS[beyType].mass };
      }),
    };
    while (world.time < 60) {
      world = think(world, 1 / 60);
      world = step(world, 1 / 60, rng);
      if (winnerTeam(world) || aliveOf(world).length === 0) break;
    }
    const won = winnerTeam(world);
    if (!won) continue;
    decided++;
    if (won === red.id) redWins++;
  }
  return { redWins, decided };
}

test('每一型對每一型都有輸有贏 —— 抽到什麼不等於穩贏', () => {
  for (const a of ['attack', 'defense', 'stamina']) {
    for (const b of ['attack', 'defense', 'stamina']) {
      if (a === b) continue;
      const { redWins, decided } = duel(a, b);
      const rate = redWins / decided;
      assert.ok(decided >= 40, `${a} vs ${b}:只有 ${decided} 場分出勝負`);
      assert.ok(rate > 0.15 && rate < 0.85, `${a} vs ${b} 勝率 ${(rate * 100).toFixed(0)}% 太一面倒`);
    }
  }
});
```

- [ ] **Step 2: 跑測試**

Run: `node --test test/smash-match.test.js`
Expected: PASS。若失敗,調 `TYPE_STATS`(只動倍率,維持 Task 2 測試裡的大小關係),每次只動一個數字、重跑,把最後的勝率表貼進 commit message。

- [ ] **Step 3: Commit**

```bash
git add test/smash-match.test.js smash/js/beys.js
git commit -m "test(smash): no bey type wins every duel"
```

---

### Task 5: 道具改版 —— 劍、盾、補包、飛彈

**Files:**
- Modify: `smash/js/items.js`(整支改寫)
- Test: `test/smash-items.test.js`(整支改寫)

**Interfaces:**
- Consumes: `stadium.randomSpot`、`beys.{ burstChance, HIT_POWER, SHIELD_KNOCK, layers }`
- Produces:
  - `ITEM_TYPES = ['attack', 'shield', 'spin', 'missile']`
  - `BUFF_TIME = 8`、`MAX_LAYERS = 3`、`MISSILE_FUSE = 1.2`、`BLAST_RADIUS = 46`、`BLAST_POWER = 620`、`HEAL_FLASH = 0.6`
  - `spawnItem(world, type, rng) → world`
  - `addLayer(list) → list`
  - `tickBuffs(world, dt) → world`
  - `applyPickups(world) → world`(吃到飛彈 → `world.strikes` 多一筆 `{ id, fighterId, x, y, fuse }`)
  - `explodeMissiles(world, dt, rng = Math.random) → world`(炸完的空襲從 `strikes` 移除)
  - **刪除** `spawnBomb`、`explodeBombs`

- [ ] **Step 1: 改寫測試**

`test/smash-items.test.js`:

```js
// 四種道具:劍、盾、補包、飛彈。
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ITEM_TYPES, BUFF_TIME, MAX_LAYERS, MISSILE_FUSE, BLAST_RADIUS,
  spawnItem, addLayer, tickBuffs, applyPickups, explodeMissiles,
} from '../smash/js/items.js';
import { wallDistance, pocketAt } from '../smash/js/stadium.js';

function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const at = (fighterId, x, y, vx = 0, vy = 0, extra = {}) => ({
  id: `c_${fighterId}_${x}_${y}`, fighterId, x, y, vx, vy,
  radius: 8, mass: 1, alive: true, spin: 1, outBy: null, pocket: null, railing: false,
  buffs: { attack: [], shield: [] }, healedAt: -Infinity, ...extra,
});
const world = combatants => ({ combatants, items: [], strikes: [], time: 3 });
const item = (type, x = 0, y = 0) => ({ id: `i_${type}`, type, x, y, radius: 7 });
const never = () => 0.999;

test('四種道具就這四種', () => {
  assert.deepEqual([...ITEM_TYPES], ['attack', 'shield', 'spin', 'missile']);
});

test('道具掉在盤內,不會掉在牆邊或口袋上', () => {
  for (let seed = 0; seed < 80; seed++) {
    const it = spawnItem(world([]), 'attack', seeded(seed)).items[0];
    assert.ok(wallDistance(it.x, it.y) < -it.radius);
  }
});

test('劍與盾:吃一個多一層,每層 8 秒', () => {
  let w = { ...world([at('red', 0, 0)]), items: [item('attack')] };
  w = applyPickups(w);
  assert.deepEqual(w.combatants[0].buffs.attack, [BUFF_TIME]);
  w = applyPickups({ ...w, items: [item('shield')] });
  assert.deepEqual(w.combatants[0].buffs.shield, [BUFF_TIME]);
});

test('最多疊 3 層,再吃就刷新最舊那層', () => {
  assert.deepEqual(addLayer([]), [BUFF_TIME]);
  assert.deepEqual(addLayer([2, 5, 7]), [BUFF_TIME, 5, 7]);
  assert.equal(addLayer([1, 2, 3]).length, MAX_LAYERS);
});

test('每層各自倒數,時間到就掉一層', () => {
  const w = world([at('red', 0, 0, 0, 0, { buffs: { attack: [0.5, 6], shield: [1] } })]);
  const out = tickBuffs(w, 0.6);
  assert.deepEqual(out.combatants[0].buffs.attack.map(t => +t.toFixed(2)), [5.4]);
  assert.deepEqual(out.combatants[0].buffs.shield.map(t => +t.toFixed(2)), [0.4]);
});

test('補包把轉速補滿,而且記下補的時間(畫面閃綠用)', () => {
  const w = { ...world([at('red', 0, 0, 0, 0, { spin: 0.2 })]), items: [item('spin')] };
  const out = applyPickups(w);
  assert.equal(out.combatants[0].spin, 1);
  assert.equal(out.combatants[0].healedAt, 3);
});

test('搆不到的道具不會被撿走;出局的人撿不到', () => {
  const far = applyPickups({ ...world([at('red', 0, 0)]), items: [item('attack', 80, 0)] });
  assert.equal(far.items.length, 1);
  const dead = applyPickups({ ...world([at('red', 0, 0, 0, 0, { alive: false })]), items: [item('attack')] });
  assert.equal(dead.items.length, 1);
});

test('同一個道具不會被兩個人同時撿走', () => {
  const out = applyPickups({ ...world([at('red', -2, 0), at('blue', 2, 0)]), items: [item('attack')] });
  assert.equal(out.combatants.filter(c => c.buffs.attack.length > 0).length, 1);
});

/* ---------- 飛彈 ---------- */

test('吃到飛彈:鎖定最近敵人「當下」的位置,準星用發射隊伍', () => {
  const w = { ...world([at('red', 0, 0), at('blue', 30, 0), at('green', 60, 0)]), items: [item('missile')] };
  const out = applyPickups(w);
  assert.equal(out.strikes.length, 1);
  const s = out.strikes[0];
  assert.equal(s.fighterId, 'red');
  assert.deepEqual([s.x, s.y], [30, 0]);
  assert.equal(s.fuse, MISSILE_FUSE);
});

test('不追蹤:目標之後移開,準星還在原地', () => {
  let w = applyPickups({ ...world([at('red', 0, 0), at('blue', 30, 0)]), items: [item('missile')] });
  w = { ...w, combatants: w.combatants.map(c => (c.fighterId === 'blue' ? { ...c, x: -50 } : c)) };
  w = explodeMissiles(w, 0.5, never);
  assert.deepEqual([w.strikes[0].x, w.strikes[0].y], [30, 0]);
});

test('場上沒有敵人就不發射', () => {
  const out = applyPickups({ ...world([at('red', 0, 0), at('red', 30, 0)]), items: [item('missile')] });
  assert.equal(out.strikes.length, 0);
  assert.equal(out.items.length, 0, '道具還是被吃掉了');
});

test('倒數沒到不炸', () => {
  const w = { ...world([at('blue', 0, 0)]), strikes: [{ id: 's', fighterId: 'red', x: 0, y: 0, fuse: 1 }] };
  const out = explodeMissiles(w, 0.2, never);
  assert.equal(out.strikes.length, 1);
  assert.equal(out.combatants[0].vx, 0);
});

test('炸開:圈內不分敵我都被推開,飛彈消失', () => {
  const w = {
    ...world([at('red', 10, 0), at('blue', -10, 0)]),
    strikes: [{ id: 's', fighterId: 'red', x: 0, y: 0, fuse: 0.05 }],
  };
  const out = explodeMissiles(w, 0.1, never);
  assert.equal(out.strikes.length, 0);
  assert.ok(out.combatants[0].vx > 100, '發射隊伍自己人也要被炸開');
  assert.ok(out.combatants[1].vx < -100);
});

test('目標在落下前就出局,照樣在準星炸開', () => {
  const w = {
    ...world([at('blue', 0, 0, 0, 0, { alive: false, outBy: 'spinout' }), at('green', 20, 0)]),
    strikes: [{ id: 's', fighterId: 'red', x: 0, y: 0, fuse: 0.01 }],
  };
  const out = explodeMissiles(w, 0.1, never);
  assert.equal(out.strikes.length, 0);
  assert.ok(out.combatants[1].vx > 0);
  assert.equal(out.combatants[0].vx, 0, '已出局的不會被炸飛');
});

test('圈外不受影響', () => {
  const w = { ...world([at('blue', BLAST_RADIUS + 5, 0)]), strikes: [{ id: 's', fighterId: 'red', x: 0, y: 0, fuse: 0 }] };
  assert.equal(explodeMissiles(w, 0.1, never).combatants[0].vx, 0);
});

test('重的、有盾的被炸得比較輕', () => {
  const blast = c => explodeMissiles({ ...world([c]), strikes: [{ id: 's', fighterId: 'red', x: 0, y: 0, fuse: 0 }] }, 0.1, never).combatants[0].vx;
  const base = blast(at('blue', 10, 0));
  assert.ok(blast(at('blue', 10, 0, 0, 0, { mass: 1.8 })) < base);
  assert.ok(blast(at('blue', 10, 0, 0, 0, { buffs: { attack: [], shield: [8] } })) < base);
});

test('爆炸也可能炸出爆裂', () => {
  const w = { ...world([at('blue', 5, 0)]), strikes: [{ id: 's', fighterId: 'red', x: 0, y: 0, fuse: 0 }] };
  const out = explodeMissiles(w, 0.1, () => 0);
  assert.equal(out.combatants[0].outBy, 'burst');
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `node --test test/smash-items.test.js`
Expected: FAIL(`addLayer` / `tickBuffs` / `explodeMissiles` 不存在)

- [ ] **Step 3: 改寫 `smash/js/items.js`**

```js
// 四種道具。全部是純函式,回傳新的 world。
//
//   attack  劍:每一層 8 秒,撞別人時對方飛更遠、更容易爆(在 physics.step 裡吃 buffs.attack)
//   shield  盾:每一層 8 秒,自己被撞時飛得近、比較難爆
//   spin    補包:轉速補滿(轉速就是命)
//   missile 飛彈:鎖定最近敵人**當下的位置**,1.2 秒後從天空落下炸開。不追蹤,圈內敵我都炸
//
// 劍盾最多疊 3 層 —— 不設上限的話疊到 5 層劍幾乎一碰就爆,8 秒內誰也擋不住。
import { newId } from '../../shared/js/ids.js';
import { randomSpot } from './stadium.js';
import { burstChance, HIT_POWER, SHIELD_KNOCK, layers } from './beys.js';

export const ITEM_TYPES = Object.freeze(['attack', 'shield', 'spin', 'missile']);

export const BUFF_TIME = 8;
export const MAX_LAYERS = 3;
export const HEAL_FLASH = 0.6;      // 補包的綠框閃幾秒(畫面用)
export const MISSILE_FUSE = 1.2;
export const BLAST_RADIUS = 46;     // 看到的準星圈就是真的會被炸到的範圍
export const BLAST_POWER = 620;

const ITEM_RADIUS = 7;
const ITEM_MARGIN = 22;             // 不掉在牆邊,也就不會掉在口袋上

export function spawnItem(world, type, rng = Math.random) {
  const { x, y } = randomSpot(rng, ITEM_MARGIN);
  return { ...world, items: [...world.items, { id: newId('it'), type, x, y, radius: ITEM_RADIUS }] };
}

// 多一層;滿了就把最舊(剩最少秒數)那層刷新。
export function addLayer(list) {
  if (list.length < MAX_LAYERS) return [...list, BUFF_TIME];
  const oldest = list.indexOf(Math.min(...list));
  return list.map((t, i) => (i === oldest ? BUFF_TIME : t));
}

export function tickBuffs(world, dt) {
  const tick = list => list.map(t => t - dt).filter(t => t > 0);
  return {
    ...world,
    combatants: world.combatants.map(c => ({
      ...c,
      buffs: { attack: tick(c.buffs?.attack ?? []), shield: tick(c.buffs?.shield ?? []) },
    })),
  };
}

function nearestEnemy(who, combatants) {
  let best = null;
  let bestD = Infinity;
  for (const c of combatants) {
    if (!c.alive || c.fighterId === who.fighterId) continue;
    const d = Math.hypot(c.x - who.x, c.y - who.y);
    if (d < bestD) { bestD = d; best = c; }
  }
  return best;
}

// 撿到道具:套用效果、把道具拿掉。同一個道具不會被兩個人同時撿走。
export function applyPickups(world) {
  if (world.items.length === 0) return world;

  const combatants = world.combatants.map(c => ({
    ...c, buffs: { attack: [...(c.buffs?.attack ?? [])], shield: [...(c.buffs?.shield ?? [])] },
  }));
  const strikes = [...(world.strikes ?? [])];
  const taken = new Set();

  for (const item of world.items) {
    const who = combatants.find(c => c.alive && Math.hypot(c.x - item.x, c.y - item.y) <= c.radius + item.radius);
    if (!who) continue;
    taken.add(item.id);

    if (item.type === 'attack' || item.type === 'shield') {
      who.buffs[item.type] = addLayer(who.buffs[item.type]);
    } else if (item.type === 'spin') {
      who.spin = 1;
      who.healedAt = world.time;
    } else if (item.type === 'missile') {
      // 鎖的是**這一刻**的座標,之後目標怎麼跑都不管 —— 有準星預告,躲得掉才公平
      const target = nearestEnemy(who, combatants);
      if (target) strikes.push({ id: newId('ms'), fighterId: who.fighterId, x: target.x, y: target.y, fuse: MISSILE_FUSE });
    }
  }

  if (taken.size === 0) return world;
  return { ...world, combatants, strikes, items: world.items.filter(i => !taken.has(i.id)) };
}

// 準星倒數;歸零就炸開。圈內**不分敵我**都被推開,每一顆都擲一次爆裂骰。
export function explodeMissiles(world, dt, rng = Math.random) {
  const all = world.strikes ?? [];
  if (all.length === 0) return world;

  const strikes = all.map(s => ({ ...s, fuse: s.fuse - dt }));
  const blown = strikes.filter(s => s.fuse <= 0);
  if (blown.length === 0) return { ...world, strikes };

  const combatants = world.combatants.map(c => ({ ...c }));
  for (const s of blown) {
    for (const c of combatants) {
      if (!c.alive) continue;
      const dx = c.x - s.x;
      const dy = c.y - s.y;
      const dist = Math.hypot(dx, dy) || 0.0001;
      if (dist > BLAST_RADIUS) continue;
      const falloff = 1 - dist / BLAST_RADIUS;
      // 除以質量、乘盾:重的、有盾的被炸得比較輕,跟撞擊同一套規則
      const power = (BLAST_POWER * falloff * SHIELD_KNOCK ** layers(c, 'shield')) / c.mass;
      c.vx += (dx / dist) * power;
      c.vy += (dy / dist) * power;
      if (power >= HIT_POWER && rng() < burstChance({ power, attacker: null, target: c })) {
        c.alive = false;
        c.outBy = 'burst';
        c.vx = 0;
        c.vy = 0;
      }
    }
  }

  return { ...world, combatants, strikes: strikes.filter(s => s.fuse > 0) };
}
```

- [ ] **Step 4: 在 `test/smash.test.js` 的 AI 區塊加飛彈閃避的測試**

```js
test('準星快落下時,圈內的陀螺會往外偏一點', () => {
  const w = { ...arena, combatants: [at('red', 10, 0), at('blue', -60, 0)], strikes: [{ id: 's', fighterId: 'blue', x: 0, y: 0, fuse: 0.3 }] };
  // 敵人在左邊,不躲的話 vx 會是負的(往左追)
  const out = think(w, 1 / 60);
  const plain = think({ ...w, strikes: [] }, 1 / 60);
  assert.ok(out.combatants[0].vx > plain.combatants[0].vx, '沒有往外偏');
});

test('準星還早就不理它', () => {
  const w = { ...arena, combatants: [at('red', 10, 0), at('blue', -60, 0)], strikes: [{ id: 's', fighterId: 'blue', x: 0, y: 0, fuse: 1.1 }] };
  assert.equal(think(w, 1 / 60).combatants[0].vx, think({ ...w, strikes: [] }, 1 / 60).combatants[0].vx);
});
```

- [ ] **Step 5: 把道具接進整場測試**

`test/smash-match.test.js` 的 `playMatch` 加回道具(順序跟 Task 6 的 `main.js` 一樣):

```js
import { ITEM_TYPES, spawnItem, applyPickups, tickBuffs, explodeMissiles } from '../smash/js/items.js';

function playMatch({ fighters, seed, withItems = true, maxTime = MAX_TIME }) {
  const rng = seeded(seed);
  let world = createWorld({ fighters, rng });
  const dt = 1 / 60;
  let nextItem = 2.6;
  while (world.time < maxTime) {
    if (withItems) {
      nextItem -= dt;
      if (nextItem <= 0) {
        world = spawnItem(world, ITEM_TYPES[Math.floor(rng() * ITEM_TYPES.length)], rng);
        nextItem = 2.6;
      }
    }
    world = explodeMissiles(world, dt, rng);
    world = tickBuffs(world, dt);
    world = applyPickups(world);
    world = think(world, dt);
    world = step(world, dt, rng);
    const won = winnerTeam(world);
    if (won || aliveOf(world).length === 0) {
      return { winner: won, seconds: world.time, alive: aliveOf(world).length, world };
    }
  }
  return { winner: null, seconds: world.time, alive: aliveOf(world).length, timedOut: true, world };
}
```

並把 `'沒有道具也一定打得完'` 的呼叫改成 `playMatch({ fighters: teams(2), seed, withItems: false })`。

- [ ] **Step 6: 跑全部大亂鬥測試**

Run: `node --test test/smash*.test.js test/modules.test.js`
Expected: 全部 PASS

- [ ] **Step 7: Commit**

```bash
git add smash/js/items.js test/smash-items.test.js test/smash.test.js test/smash-match.test.js
git commit -m "feat(smash): sword and shield stack for 8s, med kit refills spin, missile strike replaces the bomb"
```

---

### Task 6: 存檔遷移、設定分頁、遊戲迴圈

**Files:**
- Modify: `smash/js/store.js`
- Modify: `smash/js/main.js`
- Modify: `smash/index.html:79-89`
- Modify: `smash/js/scene3d.js`(只改到能畫空襲,先用舊炸彈的畫法頂著)
- Test: `test/smash.test.js`(或現有的 store 測試;`grep -n "sanitize\|smash.v1" test/*.js` 找到 store 測試所在的檔案,加在那裡)

**Interfaces:**
- Consumes: Task 5 的 `ITEM_TYPES`、`spawnItem`、`applyPickups`、`tickBuffs`、`explodeMissiles`
- Produces: `createSmashSetup().items = { attack: true, shield: true, spin: true, missile: true }`;`sanitize` 的遷移規則

- [ ] **Step 1: 寫失敗的測試**

```js
import { store, createSmashSetup } from '../smash/js/store.js';

// store.load() 讀 localStorage;Node 裡用一個假的 localStorage 餵舊資料進去
function loadFrom(raw) {
  const mem = new Map([['smash.v1', JSON.stringify(raw)]]);
  globalThis.localStorage = {
    getItem: k => mem.get(k) ?? null,
    setItem: (k, v) => mem.set(k, v),
    removeItem: k => mem.delete(k),
  };
  return store.load();
}

const oldSave = items => ({
  schema: 1,
  activeSetupId: 's1',
  setups: [{ id: 's1', name: '舊的', fighters: [{ id: 'f1', name: '紅隊', color: '#E4572E', count: 3 }], items }],
});

test('新設定:四個道具都開', () => {
  assert.deepEqual(createSmashSetup().items, { attack: true, shield: true, spin: true, missile: true });
});

test('舊存檔:速度 → 補包、炸彈 → 飛彈,關掉的照樣關掉;盾預設開;變大丟掉', () => {
  const s = loadFrom(oldSave({ attack: true, speed: false, giant: false, bomb: false })).setups[0];
  assert.deepEqual(s.items, { attack: true, shield: true, spin: false, missile: false });
});

test('壞掉的 items 也讀得進來,四個開關都有值', () => {
  for (const bad of [null, 'oops', 42, [], { giant: false }]) {
    const s = loadFrom(oldSave(bad)).setups[0];
    assert.deepEqual(Object.keys(s.items).sort(), ['attack', 'missile', 'shield', 'spin']);
  }
});

test('隊伍資料沒有多出動物欄位', () => {
  const s = loadFrom(oldSave({})).setups[0];
  assert.deepEqual(Object.keys(s.fighters[0]).sort(), ['color', 'count', 'id', 'name']);
});
```

先確認 `shared/js/storage.js` 的 `createStore` 讀寫的是 `localStorage` 與 `{ schema, ... }` 格式:`sed -n 1,80p shared/js/storage.js`。如果格式不同(例如外層還包一層),照實際格式調整 `oldSave`,**不要改 storage.js**。

- [ ] **Step 2: 跑測試確認失敗**

Run: `node --test test/smash.test.js`
Expected: FAIL(`items` 還是舊的四個鍵)

- [ ] **Step 3: 改 `smash/js/store.js`**

`createSmashSetup` 的預設:

```js
    items: items ?? { attack: true, shield: true, spin: true, missile: true },
```

`sanitizeSetup` 裡的 items 段落換成:

```js
  // 舊存檔的道具改名了:速度 → 補包(spin)、炸彈 → 飛彈(missile)。
  // 盾牌是新的,舊存檔沒有就是開;變大(giant)拿掉了,直接忽略。
  const ITEM_ALIASES = { spin: 'speed', missile: 'bomb' };
  const rawItems = raw.items && typeof raw.items === 'object' && !Array.isArray(raw.items) ? raw.items : {};
  const items = {};
  for (const t of ITEM_TYPES) items[t] = (rawItems[t] ?? rawItems[ITEM_ALIASES[t]]) !== false;
```

- [ ] **Step 4: 改 `smash/index.html` 的道具分頁**

把 `data-panel="items"` 裡四個 `<label class="switch">` 換成:

```html
      <label class="switch"><input type="checkbox" id="itemAttack"><span class="switch__box"></span>
        <span class="switch__text">⚔️ 攻擊<small>8 秒內撞人更大力、更容易把對方撞爆,可以疊 3 層</small></span></label>
      <label class="switch"><input type="checkbox" id="itemShield"><span class="switch__box"></span>
        <span class="switch__text">🛡️ 防護<small>8 秒內不容易被撞飛、不容易爆,可以疊 3 層</small></span></label>
      <label class="switch"><input type="checkbox" id="itemSpin"><span class="switch__box"></span>
        <span class="switch__text">🩹 回轉<small>轉速補滿,快停的陀螺又活過來</small></span></label>
      <label class="switch"><input type="checkbox" id="itemMissile"><span class="switch__box"></span>
        <span class="switch__text">🚀 飛彈<small>瞄準最近的敵人從天上落下,圈裡的誰都會被炸開</small></span></label>
```

- [ ] **Step 5: 改 `smash/js/main.js`**

- import:`import { ITEM_TYPES, spawnItem, applyPickups, tickBuffs, explodeMissiles } from './items.js';`
- `ITEM_INPUT` 換成 `const ITEM_INPUT = { attack: 'itemAttack', shield: 'itemShield', spin: 'itemSpin', missile: 'itemMissile' };`
- `frame` 裡掉道具的那段換成:

```js
    const enabled = ITEM_TYPES.filter(t => getActive(state).items[t]);
    nextItem -= dt;
    if (nextItem <= 0 && enabled.length > 0) {
      world = spawnItem(world, enabled[Math.floor(Math.random() * enabled.length)]);
      nextItem = ITEM_EVERY;
    }

    const before = aliveOf(world).length;
    world = explodeMissiles(world, dt);
    world = tickBuffs(world, dt);
    world = applyPickups(world);
    world = think(world, dt);
    world = step(world, dt);
```

(後面 `sfx.clunk`、`hitSound`、`scene.draw`、勝負判定不變。)

- [ ] **Step 6: `scene3d.js` 暫時用舊炸彈畫空襲**

`draw()` 裡把 `for (const bomb of world.bombs)` 與 `seenBombs` 那兩段的 `world.bombs` 改成 `(world.strikes ?? [])`;`bombVisual(bomb)` 用 `strike.fuse` 一樣跑得動(引信 1.2 秒)。這是過渡,Task 9 會換成準星 + 飛彈。

- [ ] **Step 7: 跑測試、開頁面**

Run: `node --test test/`
Expected: 全部 PASS

開 `http://localhost:8765/smash/`:設定 → 道具分頁看到四個新開關;關掉「飛彈」按確定,打一場確認不會掉飛彈;主控台沒有錯誤。用 DevTools 在 Application → Local Storage 把 `smash.v1` 改成含 `"speed":false` 的舊格式、重新整理,設定裡「回轉」是關的。

- [ ] **Step 8: Commit**

```bash
git add smash/js/store.js smash/js/main.js smash/index.html smash/js/scene3d.js test/
git commit -m "feat(smash): item switches become attack/shield/spin/missile; old saves migrate"
```

---

### Task 7: 對戰盤畫面 + 鏡頭 —— 使用者檢查點

**Files:**
- Create: `smash/js/stadium3d.js`
- Modify: `smash/js/scene3d.js`(移除米色圓盤、`createScene(canvas, { pitch })`、`frameCamera` 簡化、陀螺高度跟 `heightAt`)
- Create(不 commit):`_probe-frame.html`、`_probe-smash.html`

**Interfaces:**
- Consumes: `stadium.{ HALF, CORNER, DEPTH, POCKETS, POCKET_DEPTH, RAIL_WIDTH, heightAt, wallDistance, wallPath, onRail }`;`scene3d` 的 `part()` / `outlinable()`(從 `scene3d.js` 搬到新的 `smash/js/outline3d.js` 讓兩邊共用)
- Produces:
  - `smash/js/outline3d.js`:`export { INK, outlinable, part }`(從 `scene3d.js` 原封不動搬過來)
  - `createStadium() → THREE.Group`(userData.edges / fills 跟其他 outlinable 一樣)
  - `createScene(canvas, { pitch = 50 } = {})`
  - 物理 → 畫面的高度:`GROUND + heightAt(x, y)`

- [ ] **Step 1: 收集真盤子的參考圖**

用 claude-in-chrome(先載入 `tabs_context_mcp`、`tabs_create_mcp`、`navigate`、`computer`)開這幾頁,截下 Xtreme Stadium 的俯視與斜視照片,存到 `tools/mascot-gen/review/smash/ref-*.png`(gitignored):
- `https://beyblade.fandom.com/wiki/Xtreme_Stadium`
- `https://www.printables.com/model/1201444-beyblade-x-stadium-with-working-xtreme-line`(只看照片與描述裡的尺寸,**不下載、不使用模型檔**)

從照片量出:口袋寬 / 盤寬、口袋深度、圓角半徑 / 盤寬、牆高 / 盤寬、軌道離牆的距離。跟 `stadium.js` 的常數比對,差超過 20% 的列成表給使用者,**使用者同意後**才改常數(改了要重跑 `node --test test/smash*.test.js`)。使用者有提供自己的照片就以那張為準。

- [ ] **Step 2: 抽出 `outline3d.js`**

把 `scene3d.js` 的 `INK`、`outlinable()`、`part()`(含註解)原封不動搬到 `smash/js/outline3d.js` 並 export;`scene3d.js` 改成 `import { INK, outlinable, part } from './outline3d.js';`。開頁面確認一切照舊。

- [ ] **Step 3: 寫 `smash/js/stadium3d.js`**

```js
// 對戰盤的網格。形狀全部從 stadium.js 來 —— 這支不能自己發明任何一個尺寸。
//
// 平塗不打光,看不出凹凸,所以靠兩件事讓小孩看得出「這是碗」:
// 盤底的頂點色中間淺、外圍深一點;再畫 3 圈沿坡度的等高線。
import * as THREE from 'three';
import { INK, outlinable, part } from './outline3d.js';
import {
  HALF, DEPTH, POCKETS, POCKET_DEPTH, RAIL_WIDTH,
  heightAt, wallDistance, wallPath, onRail,
} from './stadium.js';

export const COLORS = Object.freeze({
  floorCenter: 0xEAF6FD,   // 很淡的冰藍
  floorEdge: 0xC9E6F7,
  wall: 0x8EC5E8,          // 深一階
  wallTop: 0xB5DCF3,
  rail: 0xFFFFFF,
  pocket: 0x3E5A73,        // 口袋內側深色
  contour: 0x9CCBE8,
});
const WALL_H = 12;         // 牆頂比牆腳高多少
const WALL_T = 6;          // 牆厚
const GRID = 72;           // 盤底網格每邊幾格

// 盤底:在外接正方形上鋪網格,只保留盤內的三角形;每個頂點的高度 = heightAt。
function floorGeometry(ground) {
  const pos = [];
  const col = [];
  const c0 = new THREE.Color(COLORS.floorCenter);
  const c1 = new THREE.Color(COLORS.floorEdge);
  const vert = (x, y) => {
    const h = heightAt(x, y);
    pos.push(x, ground + h, y);
    const k = h / DEPTH;
    const c = c0.clone().lerp(c1, k);
    col.push(c.r, c.g, c.b);
  };
  const step = (HALF * 2) / GRID;
  for (let i = 0; i < GRID; i++) {
    for (let j = 0; j < GRID; j++) {
      const x0 = -HALF + i * step;
      const y0 = -HALF + j * step;
      const x1 = x0 + step;
      const y1 = y0 + step;
      // 四個角都在盤內才畫(邊緣那一圈由牆蓋住,不會露縫)
      if ([[x0, y0], [x1, y0], [x0, y1], [x1, y1]].some(([x, y]) => wallDistance(x, y) > 1)) continue;
      vert(x0, y0); vert(x0, y1); vert(x1, y0);
      vert(x1, y0); vert(x0, y1); vert(x1, y1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return g;
}

// 等高線:沿著「離牆距離固定」的圈,高度用 heightAt —— 線就貼在碗面上。
function contour(ground, inset) {
  const pts = wallPath(24).map(p => {
    const n = Math.hypot(p.x, p.y) || 1;
    // 從牆往圓心方向退 inset(圓角方形的等距線近似)
    const x = p.x - (p.x / n) * inset;
    const y = p.y - (p.y / n) * inset;
    return new THREE.Vector3(x, ground + heightAt(x, y) + 0.15, y);
  });
  pts.push(pts[0].clone());
  return new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: COLORS.contour }));
}

export function createStadium(ground) {
  const g = outlinable();

  const floor = new THREE.Mesh(floorGeometry(ground), new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide }));
  g.add(floor);
  g.userData.fills.push(floor);
  for (const inset of [20, 36, 50]) g.add(contour(ground, inset));

  // 外牆:沿 wallPath 一段一段立起來的板子;口袋的地方,牆往外退 POCKET_DEPTH 圍住口袋
  const path = wallPath(16);
  const top = ground + DEPTH;
  const WALL = new THREE.BoxGeometry(1, 1, 1);
  for (let i = 0; i < path.length; i++) {
    const a = path[i];
    const b = path[(i + 1) % path.length];
    const mx = (a.x + b.x) / 2;
    const my = (a.y + b.y) / 2;
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (len < 1e-6) continue;
    const pocket = POCKETS.find(p => my > 0 && Math.abs(my) >= Math.abs(mx) && mx > p.x0 && mx < p.x1);
    const out = pocket ? POCKET_DEPTH : 0;
    const seg = part(g, WALL, COLORS.wall, {
      pos: [mx, top + WALL_H / 2 - (pocket ? WALL_H : 0) / 2, my + out],
      scale: [len + 0.6, WALL_H, WALL_T],
      outline: 0.6,
      depth: true,
    });
    seg.rotation.y = -Math.atan2(b.y - a.y, b.x - a.x);
    // part() 的描邊殼是最後一個 edge,也要轉同一個角度
    g.userData.edges[g.userData.edges.length - 1].rotation.y = seg.rotation.y;
  }

  // 口袋:前牆線外側的深色凹槽 + 兩側隔板
  for (const p of POCKETS) {
    part(g, WALL, COLORS.pocket, {
      pos: [(p.x0 + p.x1) / 2, top - 6, HALF + POCKET_DEPTH / 2],
      scale: [p.x1 - p.x0, 1, POCKET_DEPTH],
      outline: 0.4,
      depth: true,
    });
    for (const x of [p.x0, p.x1]) {
      part(g, WALL, COLORS.wall, { pos: [x, top + WALL_H / 2 - 4, HALF + POCKET_DEPTH / 2], scale: [2, WALL_H, POCKET_DEPTH], outline: 0.4, depth: true });
    }
  }

  // 軌道齒:沿外牆內側每隔一段一顆白色小方塊;onRail 為 false 的地方(口袋前)不放
  const TOOTH = new THREE.BoxGeometry(1, 1, 1);
  for (const p of wallPath(40)) {
    const n = Math.hypot(p.x, p.y) || 1;
    const x = p.x - (p.x / n) * (RAIL_WIDTH / 2);
    const y = p.y - (p.y / n) * (RAIL_WIDTH / 2);
    if (!onRail(x, y)) continue;
    part(g, TOOTH, COLORS.rail, { pos: [x, ground + heightAt(x, y) + 1.2, y], scale: [2.2, 2.4, 2.2], outline: 0.5, depth: true });
  }

  return g;
}
```

實作時用預覽頁看實際效果,**牆與口袋的擺法以畫面為準調整**(例如牆段要沿法線往外推半個牆厚、口袋隔板的高度);但所有位置都必須由 `stadium.js` 的常數 / 函式算出來,不准寫死新的尺寸數字以外的形狀(`WALL_H`、`WALL_T`、`GRID` 這種純外觀厚度例外)。

- [ ] **Step 4: 改 `scene3d.js`**

- 刪掉米色圓盤(`arena`、`rim`、`inner` 三個物件與 `draw()` 裡縮放它們的那幾行),改成 `root.add(createStadium(GROUND));`
- `createScene(canvas, { pitch = 50 } = {})`:`CAM_DIR` 改成 `new THREE.Vector3(0, Math.sin(pitch * Math.PI / 180), Math.cos(pitch * Math.PI / 180))`;`CAM_SIN`、`CAM_COS` 跟著由 `CAM_DIR` 算
- `frameCamera` 簡化:不再看 `c.radius`(沒有變大了),`need = HALF + POCKET_DEPTH`、`tall = DEPTH + 12`,其餘照舊(仍依長寬比算距離)
- 陀螺的高度:`a.group.position.set(c.x, GROUND + heightAt(c.x, c.y), c.y)`;影子同樣 `GROUND + heightAt(...) + 0.25`
- 道具與準星的高度同樣加 `heightAt`

- [ ] **Step 5: 預覽頁(不 commit)**

`_probe-frame.html`(repo 根目錄):

```html
<!doctype html><meta charset="utf-8">
<style>body{margin:0;background:#888;display:flex;gap:16px;padding:16px;flex-wrap:wrap}iframe{border:0;background:#fff}</style>
<script>
  // 用法:_probe-frame.html?src=_probe-smash.html%3Fpitch%3D50&w=390&h=844
  const q = new URLSearchParams(location.search);
  const f = document.createElement('iframe');
  f.src = q.get('src');
  f.width = q.get('w') || 390;
  f.height = q.get('h') || 844;
  document.body.append(f);
</script>
```

`_probe-smash.html`:

```html
<!doctype html><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="stylesheet" href="shared/css/tokens.css">
<style>html,body{margin:0;height:100%}canvas{width:100%;height:100%;display:block}</style>
<script type="importmap">{"imports":{"three":"./vendor/three.module.min.js"}}</script>
<canvas id="c"></canvas>
<script type="module">
  import { createScene } from './smash/js/scene3d.js';
  import { createWorld } from './smash/js/physics.js';
  import { createFighter } from './smash/js/fighters.js';
  const q = new URLSearchParams(location.search);
  const scene = createScene(document.getElementById('c'), { pitch: Number(q.get('pitch') || 50) });
  const fighters = [createFighter({ name: '紅', color: '#E4572E', count: 3 }), createFighter({ name: '藍', color: '#3D7EA6', count: 3 })];
  const world = createWorld({ fighters });
  scene.resize();
  scene.draw(world, new Map(fighters.map(f => [f.id, f])));
</script>
```

- [ ] **Step 6: 截圖給使用者**

伺服器:`python3 -m http.server 8765`(repo 根目錄)。用 claude-in-chrome 截這 6 張:
- `http://localhost:8765/_probe-frame.html?src=_probe-smash.html%3Fpitch%3D45&w=390&h=844`(再換 50、55)
- `http://localhost:8765/_probe-smash.html?pitch=45`(視窗 1440 寬;再換 50、55)

連同 Step 1 的真盤子參考圖並排傳給使用者,問:
1. 盤子像不像真的 Xtreme 盤?(口袋、牆、軌道)
2. 鏡頭俯角選 45 / 50 / 55 哪一個?

**停在這裡等使用者回覆。** 使用者要求的調整做完、再截一次,直到使用者說可以。把定案的俯角寫進 `createScene` 的預設值。

- [ ] **Step 7: Commit**

```bash
git add smash/js/outline3d.js smash/js/stadium3d.js smash/js/scene3d.js
git commit -m "feat(smash): ice-blue plastic stadium built from stadium.js; camera pitch <定案的角度>°"
```

---

### Task 8: 三種陀螺 + 動物圓片 —— 使用者檢查點

**Files:**
- Create: `smash/js/bey3d.js`
- Create: `smash/js/chip.js`(圓片裁切的純函式,Node 可測)
- Modify: `smash/js/scene3d.js`(`beyblade()` 換成 `createBey()`;低轉速搖晃、停轉、爆裂、口袋裡的陀螺、劍盾補包提示)
- Test: `test/smash-chip.test.js`

**Interfaces:**
- Consumes: `outline3d.{ part, outlinable, INK }`、`ghostleg/js/art.js` 的 `ANIMAL_URLS`、Combatant 的 `beyType / animal / spin / outBy / pocket / buffs / healedAt`、`items.{ HEAL_FLASH }`
- Produces:
  - `chip.js`:`chipCrop(w, h) → { sx, sy, size }`(從全身站姿圖裁出頭部的正方形)
  - `bey3d.js`:`createBey(beyType, color) → THREE.Group`(`userData.spin`(會轉的部分)、`userData.chip`(朝上不轉的圓片 Mesh)、`userData.parts = { blade, ratchet, bit }`)、`setChipTexture(group, texture)`、`loadChipTextures() → Promise<Map<animal, THREE.Texture>>`

- [ ] **Step 1: 圓片裁切的測試**

`test/smash-chip.test.js`:

```js
// 動物圖是全身站姿(爬格子用的),圓片只要頭 —— 從上方取一個正方形。
import test from 'node:test';
import assert from 'node:assert/strict';
import { chipCrop } from '../smash/js/chip.js';

test('裁出來的是正方形,而且在圖片範圍內', () => {
  for (const [w, h] of [[256, 256], [180, 256], [256, 180]]) {
    const { sx, sy, size } = chipCrop(w, h);
    assert.ok(size > 0);
    assert.ok(sx >= 0 && sy >= 0 && sx + size <= w && sy + size <= h, `${w}x${h}`);
  }
});

test('直的全身圖:取上半部(頭),水平置中', () => {
  const { sx, sy, size } = chipCrop(180, 256);
  assert.equal(sy, 0);
  assert.ok(Math.abs(sx + size / 2 - 90) < 1e-9);
  assert.ok(size <= 256 * 0.62);
});
```

Run: `node --test test/smash-chip.test.js` → FAIL

- [ ] **Step 2: `smash/js/chip.js`**

```js
// 動物圓片的裁切。爬格子的動物圖是全身站姿,頭大約佔上面六成;
// 圓片只要頭,所以從頂端取一個正方形、水平置中。純函式,Node 測得到。
const HEAD = 0.62;

export function chipCrop(w, h) {
  const size = Math.min(w, h * HEAD);
  return { sx: (w - size) / 2, sy: 0, size };
}
```

Run: `node --test test/smash-chip.test.js` → PASS

- [ ] **Step 3: `smash/js/bey3d.js`**

```js
// 戰鬥陀螺的造型。參考 Beyblade X 的三件式:戰刃(Blade)/ 固鎖(Ratchet)/ 軸心(Bit),
// 取輪廓特徵,不照抄任何一款。**造型就是類型** —— 小孩看形狀就知道「那顆尖的很會撞」。
//
//   攻擊型:3 片往前勾的大彎刃
//   防禦型:一圈幾乎連續的圓盾牆,只有淺凸起
//   耐久型:寬大偏圓的薄盤,外緣細翅片
//
// 單位空間:軸尖踩 y=0,佔地半徑 1,整體再乘物理的 radius。
// 外層 group 負責位置與傾斜,內層 spin 只負責繞 Y 轉;頂上的動物圓片掛在外層,**不跟著轉**。
import * as THREE from 'three';
import { part, outlinable } from './outline3d.js';
import { ANIMAL_URLS } from '../../ghostleg/js/art.js';
import { chipCrop } from './chip.js';

const METAL = 0x9AA6B2;

function shade(color, k) {
  return new THREE.Color(color).multiplyScalar(k);
}

// 一片彎刃:扇形的擠出體,外緣往前勾
function bladeShape(sweep, hook) {
  const s = new THREE.Shape();
  s.moveTo(0.35, 0);
  s.absarc(0, 0, 1, 0, sweep, false);
  s.lineTo(Math.cos(sweep + hook) * 0.62, Math.sin(sweep + hook) * 0.62);
  s.absarc(0, 0, 0.35, sweep, 0, true);
  return new THREE.ExtrudeGeometry(s, { depth: 1, bevelEnabled: false }).rotateX(-Math.PI / 2);
}

const GEO = {
  attackBlade: bladeShape(1.25, 0.35),
  disc: new THREE.CylinderGeometry(1, 1, 1, 32),
  ring: new THREE.CylinderGeometry(1, 1, 1, 12),       // 12 角 = 固鎖的凸齒
  fin: new THREE.BoxGeometry(1, 1, 1),
  tip: new THREE.ConeGeometry(1, 1, 12),
  chip: new THREE.CircleGeometry(1, 32),
};

export function createBey(beyType, color) {
  const g = outlinable();
  const spin = new THREE.Group();
  g.add(spin);
  const blade = new THREE.Group();
  const ratchet = new THREE.Group();
  const bit = new THREE.Group();
  spin.add(blade, ratchet, bit);
  const c = new THREE.Color(color);

  // 軸心:金屬灰軸尖 + 底部一圈齒輪(加速軌道咬的就是它)
  part(g, GEO.tip, METAL, { pos: [0, 0.16, 0], scale: [0.2, 0.32, 0.2], rotX: Math.PI, outline: 0.08, into: bit });
  part(g, GEO.ring, shade(METAL, 0.8), { pos: [0, 0.36, 0], scale: [0.34, 0.12, 0.34], outline: 0.08, into: bit });

  // 固鎖:隊伍色深一階、12 角
  part(g, GEO.ring, shade(c, 0.72), { pos: [0, 0.5, 0], scale: [0.62, 0.18, 0.62], outline: 0.1, into: ratchet });

  // 戰刃:隊伍色
  if (beyType === 'attack') {
    part(g, GEO.disc, c, { pos: [0, 0.66, 0], scale: [0.55, 0.16, 0.55], outline: 0.1, into: blade });
    for (let k = 0; k < 3; k++) {
      const m = part(g, GEO.attackBlade, c, { pos: [0, 0.6, 0], scale: [1, 0.16, 1], outline: 0.08, into: blade });
      m.rotation.y = (k * Math.PI * 2) / 3;
      g.userData.edges[g.userData.edges.length - 1].rotation.y = m.rotation.y;
    }
  } else if (beyType === 'defense') {
    part(g, GEO.disc, c, { pos: [0, 0.68, 0], scale: [0.95, 0.3, 0.95], outline: 0.1, into: blade });
    for (let k = 0; k < 6; k++) {
      const a = (k * Math.PI) / 3;
      part(g, GEO.fin, shade(c, 1.15), { pos: [Math.cos(a) * 0.9, 0.68, Math.sin(a) * 0.9], scale: [0.18, 0.32, 0.18], outline: 0.06, into: blade });
    }
  } else {
    part(g, GEO.disc, c, { pos: [0, 0.64, 0], scale: [1.08, 0.1, 1.08], outline: 0.1, into: blade });
    for (let k = 0; k < 10; k++) {
      const a = (k * Math.PI) / 5;
      const m = part(g, GEO.fin, shade(c, 1.15), { pos: [Math.cos(a) * 1.04, 0.64, Math.sin(a) * 1.04], scale: [0.22, 0.08, 0.06], outline: 0.04, into: blade });
      m.rotation.y = -a;
    }
  }

  // 動物圓片:掛在外層 g(不跟著轉),躺平朝上
  const chip = part(g, GEO.chip, 0xFFFFFF, { pos: [0, 0.86, 0], scale: [0.42, 0.42, 0.42], rotX: -Math.PI / 2, outline: 0.08 });

  g.userData.spin = spin;
  g.userData.chip = chip;
  g.userData.parts = { blade, ratchet, bit };
  return g;
}

export function setChipTexture(group, texture) {
  const m = group.userData.chip.material;
  m.map = texture;
  m.needsUpdate = true;
}

// 每種動物只裁一次。網址沿用爬格子帶 ?v= 的那一份 —— 首頁已經預先載入過,是快取命中。
export async function loadChipTextures() {
  const out = new Map();
  await Promise.all(Object.entries(ANIMAL_URLS).map(async ([animal, url]) => {
    const img = new Image();
    img.src = url;
    await img.decode();
    const { sx, sy, size } = chipCrop(img.naturalWidth, img.naturalHeight);
    const cv = document.createElement('canvas');
    cv.width = cv.height = 128;
    const ctx = cv.getContext('2d');
    ctx.fillStyle = '#EAF6FD';
    ctx.beginPath();
    ctx.arc(64, 64, 64, 0, Math.PI * 2);
    ctx.fill();
    ctx.save();
    ctx.clip();
    ctx.drawImage(img, sx, sy, size, size, 0, 0, 128, 128);
    ctx.restore();
    const t = new THREE.CanvasTexture(cv);
    t.colorSpace = THREE.SRGBColorSpace;
    out.set(animal, t);
  }));
  return out;
}
```

`ghostleg/js/art.js` 頂層只有常數與函式定義;確認它沒有在 import 時就碰 DOM(`sed -n 1,60p ghostleg/js/art.js`),有的話改從那支只拿 `ANIMAL_URLS`(不要動 ghostleg 的行為)。

- [ ] **Step 4: 預覽三種造型(不 commit)**

在 `_probe-smash.html` 加 `?beys=1` 模式:清空陀螺,把三種類型 × 三種隊伍色排成 3×3,固定一個動物圓片,鏡頭用 Task 7 定案的俯角,每 0.5 秒轉一點讓刃看得出形狀。照 Task 7 Step 6 的方式截 390 與 1440 兩張,傳給使用者問:
1. 三種一眼分得出來嗎?攻擊型夠尖、防禦型夠圓、耐久型夠寬嗎?
2. 動物圓片的大小與裁切(只看到頭)可以嗎?

**停在這裡等使用者回覆**,照意見改到使用者說可以。

- [ ] **Step 5: 接進 `scene3d.js`**

- `beyblade(color)` 整段刪掉,`actorFor(c, color)` 改成 `createBey(c.beyType, color)`,建立後 `setChipTexture(group, chipTextures.get(c.animal))`
- `createScene` 開頭 `const chipTextures = new Map(); loadChipTextures().then(m => { for (const [k, v] of m) chipTextures.set(k, v); for (const a of actors.values()) a.applyChip?.(); });` —— 貼圖晚到時已建立的陀螺要補上(`actorFor` 記一個 `applyChip` 閉包)
- **轉速**:`a.spin.rotation.y += dt * (6 + 22 * c.spin)`(用 `world.time` 差值算 dt);`c.spin < 0.35` 時加進動:`const w = (0.35 - c.spin) / 0.35; a.group.rotation.z = Math.sin(world.time * 9) * 0.32 * w; a.group.rotation.x = Math.cos(world.time * 9) * 0.32 * w;`(取代原本依速度傾斜的那兩行;速度傾斜改成只在 `c.spin >= 0.35` 時套用)
- **劍**:`setOutline` 只看 `buffs.attack.length`,外框紅色、`grow = 1 + 0.12 * layers`
- **盾**:每個 actor 多一個冰藍半透明環(`RingGeometry(1.15, 1.35, 40)` 平躺、`opacity = 0.25 + 0.2 * layers`、`depthWrite: false`),`layers === 0` 時隱藏
- **補包**:`world.time - c.healedAt < HEAL_FLASH` 時外框改成 `0x4CC38A`,優先於劍的紅框
- **出局**(依 `c.outBy`,在 actor 上記 `outAt = world.time` 第一次看到出局的時間):
  - `ringout`:位置直接用 `c.x, c.y`(物理已經放進口袋),高度 `GROUND + DEPTH - 6`,緩慢停轉;同一個口袋裡依出局順序往旁邊錯開 `index * radius * 0.6`
  - `spinout`:`rotation.z` 從 0 補間到 `Math.PI / 2 * 0.9`(1 秒內倒下),倒下後再 1 秒把所有材質 `transparent = true; opacity` 從 1 降到 0
  - `burst`:三件(`parts.blade` 含圓片、`ratchet`、`bit`)從 `spin` 底下 `attach` 到 `root`,各給一個水平往外、向上的初速(三個方向相隔 120°)與翻轉角速度,每格 `v.y -= 140 * dt`,0.9 秒後隱藏;同時在原地加一顆撞擊火花(沿用 `sparks.push`,`k = 1`)、`sfx.burst(1)` 由 `main.js` 依 `outBy` 播(`scene` 不播聲音)
- `main.js`:`if (aliveOf(world).length < before) sfx.clunk();` 換成比對這一格新出局的人,`burst` 播 `sfx.burst(1)`、其他播 `sfx.clunk()`

- [ ] **Step 6: 跑測試、真頁面看**

Run: `node --test test/`
Expected: 全部 PASS

開 `http://localhost:8765/smash/` 打 3 場,確認:三種造型都出現、圓片朝上不轉、低轉速會晃、三種出局演出都看得到、口袋裡的陀螺停在裡面而且不會重疊成一顆。截一張比賽中的畫面(390 與 1440)傳給使用者。

- [ ] **Step 7: Commit**

```bash
git add smash/js/bey3d.js smash/js/chip.js smash/js/scene3d.js smash/js/main.js test/smash-chip.test.js
git commit -m "feat(smash): three Beyblade X style bey types with an animal chip; wobble, spin-out and burst scenes"
```

---

### Task 9: 準星與飛彈的畫面

**Files:**
- Modify: `smash/js/scene3d.js`

**Interfaces:**
- Consumes: `world.strikes`(`{ id, fighterId, x, y, fuse }`)、`items.{ MISSILE_FUSE, BLAST_RADIUS }`、`teams.get(fighterId).color`
- Produces: 無(純畫面)

- [ ] **Step 1: 換掉 `bombVisual`**

刪掉 `bombVisual` 與 `seenBombs` 的命名,改成:

```js
  // 準星:發射隊伍色的雙圈 + 十字,邊倒數邊縮、最後 0.4 秒閃。
  // 圈的大小 = BLAST_RADIUS —— 看到的圈就是真的會被炸到的範圍。
  function crosshairVisual(strike, color) {
    const k = 1 - Math.max(0, strike.fuse) / MISSILE_FUSE;   // 0 → 1
    const blink = strike.fuse < 0.4 && Math.floor(strike.fuse * 16) % 2 === 0;
    const g = new THREE.Group();
    const mat = new THREE.MeshBasicMaterial({ color: blink ? 0xFFFFFF : color, transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false });
    const outer = new THREE.Mesh(RING_FAT, mat);
    outer.scale.setScalar(BLAST_RADIUS * (1.15 - 0.15 * k));
    const inner = new THREE.Mesh(RING, mat);
    inner.scale.setScalar(BLAST_RADIUS * 0.35);
    const bar = new THREE.PlaneGeometry(1, 1);
    const h = new THREE.Mesh(bar, mat); h.scale.set(BLAST_RADIUS * 0.5, 2, 1);
    const v = new THREE.Mesh(bar, mat); v.scale.set(2, BLAST_RADIUS * 0.5, 1);
    g.add(outer, inner, h, v);
    g.rotation.x = -Math.PI / 2;
    g.position.set(strike.x, GROUND + heightAt(strike.x, strike.y) + 0.5, strike.y);
    return g;
  }

  // 卡通飛彈:白色彈身 + 紅色彈頭 + 冰藍尾翼,從左上方斜斜落到準星。
  const MISSILE_FROM = new THREE.Vector3(-120, 220, -60);
  function missileVisual(strike) {
    const k = 1 - Math.max(0, strike.fuse) / MISSILE_FUSE;
    const ease = k * k;                          // 先慢後快,像在加速落下
    const target = new THREE.Vector3(strike.x, GROUND + heightAt(strike.x, strike.y), strike.y);
    const from = target.clone().add(MISSILE_FROM);
    const g = outlinable();
    part(g, ROD, 0xFFFFFF, { pos: [0, 0, 0], scale: [3, 12, 3], outline: 0.5 });
    part(g, TIP, 0xE4572E, { pos: [0, -8, 0], scale: [3, 5, 3], rotX: Math.PI, outline: 0.5 });
    for (let i = 0; i < 3; i++) {
      const a = (i * Math.PI * 2) / 3;
      part(g, PLATE, 0x8EC5E8, { pos: [Math.cos(a) * 2.6, 5, Math.sin(a) * 2.6], scale: [2.4, 4, 0.6], outline: 0.4 });
    }
    g.position.copy(from.lerp(target, ease));
    g.lookAt(target);
    g.rotateX(Math.PI / 2);   // 讓彈頭(-y)朝向落點
    return g;
  }
```

`draw()` 裡畫空襲的那段換成:

```js
    for (const s of world.strikes ?? []) {
      const color = teams.get(s.fighterId)?.color ?? '#574239';
      addProp(crosshairVisual(s, color));
      addProp(missileVisual(s));
    }
    // 爆炸:上一格還在、這一格不見了的空襲,就是剛炸開的那一顆
    for (const s of world.strikes ?? []) seenStrikes.set(s.id, s);
    for (const [id, s] of seenStrikes) {
      if (!(world.strikes ?? []).some(x => x.id === id)) {
        blasts.push({ x: s.x, y: s.y, at: world.time, spin: Math.random() * Math.PI });
        seenStrikes.delete(id);
      }
    }
```

import `MISSILE_FUSE`、`BLAST_RADIUS` from `./items.js`、`heightAt` from `./stadium.js`;`scene3d.js` 頂端的 `BLAST_R` 常數刪掉,改用 `BLAST_RADIUS`。`reset()` 裡 `seenBombs.clear()` 改 `seenStrikes.clear()`。

- [ ] **Step 2: 看一場**

開頁面,設定裡只留「飛彈」開關,打兩場,確認:準星是發射隊伍的顏色、飛彈從左上方落下剛好在準星中心炸、爆炸圈跟準星一樣大、發射者自己在圈裡也會被炸飛。

- [ ] **Step 3: Commit**

```bash
git add smash/js/scene3d.js
git commit -m "feat(smash): team-coloured crosshair and a missile that drops from the sky onto it"
```

---

### Task 10: 道具圖示生成 —— 使用者檢查點

**Files:**
- Create: `tools/mascot-gen/smash.py`、`tools/mascot-gen/smash_prompts.json`
- Create: `smash/img/items/{attack,shield,spin,missile}.webp`、`smash/js/art.js`
- Modify: `tools/mascot-gen/gashapon.py:391-418`(`write_preload_manifest` 納入 `smash/js/art.js`)
- Modify: `test/preload-manifest.test.js`(同步)
- Modify: `smash/js/scene3d.js`(道具改成正對鏡頭的圖示 + 影子)
- Test: `test/smash-art.test.js`

**Interfaces:**
- Consumes: `tools/mascot-gen/comfy.py` 的 `upload`、`run`、`fetch`、`graph_edit`;`ghostleg_art.cut_green`、`fit_height`;`gashapon.webp`、`write_preload_manifest`;`gashapon_art.content_hash`
- Produces:`smash/js/art.js` → `export const ITEM_URLS = { attack, shield, spin, missile }`(每個都是 `new URL('../img/items/<t>.webp?v=<hash>', import.meta.url).href`)

- [ ] **Step 1: 提示詞**

`tools/mascot-gen/smash_prompts.json`:

```json
{
  "ref": "shared/img/mascot/key/idle.webp",
  "style": "Draw a game item icon in exactly the same art style, colouring and soft shading as <image1>: flat 2D cartoon, thick dark brown outlines, cute chunky chibi proportions, soft highlights. No character, no face, no eyes, no text, no letters. A single object, centered, filling most of the frame. No base, no ground, no shadow. Isolated on a solid flat bright pure green #00FF00 background. Do not draw the fox or the ermine from <image1>.",
  "sheet": "A 2x2 grid of four separate item icons with clear green gaps between them: top-left a short cartoon sword, top-right a round cartoon shield, bottom-left a first-aid kit, bottom-right a cartoon missile pointing down.",
  "attack": "The item is a short chunky cartoon sword: icy blue steel blade with a white shine, golden cross-guard, brown wrapped handle, pointing up and slightly tilted.",
  "shield": "The item is a round chunky cartoon shield: pale icy blue face with a white snowflake emblem in the middle, a thick silver rim with rivets.",
  "spin": "The item is a small chunky first-aid kit: white box with rounded corners, a bold red cross on the front, a short handle on top.",
  "missile": "The item is a chunky cartoon missile pointing down: white body, red rounded nose cone at the bottom, three small icy blue fins at the top, a little puff of white smoke above it.",
  "picks": {}
}
```

- [ ] **Step 2: `tools/mascot-gen/smash.py`**

```python
"""大亂鬥道具圖示(2026-10-12,issue #4):劍、盾、補包、飛彈。

在 repo 根目錄執行(先 export COMFY_URL=http://<ComfyUI 那台的 IP>:8188):
  PY=tools/mascot-gen/.venv/bin/python
  $PY tools/mascot-gen/smash.py sheet                 # 先試一張 2x2 拼圖,3 個 seed → out/smash/sheet/s{1,2,3}.png
  $PY tools/mascot-gen/smash.py gen attack            # 拼圖不行就分開生成,3 個 seed → out/smash/attack/s{1,2,3}.png
  $PY tools/mascot-gen/smash.py review [--bg PATH]    # 去背、疊在盤面截圖上並排 → review/smash.html
  $PY tools/mascot-gen/smash.py pick attack 2         # 或 pick sheet 2(四格一起)
  $PY tools/mascot-gen/smash.py build                 # 輸出 smash/img/items/*.webp、蓋 ?v= 到 smash/js/art.js、重產 preload.json
"""
import argparse
import io
import json
import re
import sys
from pathlib import Path

import numpy as np
from PIL import Image

import comfy
from gashapon import webp, write_preload_manifest
from gashapon_art import content_hash
from ghostleg_art import cut_green, fit_height

ROOT = Path(__file__).resolve().parents[2]
HERE = Path(__file__).resolve().parent
OUT = HERE / 'out' / 'smash'
REVIEW = HERE / 'review' / 'smash'
CFG = HERE / 'smash_prompts.json'
IMG = ROOT / 'smash' / 'img' / 'items'
ART_JS = ROOT / 'smash' / 'js' / 'art.js'
ITEMS = ['attack', 'shield', 'spin', 'missile']
SHEET_ORDER = ['attack', 'shield', 'spin', 'missile']   # 左上、右上、左下、右下
SEEDS = [11, 22, 33]


def load_cfg():
    return json.loads(CFG.read_text())


def save_cfg(cfg):
    CFG.write_text(json.dumps(cfg, ensure_ascii=False, indent=2) + '\n')


def upload_ref(cfg):
    # 參考圖是透明背景的 webp,先鋪成綠底再上傳(Qwen 會照參考圖的底色畫)
    ref = Image.open(ROOT / cfg['ref']).convert('RGBA')
    flat = Image.new('RGB', ref.size, (0, 255, 0))
    flat.paste(ref, mask=ref.split()[3])
    buf = io.BytesIO()
    flat.save(buf, 'PNG')
    return comfy.upload(buf.getvalue(), 'smash_ref.png')


def generate(name, prompt, seeds):
    cfg = load_cfg()
    ref = upload_ref(cfg)
    d = OUT / name
    d.mkdir(parents=True, exist_ok=True)
    for n, seed in enumerate(seeds, 1):
        imgs = comfy.run(comfy.graph_edit([ref], f'{cfg["style"]} {prompt}', seed, f'smash_{name}_s{n}'))
        (d / f's{n}.png').write_bytes(comfy.fetch(imgs[0]))
        print(f'{name} s{n} seed={seed}', flush=True)


def cmd_sheet(args):
    generate('sheet', load_cfg()['sheet'], SEEDS)


def cmd_gen(args):
    seeds = [int(v) for v in args.seeds.split(',')] if args.seeds else SEEDS
    generate(args.name, load_cfg()[args.name], seeds)


def split_sheet(src):
    im = Image.open(src).convert('RGB')
    w, h = im.size
    boxes = [(0, 0, w // 2, h // 2), (w // 2, 0, w, h // 2), (0, h // 2, w // 2, h), (w // 2, h // 2, w, h)]
    return {name: im.crop(box) for name, box in zip(SHEET_ORDER, boxes)}


def icon_cut(img):
    cut = Image.fromarray(cut_green(np.asarray(img.convert('RGB'))))
    return fit_height(cut.crop(cut.getbbox()), 256)


def candidates():
    """{item: [(label, PIL.Image), ...]} —— 拼圖切開的與單獨生成的都列進來。"""
    out = {i: [] for i in ITEMS}
    for src in sorted((OUT / 'sheet').glob('s*.png')):
        for name, im in split_sheet(src).items():
            out[name].append((f'sheet-{src.stem}', im))
    for i in ITEMS:
        for src in sorted((OUT / i).glob('s*.png')):
            out[i].append((src.stem, Image.open(src)))
    return out


def cmd_review(args):
    # 候選圖疊在實際盤面上看(使用者看的是合成在畫面裡的樣子,不是綠底原圖)
    bg = Path(args.bg) if args.bg else REVIEW / 'stadium.png'
    REVIEW.mkdir(parents=True, exist_ok=True)
    bg_rel = bg.relative_to(REVIEW.parent).as_posix() if bg.exists() else ''
    html = ['<!doctype html><meta charset=utf-8><body style="background:#EAF6FD;font:14px system-ui">']
    for item, cands in candidates().items():
        cells = []
        for label, im in cands:
            dst = REVIEW / item / f'{label}.png'
            dst.parent.mkdir(parents=True, exist_ok=True)
            icon_cut(im).save(dst)
            cells.append(
                f'<figure style="display:inline-grid;justify-items:center;margin:8px;padding:8px;'
                f'background:url({bg_rel}) center/cover"><img src="smash/{item}/{label}.png" style="height:72px">'
                f'<img src="smash/{item}/{label}.png" style="height:28px;margin-top:6px">'
                f'<figcaption style="background:#fff8">{label}</figcaption></figure>')
        html.append(f'<div><b>{item}</b><br>{"".join(cells)}</div>')
    (REVIEW.parent / 'smash.html').write_text('\n'.join(html))
    print('開 http://localhost:8765/tools/mascot-gen/review/smash.html(先在 repo 根目錄 python3 -m http.server 8765)')


def cmd_pick(args):
    cfg = load_cfg()
    if args.name == 'sheet':
        for i in ITEMS:
            cfg['picks'][i] = f'sheet-s{args.n}'
    else:
        cfg['picks'][args.name] = f's{args.n}'
    save_cfg(cfg)


def picked_image(item, label):
    if label.startswith('sheet-'):
        return split_sheet(OUT / 'sheet' / f'{label[len("sheet-"):]}.png')[item]
    return Image.open(OUT / item / f'{label}.png')


def cmd_build(args):
    cfg = load_cfg()
    missing = [i for i in ITEMS if i not in cfg['picks']]
    if missing:
        sys.exit(f'還沒 pick:{", ".join(missing)}')
    IMG.mkdir(parents=True, exist_ok=True)
    lines = []
    for i in ITEMS:
        path = IMG / f'{i}.webp'
        webp(icon_cut(picked_image(i, cfg['picks'][i])), path, q=80)
        lines.append(f"  {i}: new URL('../img/items/{i}.webp?v={content_hash(path)}', import.meta.url).href,")
    ART_JS.write_text(
        '// 大亂鬥道具圖示的網址(tools/mascot-gen/smash.py build 產生,不要手改)。\n'
        '// 帶 ?v= 內容雜湊:Pages 會快取 10 分鐘,換圖不換網址的話小孩會看到舊圖。\n'
        'export const ITEM_URLS = {\n' + '\n'.join(lines) + '\n};\n')
    write_preload_manifest()
    print('smash item icons done')


def main():
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest='cmd', required=True)
    sub.add_parser('sheet')
    g = sub.add_parser('gen'); g.add_argument('name', choices=ITEMS); g.add_argument('--seeds')
    r = sub.add_parser('review'); r.add_argument('--bg')
    p = sub.add_parser('pick'); p.add_argument('name', choices=ITEMS + ['sheet']); p.add_argument('n', type=int)
    sub.add_parser('build')
    args = ap.parse_args()
    {'sheet': cmd_sheet, 'gen': cmd_gen, 'review': cmd_review, 'pick': cmd_pick, 'build': cmd_build}[args.cmd](args)


if __name__ == '__main__':
    main()
```

先 `sed -n 1,20p tools/mascot-gen/ghostleg_art.py` 確認 `cut_green` / `fit_height` 的簽名(`cut_green(np.ndarray RGB) → np.ndarray RGBA`、`fit_height(PIL.Image, h) → PIL.Image`);不一樣就照實際簽名改 `icon_cut`。

- [ ] **Step 3: 生成並給使用者挑**

```bash
export COMFY_URL=http://192.168.68.53:8188
PY=tools/mascot-gen/.venv/bin/python
$PY tools/mascot-gen/smash.py sheet
```

把 Task 7 的盤面截圖存成 `tools/mascot-gen/review/smash/stadium.png`,跑 `$PY tools/mascot-gen/smash.py review`,用 claude-in-chrome 開 review 頁截圖。拼圖切得乾淨(4 格都完整、沒有角色、畫風一致)就給使用者挑;不行(畫成別的格數、物件被切到、畫風不一)就改跑 `gen attack` / `gen shield` / `gen spin` / `gen missile` 各 3 版,再 review。

**停在這裡等使用者挑**,照回覆 `pick`。使用者都不滿意就改提示詞重跑,提示詞的修改要寫回 `smash_prompts.json`。

- [ ] **Step 4: build、預載**

`$PY tools/mascot-gen/smash.py build`

`tools/mascot-gen/gashapon.py` 的 `write_preload_manifest()`,在阿彌陀籤那段後面加:

```python
    # 大亂鬥道具圖示(2026-10-12):網址寫在 smash/js/art.js
    for m in re.finditer(r"""['"](\.\./img/[^'"]+\.webp\?v=[0-9a-f]{8})['"]""", (ROOT / 'smash' / 'js' / 'art.js').read_text()):
        add('smash/js', m.group(1))
```

`test/preload-manifest.test.js` 的 `gashaponRefs()` 同步加:

```js
  // 大亂鬥道具圖示(2026-10-12):網址寫在 smash/js/art.js
  for (const m of read('smash/js/art.js').matchAll(/['"](\.\.\/img\/[^'"]+\.webp\?v=[0-9a-f]{8})['"]/g)) add('smash/js', m[1]);
```

再跑一次 `$PY tools/mascot-gen/gashapon.py manifest` 重產 `gashapon/img/preload.json`。

- [ ] **Step 5: 測試**

`test/smash-art.test.js`:

```js
// 道具圖示:四張都要存在、網址帶內容雜湊、而且雜湊跟檔案內容一致(換圖沒重跑 build 會紅)。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ITEM_URLS } from '../smash/js/art.js';
import { ITEM_TYPES } from '../smash/js/items.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

test('每種道具都有圖示', () => {
  assert.deepEqual(Object.keys(ITEM_URLS).sort(), [...ITEM_TYPES].sort());
});

test('圖示檔案存在,網址的 ?v= 跟內容一致', () => {
  for (const [type, url] of Object.entries(ITEM_URLS)) {
    const m = url.match(/smash\/img\/items\/(\w+)\.webp\?v=([0-9a-f]{8})$/);
    assert.ok(m, url);
    assert.equal(m[1], type);
    const path = join(root, 'smash', 'img', 'items', `${type}.webp`);
    assert.ok(existsSync(path), path);
    const digest = createHash('sha1').update(readFileSync(path)).digest('hex').slice(0, 8);
    assert.equal(m[2], digest, `${type} 換了圖沒重跑 build`);
  }
});
```

先 `grep -n "def content_hash" -A6 tools/mascot-gen/gashapon_art.py` 確認雜湊演算法是 sha1 前 8 碼;不是的話照實際演算法改測試。

Run: `node --test test/smash-art.test.js test/preload-manifest.test.js`
Expected: PASS

- [ ] **Step 6: 場上的道具改成圖示**

`scene3d.js`:
- 刪掉 `ITEM_LOOK`、`iconTexture`、`itemVisual`(字的那套)
- `createScene` 開頭用 `THREE.TextureLoader` 載入 `ITEM_URLS` 四張(頁內預先載入:頁面一打開就載,不等第一個道具掉下來),存 `itemTex` Map
- 新的 `itemVisual(item)`:`THREE.Sprite`(`SpriteMaterial({ map: itemTex.get(item.type), transparent: true, depthTest: false })`),`scale.setScalar(16)`;位置 `GROUND + heightAt(it.x, it.y) + 17 + Math.sin(world.time * 2.4) * 1.6`(保留原本的浮動與地上影子)
- `setOutline` 的道具顏色改成常數:`const SWORD = 0xFF6B4A; const HEAL = 0x4CC38A;`

- [ ] **Step 7: 截圖確認**

真頁面打一場,截 390 與 1440 各一張道具在場上的畫面給使用者確認大小與可讀性(劍、盾、補包、飛彈一眼認得出來)。**等使用者說可以。**

- [ ] **Step 8: Commit**

```bash
git add tools/mascot-gen/smash.py tools/mascot-gen/smash_prompts.json tools/mascot-gen/gashapon.py \
  smash/img/items smash/js/art.js smash/js/scene3d.js gashapon/img/preload.json \
  test/smash-art.test.js test/preload-manifest.test.js
git commit -m "feat(smash): generated sword / shield / med kit / missile icons float over the stadium; preloaded"
```

---

### Task 11: 開場「3、2、1,Go Shoot!」

**Files:**
- Create: `smash/js/opening.js`
- Modify: `smash/js/main.js`、`smash/js/scene3d.js`、`smash/index.html`、`smash/css/smash.css`
- Test: `test/smash-opening.test.js`

**Interfaces:**
- Consumes: `scene.draw(world, teams, { drop })`(本 task 加的第三個參數)
- Produces:`OPENING_TIME = 2`、`openingAt(t) → { label: string | null, index: 0..3 | -1, drop: 0..1, done: boolean }`

- [ ] **Step 1: 測試**

`test/smash-opening.test.js`:

```js
// 開場倒數:3 → 2 → 1 → Go Shoot!,各 0.5 秒;Go Shoot! 時陀螺落下。
import test from 'node:test';
import assert from 'node:assert/strict';
import { openingAt, OPENING_TIME } from '../smash/js/opening.js';

test('依序是 3、2、1、Go Shoot!', () => {
  assert.deepEqual([0, 0.6, 1.1, 1.6].map(t => openingAt(t).label), ['3', '2', '1', 'Go Shoot!']);
});

test('倒數時陀螺停在上方,Go Shoot! 那半秒落下', () => {
  assert.equal(openingAt(1.2).drop, 0);
  assert.ok(openingAt(1.75).drop > 0 && openingAt(1.75).drop < 1);
  assert.equal(openingAt(OPENING_TIME).drop, 1);
});

test('時間到就結束,之後一直是結束', () => {
  assert.equal(openingAt(1.99).done, false);
  assert.equal(openingAt(OPENING_TIME).done, true);
  assert.equal(openingAt(99).label, null);
});
```

Run: `node --test test/smash-opening.test.js` → FAIL

- [ ] **Step 2: `smash/js/opening.js`**

```js
// 開場倒數。純函式:給經過的秒數,回傳該顯示什麼、陀螺落下到哪。
// 「3、2、1,Go Shoot!」是戰鬥陀螺最經典的口號,看過動畫的小孩會跟著喊。
const STEP = 0.5;
const LABELS = ['3', '2', '1', 'Go Shoot!'];
export const OPENING_TIME = STEP * LABELS.length;

export function openingAt(t) {
  if (t >= OPENING_TIME) return { label: null, index: -1, drop: 1, done: true };
  const index = Math.min(LABELS.length - 1, Math.floor(Math.max(0, t) / STEP));
  const drop = index < LABELS.length - 1 ? 0 : (t - STEP * (LABELS.length - 1)) / STEP;
  return { label: LABELS[index], index, drop, done: false };
}
```

Run: `node --test test/smash-opening.test.js` → PASS

- [ ] **Step 3: 畫面**

`smash/index.html` 的 `<main class="stage">` 裡、`<canvas>` 之後加:

```html
  <p class="countdown" id="countdown" hidden aria-live="assertive"></p>
```

`smash/css/smash.css` 加:

```css
/* 開場倒數:大字蓋在場地中央,點一下畫面直接開打 */
.countdown {
  position: absolute; inset: 0; margin: 0;
  display: grid; place-items: center;
  font-size: clamp(56px, 22vw, 140px); font-weight: 900;
  color: #fff; -webkit-text-stroke: 6px var(--ink); paint-order: stroke fill;
  pointer-events: none;
}
.countdown.is-go { font-size: clamp(40px, 13vw, 96px); }
.countdown:not([hidden]) { animation: countdown-pop .5s ease-out; }
@keyframes countdown-pop { from { transform: scale(1.6); opacity: 0; } 40% { opacity: 1; } to { transform: scale(1); } }
```

(`.stage` 若沒有 `position: relative`,一併加上;用 `grep -n "\.stage" smash/css/smash.css` 確認。)

`scene3d.js` 的 `draw(world, teams, { drop = 1 } = {})`:陀螺的高度加 `(1 - easeOutBounce(drop)) * 120`,其中

```js
// 落地時彈一下,像真的陀螺被射進盤裡
function easeOutBounce(x) {
  const n = 7.5625, d = 2.75;
  if (x < 1 / d) return n * x * x;
  if (x < 2 / d) return n * (x -= 1.5 / d) * x + 0.75;
  if (x < 2.5 / d) return n * (x -= 2.25 / d) * x + 0.9375;
  return n * (x -= 2.625 / d) * x + 0.984375;
}
```

`drop < 1` 時影子的縮放乘 `0.4 + 0.6 * easeOutBounce(drop)`(還在空中時影子小)。

- [ ] **Step 4: `main.js` 的開場流程**

`start()` 裡,在 `running = true` 之後、主迴圈之前插入開場階段;主迴圈改成開場結束才跑物理:

```js
import { openingAt } from './opening.js';

  let opening = 0;           // 開場經過的秒數
  let lastIndex = -1;
  const skip = () => { opening = Math.max(opening, 2); };
  $('arena').addEventListener('pointerdown', skip, { once: true });

  const frame = now => {
    const dt = Math.min(0.033, (now - last) / 1000);
    last = now;

    const o = openingAt(opening);
    if (!o.done) {
      opening += dt;
      if (o.index !== lastIndex) {
        lastIndex = o.index;
        $('countdown').hidden = false;
        $('countdown').textContent = o.label;
        $('countdown').classList.toggle('is-go', o.index === 3);
        // 重新觸發 CSS 動畫
        $('countdown').style.animation = 'none';
        void $('countdown').offsetWidth;
        $('countdown').style.animation = '';
        if (o.index < 3) sfx.hit(0.15); else sfx.drop();
      }
      scene.draw(world, nameMap(), { drop: o.drop });
      raf = requestAnimationFrame(frame);
      return;
    }
    $('countdown').hidden = true;

    /* ……原本的掉道具 / 物理 / 勝負判定,不變…… */
  };
```

並把 `start()` 原本開頭的 `sfx.drop();` 刪掉(改由 Go Shoot! 播)。`visibilitychange` 在開場中被觸發時:`finish(winnerTeam(world))` 之前先 `$('countdown').hidden = true;`(開場中 `winnerTeam` 會是 null → 平手,符合「切走就結束」的既有行為)。`reset()` 裡也加 `$('countdown').hidden = true;`。

- [ ] **Step 5: 看一場**

真頁面:按開打 → 3、2、1、Go Shoot! 每個約半秒、陀螺在 Go Shoot! 時落下彈一下才開始動;再試一次在「2」的時候點畫面,要直接開打。錄一段 gif(claude-in-chrome `gif_creator`,檔名 `smash_opening.gif`,前後多留幾格)給使用者。

- [ ] **Step 6: Commit**

```bash
git add smash/js/opening.js smash/js/main.js smash/js/scene3d.js smash/index.html smash/css/smash.css test/smash-opening.test.js
git commit -m "feat(smash): 3, 2, 1, Go Shoot! opening — beys drop into the stadium; tap to skip"
```

---

### Task 12: 真頁面驗證 + 首頁卡片插畫 —— 使用者檢查點

**Files:**
- Create: `img/home/smash.webp`
- Modify: `index.html:37`、`css/home.css:81-`(刪 `.card__art--smash`)、`tools/mascot-gen/home_prompts.json`
- Test: `test/home-images.test.js`

- [ ] **Step 1: 全部測試**

Run: `node --test test/`
Expected: 全部 PASS

- [ ] **Step 2: 真頁面錄完整的一場**

claude-in-chrome:開 `http://localhost:8765/smash/`(確認 `document.visibilityState === 'visible'`),預設 3 隊 × 3 人、四種道具全開,錄一整場 gif(`smash_full_match.gif`)。再把一隊改成 12 人、加到 6 隊,打一場確認人多時縮小、畫面不卡。390 與 1440 各截一張比賽中的畫面。

逐項對照 spec 的「已定案的規則」表打勾,沒做到的列出來。傳 gif + 截圖 + 對照結果給使用者。**等使用者確認。**

- [ ] **Step 3: 首頁插畫:截一張實際對戰畫面**

真頁面打到畫面最熱鬧的時候(三種造型都在、至少一個道具、一個準星),用 `javascript_tool` 取 `document.getElementById('arena').toDataURL('image/png')` 存成 `tools/mascot-gen/out/home/smash/render.png`,裁成 4:3。

- [ ] **Step 4: Qwen-Image edit 重畫成插畫**

在 `tools/mascot-gen/home_prompts.json` 加:

```json
  "smash_style_note": "2026-10-12:戰鬥陀螺對戰盤(冰藍塑膠盤 + 三種陀螺 + 動物圓片),截圖用 Qwen-Image edit 重畫;陀螺頂上的動物圓片算物件,可以出現",
  "smash_edit": "Redraw <image1> as a cute flat 2D cartoon illustration with thick dark brown outlines and soft colours, keeping exactly the same layout: the square ice-blue plastic battle stadium with its three pockets at the front, the white gear rail along the walls, and the spinning tops in the same positions and team colours. Keep the small round animal badges on top of the tops. No people, no text, no letters."
```

```bash
PY=tools/mascot-gen/.venv/bin/python
cd tools/mascot-gen && $PY - <<'EOF'
import json
from pathlib import Path
import comfy
cfg = json.loads(Path('home_prompts.json').read_text())
src = Path('out/home/smash/render.png').read_bytes()
ref = comfy.upload(src, 'smash_render.png')
for n, seed in enumerate([11, 22, 33], 1):
    imgs = comfy.run(comfy.graph_edit([ref], cfg['smash_edit'], seed, f'home_smash_s{n}'))
    Path(f'out/smash/s{n}.png').parent.mkdir(parents=True, exist_ok=True)
    Path(f'out/smash/s{n}.png').write_bytes(comfy.fetch(imgs[0]))
    print('s', n)
EOF
```

(`home.py` 的 `OUT` 是 `tools/mascot-gen/out/home`;先 `grep -n "^OUT" tools/mascot-gen/home.py` 確認,上面的 `out/smash/` 要改成 `home.py` 的 `OUT / 'smash'` 實際路徑,`build-cards --only smash` 才讀得到。)

把 3 張並排(配原截圖)截圖給使用者挑。**等使用者挑。**

- [ ] **Step 5: 接上首頁**

```bash
$PY tools/mascot-gen/home.py pick smash <n>
$PY tools/mascot-gen/home.py build-cards --only smash
```

`index.html` 第 37 行換成:

```html
    <img class="card__art card__art--img" src="img/home/smash.webp?v=<build-cards 蓋上的雜湊>" alt="" aria-hidden="true">
```

(`build-cards` 的 `stamp()` 只會改已存在的 `img/home/smash.webp` 引用;第一次接上要手動把 `<span class="card__art card__art--smash">` 換成上面的 `<img>`,再跑一次 `build-cards --only smash` 讓它蓋正確的雜湊。)刪掉 `css/home.css` 的 `.card__art--smash` 整段規則。

`test/home-images.test.js` 加:

```js
test('首頁的大亂鬥卡片用了插畫', () => {
  assert.ok(refs().some(p => p.endsWith('img/home/smash.webp')), refs().join('\n'));
});
```

Run: `node --test test/`
Expected: 全部 PASS

首頁 390 與 1440 各截一張給使用者看。

- [ ] **Step 6: Commit**

```bash
git add img/home/smash.webp index.html css/home.css tools/mascot-gen/home_prompts.json test/home-images.test.js
git commit -m "feat(home): smash card illustration — a stadium match restyled by image edit"
```

(`tools/mascot-gen/out/` 是 gitignored,生成的候選圖不 commit。)

- [ ] **Step 7: 收尾**

用 superpowers:finishing-a-development-branch 決定怎麼併回 main。推上 GitHub Pages 後提醒使用者:HTML 被快取 10 分鐘,實機看之前等 10 分鐘或重開分頁。
