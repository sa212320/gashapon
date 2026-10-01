# 立體扭蛋機改版 設計

## Context

扭蛋機頁(`gashapon/`)2026-10-01 換成冰雪畫風:z_image 機台插畫、稀有度花紋殼、冰雪外框卡片、右上角手寫 SVG 圖示。立體扭蛋機(`gashapon3d/`)還是舊樣子:米色平面托盤、純色蛋、升級只有「彈一下」(`scene.setAura?.()` 從沒實作)、topbar 標題、底部 emoji 圖示、CSS 奶油色獎項卡、🫙 空機畫面。

這次一次處理:issue #6(托盤材質;蛋殼花紋改成「升級時才出現」)+ UI 跟 2D 統一 + 整個場景冰雪風。

零建置仍是硬性條件:沒有 package.json、沒有 bundler。`tools/mascot-gen/` 是開發用素材工具,產出的圖直接 commit。

---

## 已封閉的決策(grill 階段確定,實作時不得重新討論)

| # | 決策 | 結論 |
|---|---|---|
| Q1 | 範圍 | issue #6 + UI 跟 2D 統一 + 整個場景冰雪風 |
| Q2/Q4 | 桌上的蛋 | **純隨機 12 色**(`CAPSULE_COLORS`),**沒有花紋**。`pool` 資料格式不變 |
| Q3 | 升級演出 | **完全比照 2D**:起點是那顆蛋的隨機純色;每次 upgrade 殼換成該稀有度的外觀(2D 的底色 × `pattern-*.webp`),配粒子 + 光暈 + 彈跳。N 不升級、殼不換 |
| — | 轉正 | 蛋飛到中央時**要轉正**:上半朝上、接縫在畫面上水平、正面朝鏡頭 |
| Q9 | 花紋貼法 | **正面 planar 投影**(頂點 x、y 算 UV),不重生花紋素材 |
| — | 殼的材質做法 | **執行時 Canvas 合成**:底色(純色 / SSR 金漸層 / UR 彩虹)畫進 canvas,再把花紋圖**直接疊上去**(一般 source-over)→ `CanvasTexture`。底色**從 `tokens.css` 的 CSS 變數讀**,不在 JS 複製色碼。UR 的流動:2D 是 `shimmer` = `filter: hue-rotate(360deg) saturate(1.15)` 3.2s 一圈(整顆含花紋一起轉色相),3D 在載入時用**同一個 CSS hue-rotate 色彩矩陣**預算 24 格貼圖、依時間輪播 |
| — | 花紋改白(設計階段,使用者看過模擬圖決定) | 花紋從「深色 multiply」改成**白色**:N/R/SR/SSR = 白色雪花;**UR = 淺水晶藍 `#7FD3FF` 雪花 + 白邊**(白邊寬約為圖寬的 1.7%,即 300px 預覽上的 5px MaxFilter)。**2D 一起改**。花紋在 `build-patterns` 時就烘成 **RGBA webp**(白 / 藍 + 透明度 = 原灰階反轉),檔名不變、雜湊更新;2D 的 `::before` 拿掉 `mix-blend-mode: multiply`,3D 直接疊。兩台讀同一張圖 |
| — | 稀有度色共用(設計階段發現) | 2D `style.css` 開頭覆寫了 `--r-SSR-a/b`、`--gold`、`--rainbow`、`--rainbow-conic`(「UR 太鮮艷」「SSR 不夠金」那次);`tokens.css` 還是舊值、也沒有 `--gold`。這些變數只有 `gashapon/` 在用 → **整段搬進 `tokens.css`**,2D 畫面不變,3D 讀到同一份 |
| Q8 | 粒子 / 光暈 | 2D `reveal.js` 的 `spawnParticles` / `flashAura` 抽到 `shared/js/reveal-fx.js` 兩台共用;3D 用 DOM 疊在 canvas 上,對準蛋的螢幕投影。2D 行為不變 |
| Q5 | 托盤 | 冰雪托盤;雪邊跟著托盤 scale 縮放沒關係;影子改冷色藍灰;描邊維持深棕 `INK` |
| — | 托盤立體感(設計階段加入) | **要像首頁卡片那樣有厚度**:外圍一圈 3D 冰牆(`LatheGeometry`,平塗 + 深棕描邊),上緣積雪、波浪下緣;盤底用俯視冰面貼圖(**只有冰,不含雪圈**)。牆比蛋矮(約 0.6R),物理反彈邊界 = 牆內壁 |
| Q6 | 版面 | 拿掉標題(機台名字只在設定裡);左上首頁、右上 🔊⚙️,用 `shared/img/icons.svg`、位置與 class 照抄 2D;底部 `[搖動] [抽獎] (剩 X 顆)`;`removeOnDraw = false` 不顯示膠囊;拿掉「共 N 顆(抽到的不會拿走)」;按鈕**保留「抽獎」**(3D 沒有把手可轉) |
| Q7 | 揭曉卡片 | `shared/css/prize-frame.css`(`data-rarity`、代號標籤 N/R/SR/SSR/UR、`fitText` 縮字、`is-frame-loading` 保底)、置中 + 暗幕。**不放「再抽一次」**,保留「點一下繼續」回桌面自己挑。**這次不做跳過** |
| Q11 | 空機 | 拿掉 🫙;空托盤上「扭蛋機空了!」+「再裝滿一次」(文字跟 2D 統一) |
| Q10 | 首頁卡片 | `gashapon3d` 首頁卡片換生成插畫,**已選定正圓球版 s2**(`tools/mascot-gen/out/gashapon3d/home-card-round/s2.png`) |
| Q12 | 順序 | 垂直切片 ① 頁面 UI → ② 升級演出 → ③ 冰雪托盤 → ④ 首頁卡片。**ComfyUI 候選先生**,托盤後來直接選定盤底 `floor/s2`、牆帶 `band/s2`,③ 貼進場景確認 |
| — | 暗幕時機(設計階段) | 3D 的蛋畫在 canvas 裡,DOM 暗幕會把蛋也蓋暗,所以**暗幕延到 show 才淡入**、墊在卡片下;之前靠鏡頭推近聚焦 |

