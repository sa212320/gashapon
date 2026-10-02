# 一番賞票卡美術 設計(issue #2)

## Context

一番賞(`ichiban/`)桌上是一顆顆直立的 DOM 小卡(`.ticket`,64×92,粉彩色塊 + 白色虛線框);點一張後,橫式齒孔票卡(`card-art.js` 的 `drawFace` / `drawPrize`,canvas 1020×450,34:15)飛到中央,由 `curl.js`(three.js)捲起撕開。蓋著那面是 `DESK_COLORS` 的裝飾色 + 半透明白色票卡形;獎項那面是色帶 + 深色卡身 + 白字「A賞」與獎品名。

現況兩個問題在 grill 時查到:
- **點哪張跟抽到什麼無關**:`drawTicket` 從剩下的籤隨機標一張 drawn,不一定是點的那張;`setup.tickets` 依獎項順序排(沒洗牌)。
- **桌面每次重畫都依「剩下的第幾張」算顏色與歪斜**,抽一張全桌換色換位。

這次:票卡兩面的美術 + 號碼 + 桌面改成一張 canvas 並自動縮放。零建置仍是硬性條件;`tools/mascot-gen/` 產出的圖直接 commit。

---

## 已封閉的決策(grill + 設計階段,實作時不得重新討論)

