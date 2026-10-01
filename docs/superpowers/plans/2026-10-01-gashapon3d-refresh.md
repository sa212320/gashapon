# 立體扭蛋機改版 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 立體扭蛋機(`gashapon3d/`)換成跟扭蛋機頁同一套冰雪畫風:跟 2D 一樣的升級演出(白色花紋殼、雪花粒子、光暈)、有厚度的冰雪托盤、跟 2D 一致的版面與揭曉卡片,首頁卡片換插畫。

**Architecture:** 資料層(`pool` 的 Capsule)完全不動;新增的都是畫面層。2D 的特效(`spawnParticles` / `flashAura`)、稀有度色、角落圖示、標籤樣式搬進 `shared/` 兩台共用;3D 的殼外觀由 `gashapon3d/js/skin.js` 用 Canvas 合成成 `CanvasTexture`(純數學放 `skin-math.js` 讓 Node 測得到);托盤 = 俯視冰面貼圖 + `LatheGeometry` 冰牆。

**Tech Stack:** 原生 ES modules、three.js(`vendor/three.module.min.js`,importmap)、`node --test`(零依賴)、Python 素材工具(`tools/mascot-gen/`,`.venv`,`unittest`)。

**Spec:** `docs/superpowers/specs/2026-10-01-gashapon3d-refresh-design.md`

## Global Constraints

- 零建置:不可新增 package.json、bundler、npm 依賴
- 測試:`node --test`(repo 根目錄);Python:`tools/mascot-gen/.venv/bin/python -m unittest discover tools/mascot-gen`
- 引用 `'three'` 的模組在 Node 裡 import 不到 —— 要被 Node 測的純函式**不可** import three
- 換素材的網址一律帶 `?v=<sha1 前 8 碼>`(`gashapon_art.stamp` / `content_hash`);首頁預載清單網址要跟頁面引用一字不差
- 平塗、不放光源;描邊色 `INK = 0x574239`
- 註解、UI 文字用繁體中文;識別字、commit message 用英文;commit 結尾加:
  ```
  Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01SemYkQLkTmSDDeYUKQcPZG
  ```
- 驗收一律在**真實頁面**(本機 `python3 -m http.server` 開 repo 根目錄),390 與 1440 兩種寬度各截圖給使用者;不用另做 repro 頁
- **預先載入**(使用者 2026-10-02 指定):這次新增或換過的每一張圖都要進預載範圍,兩層都要 ——
  ① 首頁閒置預抓 `gashapon/img/preload.json`(由 `gashapon.py write_preload_manifest()` 產生,`test/preload-manifest.test.js` 檢查一字不差);
  ② 進到立體扭蛋機頁時先暖好揭曉要用的圖(外框、花紋、托盤),不要等第一次揭曉才下載。
  涵蓋清單:`pattern-*.webp`(白色版)、`frame-*.webp`、`gashapon3d/img/floor.webp`、`gashapon3d/img/wall.webp`。首頁卡片 `img/home/gashapon3d.webp` 是首頁本身的圖,不用預載
- 生圖:ComfyUI 已關;本計畫用到的圖都已生好並選定,**不要再生**。後製失敗才回報使用者

## 已封閉的決策(逐字自 spec;實作時不得重新討論)

| # | 決策 | 結論 |
|---|---|---|
| Q1 | 範圍 | issue #6 + UI 跟 2D 統一 + 整個場景冰雪風 |
| Q2/Q4 | 桌上的蛋 | **純隨機 12 色**(`CAPSULE_COLORS`),**沒有花紋**。`pool` 資料格式不變 |
| Q3 | 升級演出 | **完全比照 2D**:起點是那顆蛋的隨機純色;每次 upgrade 殼換成該稀有度的外觀(2D 的底色 × `pattern-*.webp`),配粒子 + 光暈 + 彈跳。N 不升級、殼不換 |
| — | 轉正 | 蛋飛到中央時**要轉正**:上半朝上、接縫在畫面上水平、正面朝鏡頭 |
| Q9 | 花紋貼法 | **正面 planar 投影**(頂點 x、y 算 UV),不重生花紋素材 |
| — | 殼的材質做法 | **執行時 Canvas 合成**:底色(純色 / SSR 金漸層 / UR 彩虹)畫進 canvas,再把花紋圖**直接疊上去**(一般 source-over)→ `CanvasTexture`。底色**從 `tokens.css` 的 CSS 變數讀**,不在 JS 複製色碼。UR 的流動:2D 是 `shimmer` = `filter: hue-rotate(360deg) saturate(1.15)` 3.2s 一圈(整顆含花紋一起轉色相),3D 在載入時用**同一個 CSS hue-rotate 色彩矩陣**預算 24 格貼圖、依時間輪播 |
| — | 花紋改白 | 花紋從「深色 multiply」改成**白色**:N/R/SR/SSR = 白色雪花;**UR = 淺水晶藍 `#7FD3FF` 雪花 + 白邊**(白邊寬約為圖寬的 1.7%)。**2D 一起改**。花紋在 `build-patterns` 時就烘成 **RGBA webp**(白 / 藍 + 透明度 = 原灰階反轉),檔名不變、雜湊更新;2D 的 `::before` 拿掉 `mix-blend-mode: multiply`,3D 直接疊。兩台讀同一張圖 |
| — | 稀有度色共用 | 2D `style.css` 開頭覆寫的 `--r-SSR-a/b`、`--gold`、`--rainbow`、`--rainbow-conic` **整段搬進 `tokens.css`**,2D 畫面不變,3D 讀到同一份 |
| Q8 | 粒子 / 光暈 | 2D `reveal.js` 的 `spawnParticles` / `flashAura` 抽到 `shared/js/reveal-fx.js` 兩台共用;3D 用 DOM 疊在 canvas 上,對準蛋的螢幕投影。2D 行為不變 |
| Q5 | 托盤 | 冰雪托盤;雪邊跟著托盤 scale 縮放沒關係;影子改冷色藍灰;描邊維持深棕 `INK` |
| — | 托盤立體感 | **要像首頁卡片那樣有厚度**:外圍一圈 3D 冰牆(`LatheGeometry`,平塗 + 深棕描邊),上緣積雪、波浪下緣;盤底用俯視冰面貼圖(**只有冰,不含雪圈**)。牆比蛋矮(約 0.6R),物理反彈邊界 = 牆內壁 |
| — | 托盤素材 | 已選 `floor/s2`、`band/s2`(`tools/mascot-gen/out/gashapon3d/`) |
| Q6 | 版面 | 拿掉標題;左上首頁、右上 🔊⚙️(`shared/img/icons.svg`,位置與 class 照抄 2D);底部 `[搖動] [抽獎] (剩 X 顆)`;`removeOnDraw = false` 不顯示膠囊;拿掉「共 N 顆(抽到的不會拿走)」;按鈕**保留「抽獎」** |
| Q7 | 揭曉卡片 | `shared/css/prize-frame.css`(`data-rarity`、代號標籤 N/R/SR/SSR/UR、`fitText` 縮字、`is-frame-loading` 保底)、置中 + 暗幕。**不放「再抽一次」**,保留「點一下繼續」。**這次不做跳過** |
| — | 暗幕時機 | **暗幕延到 show 才淡入**、墊在卡片下 |
| Q11 | 空機 | 拿掉 🫙;空托盤上「扭蛋機空了!」+「再裝滿一次」 |
| Q10 | 首頁卡片 | 已選 `tools/mascot-gen/out/gashapon3d/home-card-round/s2.png` |
| Q12 | 順序 | ① 頁面 UI → ② 升級演出 → ③ 冰雪托盤 → ④ 首頁卡片 |

## 模型(grill 確認過;實作跟它矛盾 = plan bug,停下來回報,**不可就地改模型**)

- **實體**:`pool` 的 `Capsule { prizeId, drawn, color }` **不變**(`color` 仍是 12 色隨機、與稀有度無關)。新增的都是畫面層:演出中蛋的**外觀狀態**(`plain` → `R` → `SR` …)、托盤貼圖、`shared/js/reveal-fx.js` 特效模組
- **Cardinality**:桌上一顆蛋 ↔ `pool` 一顆 Capsule(1:1,pool 擁有);一次演出一顆蛋,外觀狀態屬於演出、演完丟棄;托盤貼圖整桌一份,跟著顆數 scale
- **Seen vs stored**:升級花紋、光暈都**不存**,每次從 `prize.rarity` 經 `buildRevealSteps` 現推;存的只有 `drawn: true`
- **三個最可能的錯誤(錯誤版本)**:
  1. 「桌上的蛋依稀有度上花紋 / 顏色」—— 錯,桌上一律純隨機色
  2. 「升級從 N 外觀開始逐階換」—— 錯,起點是隨機純色,第一次升級直接換 R;N 殼不換
  3. 「卡片放『再抽一次』或自動挑下一顆」—— 錯,只有「點一下繼續」,回桌面自己挑

## Review Focus

1. **點掉獎項卡不能順手開下一顆蛋**(既有 capture 監聽 + `stopPropagation`,且結果已寫進 localStorage 不可逆)—— 新的全螢幕揭曉層不能讓這條失效 → Task 2 Step 6 手動回歸
2. **演出中途出錯(花紋圖 404、CanvasTexture 失敗)不能卡死**:`playing` 要回到 false、按鈕可按;花紋沒載到時殼退回只用底色 → Task 5 測 `loadSkins` 失敗路徑、Task 7 Step 5 擋掉花紋網址實測
3. **抽到最後一顆剛好是 SSR/UR**:卡片先顯示、吉祥物歡呼,關卡片後才切空機;「再裝滿一次」第一下就生效(ddd39ac 修過)→ Task 2 Step 6
4. **`removeOnDraw = false`**:膠囊隱藏、池子不消耗;**沒有獎項**:顯示「還沒有獎項」、抽獎鈕 disabled → Task 2 的 `remainLabel` 單元測試
5. **窄螢幕(390)與演出中改視窗大小**:冰牆不被切、粒子仍對準蛋(每次觸發重取 `screenPos`)→ Task 7 Step 6、Task 9 Step 6

---

## 檔案結構