生成沿用共同規則:`tools/mascot-gen/`、綠幕去背、跟吉祥物同畫風(平塗、粗深棕外框、Q 版)、冰雪奇緣感不要聖誕、每張 3 個 seed 由使用者挑、換素材的網址帶內容雜湊、候選一律貼進真實畫面再給使用者看。

---

## 模型(grill 確認過,逐字帶入 plan)

- **實體**:`pool` 的 `Capsule { prizeId, drawn, color }` **不變**(`color` 仍是 12 色隨機、與稀有度無關)。新增的都是畫面層:演出中蛋的**外觀狀態**(`plain` → `R` → `SR` …)、托盤貼圖、`shared/js/reveal-fx.js` 特效模組
- **Cardinality**:桌上一顆蛋 ↔ `pool` 一顆 Capsule(1:1,pool 擁有);一次演出一顆蛋,外觀狀態屬於演出、演完丟棄;托盤貼圖整桌一份,跟著顆數 scale
- **Seen vs stored**:升級花紋、光暈都**不存**,每次從 `prize.rarity` 經 `buildRevealSteps` 現推;存的只有 `drawn: true`
- **三個最可能的錯誤(錯誤版本)**:
  1. 「桌上的蛋依稀有度上花紋 / 顏色」—— 錯,桌上一律純隨機色
  2. 「升級從 N 外觀開始逐階換」—— 錯,起點是隨機純色,第一次升級直接換 R;N 殼不換
  3. 「卡片放『再抽一次』或自動挑下一顆」—— 錯,只有「點一下繼續」,回桌面自己挑

---

## 模組切分

