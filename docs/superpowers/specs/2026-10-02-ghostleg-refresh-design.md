# 阿彌陀籤改版(issue #3)— 設計

日期:2026-10-02 · 分支:`ghostleg-refresh` · 前置已完成:數量欄位修正(e3168f3)、三模式角落工具(ad26daf)

全部決定來自 2026-10-02 的 grill(使用者看實機 / 合成截圖後拍板),**不要再重問**。

## 確認過的模型(原文,不要改寫)

- **實體**:`Player { id, name, color, animal }`(animal ∈ `snowman / rabbit / penguin / reindeer / cat / dog`);`GhostPrize { id, name, count, tier }`(tier ∈ `plain / chest / deluxe`);`Slot { prizeId | null, name }`(null = 銘謝惠顧)
- **數量**:Setup 1:N Player、1:N GhostPrize;Player 1:1 animal(存在 Player,可重複);GhostPrize 1:1 tier(存在 prize);GhostPrize 1:N Slot(依 count 展開)
- **看到 vs 存下**:染色立牌 / 名牌 / 結果小圖都由 animal+color 或 tier 即時畫,不存圖;新增玩家自動配最少用的動物;舊資料照順序補動物、tier 補 plain;結果卡依等級排序只是顯示,不改存檔順序
- **三個最可能的錯(錯誤版本,看到就要警覺)**:
  - ❌「動物每局依車道 / 順序重新分配」—— 動物存在玩家身上,跟著人走
  - ❌「等級從 count 或清單順序推算」—— tier 是每個獎項手動選的欄位,預設 plain
  - ❌「銘謝惠顧是 tier = 雪球的獎項」—— 它是 `prizeId: null` 的空格,永遠是雪球,不能選

## 已定案的外觀

