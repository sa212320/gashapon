# 從單一扭蛋機擴成四模式小網站

2026-09-22

## Context

現有的 repo 只有一台 2D 扭蛋機,已經上線在 GitHub Pages 根目錄。使用者希望把 gachago.net
上的另外幾個工具也做出來:3D 扭蛋機、一番賞、爬格子(實際上是阿彌陀籤 / 鬼腳圖)、大亂鬥。

使用對象仍然是**國小生**:外觀可愛、動畫有份量、小孩自己也會進設定改內容。
條件不變:**不用後端、純靜態、零建置、放 GitHub Pages**。

## 已封閉的決策(grill 階段確定,實作時不得重新討論)

| 決策 | 結論 |
|---|---|
| 網站結構 | 同一個 repo。**根網址變成首頁**(五張卡),現有 `…/gashapon/` 連結會變成首頁 |
| 清單共用 | 四個模式**各自維護**自己的清單,不共用名單 |
| 3D 扭蛋機 | 要做,引 three.js 走 CDN + importmap,維持零建置 |
| 交付方式 | 四個**全部做完再一次交**,不是一個一個上線 |
| 一番賞 | 賞別是自己的欄位、固定 A~G 七級、**沒有稀有度**、要有「最後一抽賞」、固定抽到就消耗(無開關) |
| 阿彌陀籤 | 獎項**也有數量**,總數不足自動補「銘謝惠顧」空籤;揭曉是全部一起像賽跑、有快有慢、有動畫 |
| 大亂鬥 | **真物理 + 道具**(攻擊 / 速度 / 極巨化 / 場地轟炸 四種;不做補血與排斥場) |
| 大亂鬥分隊 | `Fighter` 的 `count` 就是隊伍人數;同隊不互相擊飛;最後還有人活著的隊獲勝 |
| 3D 獎項欄位 | 名字 + 數量 + 稀有度,但**蛋色每顆隨機** |
| 多組設定 | 四個模式一致,每個都有 `setups[] + activeSetupId`,切換入口在各自設定面板 |
| 儲存 | `soundOn` 全域共用一份、獨立 key;每個模式一個獨立 key |
| 既有 2D | 五階稀有度、機率只看 count、升階演出、localStorage + persist、無主題色、只有文字、不做紀錄 —— **全部維持不變** |
| 架構 | 共用核心 + 每模式一個資料夾 |

## 確認過的 Model(權威來源;實作若與此牴觸,是設計的 bug —— 停下來反映,不要就地改模型)

### Entities

- `AppPrefs { soundOn }` —— 全域,獨立 storage key
- 每個模式都有 `setups[]` 與 `activeSetupId`
- 扭蛋機 2D:`Prize { id, name, count, rarity }` → `Capsule { prizeId, drawn }`
- 扭蛋機 3D:`Prize { id, name, count, rarity }` → `Capsule { prizeId, drawn, color }`
- 一番賞:`IchibanPrize { id, name, tier(A~G), count }` + `lastOnePrize` → `Ticket { prizeId, drawn }`
- 阿彌陀籤:`Player { id, name, color }` + `GhostPrize { id, name, count }` → `Ladder`(每局現場產生,不存)
- 大亂鬥:`Fighter { id, name, color, count }` + `items{attack,speed,giant,bomb}` → `Combatant { fighterId, alive }`(不存)

### Cardinality

- `Prize` 1:N `Capsule`、`IchibanPrize` 1:N `Ticket`、`GhostPrize` 1:N 底部格子、
  `Fighter` 1:N `Combatant` —— **全部由 `count` 決定,同一個形狀**
- `Player` 1:1 梯子上的一條線
- **`Fighter` 就是隊伍**,`count` 就是隊伍人數。同 `fighterId` 的 `Combatant` 不互相擊飛,
  最後還有人活著的 `fighterId` 獲勝

### Seen vs stored

- 3D 看到球體裡五顏六色的蛋 → **顏色是每顆蛋自己隨機挑的**,跟獎項、跟稀有度都無關;
  稀有度只決定翻開時的演出等級
- 一番賞看到「A賞 PVC模型」→ 存的是 `tier: 'A'` 欄位,**不是名字前綴**
- 阿彌陀籤看到大家像賽跑有快有慢 → **誰拿到什麼在起跑前梯子就決定好了**,快慢純粹是演出
- 阿彌陀籤底部有 6 格但只設了 4 個獎 → 補的「銘謝惠顧」空籤是**算出來的**,不存進設定
- 大亂鬥是**唯一**結果不預先決定的模式

### 最可能做錯的四個(以下四句都是錯的)