| 檔案 | 狀態 | 職責 |
|---|---|---|
| `shared/js/reveal-fx.js` | 新增 | `createRevealFx({ aura, particles, isSkipping })` → `{ flashAura(rarity, scale), spawnParticles(rarity, n, { near }) }`;`particleCount` 也搬來。原封不動從 2D 搬 |
| `shared/css/reveal-fx.css` | 新增 | `.aura[data-rarity]`、`.particle--snow`(從 2D `style.css` 搬) |
| `gashapon/js/particles.js` | 修改 | 改成從 `shared/js/reveal-fx.js` re-export `particleCount` |
| `gashapon/js/reveal.js` | 修改 | 改用 `reveal-fx.js`,行為不變 |
| `gashapon/css/style.css` → `shared/css/tokens.css` | 搬移 | `.remain-tag`、`.home-link--corner`、`.corner-tools`(含 iOS 修正)、開頭的稀有度色覆寫 `:root{…}` 搬到共用處;`.capsule__half::before` 拿掉 `mix-blend-mode` |
| `tools/mascot-gen/gashapon.py` `build-patterns`、`gashapon_art.py` | 修改 | 輸出白色(UR 水晶藍 + 白邊)RGBA 花紋;新增純函式 `to_white_pattern(gray, fill, edge)` 附測試 |
| `gashapon3d/js/skin.js` | 新增 | `loadSkins()`:讀 `tokens.css` 變數 + 5 張 pattern,Canvas 合成每個稀有度上 / 下半的 `CanvasTexture`;`applySkin(egg, rarity)`、`resetSkin(egg)`、`tickSkins(now)`(UR 輪播預算好的 hue-rotate 格);純函式 `skinSequence(steps)` |
| `gashapon3d/js/scene.js` | 修改 | 半球幾何加正面 UV;托盤 = 盤底貼圖 + 冰牆幾何(含描邊);影子冷色;`upright(egg, k)`(slerp 到正面朝鏡頭);`screenPos(egg)`;反彈邊界改牆內壁;取景算進牆高 |
| `gashapon3d/js/main.js` | 修改 | `play()`:drop 加轉正、upgrade 換殼 + 粒子 + 光暈、show 用 prize-frame + 暗幕;版面 DOM 跟著改 |
| `gashapon3d/index.html`、`css/gashapon3d.css` | 修改 | 角落圖示、膠囊、`.fx` 層、`#dim`、prize-frame 卡片、`<symbol id="snowflake">`、空機畫面;刪舊 `.prize-card` 樣式與 topbar |
| `tools/mascot-gen/gashapon3d.py` | 新增 | `floor` / `band` / `review` / `pick` / `build-tray`(去背、裁圓或裁帶、webp、雜湊) |
| `tools/mascot-gen/home_prompts.json` | 修改 | `gashapon3d` 卡片提示詞換成正圓球版;picks 記 s2 |
| `js/preload-modes.js` 或 preload 清單 | 修改 | 首頁閒置預抓加上 3D 托盤圖 |

`fit-text.js`、`image-ready.js` 留在 `gashapon/js/`,3D 直接 import(同現在 import `constants.js` 的做法),不搬 `shared/`。

---

## 演出流程

步驟仍由 `buildRevealSteps(rarity, prize, { turn: false })` 決定;3D 只負責演。

| 步驟 | 3D 怎麼演 |
|---|---|
| drop | 蛋飛到桌中央、鏡頭推近(同現在)。同時 **slerp 轉正**到「上半朝上、local +z 朝鏡頭」。拉長到 600ms |
| shake | 左右晃,幅度依 `tension` 遞增(比照 2D `7 + tension*5`) |
| upgrade | `applySkin(egg, step.to)` + `spawnParticles(near)` + `flashAura` + 彈一下,480ms。第一次 upgrade 從隨機純色直接換 R |
| crack | 上下兩半分開(同現在),花紋跟著兩半走 |
| burst | 大量粒子 + 大光暈(`particleCount('burst', level)`) |
| show | 卡片設 `data-rarity`、`waitForImage` 最多 2 秒(等不到用 `is-frame-loading`),**暗幕此時才淡入**,卡片置中 |

- 殼的外觀:上半 = `--r-<R>-a`、下半 = `--r-<R>-b`(N/R/SR);SSR 用 `--gold` 漸層;UR 用 `--rainbow` 漸層 + 預算 24 格 hue-rotate 輪播(3.2s 一圈,同 2D `shimmer`)。漸層在 canvas 上重畫 CSS 那條漸層的色標;直接疊上白色 RGBA 花紋,上下兩半共用同一張花紋、各取一半(同 2D 的 `::before` 200% 高)
- 粒子 / 光暈定位:觸發當下取 `scene.screenPos(egg)`,特效容器以那點為中心
- 收尾:點掉卡片後 `render()` → `dealTable()` 全部重建,換過的材質跟著丟;`resetSkin()` 只是防衛
- 演出中的例外照現在的 `finally` 收尾,`playing` 不能卡住

