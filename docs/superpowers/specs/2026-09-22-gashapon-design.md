# 扭蛋機(gashapon)設計文件

2026-09-22

## 問題

原本用 gachago.net 的 Gashapon2D 當抽獎工具,設定「過一段時間就會不見」。
實測發現 gachago **有**寫 `localStorage`(key `gashapon_2d_settings`),所以問題不是沒存,
而是 localStorage 本來就會被瀏覽器清掉:Safari/iOS 的 ITP 7 天驅逐、Chrome 空間壓力驅逐、
使用者清除瀏覽資料。

## 目標

一個純靜態頁面(GitHub Pages,無後端),給**國小生**使用:外觀可愛、動畫有份量、
有 N/R/SR/SSR/UR 五階稀有度,高階有更長的升階演出。小孩自己也會進設定改獎項。

## 已封閉的決策

| 決策 | 結論 |
|---|---|
| 儲存 | 只用 `localStorage` + `navigator.storage.persist()`。網址保持乾淨。使用者已知並接受「清資料 / Safari 7 天 / 換裝置就沒了」的風險 |
| 多機台 | 支援多台,切換入口在設定面板裡,開頁面載入上次那台 |
| 稀有度 | 固定 5 階 `N R SR SSR UR` → 白 / 綠 / 紫 / 金 / 彩虹 |
| 稀有度 vs 機率 | 完全無關。機率只由 `count` 決定 |
| 揭曉方式 | 分段升階。搖一次升一階,升到目標階才裂開 |
| 動畫 | SVG + CSS + Web Animations API 手刻,不用 Lottie、不引入動畫函式庫 |
| 音效 | Web Audio 即時合成,零音檔,設定面板有開關 |
| 連抽 | 不做十連。單抽 + 「再抽一次」+ 演出可點擊跳過 |
| 抽獎紀錄 | 不做 |
| 獎項外觀 | 只有文字 |
| 主題色 | 不做 |
| 編輯 UI | 逐項卡片式 |
| 編輯後行為 | 只有 prizes 真的變動才重建 pool,並先跳確認 |
| 抽光時 | 「扭蛋機空了!」+ 一鍵裝滿 |
| 技術棧 | 原生 ES module,零建置 |

## Model(權威來源;實作若與此牴觸,是設計的 bug)

### Entities
- `Machine` — 一台扭蛋機:`id, name, removeOnDraw, prizes[], pool[]`
- `Prize` — 獎項**設定**:`id, name, count, rarity`
- `Capsule` — 池子裡的**一顆蛋**:`prizeId, drawn`,由 `Prize.count` 展開
- `AppState` — 全域:`machines[], activeMachineId, soundOn`
- `DrawResult` — 一次抽獎:`capsule, prize, pool, revealSteps[]`

### Cardinality
- `AppState` 1:N `Machine`,`activeMachineId` 指向其中一台
- `Machine` 1:N `Prize`;`Prize` 1:N `Capsule`(`count` 決定幾顆,`Capsule` 以 `prizeId` 參照)
- `Machine` 1:1 `pool` —— 每台各自的抽獎進度,切換機台互不影響
- `soundOn` 全域一份;`removeOnDraw` 每台一份

### Seen vs stored
- 看到「饅頭 ×2」 → 存的是 `Prize{count:2}` 加 pool 裡 2 個各有 `drawn` 的 `Capsule`
- 看到「還剩 5 顆」 → 沒有這個欄位,是 `pool.filter(c => !c.drawn).length` 算出來的
- 看到「蛋從白慢慢升到金」 → 結果在按下抽獎那一刻就定了,`revealSteps` 是從已知最終稀有度往回推的腳本
- 按「確定」 → 只有 `prizes` 真的變動才重建 pool

### 最可能做錯的三個(以下三句都是錯的)
1. 「rarity 高就比較難抽」 —— 機率**只**看 `count`,rarity 不參與計算
2. 「抽掉就把 `Prize.count` 減 1」 —— `prizes` 是不被消耗的設定,`pool` 才是可消耗的副本
3. 「升階動畫是邊演邊擲骰」 —— 只擲一次骰,演出只是重播

## 模組

| 檔案 | 職責 | 自動測試 |
|---|---|---|
| `js/constants.js` | 稀有度順序與配色、儲存 key、種子資料 | — |
| `js/state.js` | 純函式:建機台/建獎項/展開 pool/重置/dirty 比對 | ✅ |
| `js/gacha.js` | 純函式:抽一顆 + 產 revealSteps | ✅ |
| `js/storage.js` | localStorage 讀寫、容錯、persist() | ✅ |
| `js/reveal.js` | WAAPI 播放 revealSteps、跳過、reduced-motion | 手動 |
| `js/sound.js` | Web Audio 合成 | 手動 |
| `js/ui-machine.js` | 主畫面 | 手動 |
| `js/ui-settings.js` | 設定對話框 | 手動 |
| `js/main.js` | 啟動與接線,持有唯一的可變 state | 手動 |

`state.js` 與 `gacha.js` 全為純函式、不就地改動輸入,因此可以在 Node 裡直接測。

## 演出腳本

`buildRevealSteps(rarity)` 從已知的最終稀有度往回推:

```
N   drop → shake(0) → crack → burst → show
R   drop → shake(0) → upgrade(R) → crack → burst → show
UR  drop → shake(0) → upgrade(R) → shake(1) → upgrade(SR)
         → shake(2) → upgrade(SSR) → shake(3) → upgrade(UR) → crack → burst → show
```

搖越多次 = 越大獎。小孩不用解釋就會懂,期待感落在每次搖之間。

## 驗證

```bash
node --test          # 零依賴,不需要 npm install
python3 -m http.server 8000
```