1. 「一番賞的賞別就是稀有度」 —— 兩個是不同欄位。**一番賞沒有稀有度,扭蛋機沒有賞別**
2. 「大亂鬥的隊伍是一個獨立實體」 —— 沒有 `Team` 這種東西,隊伍就是同一筆 `Fighter`
3. 「3D 扭蛋機的蛋色由稀有度決定」 —— 只有 2D 那台是。3D 每顆蛋隨機上色
4. 「阿彌陀籤誰先跑到終點誰拿頭獎」 —— 名次跟獎項完全無關

## 檔案結構

```
/
  index.html                     首頁:五張卡
  shared/
    css/tokens.css               配色、按鈕、對話框、卡片
    js/storage.js                泛用 load/save/容錯/debounce/persist(帶 key 與 sanitizer)
    js/prefs.js                  AppPrefs { soundOn },獨立 key
    js/roster.js                 count→個體展開、needsRebuild、setups 增刪改切換
    js/sound.js                  現有,搬過來
    js/ask.js                    現有,搬過來
    js/dialog.js                 設定對話框骨殼:分頁、取消/確定、dirty 確認、設定組下拉
  gashapon/     index.html + js/ + css/     2D(現有程式搬進來,邏輯不動)
  gashapon3d/   index.html + js/ + css/
  ichiban/      index.html + js/ + css/
  ghostleg/     index.html + js/ + css/
  smash/        index.html + js/ + css/
  test/
  check.html                     現有的裝置診斷頁,保留在根目錄
```

無框架、無打包。three.js 只在 `gashapon3d/index.html` 以 importmap 從 CDN 載入。

## 共用層

### `shared/js/roster.js`

五個模式的「設定 → 個體」是同一個形狀,所以抽成共用:

- `expand(entries, makeItem)` → 依 `count` 展開成個體陣列
- `needsRebuild(before, after)` → 只比對 id 與 count。**改名字、改稀有度、改賞別、改顏色都不重建**,
  不能沒收使用者的進度
- `entriesChanged(before, after)` → 比對全部欄位,給「按確定時要不要做事」用
- `countOf(entries)` → 所有 count 的總和
- `remaining(items)` → `items.filter(i => !i.drawn).length`
- setups 的 `createSetupList` / `addSetup` / `removeSetup` / `getActive` / `replaceSetup`

**`refill` 不放在共用層**:每個模式展開出來的個體形狀不同(`Capsule` 有 `color`、`Ticket` 沒有),
重建需要各自的 `makeItem`,硬抽成共用只會多一層轉接。各模式自己提供 `refillSetup`。

**沒有 `rename`**:改名字就是在設定的「其他」分頁編輯 `setup.name`,按確定時走 `replaceSetup`,
不需要獨立的函式。

3D 的隨機蛋色實作在該模式自己的 `makeItem` 裡 —— 結構上就不可能污染 `Prize`,
model 第 3 條由此被保護。

### `shared/js/storage.js`

現有 `storage.js` 泛用化:`createStore({ key, schema, sanitize, seed })` 回傳 `load` / `save` /
`debouncedSave`。容錯原則不變:讀進來一律當不可信,壞掉就回種子資料,絕不白屏。

### `shared/js/prefs.js`

`soundOn` 從 `gashapon.v1` 搬到全域 `prefs.v1`,做一次性讀取遷移(讀舊的、寫新的,舊欄位留著不管)。

### `shared/js/dialog.js`

設定對話框的殼:分頁切換、底部取消/確定、開啟時對內容拍快照、按確定時 dirty 比對並在需要時跳確認、
頂部的設定組下拉(切換 / 新增 / 刪除)。各模式只提供自己的分頁內容。

## 各模式

### 扭蛋機 2D(`/gashapon/`)

現有程式搬進來,改為引用共用層。**邏輯完全不動**,測試必須全綠。

### 扭蛋機 3D(`/gashapon3d/`)

three.js 場景:透明球體容器、數十顆隨機色蛋、把手。轉把手 → 一顆滾到出口 → 鏡頭推近 →
裂開 → 依稀有度播演出。**不引物理引擎**,球形容器內的簡化碰撞自己寫。
沿用 `buildRevealSteps` 的腳本概念:抽獎當下決定結果,演出只是重播。

### 一番賞(`/ichiban/`)

DOM 實作。一疊隨機旋轉、隨機位置的籤紙鋪在桌上,點一張翻開。`tier` 決定籤紙顏色與翻開的演出等級,
A 賞最盛大。抽走最後一張時,若 `lastOnePrize` 非空,額外跳出最後一抽賞。
固定抽到就消耗,沒有開關。`lastOnePrize` **只有名字,沒有賞別** —— 它是整箱抽完的額外獎,不屬於 A~G 任何一級。

