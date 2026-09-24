# 雪地主題與吉祥物 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把全站背景換成雪地舞台,並加上一對會對五個模式的關鍵時刻做出反應的吉祥物(小狐狸 + 白鼬)。

**Architecture:** 兩個彼此獨立的共用模組。`snow.js` 注入雪花節點後就不管了;`mascot.js` 在 `<body>` 底下維護一個 `position: fixed` 的獨立層,持有 `pose` 與 `placement` 兩個狀態,五個模式在自己的關鍵時刻呼叫它。吉祥物**從不進入任何模式的 DOM** —— 錨點只當座標來源。

**Tech Stack:** 原生 ES module、行內 SVG、CSS transform 動畫。**零建置**:沒有 package.json、沒有 node_modules、沒有 bundler。測試用 `node --test`。

**Spec:** `docs/superpowers/specs/2026-09-24-snow-theme-mascots-design.md`(commit d7873ea)

## Global Constraints

- **零建置**:不得新增 package.json、node_modules 或任何打包工具
- **測試指令是 `node --test test/*.test.js`** —— 這台機器上 `node --test test/` 會失敗(`Cannot find module .../test`),一定要用 glob
- **現有 213 個測試必須保持全綠**。這次不動任何模式的業務邏輯,有既有測試變紅就是改錯地方了
- **不得新增任何 localStorage key**,五個模式現有的存檔格式一個位元都不動
- **雪地只是舞台**:`shared/css/tokens.css` 只改 `body` 那段 `background`,其他 token 一個都不碰。卡片/按鈕維持暖米色 `--cream #FFF7EC` + 珊瑚紅 `--coral #FF8D70`
- **3D 物件顏色不得轉冷**:大亂鬥的隊伍紅綠藍、扭蛋的 12 色是**功能**不是裝飾
- **吉祥物不可點**:整層 `pointer-events: none`,飛行途中也是
- **吉祥物永遠不進入任何模式的 DOM**
- 註解寫繁體中文,與現有程式碼一致;識別字與 commit message 用英文
- commit message 結尾固定加上:
  ```
  Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_018HB492KLcUb11Bqr4pcBR9
  ```

---

## 確認過的 Model(實作若與此牴觸,是計畫的 bug —— 停下來反映,不要就地改模型)

**Entities**
- `MascotPair` — 一對吉祥物(狐狸 + 白鼬),全站唯一一對,每頁一個實例
- `Pose` — 五個值之一:`idle` / `watch` / `cheer` / `aww` / `empty`。屬於這一對,不屬於個別動物
- `Placement` — `corner`(左下角常駐)或 `reveal`(飛到某個錨點旁)
- `Anchor` — 每個模式提供的空的、不佔空間的定位錨點
- 雪地主題**不是 entity**,是寫死的 CSS

**Cardinality**
- `MascotPair` 1:1 `Pose`、1:1 `Placement`(同時只有一個姿勢、一個位置)
- 每個模式 **2 個** `Anchor`:一個給揭曉、一個給空狀態
- 狐狸和白鼬**不是獨立實體**,沒有各自的 pose 欄位 —— 牠們是同一張雙人構圖裡的兩個部位

> **模型修訂(brainstorming 階段追加)**:grill 當下確認的模型寫的是「每個模式 1 個 `RevealAnchor`」。
> 後來決定 `empty` 姿勢也要飛到空狀態面板旁,所以錨點從 1 個變 2 個,`RevealAnchor` 一般化為 `Anchor`。
> 這是使用者明確同意的修訂,**不是**實作偏離模型。

**Seen vs stored**
- 看到「兩隻在角落呼吸、偶爾翻身」→ **什麼都沒存**。`pose` 和 `placement` 都是當下畫面狀態,重整就回 `idle` / `corner`
- 看到「雪地 + 飄雪」→ 沒有主題欄位,寫死的 CSS
- 看到「牠們飛到獎項旁」→ 揭曉面板的排版**完全不知道吉祥物存在**,加不加都長一樣
- **localStorage 不新增任何 key**

**最可能做錯的四個(以下四句都是錯的)**

1. 「狐狸和白鼬各有自己的 pose,可以分別切換」 —— 錯。拆開會生出「狐狸在抱空氣」這種組合,而且兩隻會不同步
2. 「主題要存一個設定,之後好切換或依季節換」 —— 錯。一套固定的雪地,沒有切換、沒有設定、沒有持久化
3. 「吉祥物飛進揭曉區時,插進獎項面板的 DOM 裡跟著排版」 —— 錯。吉祥物**永遠不進入任何模式的 DOM**
4. 「雪地是全站換色」 —— 錯。雪地只是舞台

---

## 檔案結構