| # | 決策 | 結論 |
|---|---|---|
| 1 | 大小卡 | 桌上小卡與大卡**長一樣、只是比例**:同一個齒孔票卡輪廓,桌上轉 90° 直放;同一支 `drawFace` 畫。點起來飛到中央時轉回橫的放大,撕開 3D 效果不變 |
| 1b | 直放時的號碼與頭(設計階段) | 輪廓、紋樣跟著轉;**號碼圈與角色頭保持正立**。直卡:號碼在上、頭在下;橫卡:號碼在左、頭在右 |
| 1c | 輪廓(實作中,使用者看實機後改) | 原本「上下方齒 + 左側半圓耳」直放像梳子 → 改成**圓角長方形 + 上下兩條長邊各一排半圓撕線孔**(選項 D,像真的一番賞籤券)。大卡、小卡、撕開、獎項面一起換;獎項面色帶改成「賞別色帶 → 細白線 → 深色卡身」 |
| 4b | 雪花紋(實作中,使用者:太規則了) | 依號碼固定隨機散佈(每格一朵隨機偏移,大小 / 角度 / 深淺不同,夾小圓點);同一張永遠一樣、不同張不同 |
| 4c | 紙紋(實作中,使用者看候選後) | **拿掉紙紋**:縮到桌上小卡完全看不出來,加強 3 倍又顯得灰髒。紙感靠撕線孔、霧面平塗、白色印刷雪花與撕開捲紙。ComfyUI 只生兩顆角色頭(選定狐狸 s2、白鼬 s1) |
| 11 | 「抽完了」畫面(範圍追加,使用者要求) | 🎉 換成 ComfyUI 插圖(空籤盒 + 散落撕開的冷色籤,選定 s1),底色從舊奶油色改成冰雪半透明白 `rgba(238,246,255,.9)`;`ichiban/img/empty.webp` 進首頁預載(manifest 也掃 `ichiban/index.html` 的 `<img>`) |
| 1d | 桌上小卡方向(使用者更正) | **取代 1 / 1b 的「直放」**:使用者原意是小卡也橫的、跟大卡一模一樣只差大小。`drawFace` 不再有 orientation;桌上卡 62×27 ~ 96×42(MIN/MAX_CARD_W 62/96,CARD_ASPECT 15/34),拿起來只轉正 tilt |
| 12 | 號碼樣式(使用者選 B) | 白色印刷大數字、沒有圓圈(原本白圓圈 + 粗棕框太重,跟籤不搭) |
| 5b | 印刷一律白色(使用者) | 冰白 `#EEF3FA` 太淺、白色印刷看不見 → 改成冰河藍 `#8FB3E8`;測試保證每個底色亮度 < 0.88 |
| 2 | 號碼 | ticket 存固定 `no`(`buildTickets` 時 1..N);抽走後其他**往前補位不留空位**,號碼不重編;補籤 / 改獎項重建時重編。號碼**只印在背面**,獎項面不印 |
| 3 | 點哪張抽哪張 | 撕開時從剩下的籤隨機挑一張與被點的那張**互換 `prizeId`**,再標被點的 drawn。每張機會均等、各獎機率不變 |
| 4 | 紙不是冰 | 背面只做 **1 款版型**:霧面紙(灰階紙纖維貼圖 multiply,ComfyUI 生成)+ **白色印刷**雪花紋 / 虛線框(程式畫)+ 白底深棕框號碼圈。不做透明、亮面、立體冰晶材質 —— 撕開動畫是紙 |
| 5 | 底色 | `DESK_COLORS` 改**冷色系 7 色**(使用者選 C:`#B9D8F2 #CBBDEB #A9E3E0 #D9E8F7 #BFC9F2 #C7E9D8 #E2D3F2`)。實作時在冷色範圍內把太接近的(第 1 / 8 號淺藍、第 4 號偏白)拉開,7 色並排截圖給使用者確認。顏色的用途是讓相鄰卡一眼分得出不同張 |
| 6 | 角色頭 | 狐狸頭、白鼬頭兩款(**不要 logo**)。簡單正面 Q 版頭,**白色印章風**(填白、眼鼻耳內側鏤空露底色),不做貼紙版。ComfyUI 生成各 3 版,畫在卡上給使用者挑;`mouths closed`。哪隻由 `no` 的固定偽隨機決定(同現有 `pseudoRandom` 的 sine hash) |
| 7 | 桌面 | 依張數**自動縮放一次顯示全部**,最小約 28px 寬(手機約 80 張內不用滑),超過才捲動。歪斜保留但小幅,避免互疊 |
| 7b | 桌面畫法(設計階段) | **整個桌面一張 canvas**(使用者選 C),大小 = 桌面可見區域,最大就是一個螢幕;**只畫可見範圍內的卡**,捲動時重畫。每張卡上面疊一顆**透明 `<button>`**(在可捲動的內容層,撐出捲動高度),負責點擊、焦點、`aria-label="抽 7 號籤"`、飛出起點 |
| 7c | 排法(設計階段) | 格狀(選項 1)。3D 堆 / 籤筒會推翻號碼決策,**另開 issue**,不在這次 |
| 8 | 獎項面 | 保留結構(上方賞別色帶 + 深色卡身)。文字「A賞」換成**徽章**:7 賞**同一個版型**(冰晶外框圓章,程式畫,外框染 `TIER_META` 色,中間大字母),右側白字獎品名(最長 20 字,過長縮字級)。**不分等級華麗度**(真一番賞都長一樣,等級感交給現有撕開演出的 `level`)。全部程式畫,只疊共用紙紋。花邊太陽春之後再考慮 ComfyUI 線稿 |
| 9 | 最後一抽賞 | 同版型金色底 + 雪花紋,號碼位置放 🌟,狐狸 + 白鼬兩顆頭並排;獎項面徽章金色 + 🌟。**做出來看效果再調** |
| 10 | 工具 | ComfyUI 只用在:**灰階紙紋 1 張、白章角色頭 2 顆**。Blender 不用 |

共同規則(issue 內文):功能色由程式上色、純裝飾直接彩色;跟吉祥物同畫風;綠幕去背;換素材網址帶內容雜湊;候選一律放進真實情境截圖給使用者看(使用者用手機看)。

---

## 模型(grill 確認,原文帶入 plan;實作與此矛盾 = plan bug,停下回報)