### 阿彌陀籤(`/ghostleg/`)

SVG 畫梯子。流程:

1. 依 `players.length` 決定直線數量
2. 底部格子 = `expand(prizes)`。**底部格子數恆等於 `players.length`**:
   不足時在尾端補「銘謝惠顧」;超過時只取前 `players.length` 個,設定面板顯示提示告知有幾個用不到
3. 隨機生成橫線
4. **純函式 `walk(ladder, startIndex) → endIndex`** 算出每個 player 的終點 —— 這是核心演算法,必測
5. 所有人同時沿線跑,每個人速度各自隨機。快慢**純粹是演出**,結果第 4 步就定了
6. 全部到齊後列出配對結果

### 大亂鬥(`/smash/`)

canvas 2D,自寫物理。圓形剛體、彈性碰撞、出界淘汰。四種道具由設定開關:

- `attack` 提升擊飛力
- `speed` 提升移動速度
- `giant` 變大、抗擊飛
- `bomb` 場地隨機落下炸彈

碰撞的處理分兩種,這是「同隊不互相擊飛」的具體定義:

- **同 `fighterId`**:只做位置分離(把重疊的兩個推開到剛好不重疊),**不施加任何額外衝量**
- **不同 `fighterId`**:位置分離之外,再依相對速度與道具加成施加擊飛衝量

場上只剩一個 `fighterId` 還有存活者時,該隊獲勝。**唯一有 game loop、唯一結果不預先決定的模式。**

## 我自己補的假設(grill 沒問到,實作前若有疑義請先提出)

1. **3D 扭蛋機沿用 2D 的全部規則**,包含「抽到的移出池子」開關、抽光時的空機畫面、
   編輯後只有 count 或項目增減才重建池子。兩台的差別只在渲染方式與蛋色來源。
2. **`Player.color` 與 `Fighter.color` 由系統自動指派** —— 新增時從一組預設色裡挑一個還沒被用掉的,
   使用者只填名字。顏色仍然存進設定(這樣重開才不會換色),但設定面板不提供調色盤。
3. 首頁是**五張卡**,不是四張:2D 扭蛋機也是其中一張。
   grill 當時說「四張」是在 3D 扭蛋機加進範圍之前。

## 驗證

### 自動測試(零依賴,不需 npm install)

```bash
cd /Users/willian/github/gashapon && node --test
```

必過的關鍵斷言:

- 現有 2D 扭蛋機的 45 個測試搬家後**全部仍然通過**
- `roster.expand` 依 count 展開;count 為 0 不產生個體
- `roster.needsRebuild`:改名字 / 改稀有度 / 改賞別 / 改顏色 → false;改 count 或增刪項目 → true
- 一番賞:`tier` 排序為 A→G;抽到最後一張才觸發最後一抽賞;`lastOnePrize` 為空字串時不觸發
- **阿彌陀籤 `walk()`**:給定固定的橫線集合,每個起點的終點正確;
  **不同起點的終點必定互不相同**(這是阿彌陀籤的數學性質,也是「名次跟獎項無關」的護欄);
  獎項總數不足時補足空籤且底部格子數恆等於玩家數
- 大亂鬥:同 `fighterId` 之間的碰撞不產生擊飛;只剩一個 fighterId 有存活者時判定該隊獲勝
- `prefs` 遷移:舊的 `gashapon.v1` 有 `soundOn: false` 時,新的 `prefs.v1` 讀出來是 false

### 手動驗證(自動化瀏覽器驗不到)

```bash
cd /Users/willian/github/gashapon && python3 -m http.server 8000
```

- 首頁五張卡都能點進去、都能返回
- 3D 扭蛋機:蛋在球體裡滾動、鏡頭推近、裂開;**蛋的顏色跟抽到什麼無關**(連抽數次確認不會暴雷)
- 一番賞:籤紙翻開的手感、A 賞的演出夠盛大、最後一抽賞會跳
- 阿彌陀籤:賽跑的快慢感、線走得清楚、結果列表正確
- 大亂鬥:物理手感、四種道具的效果、同隊真的不互相擊飛
- 每個模式重新整理後設定與進度都還在
- 手機實機各開一次,確認按鈕夠大、3D 與物理不掉格

**已知驗不到的範圍:** 自動化瀏覽器的分頁是背景狀態、rAF 為 0 fps,
3D 場景與物理模擬的實際觀感一律無法在開發過程中驗證,只能驗邏輯與狀態。
Safari / WebKit 與真實行動裝置同樣沒有自動化覆蓋。