| 檔案 | 職責 |
|---|---|
| `shared/css/theme-snow.css`(新) | 雪地舞台:天空、雪坡、遠景的 body background;雪花節點的樣式與 keyframes |
| `shared/js/snow.js`(新) | 產生雪花參數、注入節點。`prefers-reduced-motion` 時什麼都不做 |
| `shared/css/mascot.css`(新) | 吉祥物固定層的定位、五組姿勢的 transform、待機動畫 |
| `shared/js/mascot.js`(新) | SVG 骨架字串、`pose`/`placement` 狀態機、待機排程、飛行 |
| `shared/css/tokens.css`(改) | **只改 `body` 的 `background`**(第 33~37 行那四層 radial-gradient) |
| `index.html` + 五個模式的 `index.html`(改) | 加兩行 `<link>`、兩個空錨點 `<div>` |
| 五個模式的 `js/main.js`(改) | 在既有的關鍵時刻多呼叫一兩行 |
| `test/snow.test.js`(新) | 雪花參數與 reduced-motion |
| `test/mascot.test.js`(新) | 狀態機與待機排程 |

---

## Task 1: 雪地舞台

**Files:**
- Create: `shared/css/theme-snow.css`
- Create: `shared/js/snow.js`
- Create: `test/snow.test.js`
- Modify: `shared/css/tokens.css:32-38`(`body` 的 `background`)
- Modify: `index.html`, `gashapon/index.html`, `gashapon3d/index.html`, `ichiban/index.html`, `ghostleg/index.html`, `smash/index.html`

**Interfaces:**
- Produces: `shared/js/snow.js` 匯出 `FLAKES`(常數 `24`)、`flakeSpecs(count = FLAKES, rng = Math.random)`(純函式,回傳參數陣列)、`mountSnow({ rng, reduceMotion } = {})`(注入節點,回傳注入的節點數)
- Consumes: 無

- [ ] **Step 1: 寫失敗的測試**

建立 `test/snow.test.js`:

```js
// 飄雪。兩件事要釘住:
//   1. prefers-reduced-motion 時**不產生節點**,不是產生後隱藏 —— 會動的節點
//      就算看不到,合成器還是要處理它。
//   2. 每片的參數都要在範圍內。亂數注入進來,才驗得到而不是碰運氣。
import test from 'node:test';
import assert from 'node:assert/strict';

import { FLAKES, flakeSpecs, mountSnow } from '../shared/js/snow.js';

// 固定序列的假亂數:第一次回 0、第二次回 0.999,用來打範圍的兩端
function seq(values) {
  let i = 0;
  return () => values[i++ % values.length];
}

test('雪花數量等於常數', () => {
  assert.equal(flakeSpecs().length, FLAKES);
  assert.equal(flakeSpecs(7).length, 7);
});

test('rng 回 0 時,每個參數都落在範圍下緣', () => {
  const [f] = flakeSpecs(1, seq([0]));
  assert.equal(f.size, 2);
  assert.equal(f.duration, 8);
  assert.equal(f.left, 0);
  assert.equal(f.delay, -18);
  assert.equal(f.drift, -24);
});

test('rng 接近 1 時,每個參數都落在範圍上緣', () => {
  const [f] = flakeSpecs(1, seq([0.999999]));
  assert.ok(f.size > 5.99 && f.size <= 6, `size=${f.size}`);
  assert.ok(f.duration > 17.9 && f.duration <= 18, `duration=${f.duration}`);
  assert.ok(f.left > 99.9 && f.left <= 100, `left=${f.left}`);
  assert.ok(f.drift > 23.9 && f.drift <= 24, `drift=${f.drift}`);
});

test('delay 一律是負的 —— 一載入就該滿天都是雪,不是等十八秒才飄第一片', () => {
  for (const f of flakeSpecs(FLAKES, seq([0.3, 0.7, 0.1, 0.9]))) {
    assert.ok(f.delay <= 0, `delay=${f.delay}`);
  }
});

test('prefers-reduced-motion 時產生 0 個節點', () => {
  const made = mountSnow({ reduceMotion: true });
  assert.equal(made, 0);
});
```

- [ ] **Step 2: 跑測試確認它失敗**

Run: `node --test test/snow.test.js`
Expected: FAIL —— `Cannot find module '../shared/js/snow.js'`

- [ ] **Step 3: 寫 `shared/js/snow.js`**

```js
// 飄雪。注入一次就不管了,沒有狀態、沒有計時器 —— 動畫全部交給 CSS,
// 跑在合成器上,不跟三個 3D 模式的 rAF 迴圈搶主執行緒。
//
// 雪花放在**舞台後面**不是前面:小孩要讀的是獎項名稱和按鈕,雪花飄過文字會扣分。
// 而三個 3D 的 canvas 是透明的,雪花在後面一樣會透出來 ——
// 等於免費拿到前景的效果,而沒有前景的代價。

// 片數。低階手機掉幀的話就調小,設 0 等於關掉。
export const FLAKES = 24;

const SIZE = [2, 6];        // px
const DURATION = [8, 18];   // 秒
const DRIFT = [-24, 24];    // 左右飄移 px

const lerp = (range, t) => range[0] + (range[1] - range[0]) * t;

// 純函式,方便測試:給同一組亂數就給同一批雪花。
export function flakeSpecs(count = FLAKES, rng = Math.random) {
  return Array.from({ length: count }, () => {
    const duration = lerp(DURATION, rng());
    return {
      size: lerp(SIZE, rng()),
      duration,
      left: lerp([0, 100], rng()),      // vw
      // delay 是**負的**:一載入畫面上就該已經滿天是雪,
      // 而不是等最慢那片飄完 18 秒才看到第一片。
      delay: -duration,
      drift: lerp(DRIFT, rng()),
    };
  });
}

export function mountSnow({ rng = Math.random, reduceMotion, doc = globalThis.document } = {}) {
  const reduce = reduceMotion ?? (
    typeof globalThis.matchMedia === 'function'
      && globalThis.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
  // 產生後隱藏是不夠的:會動的節點就算看不到,合成器還是要處理它。
  if (reduce || !doc || FLAKES === 0) return 0;

  const layer = doc.createElement('div');
  layer.className = 'snow';
  layer.setAttribute('aria-hidden', 'true');

  for (const f of flakeSpecs(FLAKES, rng)) {
    const el = doc.createElement('i');
    el.className = 'snow__flake';
    el.style.cssText = [
      `--size:${f.size.toFixed(2)}px`,
      `--dur:${f.duration.toFixed(2)}s`,
      `--left:${f.left.toFixed(2)}vw`,
      `--delay:${f.delay.toFixed(2)}s`,
      `--drift:${f.drift.toFixed(2)}px`,
    ].join(';');
    layer.append(el);
  }

  doc.body.append(layer);
  return layer.childElementCount;
}
```