| 檔案 | 動作 | 職責 |
|---|---|---|
| `shared/css/tokens.css` | 改 | 收下 2D 的稀有度色覆寫、`.home-link--corner`、`.corner-tools`、`.remain-tag` |
| `shared/css/prize-frame.css` | 改 | 收下 `.prize-card__badge` 的稀有度樣式與 `@keyframes shimmer` |
| `shared/css/reveal-fx.css` | 新 | `.fx`、`.aura[data-rarity]`、`.particles`、`.particle*` |
| `shared/js/reveal-fx.js` | 新 | `createRevealFx`、`particleCount` |
| `gashapon/css/style.css`、`animations.css` | 改 | 刪掉搬走的段落;`::before` 去掉 multiply |
| `gashapon/index.html` | 改 | 連 `shared/css/reveal-fx.css` |
| `gashapon/js/particles.js` | 改 | re-export |
| `gashapon/js/reveal.js` | 改 | 用 `createRevealFx` |
| `gashapon/img/pattern-*.webp` | 重產 | 白色 RGBA 花紋 |
| `gashapon3d/index.html`、`css/gashapon3d.css` | 改 | 新版面 |
| `gashapon3d/js/model.js` | 改 | `remainLabel` |
| `gashapon3d/js/skin-math.js` | 新 | 純函式:`skinSequence`、色彩矩陣、`parseGradient`、`planarUV` |
| `gashapon3d/js/skin.js` | 新 | 載入 / 合成貼圖、`applySkin`、`tickSkins` |
| `gashapon3d/js/tray-art.js` | 新 | 托盤貼圖網址(帶雜湊) |
| `gashapon3d/js/scene.js` | 改 | UV、轉正、`screenPos`、托盤 |
| `gashapon3d/js/main.js` | 改 | 演出與版面接線 |
| `gashapon3d/img/floor.webp`、`wall.webp` | 新 | 托盤素材 |
| `tools/mascot-gen/gashapon_art.py` | 改 | `to_white_pattern`、`crop_square_center`、`ink_rows`、`make_seamless` |
| `tools/mascot-gen/gashapon.py` | 改 | `build-patterns` 輸出白花紋;預載清單納入 3D 托盤 |
| `tools/mascot-gen/gashapon3d.py` | 新 | `build-tray` |
| `tools/mascot-gen/home_prompts.json`、`index.html`、`css/home.css` | 改 | 首頁卡片 |
| `test/*.test.js`、`tools/mascot-gen/test_gashapon_art.py` | 改 / 新 | 見各 task |

---

## 切片 ① 頁面 UI

### Task 1: 共用樣式搬家(2D 畫面不變)

**Files:**
- Modify: `shared/css/tokens.css`、`shared/css/prize-frame.css`、`gashapon/css/style.css`(開頭 `:root{…}`、`.home-link--corner`、`.corner-tools` 三段、`.remain-tag` 兩段、`.prize-card__badge` 與其 `[data-rarity]` 五行)、`gashapon/css/animations.css`(`@keyframes shimmer`)
- Test: `test/shared-css.test.js`(新)

**Interfaces:**
- Produces: `tokens.css` 定義 `--gold`、`--rainbow`、`--rainbow-conic`、`--r-SSR-a/b`(2D 調過的值)與 `.home-link--corner`、`.corner-tools`、`.remain-tag`;`prize-frame.css` 定義 `.prize-card__badge[data-rarity]` 與 `@keyframes shimmer`

- [ ] **Step 1: 寫會失敗的測試**

