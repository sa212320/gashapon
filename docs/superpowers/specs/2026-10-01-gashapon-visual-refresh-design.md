# 扭蛋機畫面優化 設計

## Context

首頁剛換上 z_image 生成的木牌插畫,扭蛋機頁(`gashapon/`)卻還是手繪 SVG 機台、純文字標題、emoji 圖示(🔊 ⚙️ ←),兩頁接不起來。筆電上機台只有 330px 寬,畫面很空。揭曉演出的扭蛋殼和獎項卡片是 CSS 畫的(issue #5 原本要處理的範圍)。

這次一口氣處理四件事:風格統一、版面比例、機台本體、抽獎演出,並吃下整個 issue #5。

零建置仍是硬性條件:網站沒有 package.json、沒有 bundler。`tools/mascot-gen/` 是開發用的素材生成工具,產出的圖直接 commit。

---

## 已封閉的決策(grill 階段確定,實作時不得重新討論)

| # | 決策 | 結論 |
|---|---|---|
| Q1 | 範圍 | 風格統一 + 版面比例 + 機台本體 + 抽獎演出,四項都做 |
| Q2 | 機台本體 | **整台換 z_image 插畫**。圓頂裡的蛋不再即時畫,剩餘數量只靠文字。推翻 issue #5 的「本體維持 CSS」 |
| Q3 | 把手動畫 | **圖層拆開 + CSS 動畫**:把手是獨立圖片旋轉,機身壓扁回彈、晃動。不用 Wan 影片、不用 Live2D |
| Q4 | 範圍與順序 | 吃下整個 issue #5;首頁扭蛋機卡片**最後做**,用同一張機台圖 |
| Q5 | 多台機器外觀 | **全部同一款**,`Machine` 資料不加欄位 |
| Q6 | 標題 | 主畫面**拔掉標題**,機台名字只在設定下拉選單看得到 |
| Q7 | 剩餘數量 | 「剩 X 顆」膠囊標籤放在「轉!」旁邊;`removeOnDraw = false` 時不顯示 |
| Q8 | 圖示 | ← 🔊 ⚙️ 換成**手寫 SVG**,放 `shared/`。驗收標準是跟插畫、吉祥物風格對得上;SVG 怎麼調都對不上才改用生成 |
| Q9 | 觸發 | **點把手 = 按「轉!」**,兩個都能抽 |
| Q10 | 臉 | 機台**沒有臉**。眼睛、腮紅、瞇眼演出拿掉 |
| Q11 | 大小 | 機台**撐滿可用高度**,寬度避開右下角吉祥物;插畫是直式、約 3:4 |
| Q12 | 扭蛋殼 | 5 個稀有度各一款**灰階花紋,階級越高越華麗**,由程式依 `RARITY_META` 上色;UR 用 CSS 彩虹 + `hue-rotate`;每款拆上下兩半(crack 動畫需要),共 10 張 |
| Q13 | 卡片外框 | 灰階、階級越高越華麗、**九宮格**(四角裝飾、四邊可拉伸)、程式上色,放 `shared/` 讓 3D 之後可以用。**退路**:九宮格生不出來就改成一款外框只換色 |
| Q14 | 空機畫面 | **這次不動** |
| Q15 | 把手圖層 | 生一張完整機台,把把手切出來。切不乾淨才改成分開生成 |
| — | 實作順序 | **垂直切片**:機台 → 殼 → 外框 → 圖示 → 首頁卡片。每片「生圖、挑圖、接程式、驗收」走完一輪 |
| — | 畫風(2026-10-01 執行中修訂) | 使用者看過機台候選後決定:**冰雪奇緣的感覺,不要聖誕**。冰藍、淡紫、白,雪花結晶、閃光、積雪與冰柱;不畫冬青、紅果、緞帶。機台、殼、外框、首頁卡片、首頁木牌全部沿用。只取氛圍,不畫任何角色或商標 |
| — | 首頁木牌(2026-10-01 執行中加入) | 木牌兩端的冬青紅果是聖誕元素,跟畫風衝突,**這次重生**:積雪 + 冰柱 + 小雪花,不要冬青;跟切片 ⑤ 一起做 |
| — | 3D 扭蛋機 | 只有卡片外框放 `shared/` 讓它之後可以用;3D 的殼怎麼處理是 issue #6 的事,**這次不碰 `gashapon3d/`** |

生成沿用 issue #5 的共同規則:跟吉祥物同畫風(平塗、粗深棕外框、Q 版)、先試拼圖再試分開生、每張 3 個 seed 由使用者在比較頁挑、綠幕去背(`key_border` + `keep_largest`)、工具在 `tools/mascot-gen/`、換素材的網址要帶內容雜湊。

---

## 模型(grill 確認,原文收錄)

> 實作時發現程式跟這段矛盾 = **spec / plan 的 bug**,停下來回報,不要自己改模型。

- **Entities**:`Machine`(資料**不變**,不加 `skin` / `color`);機台素材組 `machine.webp`(機身 + 圓頂 + 裝飾用的蛋)+ `knob.webp` + `anchors.json`(把手中心、出蛋口,圖片座標);殼 `shell-{N,R,SR,SSR,UR}-{top,bottom}`(10 張灰階);卡片外框 `frame-{N…UR}`(5 張灰階九宮格,放 `shared/`);圖示 SVG `home / sound-on / sound-off / settings`(放 `shared/`)
- **Cardinality**:機台素材 1 : N `Machine`(每台共用);稀有度 1:1 殼花紋(每款拆上下兩張);稀有度 1:1 卡片外框
- **Seen vs stored**:圓頂裡看到的蛋是**畫死在插畫裡的裝飾**,跟剩幾顆、稀有度都無關;`machine.name` 有存但主畫面不顯示;「剩 X 顆」是算出來的,`removeOnDraw = false` 時不顯示
- **畫面**:拔標題;機台撐滿高度但避開吉祥物;剩 X 顆標籤在「轉!」旁;點把手 = 轉!;空機畫面不動;首頁卡片最後用同一張機台圖生

> **模型修訂(2026-10-01 執行中,使用者確認)**:殼不再是生成的整顆圖。球(圓形、深棕外框、分界線、高光)由 CSS 畫,
> 5 個稀有度外形完全一樣;ComfyUI 只生**花紋貼圖** `pattern-{N,R,SR,SSR,UR}`(5 張方形灰階,白底,同一個雪花/冰晶主題、
> 階級越高越華麗),疊在球裡用 multiply 上稀有度色;上下兩半共用同一張貼圖,各顯示一半。
> 取代原本的 `shell-{…}-{top,bottom}`(10 張)。卡片外框的四角裝飾也改成同一個雪花/冰晶主題逐級華麗。

> **模型修訂 2(2026-10-01,使用者確認)**:卡片外框也改成全部由程式畫 —— CSS 色帶(UR 用 `--rainbow`)+ 四角白色 SVG 雪花 `flake-{N,R,SR,SSR,UR}.svg`(不吃稀有度色,一階比一階華麗)+ 上緣 SVG 積雪 `snow-cap.svg`,由 `tools/mascot-gen/flakes.py` 產生。取代生成的 `frame-{…}` 九宮格與 `shared/js/tint.js`。

> **模型修訂 3(2026-10-01,使用者確認)**:卡片外框改成 5 張 ComfyUI 生成的**彩色**冰雪整張框 `shared/img/frames/frame-{N,R,SR,SSR,UR}.webp`(不分稀有度顏色,只靠冰晶多寡與冰晶冠等裝飾逐級華麗);卡片固定 4:3,名字自動縮字(`gashapon/js/fit-text.js`,18–44px),「再抽一次」移到卡片正下方。取代模型修訂 2 的 CSS 色帶與 SVG 雪花。

**最可能做錯的三個(以下都是錯的)**

1. 「圓頂裡的蛋要依剩餘數量或稀有度畫」—— 錯,那是靜態插畫,抽完了也長一樣
2. 「殼和卡片外框的顏色直接畫在圖上」—— 錯,生灰階圖,由 `RARITY_META` 上色;UR 的彩虹是 CSS 動畫
3. 「3D 扭蛋機也一起換成花紋殼」—— 錯,只有卡片外框放 `shared/` 讓 3D 可以用

(註:grill 時模型寫的是「把手位置補實心底座」。設計階段發現把手是實心圓盤、原地旋轉時佔的範圍不變,會一直蓋住原圖上的把手,所以**不用補**;前提是橫桿不能凸出圓外,凸出的那張在挑圖時就淘汰。這是實作上的簡化,不改變任何 entity。)

---

## 切片 ① 機台與版面

### 生成:`tools/mascot-gen/gashapon.py`

指令結構照 `home.py`,提示詞放 `tools/mascot-gen/gashapon_prompts.json`。

- `machine`:768×1024 直式、綠底 `#00FF00`、3 個 seed。提示詞 = 首頁的 `style` + 正面視角、**no face**、圓頂裡有彩色扭蛋、機身中央一個**圓形把手,橫桿完全收在圓裡**、把手下方一個出蛋口、雪地冬季配色
- `review`:產生比較頁 `tools/mascot-gen/review/gashapon.html`。每張圖上可以**點出把手圓心、拖出半徑、點出出蛋口**,頁面把結果顯示成一行可以複製的指令
- `pick machine <n> --knob cx,cy,r --outlet x,y`:記錄挑選與錨點(像素座標)
- `build-machine`:去背 → 裁到內容邊界 → 輸出到 `gashapon/img/`:
  - `machine.webp`:整台,**不挖洞**
  - `knob.webp`:照圓切下來的把手圓盤,圓外透明
  - `anchors.json`:`{ "aspect": <寬/高>, "knob": { "cx", "cy", "r" }, "outlet": { "x", "y" } }`,全部是相對於裁切後圖片寬高的 0–1 比例(`r` 相對於寬)

### DOM / CSS(`gashapon/index.html`、`gashapon/css/style.css`)

- `<svg class="machine">` 換成:
  ```html
  <div class="machine" id="machine">
    <img class="machine__body" src="img/machine.webp?v=<hash>" alt="">
    <button class="machine__knob" id="knob" type="button" aria-label="轉">
      <img src="img/knob.webp?v=<hash>" alt="">
    </button>
  </div>
  ```
  把手位置用 CSS 變數 `--knob-x / --knob-y / --knob-r`(百分比)
- 刪掉:`.sparkles`、`#capsuleGroup`、眼睛、腮紅、標題 `h1#machineName`、舊的 `p#remaining`
- 左上的 ← 改成絕對定位,不佔版面;`body` 的 grid 變成「舞台 `1fr` + 工具列 `auto`」兩列
- 機台:`height: 92%`(舞台高度)、`aspect-ratio` 跟 `anchors.aspect` 一致;`> 600px` 時 `max-width: calc(100vw - 2 * 吉祥物寬)`,`≤ 600px` 不限(手機上吉祥物排在內容後面,`z-index: -2`)
- 保留 `idle-bob` 待機上下浮動
- 「剩 X 顆」膠囊放在「轉!」**正上方**,工具列左右兩顆圖示保持對稱

### JS

- 啟動時 `fetch('img/anchors.json')`,把錨點設成 CSS 變數。**失敗就用寫死在程式裡的預設值**(以第一版 `anchors.json` 的數值為準),不擋抽獎
- `ui-machine.js`:拿掉 `SLOTS` 與 `renderCapsules()`;`render()` 只更新剩餘標籤、空機畫面、`drawBtn` 與把手的 `disabled`
- `main.js`:把手的 `click` 跟 `drawBtn` 走同一個 handler
- `reveal.js`:
  - `turn()`:把手轉 360°,機身「壓扁 → 彈回 → 左右晃」;眼睛、圓頂裡的蛋的動畫刪掉
  - `slotOffset()`:改成 `outlet` 比例 × 機台 `getBoundingClientRect()`
  - `els` 拿掉 `eyes`、`capsuleGroup`

### 測試

- `anchors.json`:欄位齊全、數值在 0–1、把手圓不超出圖
- 頁面引用的 `machine.webp`、`knob.webp`、`anchors.json` 都存在(照 `test/home-images.test.js` 的寫法)
- `ui-machine` render:剩餘標籤文字;`removeOnDraw = false` 時隱藏;沒有獎項時 `drawBtn` 與把手都 disabled

---

## 切片 ② 扭蛋殼

### 生成(`gashapon.py shells`)

- 先試**拼圖**:一張 5 格橫排、灰階、白底,每格一顆正面扭蛋,花紋由左到右:素面 → 條紋 → 星星 → 皇冠與金邊 → 翅膀加閃光。格數錯或大小不一 → 改成 5 張分開生,每張 3 個 seed
- 比較頁上點出每顆的**上下分界線 y 座標**,`pick` 時記錄
- `build-shells`:去背 → **強制轉灰階,亮部拉到接近白** → 照分界線切成上下兩半 → 輸出 `gashapon/img/shell-{N,R,SR,SSR,UR}-{top,bottom}.webp`,寬 256px

### 上色(純 CSS,`reveal.js` 的步驟邏輯不動)

- 每個 `.capsule__half`:
  - `background: var(--half-a)`(沿用 `--r-X-a / --r-X-b` 上下兩色)
  - `mask-image: url(shell-X-top.webp)`(附 `-webkit-mask-image`)
  - `::after` 疊同一張灰階圖,`mix-blend-mode: multiply`:白處顯示稀有度色,外框與花紋的暗部保留
- 換殼靠現有的 `data-rarity` 屬性選擇器,`upgrade()` 改 `dataset.rarity` 時自動換圖
- UR:底色是 `--rainbow` + `hue-rotate` 動畫,花紋照樣疊上去
- 拿掉現在 border 畫的半圓與 `::after` 白色高光
- 10 張圖在頁面載入後預載

### 測試

- `RARITIES × {top, bottom}` 的 10 張圖都存在
- `style.css` 每個稀有度都有對應的 mask 規則

---

## 切片 ③ 揭曉卡片外框(`shared/`)

`border-image` 無法直接上色,能替九宮格做遮罩的 `mask-border` 只有 Safari 支援,所以**用 SVG 濾鏡上色**。

### 上色:`shared/js/tint.js`

- `colorToMatrix(hex)`:純函式,回傳 `feColorMatrix` 的 20 個數值,把灰階對應成「黑 → 黑、白 → 該色」(等同 multiply),alpha 原樣保留
- `mountTintFilters(meta)`:讀 `RARITY_META`,在 `<body>` 插入一個隱藏的 `<svg>`,裡面 5 個 `<filter id="tint-X">`
- UR 的 `color` 是哨兵值 `'rainbow'`,改用 `edge`(`#8B5CF6`),再由 CSS 疊 `hue-rotate` 動畫

### 生成(`gashapon.py frames`)

- 5 張 1024×1024 方形外框:灰階、白底、**中間鏤空**,四角有裝飾、四邊是樸素直線,越高階角越華麗
- 5 張共用**同一個切片比例:四角各佔 25%**,寫在提示詞與 CSS 裡,不逐張標
- `build-frames`:去背 → 轉灰階 → **四條邊的中段換成從中心那一欄/列重複出來的像素**(保證拉伸不變形)→ 輸出 `shared/img/frames/frame-{N,R,SR,SSR,UR}.webp`
- 退路(Q13):比較頁上看得出九宮格拉伸會壞 → 只生一款外框,5 個稀有度共用、只換色

### CSS:`shared/css/prize-frame.css`

- `.prize-frame::before`:`position: absolute; inset: 0; border-image: url(...) 25% / <寬度> stretch; filter: url(#tint-X)`。濾鏡只套在偽元素上,卡片裡的文字與按鈕不會被染
- `.prize-frame[data-rarity="X"]` 對應圖片與濾鏡
- 扭蛋機的 `.prize-card` 加上 `prize-frame` class,拿掉現在的虛線 `::before`
- **`gashapon3d/` 這次不改**

### 測試

- `colorToMatrix`:`#FFFFFF` → 單位矩陣、`#000000` → 全黑、`#5FD68A` 的係數正確
- `RARITIES` 每個都產生得出濾鏡(UR 走 `edge`)
- 5 張外框圖都存在

---

## 切片 ④ SVG 圖示(`shared/`)

- sprite:`shared/img/icons.svg`,`<symbol id="home|sound-on|sound-off|settings">`。頁面用 `<svg><use href="../shared/img/icons.svg#settings"/></svg>` 引用
- `stroke="currentColor"`、圓頭線帽、圓角轉折、平塗、無漸層
- 線條粗細用變數 `--icon-stroke`:**等切片 ① 接上後,在實際畫面量機台外框幾 px 再定**
- `home` 是圓頭「←」(維持原本的意思,不改成房子)
- 靜音改成換 symbol(`sound-off` = 喇叭 + 斜線),不再用 `.is-muted` 半透明
- **這次只換扭蛋機頁**,其他模式的 emoji 留給它們自己的 issue
- 驗收:圖示、機台、吉祥物放同一張截圖,**使用者點頭才算過**
- 測試:sprite 裡 4 個 `id` 都在;扭蛋機頁引用的 `id` 都存在於 sprite

---

## 切片 ⑤ 首頁扭蛋機卡片

- 不另外生機台,**直接用 `machine.webp` 合成**:z_image 只生一張 4:3 雪地背景(地上散落幾顆扭蛋,不畫機台),程式把機台貼在中間
- `home.py` 新增 `build-cards --only gashapon`,可以只輸出單張
- `test/home-images.test.js` 改成「有接上的卡片,圖要存在」
- 首頁卡片的 `.card__art` 換成插畫,版面照 issue #5 已定規格(4:3、撐滿卡片內緣)

---

### 首頁木牌(執行中加入)

- `home_prompts.json` 的 `sign` 改成冰雪版(積雪、冰柱、小雪花、不要冬青紅果),負面詞加 `christmas, holly, berries`
- 流程照舊:`home.py sign → review → pick sign <n> → build-sign`;`css/home.css` 的 `aspect-ratio` 與文字位置要照新圖重量(cd67b05 修過的那段)

---

## 收尾

- 更新 issue #5:改掉「本體維持 CSS」,範圍指向這份 spec
- README:立體扭蛋機已經有程式,改掉「規劃中」那句

## 驗收方式

- 每個切片做完都用**實際跑起來的頁面**截圖(筆電寬 1440×900、手機寬 390×844),跟使用者確認後才進下一片
- `node --test` 全綠
- 抽獎流程手動走一輪:點把手、按「轉!」、跳過、再抽一次、抽空、切到背景再切回來

## 不在這次範圍

- 空機畫面(Q14)
- `gashapon3d/` 的任何改動
- 其他模式的圖示
- 用手指拖著轉把手的手勢