- [ ] **Step 4: 跑測試確認它通過**

Run: `node --test test/snow.test.js`
Expected: PASS(5 個測試)

- [ ] **Step 5: 證明測試真的會咬**

暫時把 `mountSnow` 的 `if (reduce || ...) return 0;` 改成 `if (false) return 0;`,跑 `node --test test/snow.test.js`。

Expected: 「prefers-reduced-motion 時產生 0 個節點」那個測試**變紅**(會因為 `doc` 是 undefined 而丟例外或回傳非 0)。確認後改回來。

- [ ] **Step 6: 寫 `shared/css/theme-snow.css`**

```css
/* 雪地舞台。四層由後到前:天空 → 遠景 → 雪坡 → 雪花。
   前三層全部在 body 的 background 裡,零 DOM、零額外請求 ——
   遠景用 data URI 內嵌,不多一次網路往返。 */

:root {
  --sky-top: #DCEBF7;
  --sky-low: #F3F8FC;
  --snow: #FFFFFF;
  --snow-shade: #E8F1F8;
  --far: #BCD2E4;
}

/* 雪花那一層。整層不可點,而且不佔排版。 */
.snow {
  position: fixed;
  inset: 0;
  z-index: 0;
  pointer-events: none;
  overflow: hidden;
}

.snow__flake {
  position: absolute;
  top: -8px;
  left: var(--left);
  width: var(--size);
  height: var(--size);
  border-radius: 50%;
  background: #FFFFFF;
  opacity: .85;
  /* translate3d 而不是 top/left:前者跑在合成器上,後者每幀都要重排 */
  animation: snow-fall var(--dur) linear var(--delay) infinite;
}

@keyframes snow-fall {
  from { transform: translate3d(0, -10vh, 0); }
  to   { transform: translate3d(var(--drift), 110vh, 0); }
}

/* 頁面內容要浮在雪花之上,不然雪會蓋住文字 */
body > *:not(.snow) {
  position: relative;
  z-index: 1;
}
```

- [ ] **Step 7: 改 `shared/css/tokens.css` 的 body background**

把現在這段:

```css
  background:
    radial-gradient(circle at 12% 18%, #FFE9C9 0 22%, transparent 22.5%),
    radial-gradient(circle at 88% 12%, #FFDCD2 0 16%, transparent 16.5%),
    radial-gradient(circle at 78% 86%, #E4F6E2 0 20%, transparent 20.5%),
    var(--cream);
```

換成:

```css
  /* 雪地舞台。由前到後:雪坡 → 遠景剪影 → 天空。
     注意這裡只換「舞台」—— 卡片、按鈕維持暖米色,暖色壓在冷色上對比最強,
     小孩最容易看出哪個可以點。 */
  background:
    /* 雪坡:畫面下方兩道起伏 */
    radial-gradient(120% 40% at 20% 108%, var(--snow) 0 60%, transparent 60.5%),
    radial-gradient(120% 34% at 85% 112%, var(--snow-shade) 0 60%, transparent 60.5%),
    /* 遠景:松樹剪影 + 小木屋,壓淡並貼在畫面上緣 */
    url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='480' height='120' viewBox='0 0 480 120'%3E%3Cg fill='%23BCD2E4' opacity='0.3'%3E%3Cpath d='M40 100 L60 40 L80 100 Z'/%3E%3Cpath d='M46 76 L60 24 L74 76 Z'/%3E%3Cpath d='M120 100 L136 52 L152 100 Z'/%3E%3Cpath d='M210 100 L236 34 L262 100 Z'/%3E%3Cpath d='M218 72 L236 18 L254 72 Z'/%3E%3Cpath d='M330 100 L346 54 L362 100 Z'/%3E%3Cpath d='M420 100 L442 42 L464 100 Z'/%3E%3Crect x='280' y='72' width='40' height='28'/%3E%3Cpath d='M274 74 L300 54 L326 74 Z'/%3E%3C/g%3E%3C/svg%3E"),
    /* 天空 */
    linear-gradient(180deg, var(--sky-top) 0%, var(--sky-low) 62%, var(--sky-low) 100%);
  background-repeat: no-repeat, no-repeat, repeat-x, no-repeat;
  background-position: center bottom, center bottom, left top, center;
  background-size: auto, auto, 480px 120px, cover;
  background-attachment: fixed;
```