| 部分 | 定案 |
|---|---|
| 梯子底板 | 冰板:生成的冰面貼圖(z_image t2i,seed 11,見下方提示詞),雪邊外框 |
| 梯子的路 | 雪路:冰面上鼓起的白雪帶 + 深棕粗外框;寬度隨車道寬縮放 |
| 走過的軌跡 | 細緞帶疊在雪路上(比預覽的 0.13 粗),轉角圓角;橫槓上兩人的緞帶並排 |
| 玩家 | 桌遊立牌:2D 動物圖(billboard)+ 3D 小圓底座,底座也是玩家色 |
| 動物 | 雪人、兔子、企鵝、馴鹿、貓、狗;Q 版全身正面站姿,頭身比約 1:1;**輪廓線以內整隻染玩家色**(雪人也是),只有深棕線條 / 眼睛不變 |
| 名牌 | 只有名字(不要編號);玩家色底,字色依底色亮度白 / 深棕;超過 8 人時相鄰一高一低 |
| 獎品(這輪 2D) | 一般 = 素面冰盒(保留冰藍蝴蝶結,使用者明確允許);大獎 = 冰寶箱;頭獎 = 豪華發光冰寶箱;銘謝惠顧 = 雪球(比盒子小) |
| 獎品動態 | 開跑前在上空亂飛(左右繞、上下浮、晃動,不只上下);按開始後幅度收斂、飛到終點各格 |
| 結果卡 | 冰雪框 + 標題冰牌;每列 = 染色動物小立牌 → 名字 → 獎品小圖 → 獎項名稱;依等級排序;頭獎列微發光 |
| 空狀態 | 小冰板上只站一隻染色動物,旁邊一個空的虛線圓座;文案與「去加人」不變 |
| 鏡頭 | 開跑前拉近,冰板約佔畫面寬八成;開跑後的追蹤鏡頭不變 |
| 首頁卡片 | 這輪最後一步;只畫冰板 + 雪路梯子 + 獎品,不放角色 |
| 3D 獎品 | **不在這輪**;另開 issue(2D 轉 3D,接 #7) |

## 架構

### 1. 資料層(`ghostleg/js/ladder.js`、`store.js`)

- `ANIMALS = ['snowman','rabbit','penguin','reindeer','cat','dog']`;`pickAnimal(existing)` 回傳目前最少人用的(同票照清單順序)
- `createPlayer({ name, color, animal })`,`animal` 預設 `pickAnimal`
- `TIERS = ['plain','chest','deluxe']`;`createGhostPrize({ name, count, tier = 'plain' })`
- `bottomSlots` 展開時把 `tier` 帶進每一格;銘謝惠顧格沒有 `tier`
- `store.js` 正規化:`animal` 缺或不在 ANIMALS → `ANIMALS[i % 6]`;`tier` 缺或不在 TIERS → `'plain'`(跟現在補 `color` 同一處)
- `sortResults(results)`:頭獎(deluxe)→ 大獎(chest)→ 一般(plain)→ 銘謝惠顧,同級照設定順序;只給結果卡用

### 2. 素材(`tools/mascot-gen/ghostleg.py` + `ghostleg_prompts.json` → `ghostleg/img/`)

- 指令照 `ichiban.py`:`gen <name>` → `review` → `pick <name> <n>` → `build`
- 動物:`comfy.graph_edit`(Qwen-Image 2.1),參考圖 `shared/img/mascot/key/idle.webp`,每隻 3 張,綠幕;提示詞要寫白身體、深棕粗外框、Q 版全身正面、`mouths closed, not talking`
- 已挑好的原圖(本機、gitignored):`tools/mascot-gen/out/ghostleg/picked/` 的 `prize-plain|chest|deluxe|snow.png`、`board-ice.png`;`build` 負責去背(白底 / 綠幕)、裁切、WebP
- 輸出:`ghostleg/img/animals/<animal>.webp`(~256px 高)、`ghostleg/img/prizes/<plain|chest|deluxe|snow>.webp`(~256px)、`ghostleg/img/board.webp`;每張幾十 KB 內
- 網址一律帶 `?v=<內容雜湊 8 碼>`;`gashapon.py write_preload_manifest()` 加入阿彌陀籤的圖,`test/preload-manifest.test.js` 跟著改;頁內啟動時先 warm-up 全部素材
- **染色**(`ghostleg/js/tint.js`):canvas 上畫白身體圖 → `multiply` 填玩家色 → `destination-in` 用原圖 alpha 剪回輪廓;以 `animal|color` 為鍵快取;設定小圖、結果卡、空狀態、立牌共用
- 動物挑好之前,場景用程式畫的白色圓頭小人當暫代,一樣走 tint

### 3. 場景(`ghostleg/js/`,`track.js` 拆分)

- `board.js`:冰板平面(`board.webp`,依車道數 × 列數算尺寸);雪路 = 每段梯線兩層方塊(深棕外框底層 + 白雪頂,側面淡藍),寬 = `laneWidth × 0.3`
- `ribbon.js`(純函式):`(route, dist) → geometry`;寬約 `laneWidth × 0.17`,轉角圓弧;水平段依前進方向偏移(往右偏前、往左偏後),橫槓上兩人並排;只畫到已走的距離
- `standee.js`:染色動物 billboard + 玩家色小圓座(外圈深棕);名牌獨立 billboard,`textColorFor(bg)` 依亮度選白 / 深棕,`lanes > 8` 時相鄰交錯高度
- `prize-art.js`:依 slot 的 tier 選圖,雪球縮到約 0.7;亂飛 = 每個獎品自己的頻率組合(x 繞、y 浮、輕晃),幅度 = `1 − 飛向終點的進度`;閒置時需要持續 rAF 迴圈,分頁隱藏時停
- `camera-script.js`:開跑前鏡頭依冰板寬度算距離,冰板佔畫面寬 ~80%(直式 / 橫式各算);開跑後不變
- `track.js`:組裝上面幾個模組,對 `main.js` 的介面(`build / setProgress / setPrizeFly / resize / render / dispose`)不變;維持「平塗、不打光」

### 4. UI(`ghostleg/index.html`、`main.js`、`ghostleg.css`)

- 「誰要抽」每列:色點 → 動物小圖(染色)→ 名字 → 刪;點動物在該列下方展開 6 隻(染成該玩家色),點一隻即換並收起,點外面也收起
- 「抽什麼」每列:盒子小圖 → 名稱 → 數量 → 刪;點盒子展開三選一,附文字「一般 / 大獎 / 頭獎」
- 選擇器都是 `<button>` + `aria-label`(例:「小紅的動物:兔子」),點擊區 ≥ 44px;390 寬時列不能撐出對話框(e3168f3 的版面要維持)
- 結果卡:冰雪框沿用 `shared/css/prize-frame.css` 的語彙;依 `sortResults`;頭獎列 CSS 光暈;40 人時清單捲動,「再跑一次」固定在下
- 空狀態:取代 🪜

### 5. 首頁卡片(最後一步)

`home.py cards --only ghostleg` → `review` → `pick ghostleg <n>`;`build-cards` 先改成可以只輸出一張;`test/home-images.test.js` 一起改。

## 停下來給使用者看的點

1. 資料層 + 設定選擇器(暫代動物)
2. 場景:冰板、雪路、緞帶、立牌、名牌、鏡頭
3. 6 隻動物生成 → **等使用者挑**
4. 獎品圖 + 亂飛、結果卡、空狀態
5. 首頁插畫候選 → **等使用者挑**

每個點都要:390 與 1440 截圖(390 用 iframe 包)、動畫用假時鐘逐格錄成影片(claude-in-chrome 背景分頁 rAF 不跑)、6 人與 40 人各看一次、`node --test` 全過、新圖確認在預載清單。

## 測試

- `ladder`:`pickAnimal` 挑最少的;`createPlayer` / `createGhostPrize` 預設值;`bottomSlots` 帶 tier、銘謝惠顧格沒有 tier;`sortResults` 順序
- `store`:舊資料補 animal / tier、不合法值修正;換車道 / 重新洗牌後 animal 不變
- `ribbon`:轉角圓弧、橫槓兩人分兩側、只畫到 dist
- `standee`:`textColorFor` 深底白字、淺底深棕字
- `board`:雪路寬度隨 laneWidth 縮放
- `camera-script`:開跑前冰板佔寬 ~80%
- 素材:引用的圖都存在、網址帶雜湊、在 preload.json 裡

## 不做

- 3D 獎品(另開 issue)
- 動物以外的角色、吉祥物入鏡首頁插畫
- 音效改動

## 生成紀錄(已挑定的素材)

- 共用畫風:`flat 2D cartoon game item icon, cute chibi style, flat colors, thick dark brown outlines, magical frozen winter theme, icy blue lavender and white palette, clean simple shapes, single object centered, seen from the front and slightly above in three-quarter view, isolated on a plain pure white background, no text`;z_image_turbo 1024²
- 一般 seed 7 / 大獎 seed 7 / 頭獎 seed 7 / 雪球 seed 77(完整提示詞在 `tools/mascot-gen/out/ghostleg/picked/tiers.py`、`snow.py`、`board_gen.py`;寫進 `ghostleg_prompts.json` 之後以該檔為準)
- 冰板:`flat 2D cartoon game texture, top-down view …`,`a long rectangular slab of smooth frozen lake ice seen from directly above …`,768×1344,seed 11