```js
// test/shared-css.test.js
// 2D 跟 3D 共用的樣式只能住在 shared/ —— 留在 gashapon/css 的話,立體扭蛋機讀到的會是舊值
// (2026-10-01 發現:tokens.css 的 --rainbow 是調整前的鮮豔版、也沒有 --gold)。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = p => readFileSync(join(root, p), 'utf8');

test('稀有度色只定義在 tokens.css,而且是 2D 調過的值', () => {
  const tokens = read('shared/css/tokens.css');
  const style = read('gashapon/css/style.css');
  for (const v of ['--gold:', '--rainbow:', '--rainbow-conic:', '--r-SSR-a:', '--r-SSR-b:']) {
    assert.ok(tokens.includes(v), `tokens.css 少了 ${v}`);
    assert.ok(!style.includes(v), `gashapon/css/style.css 不該再定義 ${v}`);
  }
  assert.match(tokens, /--r-SSR-a:\s*#FFD54A/);
  assert.match(tokens, /#FFA3B1 0%/);
});

test('角落圖示、剩餘膠囊、稀有度標籤、shimmer 都在 shared/', () => {
  const tokens = read('shared/css/tokens.css');
  const frame = read('shared/css/prize-frame.css');
  const style = read('gashapon/css/style.css');
  for (const sel of ['.home-link--corner', '.corner-tools', '.remain-tag']) {
    assert.ok(tokens.includes(sel), `tokens.css 少了 ${sel}`);
    assert.ok(!style.includes(`${sel} {`), `style.css 還留著 ${sel}`);
  }
  assert.ok(frame.includes('.prize-card__badge[data-rarity="UR"]'));
  assert.ok(frame.includes('@keyframes shimmer'));
  assert.ok(!read('gashapon/css/animations.css').includes('@keyframes shimmer'));
  assert.ok(frame.includes('.preload-rack'));
  assert.ok(!style.includes('.preload-rack {'));
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `node --test test/shared-css.test.js`
Expected: FAIL(`tokens.css 少了 --gold:`)

- [ ] **Step 3: 搬移**

1. `gashapon/css/style.css` 第 1–11 行整段 `:root { --r-SSR-a … --rainbow-conic … }`(含上面那兩行註解,改寫成「2D 與 3D 共用,2026-10-01 從扭蛋機頁搬來」)剪下,**取代** `tokens.css` 裡原本的 `--r-SSR-a/b`、`--rainbow`、`--rainbow-conic` 定義(放在 `:root` 內同一位置;`--gold` 是新增)
2. `style.css` 的 `.home-link--corner { … }`、`.corner-tools { … }`、`.corner-tools .icon-btn { … }`、`.corner-tools .icon { … }`(含註解)剪下,貼到 `tokens.css` 的 `.home-link` 規則之後
3. `style.css` 兩段 `.remain-tag { … }`:第一段(一般寬度)搬到 `tokens.css`;`@media (max-height: 560px)` 裡那段跟一般寬度完全一樣,直接刪掉;同一個 media 區塊裡被誤貼的 `.draw-group { … }` 也刪(上層已有同樣規則)
4. `style.css` 的 `.prize-card__badge { … }` 與五行 `.prize-card__badge[data-rarity=…]` 搬到 `prize-frame.css` 末尾
5. `animations.css` 的 `@keyframes shimmer { … }` 搬到 `prize-frame.css` 末尾(`style.css` 的 UR 殼也用它,2D 兩支 CSS 都有載入,不受影響)
6. `style.css` 末尾的 `.preload-rack { … }`(含註解)搬到 `prize-frame.css` 末尾 —— 立體扭蛋機也要用它暖外框圖

- [ ] **Step 4: 跑全部測試**

Run: `node --test`
Expected: 全部 PASS(含 `preload-manifest.test.js`:它掃 `style.css` 與 `prize-frame.css` 的 `url()`,這次沒有搬任何 `url()`)

- [ ] **Step 5: 2D 實機目視**

開 `http://localhost:8000/gashapon/`(390 與 1440):角落圖示位置、剩餘膠囊、抽到 SSR 與 UR 的標籤與殼色跟搬家前一樣。截圖給使用者。

- [ ] **Step 6: Commit**

```bash
git add shared/css gashapon/css test/shared-css.test.js
git commit -m "refactor(shared): move rarity colours, corner tools, remain tag and badge styles to shared css"
```

---

### Task 2: 3D 頁面版面、揭曉卡片、空機畫面

**Files:**
- Modify: `gashapon3d/index.html`、`gashapon3d/css/gashapon3d.css`、`gashapon3d/js/main.js`、`gashapon3d/js/model.js`
- Test: `test/gashapon3d.test.js`

**Interfaces:**
- Consumes: Task 1 的共用 class;`cssUrl`、`waitForImage`(`gashapon/js/image-ready.js`);`fitText(el, box, { max, min })`(`gashapon/js/fit-text.js`)
- Produces: `remainLabel(setup) → { text: string, hidden: boolean }`(model.js);DOM id:`remainTag`、`dim`、`fx`、`aura`、`particles`、`prizeCard`、`prizeBadge`、`prizeName`、`soundIcon`(`<use>`)

- [ ] **Step 1: 寫會失敗的測試**(加在 `test/gashapon3d.test.js` 末尾)

```js
import { remainLabel } from '../gashapon3d/js/model.js';

test('remainLabel:顯示「剩 X 顆」', () => {
  const setup = createSetup3d({ prizes: [createPrize({ name: '甲', count: 3 })], rng: seeded(2) });
  setup.pool[0] = { ...setup.pool[0], drawn: true };
  assert.deepEqual(remainLabel(setup), { text: '剩 2 顆', hidden: false });
});

test('remainLabel:抽到不拿走 → 不顯示(數字永遠不變,顯示了反而誤導)', () => {
  const setup = createSetup3d({ prizes: [createPrize({ name: '甲', count: 3 })], removeOnDraw: false, rng: seeded(3) });
  assert.equal(remainLabel(setup).hidden, true);
});

test('remainLabel:沒有獎項 → 提示去設定,而且要看得到', () => {
  assert.deepEqual(remainLabel(createSetup3d({ prizes: [] })), { text: '還沒有獎項', hidden: false });
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `node --test test/gashapon3d.test.js`
Expected: FAIL(`remainLabel` is not exported)

- [ ] **Step 3: 實作 `remainLabel`**(model.js,放在 `remaining3d` 後面)

```js
// 工具列上的「剩 X 顆」膠囊。文字規則跟扭蛋機頁(gashapon/js/ui-machine.js)一致。
export function remainLabel(setup) {
  if (setup.pool.length === 0) return { text: '還沒有獎項', hidden: false };
  // 抽到不拿走的話,「剩幾顆」永遠不變,顯示了反而誤導
  return { text: `剩 ${remaining3d(setup)} 顆`, hidden: !setup.removeOnDraw };
}
```

Run: `node --test test/gashapon3d.test.js` → PASS

- [ ] **Step 4: HTML**

`gashapon3d/index.html`:
- `<head>` 加 `<link rel="stylesheet" href="../shared/css/prize-frame.css">`、`<link rel="stylesheet" href="../shared/css/reveal-fx.css">`(Task 4 才建立這支;本 task 先建一個只有註解的空檔 `shared/css/reveal-fx.css`,Task 4 再填)
- 刪掉整個 `<header class="topbar">…</header>`
- `<body>` 一開頭照抄 2D(`gashapon/index.html` 第 17–21 行)的 `home-link--corner` 與 `.corner-tools`(`soundBtn`、`settingsBtn`,`<use id="soundIcon" href="../shared/img/icons.svg#sound-on"/>`)
- 照抄 2D 第 23–31 行的 `<svg width="0" height="0">…<symbol id="snowflake">…</svg>`
- `<main class="stage">` 內:保留 `canvas`、`loading`、`pickHint`;空機改成

```html
  <div class="empty-state" id="emptyState" hidden>
    <p class="empty-state__text">扭蛋機空了!</p>
    <button class="btn btn--primary" id="refillBtn" type="button">再裝滿一次</button>
  </div>
```

- 舊的 `#prizeCard` 換成一個全螢幕揭曉層,放在 `</main>` 之後:

```html
<div class="reveal-layer">
  <div class="reveal-layer__dim" id="dim"></div>
  <div class="fx" id="fx" aria-hidden="true">
    <div class="aura" id="aura" hidden></div>
    <div class="particles" id="particles"></div>
  </div>
  <div class="prize-card prize-frame" id="prizeCard" data-rarity="N" hidden>
    <span class="prize-card__badge" id="prizeBadge"></span>
    <div class="prize-card__name-box"><p class="prize-card__name" id="prizeName"></p></div>
    <p class="skip-hint">點一下繼續</p>
  </div>
</div>
```

- `<footer class="toolbar">` 改成:

```html
<footer class="toolbar">
  <button class="btn btn--ghost" id="shakeBtn" type="button">搖動</button>
  <button class="btn btn--primary btn--go" id="turnBtn" type="button">抽獎</button>
  <p class="remain-tag" id="remainTag"></p>
</footer>
```

- [ ] **Step 5: CSS 與 main.js**

`gashapon3d/css/gashapon3d.css`:刪掉 `.topbar`、`.setup-name`、`.remaining`、整段舊 `.prize-card*`、`.prize-card--ur`、`.empty-state__icon`;`body` 改成 `display: grid; grid-template-rows: 1fr auto; min-height: 100dvh; overflow: hidden;`;新增:

```css
/* 揭曉層蓋滿整個畫面,但平常完全不擋點擊 —— 桌上的蛋要能直接點 */
.reveal-layer { position: fixed; inset: 0; display: grid; place-items: center; z-index: 20; pointer-events: none; }
/* 3D 的蛋畫在 canvas 裡,DOM 暗幕一蓋連蛋也變暗,所以暗幕等到 show 才淡入、墊在卡片下 */
.reveal-layer__dim { position: absolute; inset: 0; background: rgba(58, 46, 41, .55); backdrop-filter: blur(3px); opacity: 0; transition: opacity .3s; }
.reveal-layer__dim.is-on { opacity: 1; }
.reveal-layer .prize-card { position: relative; }
.prize-frame .skip-hint { position: absolute; top: calc(100% + 14px); left: 50%; translate: -50% 0; margin: 0; white-space: nowrap; padding: 7px 16px; border-radius: 999px; background: rgba(58, 46, 41, .5); color: #fff; font-size: 14px; }
.empty-state { pointer-events: none; }
.empty-state .btn { pointer-events: auto; }
.empty-state__text { margin: 0; font-size: 24px; font-weight: 800; }
```

`.pick-hint` 的 `top` 改成 `max(64px, calc(env(safe-area-inset-top) + 56px))`,避開角落圖示。

`gashapon3d/js/main.js`:
- import 加 `remainLabel`(model.js)、`cssUrl, waitForImage`(`../../gashapon/js/image-ready.js`)、`fitText`(`../../gashapon/js/fit-text.js`)
- `render()`:刪掉 `setupName`、`remaining` 兩行,改成

```js
  const tag = remainLabel(setup);
  $('remainTag').textContent = tag.text;
  $('remainTag').hidden = tag.hidden;
```

  `$('turnBtn').disabled = empty || playing || setup.pool.length === 0;`;音效圖示改成
  `$('soundIcon').setAttribute('href', `../shared/img/icons.svg#${prefs.soundOn ? 'sound-on' : 'sound-off'}`);`
- 刪掉 `auraColor()` 與 `scene.setAura?.(...)` 呼叫(從沒實作;光暈改由 Task 7 的 `reveal-fx` 做)
- `play()` 的 `show` 分支整段換成:

```js
      } else if (step.type === 'show') {
        const card = $('prizeCard');
        card.dataset.rarity = step.rarity;
        $('prizeBadge').dataset.rarity = step.rarity;
        // 標籤顯示稀有度代號(N / R / SR / SSR / UR),跟扭蛋機頁一致
        $('prizeBadge').textContent = step.rarity;
        $('prizeName').textContent = step.prize?.name ?? '';
        // 等外框圖解碼完才出現(最多 2 秒);等不到先用奶油色保底卡,圖到了再換上
        const frameUrl = cssUrl(getComputedStyle(card).backgroundImage);
        const ready = await waitForImage(frameUrl);
        card.classList.toggle('is-frame-loading', !ready);
        if (!ready) {
          waitForImage(frameUrl, { timeout: 60000 }).then(ok => {
            if (ok && card.dataset.rarity === step.rarity) card.classList.remove('is-frame-loading');
          });
        }
        $('dim').classList.add('is-on');
        card.hidden = false;
        fitText($('prizeName'), $('prizeName').parentElement, { max: 44, min: 18 });
        if (BIG.has(step.rarity)) mascots.setPose('cheer');
        await tween(320, () => {});
      }
```

- `dismissPrize()` 在 `$('prizeCard').hidden = true;` 後加 `$('dim').classList.remove('is-on');`
- 進頁面就暖好 5 張外框圖(預先載入 ②)。不自己組網址 —— 放一排看不到的 `.prize-frame[data-rarity]`,讓瀏覽器照 CSS 的網址(含 `?v=`)下載,跟正式卡片同一份快取:

```js
// 揭曉卡片的外框先下載好,第一次揭曉時才不會畫出半張框(同扭蛋機頁的 mountPreloadRack)
function warmFrames() {
  const rack = document.createElement('div');
  rack.className = 'preload-rack';
  rack.setAttribute('aria-hidden', 'true');
  for (const r of RARITIES) {
    const f = document.createElement('div');
    f.className = 'prize-card prize-frame';
    f.dataset.rarity = r;
    rack.appendChild(f);
  }
  document.body.appendChild(rack);
}
warmFrames();
```
- `document` 的 capture 監聽保留原樣(`closest('.toolbar, dialog')` 那行改成 `closest('.toolbar, .corner-tools, .home-link, dialog')`,角落圖示也不算「點外面」)

- [ ] **Step 6: 實機驗收**(`http://localhost:8000/gashapon3d/`,390 與 1440)

1. 角落圖示、膠囊位置與 2D 相同;設定裡關掉「抽到的就拿走」→ 膠囊消失
2. DevTools → Network,重新整理:頁面一載入就抓了 5 張 `frame-*.webp`(帶 `?v=`),第一次揭曉時 Network 沒有再抓外框
3. 設定把獎項改成 5 種稀有度各 1 顆,逐顆點開:卡片外框、代號標籤、長名字縮字都對;卡片出現時才變暗
4. 卡片開著時點 canvas 上別的蛋 → 只關卡片,**沒有**開下一顆(設定「剩下什麼」的數字只少 1)
5. 最後一顆抽到 SSR:卡片 + 歡呼 → 關卡片才出現「扭蛋機空了!」→「再裝滿一次」點一下就裝滿
6. 截圖給使用者

- [ ] **Step 7: Commit**

```bash
git add gashapon3d shared/css/reveal-fx.css test/gashapon3d.test.js
git commit -m "feat(gashapon3d): corner tools, remain tag, framed prize card and empty state like the gashapon page"
```

---

## 切片 ② 升級演出

### Task 3: 白色花紋(2D 一起換)

**Files:**
- Modify: `tools/mascot-gen/gashapon_art.py`、`tools/mascot-gen/gashapon.py`(`cmd_build_patterns`)、`gashapon/css/style.css`(`.capsule__half::before`)
- Regenerate: `gashapon/img/pattern-*.webp`、`gashapon/img/preload.json`
- Test: `tools/mascot-gen/test_gashapon_art.py`

**Interfaces:**
- Produces: `to_white_pattern(gray: np.ndarray[H,W] uint8, fill=(255,255,255), edge=None, edge_px=0) -> np.ndarray[H,W,4] uint8`;`pattern-*.webp` 變成 RGBA(透明 = 原本白底)

- [ ] **Step 1: 寫會失敗的測試**(`test_gashapon_art.py` 末尾)

```python
from gashapon_art import to_white_pattern


class WhitePattern(unittest.TestCase):
    def test_alpha_is_inverted_gray(self):
        gray = np.array([[255, 0], [128, 255]], np.uint8)
        out = to_white_pattern(gray)
        self.assertEqual(out.shape, (2, 2, 4))
        self.assertEqual(out[0, 0, 3], 0)        # 原本白底 → 透明
        self.assertEqual(out[0, 1, 3], 255)      # 原本黑線 → 不透明
        self.assertEqual(tuple(out[0, 1, :3]), (255, 255, 255))

    def test_fill_with_edge(self):
        gray = np.full((9, 9), 255, np.uint8)
        gray[4, 4] = 0
        out = to_white_pattern(gray, fill=(0x7F, 0xD3, 0xFF), edge=(255, 255, 255), edge_px=1)
        self.assertEqual(tuple(out[4, 4, :3]), (0x7F, 0xD3, 0xFF))   # 花紋本體是水晶藍
        self.assertEqual(tuple(out[4, 5, :3]), (255, 255, 255))      # 外圍一圈白邊
        self.assertEqual(out[4, 5, 3], 255)
        self.assertEqual(out[0, 0, 3], 0)                             # 遠處仍透明
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `tools/mascot-gen/.venv/bin/python -m unittest discover tools/mascot-gen`
Expected: FAIL(`cannot import name 'to_white_pattern'`)

- [ ] **Step 3: 實作**(`gashapon_art.py`,`to_tint_gray` 後面)

```python
def to_white_pattern(gray, fill=(255, 255, 255), edge=None, edge_px=0):
    """花紋改成「有顏色的線 + 透明底」(2026-10-01 使用者決定:深色雪花改白色;UR 用水晶藍加白邊)。
    透明度 = 灰階反轉:原本白底的地方全透明,黑線的地方不透明。edge 給的話,在花紋外圍再長一圈
    edge_px 寬的邊(用最大值濾波擴張透明度),花紋本體蓋在邊上面。"""
    a = 255 - gray.astype(np.int32)
    h, w = gray.shape
    rgb = np.empty((h, w, 3), np.float32)
    rgb[:] = fill
    alpha = a.astype(np.float32)
    if edge is not None and edge_px > 0:
        grown = a.copy()
        for dy in range(-edge_px, edge_px + 1):
            for dx in range(-edge_px, edge_px + 1):
                shifted = np.roll(np.roll(a, dy, axis=0), dx, axis=1)
                grown = np.maximum(grown, shifted)
        k = (a / 255.0)[..., None]
        rgb = rgb * k + np.array(edge, np.float32) * (1 - k)
        alpha = grown.astype(np.float32)
    return np.dstack([np.clip(rgb, 0, 255).astype(np.uint8), np.clip(alpha, 0, 255).astype(np.uint8)])
```

Run: unittest → PASS

- [ ] **Step 4: `build-patterns` 改成輸出白花紋**(`gashapon.py` 的 `cmd_build_patterns` 迴圈內)

```python
        gray = to_tint_gray(rgba)[..., 0]
        gray = np.asarray(Image.fromarray(gray).resize((256, 256), Image.LANCZOS))
        if r == 'UR':
            # UR:淺水晶藍雪花 + 白邊(白邊約圖寬 1.7%,256px 上是 4px)
            out = to_white_pattern(gray, fill=(0x7F, 0xD3, 0xFF), edge=(255, 255, 255), edge_px=4)
        else:
            out = to_white_pattern(gray)
        path = IMG / f'pattern-{r}.webp'
        webp(Image.fromarray(out, 'RGBA'), path)
```

(取代原本 `im = Image.fromarray(to_tint_gray(rgba)[..., :3]).resize(...)` 與 `webp(im, path)` 兩行;import 加 `to_white_pattern`。)

Run: `cd /Users/willian/github/gashapon && tools/mascot-gen/.venv/bin/python tools/mascot-gen/gashapon.py build-patterns`
Expected: `patterns done`、`preload.json: 12 張`;`git diff gashapon/css/style.css` 只有五個 `?v=` 變了

- [ ] **Step 5: 2D CSS**

`gashapon/css/style.css` 的 `.capsule__half::before` 刪掉 `mix-blend-mode: multiply;`,上面註解改成:「花紋貼圖(2026-10-01 改白):圖本身是白色(UR 水晶藍 + 白邊)加透明度,直接疊在稀有度色上。上下兩半共用同一張圖…(其餘照舊)」。

- [ ] **Step 6: 驗證**

Run: `node --test` → PASS(preload 清單跟新雜湊一致)
2D 實機抽 R / SR / SSR / UR 各一次,截圖給使用者對照模擬圖(`ball-dark-vs-white.png` 下排、`all-crystal.png` 右下)。

- [ ] **Step 7: Commit**

```bash
git add tools/mascot-gen gashapon/img gashapon/css
git commit -m "feat(gashapon): white capsule patterns, UR in crystal blue with a white edge"
```

---

### Task 4: 粒子與光暈抽到 `shared/`

**Files:**
- Create: `shared/js/reveal-fx.js`;Fill: `shared/css/reveal-fx.css`
- Modify: `gashapon/js/reveal.js`、`gashapon/js/particles.js`、`gashapon/css/style.css`(`.aura*`、`.particles`、`.particle*`)、`gashapon/index.html`
- Test: `test/gashapon-ui.test.js`(既有 `particleCount` 測試照過)、`test/reveal-fx.test.js`(新)

**Interfaces:**
- Produces:
  - `particleCount(kind: 'upgrade'|'burst', level: number) → number`
  - `createRevealFx({ aura: HTMLElement, particles: HTMLElement, animate?: (el, keyframes, ms) => Promise<void>, isSkipping?: () => boolean }) → { flashAura(rarity: string, scale: number): Promise<void>, spawnParticles(rarity: string, amount: number, opts?: { near?: boolean }): void }`
  - 沒給 `animate` 時用內建的:`el.animate(...)`,`finished` 或 `ms + 1500` 逾時先到先算

- [ ] **Step 1: 寫會失敗的測試**

```js
// test/reveal-fx.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { particleCount, createRevealFx } from '../shared/js/reveal-fx.js';
import { particleCount as fromGashapon } from '../gashapon/js/particles.js';

test('particleCount 搬到 shared 之後,扭蛋機頁拿到的是同一支', () => {
  assert.equal(fromGashapon, particleCount);
});

test('跳過中不噴雪花', () => {
  const particles = { appendChild() { throw new Error('不該噴'); } };
  const fx = createRevealFx({ aura: {}, particles, isSkipping: () => true });
  fx.spawnParticles('R', 6);
});
```

Run: `node --test test/reveal-fx.test.js` → FAIL(找不到模組)

- [ ] **Step 2: 建 `shared/js/reveal-fx.js`**

把 `gashapon/js/particles.js` 的 `particleCount`(含註解)與 `gashapon/js/reveal.js` 的 `SVG_NS`、`flashAura`、`spawnParticles`(含註解,**內容一字不改**)搬進來,包成:

```js
// 揭曉演出的雪花粒子與光暈(2026-10-01 從扭蛋機頁抽出來,立體扭蛋機也用)。
// 只負責「在給定的容器裡噴、閃」;容器擺在哪裡由呼叫端決定 ——
// 2D 是畫面正中央的蛋,3D 是蛋投影到螢幕上的位置。
import { RARITY_META } from '../../gashapon/js/constants.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

export function particleCount(kind, level) { /* 原樣 */ }

function defaultAnimate(el, keyframes, ms) {
  const anim = el.animate(keyframes, { easing: 'ease-out', fill: 'forwards', duration: ms });
  return new Promise(resolve => {
    const timer = setTimeout(resolve, ms + 1500);   // 分頁在背景時 finished 永遠不會 settle
    anim.finished.then(() => { clearTimeout(timer); resolve(); }, () => { clearTimeout(timer); resolve(); });
  });
}

export function createRevealFx({ aura, particles, animate = defaultAnimate, isSkipping = () => false }) {
  async function flashAura(rarity, scale) { /* 原樣,els.aura → aura */ }
  function spawnParticles(rarity, amount, { near = false } = {}) { /* 原樣,els.particles → particles */ }
  return { flashAura, spawnParticles };
}
```

`gashapon/js/particles.js` 整支換成:

```js
// 搬到 shared/js/reveal-fx.js 了(2026-10-01,立體扭蛋機也用);留這支讓既有的 import 不用改。
export { particleCount } from '../../shared/js/reveal-fx.js';
```

`gashapon/js/reveal.js`:刪掉 `SVG_NS`、`flashAura`、`spawnParticles` 的定義與 `particleCount` 的 import;`createRevealer` 內 `animate` 定義之後加

```js
  const { flashAura, spawnParticles } = createRevealFx({
    aura: els.aura, particles: els.particles, animate, isSkipping,
  });
```

import 加 `import { createRevealFx, particleCount } from '../../shared/js/reveal-fx.js';`。

- [ ] **Step 3: CSS 搬家**

`gashapon/css/style.css` 的 `.aura { … }`、五行 `.aura[data-rarity]`、`.particles { … }`、`.particle { … }`、`.particle--rainbow`、`.particle--snow { … }`(含註解)剪下貼到 `shared/css/reveal-fx.css`,檔頭加註解;再加 3D 用的定位層:

```css
/* 3D 用:特效層釘在蛋投影到螢幕上的那一點(--fx-x / --fx-y 由 main.js 設) */
.fx {
  position: fixed;
  left: var(--fx-x, 50%);
  top: var(--fx-y, 50%);
  width: 0;
  height: 0;
  display: grid;
  place-items: center;
  pointer-events: none;
}
```

`gashapon/index.html` 在 `style.css` 之前加 `<link rel="stylesheet" href="../shared/css/reveal-fx.css">`。

- [ ] **Step 4: 驗證**

Run: `node --test` → 全部 PASS
2D 實機:抽到 UR 一次,升階雪花、爆開雪花、光暈都跟以前一樣;按「點一下跳過」仍會快轉。截圖給使用者。

- [ ] **Step 5: Commit**

```bash
git add shared gashapon test/reveal-fx.test.js
git commit -m "refactor(shared): snow particles and aura move to shared/js/reveal-fx.js"
```

---

### Task 5: 殼的外觀(skin-math + skin)

**Files:**
- Create: `gashapon3d/js/skin-math.js`、`gashapon3d/js/skin.js`
- Test: `test/gashapon3d-skin.test.js`(新)

**Interfaces:**
- Produces(`skin-math.js`,不 import three):
  - `skinSequence(steps) → string[]`:每一步結束後的外觀,起點 `'plain'`,`upgrade` 換成 `step.to`
  - `hueRotateMatrix(deg) → number[9]`、`saturateMatrix(s) → number[9]`、`mulMatrix(a, b) → number[9]`、`applyColorMatrix(rgba: Uint8ClampedArray, m) → void`(就地改,alpha 不動)
  - `parseGradient(css: string) → { angle: number, stops: { color: string, pos: number }[] }`(`pos` 0–1)
  - `gradientLine(angleDeg, size) → [x0, y0, x1, y1]`(CSS linear-gradient 的漸層線,正方形 size×size)
  - `planarUV(positions: Float32Array|number[], radius) → Float32Array`(每個頂點 `u = x/(2R)+.5`、`v = y/(2R)+.5`)
  - `UR_FRAMES = 24`、`SHIMMER_MS = 3200`
- Produces(`skin.js`):
  - `loadSkins(root = document.documentElement) → Promise<boolean>`:讀 CSS 變數 + 5 張花紋,合成每個稀有度一張整顆球的貼圖(UR 24 張);花紋載入失敗回傳 `false`、仍建好只有底色的貼圖
  - `applySkin(egg, rarity)`:把 `egg.top` / `egg.bottom` 的 `userData.fill.material` 換成該稀有度的材質
  - `tickSkins(now: number)`:UR 材質依時間換格

- [ ] **Step 1: 寫會失敗的測試**

```js
// test/gashapon3d-skin.test.js
// 3D 殼的外觀:這裡釘死「升級從隨機純色開始、第一次直接換 R、N 從頭到尾不換」(模型的錯誤版本 2)。
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRevealSteps } from '../gashapon/js/gacha.js';
import {
  skinSequence, hueRotateMatrix, saturateMatrix, mulMatrix, applyColorMatrix,
  parseGradient, gradientLine, planarUV,
} from '../gashapon3d/js/skin-math.js';