同時在 `tokens.css` 最上面加一行 import,讓五個頁面不用各自多掛一個 `<link>`:

```css
@import url("./theme-snow.css");
```

(放在檔案第一行 —— CSS 的 `@import` 必須出現在所有規則之前,否則整條會被忽略。)

- [ ] **Step 8: 六個 HTML 各加一行 module**

在 `index.html`、`gashapon/index.html`、`gashapon3d/index.html`、`ichiban/index.html`、`ghostleg/index.html`、`smash/index.html` 的 `</body>` 之前加:

```html
<script type="module">
  import { mountSnow } from './shared/js/snow.js';
  mountSnow();
</script>
```

五個模式的頁面路徑是 `../shared/js/snow.js`(多一層)。首頁是 `./shared/js/snow.js`。

- [ ] **Step 9: 跑全部測試**

Run: `node --test test/*.test.js`
Expected: PASS,總數 213 + 5 = 218

- [ ] **Step 10: 用瀏覽器看一次**

```bash
cd /Users/willian/github/gashapon && python3 -m http.server 8200
```

**一定要開新的 port** —— 舊 port 會服務快取住的舊模組,這個 session 已經因為這件事誤判過一次「修好了但其實沒生效」。

在**前景**分頁(先確認 `document.visibilityState === 'visible'`,背景分頁會停掉動畫,截圖會騙人)逐一打開六個頁面,確認:
- 雪在飄,而且一載入就滿天都是(不是空白等十八秒)
- 雪在**文字後面**,沒有蓋住獎項名稱或按鈕
- 三個 3D 模式裡,雪從透明的 canvas 透出來
- 卡片和按鈕仍是暖米色,沒有跟著轉冷

- [ ] **Step 11: Commit**

```bash
git add shared/css/theme-snow.css shared/js/snow.js shared/css/tokens.css test/snow.test.js index.html gashapon/index.html gashapon3d/index.html ichiban/index.html ghostleg/index.html smash/index.html
git commit -F - <<'EOF'
feat(theme): 全站換成雪地舞台

背景從米色圓點換成天空 + 遠景剪影 + 雪坡,再加一層 24 片的飄雪。
前三層全部在 body 的 background 裡,零 DOM、零額外請求(遠景用
data URI 內嵌,不多一次網路往返)。

雪花放在舞台**後面**不是前面:小孩要讀的是獎項名稱和按鈕,雪花
飄過文字會扣分;而三個 3D 的 canvas 是透明的,雪花在後面一樣會
透出來,等於免費拿到前景效果而沒有前景的代價。

雪地只是舞台 —— 卡片和按鈕維持暖米色,3D 物件的識別色一個都沒動。

prefers-reduced-motion 時**完全不注入節點**,不是注入後隱藏:
會動的節點就算看不到,合成器還是要處理它。

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_018HB492KLcUb11Bqr4pcBR9
EOF
```

---

## Task 2R: 圖片版吉祥物模組(取代原 Task 2/3/4)

> **原 Task 2/3/4(手刻 SVG 骨架 + 五組姿勢 transform + 待機小動作)已作廢。**
> 三輪實作(`aad0c4e` / `cd9eda9` / `ed488f1`)都沒通過使用者那一關,素材改為生成圖。
> 原因與新流程見 spec 的「修訂一」。那三個 commit 留在歷史裡,檔案內容由這個任務換掉。

**Files:**
- Rewrite: `shared/js/mascot.js`(丟掉 SVG 骨架字串,改成 `<img>` 切換)
- Rewrite: `shared/css/mascot.css`(丟掉五組零件 transform,改成圖片層的定位/淡入/呼吸)
- Modify: `test/mascot.test.js`(狀態機的斷言保留,拿掉針對 SVG 內部結構的部分)
- 素材已就位(不要動,也不要重新產生):`shared/img/mascot/{idle,watch,cheer,aww,empty,doze}.webp`

**Interfaces:**
- Produces:
  - `POSES` = `['idle','watch','cheer','aww','empty']` —— **仍然是五個**
  - `mountMascots({ home = false, fidget = true, doc } = {})` → `{ el, getState(), setPose(p), flyTo(el, {pose}), home({pose}), stop() }`
  - `getState()` 回 `{ pose, placement }`,初始 `{ pose:'idle', placement:'corner' }`
- Consumes: 無

**這個任務的硬性要求**

1. **`doze` 不是第六個 pose。** 它是 `idle` 的待機變化,跟「打哈欠」同一類。`POSES` 保持五個值,`setPose('doze')` 必須被擋掉。
2. **只有 `idle` 在首屏載入。** 其餘五張(含 `doze`)延後到第一次要用時才抓。六張合計 278 KB,全部預載會把首屏成本從 45 KB 變成 278 KB —— 這個站的首屏延遲已經被抱怨過。
   做法:`idle` 的 `<img>` 一開始就有 `src`;其餘的在 `setPose` / 待機第一次需要時才建立或指定 `src`。