- **實體**:`ticket { no, prizeId, drawn }`(`no` 新增);`drawFace({ color, no, critter, orientation, w, h })` 大小卡共用;`critter ∈ { fox, ermine }`(最後一抽賞 `both`);`DESK_COLORS` 7 冷色。
- **對應**:setup 1:N ticket;ticket 1:1 `no`(重建時重編);color / critter / tilt 都由 `no` 推算,**不存**。
- **看到 vs 存的**:只存 `no` / `prizeId` / `drawn`;外觀全在繪製時推算。點 7 號撕開 → 隨機挑一張剩下的與 7 號互換 `prizeId` → 標 7 號 drawn;存的 `prizeId` 在撕開前沒有意義。舊 localStorage 沒 `no` → 讀取時依陣列順序補。
- **最可能的錯(以下都是錯誤版本)**:
  1. color / critter / tilt 依「剩下的第幾張」算 —— 錯,依固定 `no`,否則補位時變臉
  2. 桌上小卡另外用 CSS 畫一份 —— 錯,是同一支 `drawFace`,`orientation: 'portrait'`
  3. 獎項面印號碼 / 角色,或 A 賞徽章比較華麗 —— 錯,獎項面只有共用徽章版型 + 字母 + 賞別色 + 獎品名

---

## 設計

### 1. 資料與抽籤(`ichiban.js`、`store.js`、`main.js`)

- `buildTickets(prizes)` → `{ no: i + 1, prizeId, drawn: false }`。`refillSetup` 與改獎項重建都走它,所以重編。
- `store.js` `sanitizeSetup`:ticket 沒有 `no`、`no` 不是正整數、或有重複 → 整組依陣列順序補 / 重編 `i + 1`。`prizeId` / `drawn` 的既有檢查不變。schema 不升版(補欄位是相容的)。
- `drawTicket(setup, rng, pickedNo)`:
  1. 候選 = 未抽的 index;隨機挑 j
  2. 若有 `pickedNo` 且它在候選內:把 j 與 `pickedNo` 那張的 `prizeId` 互換,標 `pickedNo` 那張 drawn
  3. 沒傳 `pickedNo`(或不在候選內)→ 維持現行為(標 j)
  4. 回傳的 `ticket` / `prize` 是互換後被點那張的;`isLastOne` / `lastOnePrize` 邏輯不變
- `main.js` `doDraw`:從按鈕讀 `no`(`dataset.no`),傳給 `drawTicket`;`faceColor` 改由 `no` 推算(不讀 `dataset.color`)。取消仍不改 state。
- 推算函式放在新檔 `ichiban/js/desk-layout.js`(純函式,與 `layoutDesk` 同檔):`faceColorFor(no) = DESK_COLORS[(no - 1) % 7]`、`critterFor(no)`(sine hash < .5 → fox)、`tiltFor(no)`(小幅,約 ±4°)。

### 2. 繪圖(`card-art.js`)

- `drawFace(ctx, { color, no, critter, orientation = 'landscape', w = CARD_W, h = CARD_H })`
  - `portrait`:座標系轉 90° 畫輪廓與紋樣,畫進 w×h
  - 順序:齒孔輪廓填底色 → 紙紋 multiply → 白色雪花印刷紋與虛線框 → 號碼圈(白底深棕框,正立)→ 白章角色頭(正立)
  - 排位:橫 = 號碼左、頭右;直 = 號碼上、頭下
  - 最後一抽賞:`no: '★'`(畫 🌟)、`critter: 'both'`、金色底
  - 線寬、字級依卡片短邊等比例,28px 寬仍可讀
  - 不透明:底下的獎項不能透出來(現有規則)
- `drawPrize(ctx, { color, letter, name, bonus })`:色帶結構保留;左側徽章(冰晶外框圓章,外框賞別色,中間大字母;bonus 金色 + 🌟);右側白字名稱,量字寬過長縮字級;疊同一張紙紋。`badge` 文字參數改成 `letter`(呼叫端 `ui.js` 與 `curl.js` 一起改;螢幕閱讀器文字 `cardBadge` 仍用 `meta.label`)。
- 印章頭:生成「白底黑色印章圖」,由工具在 build 時烘成「白色 + alpha」webp(同扭蛋殼花紋的做法),執行時直接 `drawImage`。
- `loadCardArt()`:預載紙紋與兩顆頭,回傳 promise;未就緒時 `drawFace` / `drawPrize` 畫沒有紙紋與頭的版本;就緒後通知桌面與大卡重畫。
- `curl.js`:只改 `setCard` 傳的參數(`faceColor` → `drawFace` 的 `{ color, no, critter }`),捲曲與紙背(底色壓深平塗)不動。沒有 WebGL 的退路 `drawStatic` 一樣走 `drawPrize`。