const steps = r => buildRevealSteps(r, null, { turn: false });

test('skinSequence:N 從頭到尾都是隨機純色', () => {
  assert.ok(skinSequence(steps('N')).every(s => s === 'plain'));
});

test('skinSequence:SR = 純色 → R → SR,第一次升級直接換 R', () => {
  const seq = skinSequence(steps('SR'));
  const changes = seq.filter((s, i) => i === 0 || s !== seq[i - 1]);
  assert.deepEqual(changes, ['plain', 'R', 'SR']);
});

test('skinSequence:UR 最後停在 UR', () => {
  assert.equal(skinSequence(steps('UR')).at(-1), 'UR');
});

const near = (a, b) => a.every((v, i) => Math.abs(v - b[i]) < 1e-3);

test('hueRotateMatrix(0) 與 saturateMatrix(1) 是單位矩陣', () => {
  const I = [1, 0, 0, 0, 1, 0, 0, 0, 1];
  assert.ok(near(hueRotateMatrix(0), I));
  assert.ok(near(saturateMatrix(1), I));
  assert.ok(near(mulMatrix(I, hueRotateMatrix(90)), hueRotateMatrix(90)));
});

test('applyColorMatrix:白色轉色相還是白色、alpha 不動', () => {
  const px = new Uint8ClampedArray([255, 255, 255, 77]);
  applyColorMatrix(px, hueRotateMatrix(137));
  assert.deepEqual([...px], [255, 255, 255, 77]);
});