3. **切換要淡入淡出,不能硬切。** 兩層 `<img>` 交叉淡入(舊的淡出、新的淡入),約 220ms。硬切在換姿勢時會「啪」一下。
4. **吉祥物仍然是 `<body>` 底下的 fixed 層,絕不進入任何模式的 DOM。** 錨點只當座標來源。
5. **待機**:整體 `scaleY` 呼吸(常駐);每 4~9 秒有機率切到 `doze` 停約 1.6 秒再回 `idle`。`pickFidget` 那種「不連續兩次抽到同一個」的邏輯不再需要(只有一個變化),但**排程仍須可用假亂數注入並且可以關掉**(`fidget: false`),否則 `node --test` 會因為計時器不斷重排而**永遠不結束**。
6. `prefers-reduced-motion` 時:不呼吸、不切 `doze`、飛行不補間。

- [ ] **Step 1: 改測試(先讓它紅)**

`test/mascot.test.js` 保留原有的狀態機斷言(初始狀態、`setPose` 只改姿勢、不認得的姿勢被擋、`flyTo` 遇到 rect 全 0 退回角落、`home()` 回 idle/corner),並**新增**:

```js
test('doze 不是 pose,setPose 擋掉它', () => {
  const m = mountMascots({ doc: fakeDoc(), fidget: false });
  m.setPose('doze');
  assert.equal(m.getState().pose, 'idle');
});

test('只有 idle 在一開始就有 src —— 其餘五張延後載入', () => {
  const m = mountMascots({ doc: fakeDoc(), fidget: false });
  const srcs = m.el.children.flatMap(c => c.src ? [c.src] : []);
  assert.equal(srcs.length, 1, `一開始只該有一個 src,實際 ${srcs.length}`);
  assert.ok(srcs[0].includes('idle'), srcs[0]);
});

test('fidget: false 時不排任何計時器 —— 不然 node --test 不會結束', () => {
  const m = mountMascots({ doc: fakeDoc(), fidget: false });
  assert.equal(typeof m.stop, 'function');
  m.stop();  // 呼叫兩次也不能爆
  m.stop();
});
```

假 DOM 需要補上 `src` 屬性與 `children` 陣列(原本的 `fakeDoc` 已有 `children`)。

- [ ] **Step 2: 跑測試確認新的斷言失敗**

Run: `node --test test/mascot.test.js`
Expected: 新增的三條紅(舊的 SVG 結構斷言若還在也會紅,一併拿掉)

- [ ] **Step 3: 重寫 `shared/js/mascot.js`**

要點(不要照抄舊檔):
- 移除 `RIG` 那個 SVG 字串與 `FIDGETS` / `pickFidget`
- 建兩個 `<img class="mascots__img">` 疊在一起,一個是「目前」一個是「下一張」,交叉淡入
- `POSES` 五個值;`SRC = { idle:'…/idle.webp', …, doze:'…/doze.webp' }`,`doze` 只給待機用
- 路徑:`new URL('../img/mascot/idle.webp', import.meta.url)` —— 五個模式與首頁的深度不同,寫死相對路徑會有一個壞掉
- `flyTo` / `home` / `--fly-x` / `--fly-y` 的做法**原封不動沿用**(那部分跟素材無關)

- [ ] **Step 4: 跑測試確認通過**

Run: `node --test test/*.test.js`
Expected: PASS(既有 218 + mascot 的新測試)

- [ ] **Step 5: 重寫 `shared/css/mascot.css`**

- `.mascots` 固定層、`pointer-events:none`、`z-index:50`、`--fly-x/--fly-y` 的 translate(沿用)
- `.mascots__img` 絕對疊放、`width:100%`、`opacity` 過渡 220ms
- `.mascots--home` 放大版
- 呼吸:`@keyframes` 對整層做 `scaleY(1 → 1.03)`,3.4s
- `.mascot-anchor` 那條(1px、透明、不佔空間)保留
- `prefers-reduced-motion` 時關掉呼吸與過渡

- [ ] **Step 6: 用檢查頁看五個姿勢 + 呼吸**

改 `_mascot-check.html` 列出五個姿勢加 `doze`,開**新 port**,前景分頁截圖。
(`document.visibilityState` 在這個環境會一直回報 hidden,**不要靠它** —— 改用連續兩次讀元素座標/樣式看有沒有變。)

- [ ] **Step 7: Commit**

```bash
git add shared/js/mascot.js shared/css/mascot.css test/mascot.test.js _mascot-check.html
git commit -F - <<'EOF'
feat(mascot): 改用生成圖,丟掉手刻的 SVG 骨架

素材改為 shared/img/mascot/*.webp。POSES 仍是五個值 —— doze 是 idle
的待機變化,不是第六個 pose。

只有 idle 在首屏載入,其餘五張延後:六張合計 278 KB,全部預載會把
首屏成本從 45 KB 變成 278 KB。

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_018HB492KLcUb11Bqr4pcBR9
EOF
```

---

## Task 5: 接線 — 扭蛋機與立體扭蛋機

兩個模式的姿勢對應**完全一樣**(高階獎才飛到 `#prizeCard`),放同一個任務。

**Files:**
- Modify: `gashapon/index.html`, `gashapon/js/main.js`
- Modify: `gashapon3d/index.html`, `gashapon3d/js/main.js`

