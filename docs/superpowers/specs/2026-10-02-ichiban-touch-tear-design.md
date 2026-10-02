# 一番賞手指撕籤 — 設計

日期:2026-10-02 · 決定來自 2026-10-02 的 grill(使用者逐題拍板,**不要再重問**)

## 確認過的模型(原文,不要改寫)

- **Entities**:`Ticket { no, prizeId, drawn }`(沿用、不新增欄位);`TearState { progress 0~1, committed, auto }` 只在畫面上,不存檔
- **Cardinality**:一次抽 1:1 一張籤 1:1 一個撕開流程;最後一抽賞時後面再 1 個金卡撕開流程
- **Seen vs stored**:撕到一半的進度不存;commit 時機 = 按「撕開」或手指往右拉 > 3%;之後取消消失,拉回 0% 也算抽走;≥ 70% 或按撕開後自動撕完、不能再拉
- **三個錯誤版本(看到就要警覺)**:
  - ❌「放開手指紙彈回去」—— 錯,停在原地
  - ❌「拉回 0% 可以取消」—— 錯,> 3% 就算抽走,取消鈕已經消失
  - ❌「金卡維持自動撕開」—— 錯,金卡也手撕,只是沒有取消

## 已定案的互動

1. 「撕開」按鈕與手指撕並存;撕到一半按「撕開」→ 從目前進度自動撕完
2. 從籤的任何地方按住往右拉,`progress = 往右拉的距離 / 籤寬`;可以往回拉(進度跟著減);滑鼠拖也可以(pointer events)
3. 放開手指停在原地;撕到 70% 自動撕完,之後不能再拉
4. 拉超過 3%(還看不到獎項)就 commit:寫進 state、存檔、「取消」消失
5. 每次拿起籤都顯示「→ 往右撕」,開始撕就收
6. 音效:往前每 8% 一聲短撕紙聲(新增 `sfx.rip`),70% 時 `crack` 接自動撕完;往回不出聲;音效開關照舊
7. 單點(沒拉動)不算撕、不觸發跳過;跳過只在 70% 之後的自動撕與獎項演出
8. 最後一抽賞金卡也手撕:有提示、有撕開鈕、沒有取消
9. 順便修:爬格子「抽什麼」等級選擇器文字被 `overflow: hidden` 切掉約 1px

## 架構

- **`ichiban/js/tear-drag.js`(新,純函式,node 測得到)**:`createTearDrag({ cardWidth })` → `{ down(x), move(x), up(), button(), get progress, get committed, get auto }`;`move` / `button` 回傳 `{ progress, events: [] }`,events ∈ `commit`(第一次 > 3%)、`rip`(往前每多 8%,往回不算、回到同一區段不重複)、`auto`(≥ 70% 或 button)。auto 之後 move 無效;只有 down 之後的 move 算數。常數 `COMMIT_AT = 0.03`、`AUTO_AT = 0.7`、`RIP_STEP = 0.08`
- **`ichiban/js/curl.js`**:新增 `show(p)`(直接畫到 p)與 `playFrom(p, ms)`(從 p 播到 1,時間按剩餘比例);`play(ms)` = `playFrom(0, ms)`;拖曳與自動撕共用同一條 ease
- **`ichiban/js/ui.js`**:`revealer.waitForTear({ cancellable })` → resolve `'cancel' | 'commit' | 'button'`;在 `#tearCard` 掛 pointer 事件(`touch-action: none`、`setPointerCapture`),commit 之後繼續追手指直到 auto,才接 `playTear(from)`(既有光暈 / 碎花不變);提示元素 `#tearHint`
- **`ichiban/js/main.js`**:`waitForChoice` 換成 `revealer.waitForTear`;`'commit' | 'button'` 時寫 state、存檔、收取消;金卡 `cancellable: false`
- **`shared/js/sound.js`**:`sfx.rip()` = 短濾波噪音(~0.06 s)

## 測試

- `tear-drag`:3% 才 commit、單點不 commit;往回 progress 減少但 committed 不變;rip 只往前;70% → auto、之後 move 無效;button 任何進度 → auto(也會 commit)
- 靜態:`main.js` 的 commit(寫 state + persist)只發生在 `'commit' | 'button'` 之後;金卡 `cancellable: false`
- 瀏覽器:假時鐘 + 合成 pointer 事件,錄「拉到 30% 停 → 往回 → 再過 70%」,390 與桌機寬各一次;WebKit 工具(scratchpad/wk)再跑一次

## 不做

- 改變撕的方向、彈回、震動