test('applyColorMatrix:紅色轉 180 度偏青', () => {
  const px = new Uint8ClampedArray([255, 0, 0, 255]);
  applyColorMatrix(px, hueRotateMatrix(180));
  assert.ok(px[0] < px[1] && px[0] < px[2], [...px].join(','));
});

test('parseGradient:讀得懂 tokens.css 的 --gold', () => {
  const g = parseGradient('linear-gradient(135deg, #FFE68C 0%, #F7BE1E 38%, #FFF0B3 52%, #E3A008 70%, #F7C948 100%)');
  assert.equal(g.angle, 135);
  assert.equal(g.stops.length, 5);
  assert.deepEqual(g.stops[1], { color: '#F7BE1E', pos: 0.38 });
});

test('parseGradient:多行、沒寫位置的色標平均分配', () => {
  const g = parseGradient(`linear-gradient(115deg,
    #FFA3B1, #FFF1A6, #A6DDFF)`);
  assert.deepEqual(g.stops.map(s => s.pos), [0, 0.5, 1]);
});

test('gradientLine:90deg 是由左到右、穿過中心', () => {
  assert.ok(near(gradientLine(90, 100), [0, 50, 100, 50]));
});

test('planarUV:頂端 v=1、左緣 u=0', () => {
  const uv = planarUV([0, 0.5, 0, -0.5, 0, 0], 0.5);
  assert.ok(near([...uv], [0.5, 1, 0, 0.5]));
});
```

Run: `node --test test/gashapon3d-skin.test.js` → FAIL

- [ ] **Step 2: 實作 `skin-math.js`**

```js
// 3D 殼外觀的純數學:不 import three,Node 測得到。

export const UR_FRAMES = 24;
export const SHIMMER_MS = 3200;   // 同 gashapon/css 的 shimmer 3.2s

// 每一步「結束後」蛋是什麼外觀。起點是那顆蛋自己的隨機純色(plain),
// 只有 upgrade 會換 —— N 沒有 upgrade,所以從頭到尾都是 plain。
export function skinSequence(steps) {
  let cur = 'plain';
  return steps.map(s => (s.type === 'upgrade' ? (cur = s.to) : cur));
}

// CSS Filter Effects 規格的 hue-rotate / saturate 矩陣(列優先 3×3)
export function hueRotateMatrix(deg) {
  const r = (deg * Math.PI) / 180;
  const a = Math.cos(r);
  const b = Math.sin(r);
  return [
    0.213 + 0.787 * a - 0.213 * b, 0.715 - 0.715 * a - 0.715 * b, 0.072 - 0.072 * a + 0.928 * b,
    0.213 - 0.213 * a + 0.143 * b, 0.715 + 0.285 * a + 0.140 * b, 0.072 - 0.072 * a - 0.283 * b,
    0.213 - 0.213 * a - 0.787 * b, 0.715 - 0.715 * a + 0.715 * b, 0.072 + 0.928 * a + 0.072 * b,
  ];
}

export function saturateMatrix(s) {
  return [
    0.213 + 0.787 * s, 0.715 - 0.715 * s, 0.072 - 0.072 * s,
    0.213 - 0.213 * s, 0.715 + 0.285 * s, 0.072 - 0.072 * s,
    0.213 - 0.213 * s, 0.715 - 0.715 * s, 0.072 + 0.928 * s,
  ];
}

export function mulMatrix(a, b) {
  const out = new Array(9);
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      out[i * 3 + j] = a[i * 3] * b[j] + a[i * 3 + 1] * b[3 + j] + a[i * 3 + 2] * b[6 + j];
    }
  }
  return out;
}

export function applyColorMatrix(px, m) {
  for (let i = 0; i < px.length; i += 4) {
    const r = px[i], g = px[i + 1], b = px[i + 2];
    px[i] = m[0] * r + m[1] * g + m[2] * b;
    px[i + 1] = m[3] * r + m[4] * g + m[5] * b;
    px[i + 2] = m[6] * r + m[7] * g + m[8] * b;
  }
}

// 只處理 tokens.css 裡用到的寫法:linear-gradient(<角度>deg, <#hex> [<百分比>], …)
export function parseGradient(css) {
  const body = css.replace(/\s+/g, ' ').match(/linear-gradient\((.*)\)/)[1];
  const parts = body.split(',').map(s => s.trim());
  const angle = parseFloat(parts.shift());
  const raw = parts.map(p => {
    const [color, pos] = p.split(' ');
    return { color, pos: pos === undefined ? null : parseFloat(pos) / 100 };
  });
  return {
    angle,
    stops: raw.map((s, i) => ({ color: s.color, pos: s.pos ?? (raw.length === 1 ? 0 : i / (raw.length - 1)) })),
  };
}

// CSS 的漸層線:0deg 朝上、90deg 朝右,長度 = |S sin a| + |S cos a|,穿過中心
export function gradientLine(deg, size) {
  const r = (deg * Math.PI) / 180;
  const half = (Math.abs(size * Math.sin(r)) + Math.abs(size * Math.cos(r))) / 2;
  const dx = Math.sin(r) * half;
  const dy = -Math.cos(r) * half;
  const c = size / 2;
  return [c - dx, c - dy, c + dx, c + dy];
}

// 正面投影:蛋轉正後 local +z 朝鏡頭,所以只看 x、y,就跟 2D 把圖平貼在圓上一樣
export function planarUV(positions, radius) {
  const n = positions.length / 3;
  const uv = new Float32Array(n * 2);
  for (let i = 0; i < n; i++) {
    uv[i * 2] = positions[i * 3] / (2 * radius) + 0.5;
    uv[i * 2 + 1] = positions[i * 3 + 1] / (2 * radius) + 0.5;
  }
  return uv;
}
```

Run: `node --test test/gashapon3d-skin.test.js` → PASS

- [ ] **Step 3: 實作 `skin.js`**

```js
// 3D 殼的外觀:每個稀有度合成一張「整顆球」的貼圖,上下兩半共用、靠 planar UV 各取一半
// (同 2D 的 ::before 200% 高)。底色從 tokens.css 讀,花紋是 gashapon/img 的白色 RGBA 圖。
import * as THREE from 'three';
import {
  UR_FRAMES, SHIMMER_MS, hueRotateMatrix, saturateMatrix, mulMatrix, applyColorMatrix,
  parseGradient, gradientLine,
} from './skin-math.js';

const SIZE = 256;
// ?v= 的 8 碼照抄 gashapon/css/style.css(Task 3 重產後的值);之後由 build-patterns 一起改寫
const PATTERN = {
  R: '../../gashapon/img/pattern-R.webp?v=<style.css 的 8 碼>',
  SR: '../../gashapon/img/pattern-SR.webp?v=<style.css 的 8 碼>',
  SSR: '../../gashapon/img/pattern-SSR.webp?v=<style.css 的 8 碼>',
  UR: '../../gashapon/img/pattern-UR.webp?v=<style.css 的 8 碼>',
};
```

(上面四個 `?v=` 必須跟 `style.css` 一字不差,快取才共用;Step 4 加一個測試釘死。不需要 N:N 不升級。)

```js
const materials = {};   // rarity → MeshBasicMaterial(UR 的 map 會輪播)
let urFrames = [];

function loadImage(url) {
  const img = new Image();
  img.src = new URL(url, import.meta.url).href;
  return img.decode().then(() => img);
}

function paintBase(ctx, css, a, b) {
  if (css) {
    const g = parseGradient(css);
    const grad = ctx.createLinearGradient(...gradientLine(g.angle, SIZE));
    for (const s of g.stops) grad.addColorStop(s.pos, s.color);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, SIZE, SIZE);
  } else {
    ctx.fillStyle = a;
    ctx.fillRect(0, 0, SIZE, SIZE / 2);
    ctx.fillStyle = b;
    ctx.fillRect(0, SIZE / 2, SIZE, SIZE / 2);
  }
}

function canvasFor(css, a, b, pattern) {
  const c = document.createElement('canvas');
  c.width = c.height = SIZE;
  const ctx = c.getContext('2d');
  paintBase(ctx, css, a, b);
  if (pattern) ctx.drawImage(pattern, 0, 0, SIZE, SIZE);
  return c;
}