**Interfaces:**
- Consumes: `mountMascots()` / `setPose(pose)` / `flyTo(el, { pose })` / `home()`
- Produces: 無(這是葉節點)

- [ ] **Step 1: 兩個 index.html 各加兩個空錨點**

在 `gashapon/index.html` 的 `#prizeCard` **之後**、`#emptyState` **之後**,各加一個:

```html
<div class="mascot-anchor" id="revealAnchor" aria-hidden="true"></div>
```

```html
<div class="mascot-anchor" id="emptyAnchor" aria-hidden="true"></div>
```

`gashapon3d/index.html` 一樣。錨點必須是**空的、不佔空間**的 —— 在 `shared/css/mascot.css` 加:

```css
/* 錨點只是座標,不是容器。它不能佔空間,也不能被看到。 */
.mascot-anchor {
  width: 1px;
  height: 1px;
  margin: 0;
  padding: 0;
  pointer-events: none;
  opacity: 0;
}
```

- [ ] **Step 2: `gashapon/js/main.js` 接線**

在 import 區塊加:

```js
import { mountMascots } from '../../shared/js/mascot.js';
```

在 `const overlay = $('overlay');` 附近加:

```js
const mascots = mountMascots();

// 只有高階才值得讓牠們衝過來。每抽一次就衝一次的話,那個動作三次之後
// 就不特別了,而且會變成干擾 —— 普通結果在角落換個表情就好。
const BIG = new Set(['SSR', 'UR']);
```

把 `doDraw` 裡這三行:

```js
  overlay.hidden = false;
  $('skipHint').hidden = false;
  await revealer.play(result.revealSteps);
  $('skipHint').hidden = true;
  view.render(getActiveMachine(state));
```

改成:

```js
  overlay.hidden = false;
  $('skipHint').hidden = false;
  mascots.setPose('watch');
  await revealer.play(result.revealSteps);
  $('skipHint').hidden = true;
  if (BIG.has(result.prize.rarity)) {
    mascots.flyTo($('revealAnchor'), { pose: 'cheer' });
  } else {
    mascots.home();
  }
  view.render(getActiveMachine(state));
```

在 `render()` 裡加空狀態判斷(條件抄自 `gashapon/js/ui-machine.js:46`,那是現在決定 `#emptyState` 的同一條):

```js
function render() {
  view.render(getActiveMachine(state));
  view.setSoundIcon(prefs.soundOn);
  const machine = getActiveMachine(state);
  const empty = machine.removeOnDraw && machine.pool.every(c => c.drawn);
  if (empty) mascots.flyTo($('emptyAnchor'), { pose: 'empty' });
}
```

並在關掉 overlay 的地方(`overlay.hidden = true` 那一處)加 `mascots.home();`。

- [ ] **Step 3: `gashapon3d/js/main.js` 接線**

在 import 區塊加 `import { mountMascots } from '../../shared/js/mascot.js';`,並在模組頂層加 `const mascots = mountMascots();` 與同一份 `const BIG = new Set(['SSR', 'UR']);`。

- `drawForMe()` 與點蛋的處理一開始:`mascots.setPose('watch');`
- 在 `'show'` 那一步、`$('prizeCard').hidden = false;` 之後(第 136 行):
  ```js
  if (BIG.has(step.rarity)) {
    mascots.flyTo($('revealAnchor'), { pose: 'cheer' });
  }
  ```
  `step` 是該 `for` 迴圈當下的 reveal step,`step.rarity` 就是這次開出來的稀有度
  —— 同一個 `'show'` 分支上面兩行的 `RARITY_META[step.rarity]` 用的是同一個值。
- `dismissPrize()` 把 `#prizeCard` 關掉時:`mascots.home();`
- `render()` 裡已經有 `const empty = ...`(第 57~65 行),在 `$('emptyState').hidden = !empty;` 之後加:
  ```js
  if (empty) mascots.flyTo($('emptyAnchor'), { pose: 'empty' });
  ```

- [ ] **Step 4: 跑全部測試**

Run: `node --test test/*.test.js`
Expected: PASS,總數維持 230。**既有測試一個都不能紅** —— 這一步沒動任何業務邏輯。

- [ ] **Step 5: 開新 port,兩個模式各實際抽到「高階」與「普通」各一次**

```bash
cd /Users/willian/github/gashapon && python3 -m http.server 8203
```