### 3. 桌面(`ui.js` `createDeskView`、`ichiban.css`)

- 結構:`.desk`(可捲動)內放 `.pile`(透明按鈕的格狀容器,撐出高度)+ 一張 `position: sticky` 的 `<canvas>` 鋪滿桌面可見區域、墊在按鈕底下。
- 版面計算純函式 `layoutDesk({ count, width, height })` → `{ cardW, cardH, cols, gap }`:在可見區域內找能一次放下 `count` 張的最大卡寬,下限約 28px;下限時超過的部分捲動。卡片比例 = 齒孔票卡直放(15:34)。
- 畫:只畫與可見範圍相交的卡;`scroll`(rAF 節流)、`ResizeObserver`、render、`loadCardArt` 就緒時重畫。canvas 尺寸 = 可見區域 × `devicePixelRatio`,不隨張數變高。
- 按鈕:`data-no`、`aria-label="抽 N 號籤"`、套 `tiltFor(no)` 的 transform(與 canvas 上同角度)。飛出起點用按鈕 `getBoundingClientRect()`。
- 拿起演出:`.tear` 起始 `rotate(90deg + tilt)`、縮放比例由起點按鈕大小算(取代固定 `scale(.4)`),落定 `rotate(0)`;取消時反向飛回。

### 4. 素材(`tools/mascot-gen/`)

- 新增 `ichiban.py` + `ichiban_prompts.json`(照 `gashapon.py` 寫法):
  - 紙紋:z_image t2i 一張 1024×448 灰階霧面紙纖維,整張拉伸鋪滿票卡(不需無縫拼接),壓淡後存 webp
  - 角色頭:狐狸 / 白鼬各 3 版,正面 Q 版粗輪廓、`mouths closed`、綠幕;每角色固定 seed;去背後轉印章 mask
- 候選畫在冷色卡上(小卡 + 大卡)截圖給使用者挑,挑完才接進程式
- 輸出到 `ichiban/img/`,網址帶 `?v=<sha1>`;加進首頁 `gashapon/img/preload.json`(`write_preload_manifest()`)+ 一番賞頁啟動時 `loadCardArt()` 預熱

### 5. 驗證

- 真實頁面,手機 390 與桌機 1440:桌面 20 / 80 / 150 張(捲動)、拿起、撕開、獎項面、最後一抽賞
- 撕開 3D 效果正常;無 WebGL 靜態退路正常
- 7 色並排、角色候選、成品都截圖給使用者;HTML 被 Pages 快取 10 分鐘,實機驗證前提醒

### 6. 自動測試(`node --test`)

- `drawTicket` 帶 `pickedNo`:被點那張一定 drawn;大量抽樣後各獎分布與 count 成比例;不帶 `pickedNo` 行為不變;抽光回 null、最後一抽賞觸發不變
- `buildTickets` 給 1..N;`sanitizeSetup` 補 / 重編 `no`
- 補位後 `faceColorFor` / `critterFor` / `tiltFor` 只看 `no`
- `drawFace` / `drawPrize` 在假 2D context 上不丟錯,portrait / landscape 都畫號碼;未載入素材時也不丟錯
- `layoutDesk`:28px 下限、剛好填滿、0 張
- `preload-manifest.test.js` 更新

---

## 不在範圍

- 3D 籤堆 / 籤筒(另開 issue)
- 撕開捲曲邏輯、演出 level 規則、音效
- 其他模式(#3、#4)