function texture(canvas) {
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export async function loadSkins(root = document.documentElement) {
  const cs = getComputedStyle(root);
  const v = name => cs.getPropertyValue(name).trim();
  const entries = await Promise.all(Object.entries(PATTERN).map(([r, url]) =>
    loadImage(url).then(img => [r, img], () => [r, null])));
  const patterns = Object.fromEntries(entries);
  const base = {
    R: [null, v('--r-R-a'), v('--r-R-b')],
    SR: [null, v('--r-SR-a'), v('--r-SR-b')],
    SSR: [v('--gold'), null, null],
    UR: [v('--rainbow'), null, null],
  };
  for (const r of ['R', 'SR', 'SSR']) {
    materials[r] = new THREE.MeshBasicMaterial({ map: texture(canvasFor(...base[r], patterns[r])) });
  }
  // UR:2D 是整顆(含花紋)hue-rotate 0→360、saturate 1→1.15,3.2s 一圈。這裡預算 24 格輪播。
  const ur = canvasFor(...base.UR, patterns.UR);
  const src = ur.getContext('2d').getImageData(0, 0, SIZE, SIZE);
  urFrames = Array.from({ length: UR_FRAMES }, (_, i) => {
    const k = i / UR_FRAMES;
    const c = document.createElement('canvas');
    c.width = c.height = SIZE;
    const data = new ImageData(new Uint8ClampedArray(src.data), SIZE, SIZE);
    applyColorMatrix(data.data, mulMatrix(saturateMatrix(1 + 0.15 * k), hueRotateMatrix(360 * k)));
    c.getContext('2d').putImageData(data, 0, 0);
    return texture(c);
  });
  materials.UR = new THREE.MeshBasicMaterial({ map: urFrames[0] });
  return Object.values(patterns).every(Boolean);
}

export function applySkin(egg, rarity) {
  const m = materials[rarity];
  if (!m) return;   // 還沒載好:維持原本的純色,演出照走
  for (const half of [egg.top, egg.bottom]) half.userData.fill.material = m;
}

export function tickSkins(now) {
  if (!materials.UR || urFrames.length === 0) return;
  const i = Math.floor(((now % SHIMMER_MS) / SHIMMER_MS) * UR_FRAMES);
  if (materials.UR.map !== urFrames[i]) materials.UR.map = urFrames[i];
}
```

注意:`applySkin` **共用**同一個材質給所有蛋;蛋重建時(`dealTable`)`shell()` 會 new 自己的純色材質,不會被污染。`scene.clear()` 不可 dispose 這些共用材質。

- [ ] **Step 4: 釘死花紋網址跟 2D 一致**(`test/gashapon3d-skin.test.js` 末尾)

```js
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

test('3D 的花紋網址跟扭蛋機頁一字不差(含 ?v=),兩台共用快取', () => {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..');
  const skin = readFileSync(join(root, 'gashapon3d/js/skin.js'), 'utf8');
  const css = readFileSync(join(root, 'gashapon/css/style.css'), 'utf8');
  for (const r of ['R', 'SR', 'SSR', 'UR']) {
    const v = css.match(new RegExp(`pattern-${r}\\.webp\\?v=([0-9a-f]{8})`))[1];
    assert.ok(skin.includes(`pattern-${r}.webp?v=${v}`), `pattern-${r} 的雜湊對不上`);
  }
});
```

並在 `tools/mascot-gen/gashapon.py` 的 `cmd_build_patterns` 迴圈內 `restamp(css, …)` 下一行加
`restamp(ROOT / 'gashapon3d' / 'js' / 'skin.js', f'../../gashapon/img/pattern-{r}.webp', path)`,之後重產花紋兩邊會一起更新。

Run: `node --test` → PASS

- [ ] **Step 5: Commit**

```bash
git add gashapon3d/js/skin-math.js gashapon3d/js/skin.js test/gashapon3d-skin.test.js tools/mascot-gen/gashapon.py
git commit -m "feat(gashapon3d): rarity skins composed on canvas from the shared tokens and patterns"
```

---

### Task 6: 場景:正面 UV、轉正、螢幕座標

**Files:**
- Modify: `gashapon3d/js/scene.js`

**Interfaces:**
- Consumes: `planarUV(positions, radius)`(Task 5)
- Produces(`createScene` 回傳物件新增):
  - `upright(egg, k: number, from: THREE.Quaternion)`:把 `egg.group.quaternion` 設成 `from` 與「正面朝鏡頭」之間的 slerp(k=1 完全轉正);目標每次依鏡頭當下位置重算
  - `wobble(egg, angle: number, base: THREE.Quaternion)`:在 `base` 上繞 local z 轉 `angle`(畫面平面內的搖晃)
  - `screenPos(egg) → { x, y }`(client 座標)

- [ ] **Step 1: UV**

`scene.js` 在 `BOTTOM_GEO` 定義後加:

```js
import { planarUV } from './skin-math.js';

// 花紋用正面投影(2026-10-01):蛋轉正後 local +z 朝鏡頭,UV 只看 x、y,跟 2D 平貼一樣。
// 背面會是鏡像,但揭曉時背面永遠朝後,看不到。描邊幾何不貼圖,不用 UV。
for (const g of [TOP_GEO, BOTTOM_GEO]) {
  g.setAttribute('uv', new THREE.BufferAttribute(planarUV(g.attributes.position.array, R), 2));
}
```

- [ ] **Step 2: 轉正、搖晃、螢幕座標**(`createScene` 內、`return` 之前)

```js
  const AIM = new THREE.Object3D();
  const TARGET_Q = new THREE.Quaternion();
  const SPIN_Q = new THREE.Quaternion();
  const Z = new THREE.Vector3(0, 0, 1);
  const P = new THREE.Vector3();

  // 轉正:上半朝上、正面(local +z)朝鏡頭 —— Object3D.lookAt 讓 +z 指向目標、+y 保持朝上,
  // 所以接縫在畫面上是水平的。鏡頭在推近,目標每格依鏡頭當下位置重算。
  function upright(egg, k, from) {
    egg.group.getWorldPosition(AIM.position);
    AIM.lookAt(camera.position);
    TARGET_Q.copy(AIM.quaternion);
    egg.group.quaternion.slerpQuaternions(from, TARGET_Q, k);
  }

  // 轉正之後的搖晃要在「畫面平面」裡轉(繞 local z),直接改 rotation.z 會把轉正弄歪
  function wobble(egg, angle, base) {
    SPIN_Q.setFromAxisAngle(Z, angle);
    egg.group.quaternion.copy(base).multiply(SPIN_Q);
  }

  function screenPos(egg) {
    egg.group.getWorldPosition(P).project(camera);
    const rect = canvas.getBoundingClientRect();
    return { x: rect.left + ((P.x + 1) / 2) * rect.width, y: rect.top + ((1 - P.y) / 2) * rect.height };
  }
```

回傳物件加 `upright, wobble, screenPos`。

- [ ] **Step 3: 驗證**

Run: `node --test` → PASS(`modules.test.js` 解析得過)
實機:開 3D 頁不點蛋,桌面跟以前一樣(UV 不影響純色)。

- [ ] **Step 4: Commit**

```bash
git add gashapon3d/js/scene.js
git commit -m "feat(gashapon3d): planar capsule UVs, upright and wobble helpers, screen position"
```

---

### Task 7: 演出接線

**Files:**
- Modify: `gashapon3d/js/main.js`

**Interfaces:**
- Consumes: `loadSkins`、`applySkin`、`tickSkins`(Task 5);`scene.upright/wobble/screenPos`(Task 6);`createRevealFx`、`particleCount`(Task 4);DOM `#fx`、`#aura`、`#particles`(Task 2)

- [ ] **Step 1: 初始化**

```js
import { loadSkins, applySkin, tickSkins } from './skin.js';
import { createRevealFx, particleCount } from '../../shared/js/reveal-fx.js';

const fx = createRevealFx({ aura: $('aura'), particles: $('particles') });
// 花紋載不到也不擋抽獎:殼會停在原本的純色,演出照走(回傳 false 時記一筆)
loadSkins().then(ok => { if (!ok) console.warn('[gashapon3d] 花紋沒載到,升級只會閃光不換殼'); });

// 特效層釘在蛋投影到螢幕上的那一點。每次觸發都重取 —— 演出中可能被改過視窗大小。
function aimFx(egg) {
  const p = scene.screenPos(egg);
  $('fx').style.setProperty('--fx-x', `${p.x}px`);
  $('fx').style.setProperty('--fx-y', `${p.y}px`);
}
```

`loop()` 內 `scene.render()` 之前加 `tickSkins(now);`。

- [ ] **Step 2: `play()` 各步驟**(取代對應分支;`from` 之後加 `const q0 = egg.group.quaternion.clone(); let qUp = q0;`)

```js
      if (step.type === 'drop') {
        sfx.drop();
        // 飛到桌子中央、鏡頭推近,同時轉正(上半朝上、正面朝鏡頭),後面換上的花紋才是正的
        await tween(600, k => {
          egg.group.position.set(from.x * (1 - k), k * 0.9, from.z * (1 - k));
          egg.group.scale.setScalar(1 + k * 0.25);
          scene.focusView(k);
          scene.upright(egg, k, q0);
        });
        qUp = egg.group.quaternion.clone();
      } else if (step.type === 'shake') {
        sfx.shake?.(step.tension ?? 0);
        const swing = ((7 + (step.tension ?? 0) * 5) * Math.PI) / 180;   // 同 2D
        await tween(360, k => scene.wobble(egg, Math.sin(k * Math.PI * 4) * swing * (1 - k * 0.3), qUp));
        egg.group.quaternion.copy(qUp);
      } else if (step.type === 'upgrade') {
        const level = Math.max(0, RARITIES.indexOf(step.to) - 1);
        sfx.upgrade(level);
        applySkin(egg, step.to);
        aimFx(egg);
        fx.spawnParticles(step.to, particleCount('upgrade', level + 1), { near: true });
        const glow = fx.flashAura(step.to, 2.6 + level * 0.5);
        await tween(480, k => egg.group.scale.setScalar(1.25 + Math.sin(k * Math.PI) * 0.28));
        await glow;
      } else if (step.type === 'crack') {
        // (原樣)
      } else if (step.type === 'burst') {
        const level = RARITIES.indexOf(step.rarity);
        sfx.burst(Math.max(0, level - 1));
        aimFx(egg);
        fx.spawnParticles(step.rarity, particleCount('burst', level));
        const glow = fx.flashAura(step.rarity, 3.4 + level * 0.8);
        await tween(380, k => {
          egg.top.position.y = 0.85 + k * 1.4;
          egg.top.rotation.x = -0.5 - k * 1.6;
          egg.bottom.position.y = -0.25 - k * 0.5;
        });
        await glow;
      }
```

(`burst` 原本的 `egg.group.rotation.y += 0.04` 刪掉:會把背面的鏡像花紋轉到正面。)

- [ ] **Step 3: 跑測試**

Run: `node --test` → PASS

- [ ] **Step 4: 實機:5 種稀有度**

設定裡把獎項改成 N / R / SR / SSR / UR 各 1 顆、「抽到的就拿走」開著,逐顆點開(390 與 1440):
- 飛到中央時轉正,接縫水平
- N:不換殼,只搖一下就裂開
- R / SR:純色 → R(→ SR),白色雪花是正的,上下兩半花紋對得起來
- SSR:金漸層 + 白雪花;UR:彩虹 + 水晶藍白邊雪花,色相持續流動
- 粒子與光暈從蛋身上噴出(不是畫面正中央以外的地方)
錄成 GIF 或逐步截圖給使用者。

- [ ] **Step 4b: 預載檢查**

DevTools → Network,重新整理 3D 頁:一載入就抓了 `pattern-R/SR/SSR/UR.webp`(`loadSkins()` 在啟動時跑,等於暖花紋),網址跟 2D 頁一字不差;第一次升級時沒有再抓。先開首頁等幾秒再進 3D 頁:這些圖顯示 `(disk cache)` / `(memory cache)`。

- [ ] **Step 5: 失敗路徑(Review Focus 2)**

DevTools → Network → 封鎖 `pattern-UR.webp`,重新整理後抽 UR:console 有一行 warn,殼仍是純色或只有底色,演出跑完、卡片出現、按鈕恢復可按。

- [ ] **Step 6: 改視窗大小(Review Focus 5)**

演出途中把視窗從 1440 拉到 390:下一次升級的粒子仍對準蛋。

- [ ] **Step 7: Commit**

```bash
git add gashapon3d/js/main.js
git commit -m "feat(gashapon3d): upgrade reveal like the gashapon page — upright, rarity skins, snow and aura"
```

---

## 切片 ③ 冰雪托盤

### Task 8: 托盤素材後製工具

**Files:**
- Modify: `tools/mascot-gen/gashapon_art.py`
- Create: `tools/mascot-gen/gashapon3d.py`、`gashapon3d/js/tray-art.js`
- Output: `gashapon3d/img/floor.webp`、`gashapon3d/img/wall.webp`
- Test: `tools/mascot-gen/test_gashapon_art.py`

**Interfaces:**
- Produces:
  - `crop_square_center(rgb, margin: float) → ndarray`:四邊各裁 `margin`(比例)後取中間正方形
  - `ink_rows(rgb, dark=90, frac=0.3) → (top, bottom)`:深色像素佔一列 `frac` 以上的第一列與最後一列
  - `make_seamless(arr, overlap: int) → ndarray`:寬度變成 `W - overlap`,左端 `overlap` 欄跟原本右端交叉淡化
  - `gashapon3d/js/tray-art.js`:`export const FLOOR_URL`、`WALL_URL`(相對 `import.meta.url` 的絕對網址,原始字串帶 `?v=`)

- [ ] **Step 1: 寫會失敗的測試**

```python
from gashapon_art import crop_square_center, ink_rows, make_seamless


class TrayArt(unittest.TestCase):
    def test_crop_square_center(self):
        a = np.zeros((100, 120, 3), np.uint8)
        out = crop_square_center(a, 0.1)
        self.assertEqual(out.shape[:2], (80, 80))

    def test_ink_rows(self):
        a = np.full((10, 10, 3), 255, np.uint8)
        a[2, :] = 40
        a[7, :] = 40
        self.assertEqual(ink_rows(a), (2, 7))

    def test_make_seamless_wraps(self):
        a = np.arange(10, dtype=np.float32)[None, :, None].repeat(2, axis=0).repeat(3, axis=2)
        out = make_seamless(a.astype(np.uint8), 4)
        self.assertEqual(out.shape[1], 6)
        # 接起來的地方:最右一欄是原本第 5 欄,最左一欄要等於原本第 6 欄(緊接在後)
        self.assertEqual(out[0, -1, 0], 5)
        self.assertEqual(out[0, 0, 0], 6)
```

Run: unittest → FAIL

- [ ] **Step 2: 實作**(`gashapon_art.py` 末尾)

```python
def crop_square_center(rgb, margin):
    """盤底:模型把冰面畫成「有外框的一塊」,四邊裁掉 margin 再取中間正方形,只留冰面。"""
    h, w = rgb.shape[:2]
    y0, y1 = round(h * margin), round(h * (1 - margin))
    x0, x1 = round(w * margin), round(w * (1 - margin))
    s = min(y1 - y0, x1 - x0)
    cy, cx = (y0 + y1) // 2, (x0 + x1) // 2
    return rgb[cy - s // 2: cy - s // 2 + s, cx - s // 2: cx - s // 2 + s]


def ink_rows(rgb, dark=90, frac=0.3):
    """牆帶:深棕外框線佔滿一整列的地方就是帶子的上緣跟下緣。"""
    lum = rgb[..., :3].astype(np.float32) @ np.array([0.299, 0.587, 0.114], np.float32)
    rows = np.nonzero((lum < dark).mean(axis=1) >= frac)[0]
    return int(rows[0]), int(rows[-1])


def make_seamless(arr, overlap):
    """左右無縫:把右端 overlap 欄交叉淡化到左端,再把右端切掉 —— 接起來時最右一欄的下一欄
    就是最左一欄,兩欄在原圖裡本來就相鄰。"""
    a = arr.astype(np.float32)
    w = a.shape[1]
    out = a[:, : w - overlap].copy()
    t = np.linspace(0, 1, overlap, dtype=np.float32)[None, :, None]
    out[:, :overlap] = a[:, w - overlap:] * (1 - t) + a[:, :overlap] * t
    return np.clip(np.rint(out), 0, 255).astype(np.uint8)
```

Run: unittest → PASS

- [ ] **Step 3: `gashapon3d/js/tray-art.js`**

```js
// 托盤素材(tools/mascot-gen/gashapon3d.py build-tray 產生)。網址的 ?v= 由工具改寫。
export const FLOOR_URL = new URL('../img/floor.webp?v=00000000', import.meta.url).href;
export const WALL_URL = new URL('../img/wall.webp?v=00000000', import.meta.url).href;
```

- [ ] **Step 4: `tools/mascot-gen/gashapon3d.py`**

```python
"""立體扭蛋機的托盤素材後製(盤底冰面、冰牆側面帶)。圖已在 2026-10-01 生好並選定,這裡只後製。
  PY=tools/mascot-gen/.venv/bin/python
  $PY tools/mascot-gen/gashapon3d.py build-tray
"""
import subprocess
import sys
from pathlib import Path

import numpy as np
from PIL import Image

from gashapon_art import crop_square_center, ink_rows, make_seamless, content_hash, stamp

ROOT = Path(__file__).resolve().parents[2]
OUT = Path(__file__).resolve().parent / 'out' / 'gashapon3d'
IMG = ROOT / 'gashapon3d' / 'img'
ART = ROOT / 'gashapon3d' / 'js' / 'tray-art.js'
PICKS = {'floor': 2, 'band': 2}   # 使用者 2026-10-01 選定


def webp(img, path, q=82):
    tmp = path.with_suffix('.png')
    img.save(tmp)
    subprocess.run(['cwebp', '-quiet', '-q', str(q), str(tmp), '-o', str(path)], check=True)
    tmp.unlink()


def build_tray():
    IMG.mkdir(parents=True, exist_ok=True)
    floor = np.asarray(Image.open(OUT / 'floor' / f's{PICKS["floor"]}.png').convert('RGB'))
    floor = Image.fromarray(crop_square_center(floor, 0.12)).resize((1024, 1024), Image.LANCZOS)
    webp(floor, IMG / 'floor.webp')

    band = np.asarray(Image.open(OUT / 'band' / f's{PICKS["band"]}.png').convert('RGB'))
    top, bottom = ink_rows(band)
    w = band.shape[1]
    band = band[top:bottom + 1, round(w * 0.06): round(w * 0.94)]   # 裁掉兩端的圓角外框
    band = make_seamless(band, overlap=round(band.shape[1] * 0.08))
    im = Image.fromarray(band)
    im = im.resize((1024, round(1024 * im.height / im.width)), Image.LANCZOS)
    webp(im, IMG / 'wall.webp')

    text = ART.read_text()
    for name in ('floor', 'wall'):
        text = stamp(text, f'../img/{name}.webp', content_hash(IMG / f'{name}.webp'))
    ART.write_text(text)
    for name in ('floor', 'wall'):
        print(name, (IMG / f'{name}.webp').stat().st_size // 1024, 'KB')
    # 雜湊變了,首頁的預載清單要跟著重產(預先載入 ①)
    from gashapon import write_preload_manifest
    write_preload_manifest()


if __name__ == '__main__':
    if sys.argv[1:] != ['build-tray']:
        sys.exit(__doc__)
    build_tray()
```

Run: `tools/mascot-gen/.venv/bin/python tools/mascot-gen/gashapon3d.py build-tray`
Expected: 印出兩行 KB,floor ≤ 100 KB;`tray-art.js` 的 `00000000` 換成雜湊。打開兩張圖看:floor 沒有外框線、wall 上緣是雪、下緣是冰牆底線,把 wall 並排兩張看接縫。**接縫明顯或裁不乾淨 → 停下來截圖給使用者**(退路是程式畫,需使用者同意)

- [ ] **Step 5: 首頁預載納入 3D 托盤**

`gashapon.py` 的 `write_preload_manifest()` 在 CSS 迴圈之後加:

```python
    # 立體扭蛋機的托盤貼圖(網址在 JS 裡,相對於 gashapon3d/js)
    for m in re.finditer(r"'(\.\./img/[^'?]+\.webp\?v=[0-9a-f]{8})'", (ROOT / 'gashapon3d' / 'js' / 'tray-art.js').read_text()):
        add('gashapon3d/js', m.group(1))
```

`test/preload-manifest.test.js` 的 `gashaponRefs()` 加同樣的規則:

```js
  for (const m of read('gashapon3d/js/tray-art.js').matchAll(/'(\.\.\/img\/[^'?]+\.webp\?v=[0-9a-f]{8})'/g)) add('gashapon3d/js', m[1]);
```

(測試名稱改成「preload.json 跟扭蛋機頁、立體扭蛋機托盤實際引用的圖一字不差」。)

Run: `tools/mascot-gen/.venv/bin/python tools/mascot-gen/gashapon.py manifest && node --test` → PASS,`preload.json: 14 張`

再補一個測試釘死「托盤兩張圖一定在預載清單裡」(`test/preload-manifest.test.js` 末尾):

```js
test('立體扭蛋機的托盤貼圖也在首頁預載清單裡', () => {
  const manifest = JSON.parse(read('gashapon/img/preload.json'));
  for (const name of ['floor', 'wall']) {
    assert.ok(manifest.some(u => u.startsWith(`gashapon3d/img/${name}.webp?v=`)), `預載清單少了 ${name}`);
  }
});
```

- [ ] **Step 6: Commit**

```bash
git add tools/mascot-gen gashapon3d/img gashapon3d/js/tray-art.js gashapon/img/preload.json test/preload-manifest.test.js
git commit -m "feat(gashapon3d-art): ice floor and seamless snow wall band for the 3D tray"
```

---

### Task 9: 托盤上場

**Files:**
- Modify: `gashapon3d/js/scene.js`

**Interfaces:**
- Consumes: `FLOOR_URL`、`WALL_URL`(Task 8)
- Produces: 行為變更:反彈邊界 = 牆內壁;`look()` 取景含牆高

- [ ] **Step 1: 托盤群組**

把現在的 `table` mesh 換成一個 `tray` 群組,`setEggs` 裡改成 `tray.scale.set(s, 1, s)`(`s = TABLE / TABLE_BASE`;**只縮水平**)。牆高**直接由蛋高算**(`EGG_H × WALL_RATIO`),跟顆數無關 —— 蛋的大小固定,牆就永遠是蛋的同一個比例:

```js
import { FLOOR_URL, WALL_URL } from './tray-art.js';

const WALL_IN = TABLE_BASE - 0.12;    // 牆內壁(基準半徑)
const WALL_OUT = TABLE_BASE + 0.18;   // 牆外壁
const EGG_H = R * 2;                  // 蛋的高度
const WALL_RATIO = 0.3;               // 牆高 = 蛋高 × 這個比例(要調牆高只改這裡)
const WALL_TOP = -R + EGG_H * WALL_RATIO;
const FLOOR_Y = -R;

// 冰牆的剖面:內壁底 → 內壁頂 → 圓弧上緣 → 外壁頂 → 外壁底(比桌面低一點,看得出厚度)
function wallProfile(grow = 0) {
  const pts = [new THREE.Vector2(WALL_IN - grow, FLOOR_Y)];
  pts.push(new THREE.Vector2(WALL_IN - grow, WALL_TOP));
  const cx = (WALL_IN + WALL_OUT) / 2;
  const rx = (WALL_OUT - WALL_IN) / 2 + grow;
  for (let i = 1; i < 8; i++) {
    const a = Math.PI - (i / 8) * Math.PI;
    pts.push(new THREE.Vector2(cx + Math.cos(a) * rx, WALL_TOP + Math.sin(a) * rx * 0.6));
  }
  pts.push(new THREE.Vector2(WALL_OUT + grow, WALL_TOP));
  pts.push(new THREE.Vector2(WALL_OUT + grow, FLOOR_Y - 0.18 - grow));
  return pts;
}
```

在 `createScene` 裡:

```js
  const loader = new THREE.TextureLoader();
  const floorTex = loader.load(FLOOR_URL);
  floorTex.colorSpace = THREE.SRGBColorSpace;
  const wallTex = loader.load(WALL_URL);
  wallTex.colorSpace = THREE.SRGBColorSpace;
  wallTex.wrapS = THREE.RepeatWrapping;
  wallTex.repeat.set(10, 1);

  const tray = new THREE.Group();
  root.add(tray);
  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(WALL_IN, 64),
    // 貼圖還沒到之前先用冰藍底色,不會閃一塊白
    new THREE.MeshBasicMaterial({ color: 0xffffff, map: floorTex }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = FLOOR_Y;
  floor.renderOrder = -30;
  tray.add(floor);

  // 牆分前後兩半:後半在所有蛋之前畫、前半在所有蛋之後畫 ——
  // 蛋的描邊不做深度測試(見 shell() 的說明),前半牆要是先畫,蛋的描邊會穿過牆畫在牆上
  function wallHalf(phiStart, order) {
    const fill = new THREE.Mesh(
      new THREE.LatheGeometry(wallProfile(), 96, phiStart, Math.PI),
      new THREE.MeshBasicMaterial({ map: wallTex, side: THREE.DoubleSide }));
    const edge = new THREE.Mesh(
      new THREE.LatheGeometry(wallProfile(0.05), 96, phiStart, Math.PI),
      new THREE.MeshBasicMaterial({ color: INK, side: THREE.BackSide }));
    edge.renderOrder = order;
    fill.renderOrder = order + 1;
    tray.add(edge, fill);
  }
  // LatheGeometry 的 phi = 0 在 +z(朝鏡頭)那側:前半 = [-π/2, π/2],後半 = [π/2, 3π/2]
  wallHalf(Math.PI / 2, -20);
  wallHalf(-Math.PI / 2, 100000);
```

刪掉原本的 `table` mesh、`table.scale.setScalar(...)`。影子顏色 `0x9C7B52` 改成冷色 `0x5A7FA8`(藍灰),註解改成「冷色調的藍灰,配冰面」。

- [ ] **Step 2: 反彈邊界、取景**

`step()` 裡 `const max = TABLE - R * 1.45;` 改成

```js
      const max = WALL_IN * (TABLE / TABLE_BASE) - R * 1.05;   // 牆內壁再留一顆蛋的半徑
```

`setEggs` 的散開半徑 `(TABLE - R * 1.6)` 改成 `(WALL_IN * (TABLE / TABLE_BASE) - R * 1.2)`。
`look()` 的 `need = TABLE * 1.1` 改成 `need = WALL_OUT * (TABLE / TABLE_BASE) * 1.08`,`tall = 1.1` 不變(牆比蛋矮)。

- [ ] **Step 3: 描邊方向確認**

實機開頁面:牆應該是「冰藍 + 雪 + 外圍一圈深棕線」。**整圈牆是一團深棕色** → 描邊的 winding 反了,把 `edge` 的 `side` 改成 `THREE.FrontSide` 再看一次(同 `dome()` 註解提過的那個坑)。

- [ ] **Step 4: 跑測試**

Run: `node --test` → PASS

- [ ] **Step 5: 實機驗收(Review Focus 5)**

1. 獎項 3 顆、20 顆、40 顆各看一次:牆高永遠約是蛋高的三成、蛋不穿牆、按「搖動」蛋撞牆反彈
2. 390 寬:整圈牆都在畫面內
3. 點開一顆:前半牆擋住蛋下半部的地方沒有描邊穿過去
4. Network:`floor.webp`、`wall.webp` 在頁面載入時就抓了;先開首頁再進來是快取命中
5. 跟首頁卡片 s2 的冰盤截圖並排給使用者

- [ ] **Step 6: Commit**

```bash
git add gashapon3d/js/scene.js
git commit -m "feat(gashapon3d): icy tray with a snow-capped 3D wall and a textured ice floor"
```

---

## 切片 ④ 首頁卡片

### Task 10: 立體扭蛋機首頁卡片插畫

**Files:**
- Modify: `tools/mascot-gen/home_prompts.json`、`index.html`、`css/home.css`
- Output: `img/home/gashapon3d.webp`
- Test: `test/home-images.test.js`

- [ ] **Step 1: 寫會失敗的測試**(`test/home-images.test.js` 末尾)

```js
test('首頁的立體扭蛋機卡片用了插畫', () => {
  assert.ok(refs().some(p => p.endsWith('img/home/gashapon3d.webp')), refs().join('\n'));
});
```

Run: `node --test test/home-images.test.js` → FAIL

- [ ] **Step 2: 放進 home.py 的流程**

```bash
cp tools/mascot-gen/out/gashapon3d/home-card-round/s2.png tools/mascot-gen/out/home/gashapon3d/s4.png
tools/mascot-gen/.venv/bin/python tools/mascot-gen/home.py pick gashapon3d 4
```

`home_prompts.json` 的 `cards.gashapon3d` 換成這張實際用的提示詞(之後要重生才對得上;生成時前面接的是 `gashapon_prompts.json` 的 `style`,不是 `home_prompts.json` 的 `style`,在旁邊加一個 `"gashapon3d_style_note"` 欄位寫明):

```
a round icy blue ice tray with a fluffy white snow rim on soft snowy ground, seen from the front at a slight angle from above, many perfectly round spherical capsule balls scattered on the tray, every ball is a perfect circle like a ping pong ball, not oval, not egg shaped, not elongated, each ball has a colorful top half and a white bottom half split by a straight horizontal line, pink orange yellow mint sky blue and lavender capsules, a couple of balls bouncing in the air, pale icy blue sky, a few snowy pine trees far in the back, sparkling snowflakes, no machine, no characters
```

`index.html` 的立體扭蛋機卡片:

```html
    <img class="card__art card__art--img" src="img/home/gashapon3d.webp" alt="" aria-hidden="true">
```

取代 `<span class="card__art card__art--gashapon3d" aria-hidden="true"></span>`;`css/home.css` 刪掉 `.card__art--gashapon3d { … }`。

Run: `tools/mascot-gen/.venv/bin/python tools/mascot-gen/home.py build-cards --only gashapon3d`
Expected: `img/home/gashapon3d.webp` 產生,`index.html` 的網址帶上 `?v=`

- [ ] **Step 3: 驗證**

Run: `node --test` → PASS
首頁實機(390 與 1440):兩張扭蛋卡片並排,截圖給使用者。

- [ ] **Step 4: Commit**

```bash
git add tools/mascot-gen/home_prompts.json index.html css/home.css img/home/gashapon3d.webp test/home-images.test.js
git commit -m "feat(home): illustrated card for the 3D gashapon"
```

---

## 收尾

- [ ] `node --test` 與 Python unittest 全部 PASS
- [ ] 2D、3D、首頁各在 390 / 1440 截一張最終圖給使用者
- [ ] 預載總檢查:清空快取 → 開首頁等 5 秒 → 進 3D 頁抽一顆 UR:Network 裡所有 `pattern-*` / `frame-*` / `floor` / `wall` 都是快取命中
- [ ] 驗收報告寫明:手機效能只在桌機 Chrome 裝置模擬看過,沒有真機量測
- [ ] 首頁卡片文案「看蛋在球裡滾來滾去」已經不符(現在是托盤),**不在本計畫範圍**,在報告裡提出給使用者決定