在**前景**分頁確認:
- 演出中兩隻抬頭(`watch`)
- 抽到 SSR/UR 時牠們飛到獎項卡旁邊歡呼,關掉之後飛回角落
- 抽到 N/R 時牠們**留在角落**,沒有衝過來
- 抽光之後變成 `empty`,而且**獎項卡的按鈕沒有被擠動**(對照 spec 的「模型錯誤 #3」)

- [ ] **Step 6: Commit**

```bash
git add gashapon/index.html gashapon/js/main.js gashapon3d/index.html gashapon3d/js/main.js shared/css/mascot.css
git commit -F - <<'EOF'
feat(mascot): 接上扭蛋機與立體扭蛋機

演出中 watch;抽到 SSR/UR 才飛到獎項卡旁歡呼;普通結果留在角落。
只有高階才值得讓牠們衝過來 —— 每抽一次就衝一次的話,那個動作三次
之後就不特別了,而且會變成干擾。

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_018HB492KLcUb11Bqr4pcBR9
EOF
```

---

## Task 6: 接線 — 一番賞

**Files:**
- Modify: `ichiban/index.html`, `ichiban/js/main.js`

**Interfaces:**
- Consumes: `mountMascots()` / `setPose` / `flyTo` / `home`
- Produces: 無

- [ ] **Step 1: `ichiban/index.html` 加兩個錨點**

在 `#overlay` 內、`.reveal-stack` 之後加:

```html
<div class="mascot-anchor" id="revealAnchor" aria-hidden="true"></div>
```

在 `#emptyState` 之後加:

```html
<div class="mascot-anchor" id="emptyAnchor" aria-hidden="true"></div>
```

- [ ] **Step 2: `ichiban/js/main.js` 接線**

加 import 與實例:

```js
import { mountMascots } from '../../shared/js/mascot.js';

const mascots = mountMascots();

// A/B 賞跟最後一抽賞才值得衝過來。C 賞以下是常態,每次都衝會變干擾。
const BIG_TIERS = new Set(['A', 'B']);
```

在 `doDraw()` 裡,`await revealer.hold(...)` 之前加:

```js
  mascots.setPose('watch');
```

在 `await revealer.tear();` 之後加:

```js
  if (BIG_TIERS.has(result.prize.tier) || result.isLastOne) {
    mascots.flyTo($('revealAnchor'), { pose: 'cheer' });
  }
```

在 `closeOverlay()` 裡加 `mascots.home();`。

在 `render()` 裡,`$('remaining').textContent = ...` 之後加:

```js
  if (setup.tickets.length > 0 && left === 0) {
    mascots.flyTo($('emptyAnchor'), { pose: 'empty' });
  }
```

(`left` 是該函式裡已經算好的變數。)

- [ ] **Step 3: 跑全部測試**

Run: `node --test test/*.test.js`
Expected: PASS,總數維持 230

- [ ] **Step 4: 開新 port 實測**

```bash
cd /Users/willian/github/gashapon && python3 -m http.server 8204
```

在**前景**分頁確認:
- 拿起籤紙、還沒決定撕不撕的時候是 `watch`
- 撕開 A 賞或最後一抽賞 → 飛過去歡呼
- 撕開 D 賞之類 → 留在角落
- **「取消 / 撕開」那兩顆按鈕沒有被擠動** —— 這個模式踩過這個 bug,要特別看
- 全部抽完 → `empty`

- [ ] **Step 5: Commit**

```bash
git add ichiban/index.html ichiban/js/main.js
git commit -F - <<'EOF'
feat(mascot): 接上一番賞

A/B 賞與最後一抽賞才飛過去歡呼。這個模式的揭曉區踩過「新元素把
按鈕擠開」的 bug,所以吉祥物是 fixed 層 + 座標錨點,不進 DOM。

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_018HB492KLcUb11Bqr4pcBR9
EOF
```

---

## Task 7: 接線 — 阿彌陀籤與大亂鬥

兩個都是「跑完/打完 → 顯示結果面板」,形狀一樣,放同一個任務。這兩個也是**唯二會用到 `aww`** 的模式。

**Files:**
- Modify: `ghostleg/index.html`, `ghostleg/js/main.js`
- Modify: `smash/index.html`, `smash/js/main.js`

**Interfaces:**
- Consumes: `mountMascots()` / `setPose` / `flyTo` / `home`
- Produces: 無

- [ ] **Step 1: 兩個 index.html 各加兩個錨點**

`ghostleg/index.html`:在 `#results` 內的 `#resultList` 之後、以及 `#emptyState` 之後各加一個,id 分別是 `revealAnchor` 與 `emptyAnchor`。

`smash/index.html`:在 `#winner` 內的 `#winnerName` 之後、以及 `#emptyState` 之後各加一個,id 同上。

```html
<div class="mascot-anchor" id="revealAnchor" aria-hidden="true"></div>
<div class="mascot-anchor" id="emptyAnchor" aria-hidden="true"></div>
```

- [ ] **Step 2: `ghostleg/js/main.js` 接線**

```js
import { mountMascots } from '../../shared/js/mascot.js';

const mascots = mountMascots();
```

在 `start()`(按下開始、`running = true` 那裡)加:

```js
  mascots.setPose('watch');
```

在 `finish(round)` 的最後、`$('results').hidden = false;` 之後加:

```js
  // 全部都是銘謝惠顧才是真的槓龜。有人中獎就值得歡呼。
  const anyWin = round.results.some(r => r.slot.prizeId !== null);
  mascots.flyTo($('revealAnchor'), { pose: anyWin ? 'cheer' : 'aww' });
```

在 `$('againBtn')` 的 handler 裡(`$('results').hidden = true;` 那裡)加 `mascots.home();`。

在 `render()` 裡,`$('emptyState').hidden = ready;` 之後加:

```js
  if (!ready) mascots.flyTo($('emptyAnchor'), { pose: 'empty' });
```

- [ ] **Step 3: `smash/js/main.js` 接線**

```js
import { mountMascots } from '../../shared/js/mascot.js';

const mascots = mountMascots();
```

在 `start()` 裡、`running = true;` 之後加 `mascots.setPose('watch');`

在 `finish(teamId)` 裡,已經有 `const f = nameMap().get(teamId);` 與 if/else 兩條分支 —— 在 `$('winner').hidden = false;` 之後加:

```js
  // f 存在 = 有贏家;沒有 = 平手或同歸於盡
  mascots.flyTo($('revealAnchor'), { pose: f ? 'cheer' : 'aww' });
```

在把 `$('winner').hidden = true;` 的地方(`reset()` 第 65 行附近)加 `mascots.home();`。

在 `render()` 裡,`$('emptyState').hidden = ready;` 之後加:

```js
  if (!ready) mascots.flyTo($('emptyAnchor'), { pose: 'empty' });
```

- [ ] **Step 4: 跑全部測試**

Run: `node --test test/*.test.js`
Expected: PASS,總數維持 230

- [ ] **Step 5: 開新 port 實測兩個模式的四種結局**

```bash
cd /Users/willian/github/gashapon && python3 -m http.server 8205
```

在**前景**分頁(背景分頁會停掉 rAF,大亂鬥會整個凍住,這個 session 已經因此誤判過)確認:
- 阿彌陀籤:有人中獎 → `cheer`;把獎項數量設成 0 讓全部槓龜 → `aww`
- 大亂鬥:有贏家 → `cheer`;把 `MAX_TIME` 暫時調小逼出平手 → `aww`(測完改回來)
- 兩邊的結果面板**排版都沒有被擠動**
- 把隊伍/人數刪到剩一個 → `empty`

- [ ] **Step 6: Commit**

```bash
git add ghostleg/index.html ghostleg/js/main.js smash/index.html smash/js/main.js
git commit -F - <<'EOF'
feat(mascot): 接上阿彌陀籤與大亂鬥

這兩個是唯二會用到 aww 的模式:阿彌陀籤全部槓龜、大亂鬥平手。
扭蛋機抽到 N 賞不算失敗 —— 那是最常見的結果,每次都讓白鼬垂耳朵,
小孩會覺得被吉祥物嫌棄。

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_018HB492KLcUb11Bqr4pcBR9
EOF
```

---

## Task 8: 首頁主視覺,並刪掉丟棄式檢查頁

**Files:**
- Modify: `index.html`
- Modify: `css/home.css`
- Delete: `_mascot-check.html`

**Interfaces:**
- Consumes: `mountMascots({ home: true })`
- Produces: 無

- [ ] **Step 1: `index.html` 的 header 加一個掛載點**

```html
<header class="home-head">
  <h1>要玩哪一個?</h1>
  <div id="homeMascots"></div>
</header>
```

並在頁尾的 module 裡(Task 1 已經加了 `mountSnow`)補上:

```js
  import { mountMascots } from './shared/js/mascot.js';
  const m = mountMascots({ home: true });
  document.getElementById('homeMascots').append(m.el);
```

`mountMascots` 預設會把元素 append 到 `body`,這裡再搬進 header —— `append` 會移動節點,不會複製。

- [ ] **Step 2: `css/home.css` 讓 header 排得下**

```css
.home-head {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}

/* 首頁的兩隻不會飛也不會換姿勢,純主視覺。
   它不是第三種 placement —— placement 還是 corner,只是外觀不同。 */
.home-head .mascots--home { position: static; }
```

- [ ] **Step 3: 刪掉丟棄式檢查頁**

```bash
rm _mascot-check.html
```

- [ ] **Step 4: 跑全部測試**

Run: `node --test test/*.test.js`
Expected: PASS,總數維持 230

- [ ] **Step 5: 六個頁面全部再看一次**

```bash
cd /Users/willian/github/gashapon && python3 -m http.server 8206
```

在**前景**分頁逐一確認:首頁的兩隻夠大、五個模式的角落都有牠們、待機會動、飄雪還在、沒有任何一頁的排版被擠動。

另外把視窗拉到 **420px 寬**再看一次 —— 這個 session 的 3D 取景就是在窄視窗下才發現被切掉的。

- [ ] **Step 6: Commit 並 push**

```bash
git add index.html css/home.css
git rm --cached _mascot-check.html 2>/dev/null || true
git commit -F - <<'EOF'
feat(mascot): 首頁主視覺,移除丟棄式檢查頁

首頁的兩隻不會飛也不會換姿勢,純主視覺。它不是第三種 placement ——
placement 還是 corner,只是多掛一個 .mascots--home 改外觀,狀態機
不因為一頁而多一個分支。

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_018HB492KLcUb11Bqr4pcBR9
EOF
git push
```

---

## 交付前要誠實講清楚的事

這些不是待辦,是**驗證範圍的邊界**,交付時要主動說出來:

- **真機沒測過**。低階手機上 24 片持續 transform 的雪花疊在跑 WebGL 的三個模式後面會不會掉幀,只能靠 `FLAKES` 這個常數事後調
- **只有 Chrome**。Safari 與 Firefox 完全沒測
- **「夠不夠可愛」不是測試能回答的**。Task 2 的關卡就是為了這件事存在
- **音效沒有動到**,這次不加任何吉祥物音效