---

## 托盤

- **盤底**:俯視冰面貼圖(只有冰,沒有雪圈),貼在現有 `CircleGeometry`;生成 1024px,輸出 webp,目標 ≤100KB
- **冰牆**:`LatheGeometry` 一圈(內壁、上緣、外壁),高約 0.6R;平塗、無光源,背面放大的深棕描邊(跟蛋同一套,畫家演算法排序要把牆納入或確定牆永遠先畫)。側面用一張橫向無縫的「上雪下冰」帶狀貼圖;生成的帶不好用時改程式畫(白色波浪 + 冰藍)
- 候選已先生(`tools/mascot-gen/out/gashapon3d/`):`floor/s1-3`、`band/s1-3`(另有早一輪含雪圈的 `tray/s1-3`,立體牆定案後不用)。模型都把它們畫成「有外框的一塊」而不是滿版材質:盤底要**裁中間的冰面再套圓形遮罩**,牆帶要**裁掉兩端的圓角外框、取中段再做左右無縫**(交叉淡化接縫)。`build-tray` 負責這兩步。**使用者已選定 `floor/s2` 與 `band/s2`**(2026-10-01);③ 仍要貼進真實場景截圖確認,後製不行才回頭換
- 整組(盤底 + 牆)跟著顆數 `scale`;反彈邊界 = 牆內壁;鏡頭 `look()` 的取景把牆高算進去
- 影子改冷色藍灰

---

## 版面

- 刪 `<header class="topbar">`(含 `#setupName`、`#remaining`)
- 左上 `home-link--corner`、右上 `.corner-tools`(🔊 ⚙️),HTML 與 class 照抄 2D
- 底部 `.toolbar`:`[搖動] [抽獎] (剩 X 顆)`,膠囊用共用的 `.remain-tag`
- `.fx`(`#aura`、`#particles`)與 `#dim` 疊在 stage 上
- 卡片:`<div class="prize-card prize-frame" data-rarity>` → badge、`.prize-card__name-box > .prize-card__name`、「點一下繼續」
- 空機:拿掉 🫙、「再裝滿一次」
- `pick-hint` 保留在上方中央,檢查 390 寬跟角落圖示不擠
- 點掉卡片不能順手開下一顆蛋(既有的 capture + `stopPropagation` 邏輯保留)

---

## 測試與驗收

**單元測試**(`node --test`)
- `test/gashapon3d.test.js` 原有「殼色與稀有度無關」**不改、必須過**(擋錯誤 1)
- 新增 `skinSequence(steps)`:各稀有度推出 `plain → R → … → 目標`;N 全程 `plain`(擋錯誤 2)
- `particleCount` 原有測試照過,import 改 `shared/`
- `preload-manifest.test.js` 涵蓋 3D 托盤網址並帶雜湊
- `modules.test.js` 若檢查 import 圖,補上新模組

**實機驗收**(每片做完,真實頁面、390 與 1440 各截圖給使用者)
- ① 角落圖示、膠囊、5 種稀有度的外框卡片;`removeOnDraw` 關掉時膠囊消失;空機畫面;點掉卡片不多開一顆(回歸)
- ② 5 種稀有度各走一次:轉正、換殼、粒子對準蛋、SSR 金、UR 流動;**2D 頁面也抽一次**確認 `reveal-fx` 搬家沒壞
- ③ 托盤候選 + 冰牆貼進真實場景給使用者挑;40 顆蛋不穿牆;窄螢幕牆不被切
- ④ 首頁卡片 s2 跟 2D 卡片並排截圖

**已知限制**:手機效能(40 顆蛋 + 牆描邊 + CanvasTexture)只能在桌機 Chrome 的裝置模擬看,沒有真機量測,驗收時會寫明。
