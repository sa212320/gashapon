# 吉祥物影片片段 設計

## Context

吉祥物(小狐狸抱著白鼬)現在每個姿勢都是一張獨立生成的 WebP,換姿勢是換 `<img>` 配交叉淡入。使用者最在意的是**換姿勢很跳**:六張圖是分開生成的,狐狸大小、位置、臉型、白鼬尾巴都不一樣,淡入時看起來是兩隻不同的角色疊在一起。其次才是待機沒有眨眼、耳朵尾巴不會動,以及不會對人有反應。

考慮過 Live2D,放棄了(見下表)。改成**用使用者的 ComfyUI(Wan 2.2 圖轉影片)預先算好一組片段,前端用 canvas 逐格播放**。試做(從現有 `idle.webp` 生成 idle→cheer,49 格 640×576,40 秒)證明角色能從頭到尾維持同一隻。

零建置仍是硬性條件:網站本身沒有 package.json、沒有 bundler。`tools/mascot-gen/` 是開發用的素材生成工具,產出的圖與 manifest 直接 commit,網站不在部署時跑它。

---

## 已封閉的決策(grill 階段確定,實作時不得重新討論)

| 決策 | 結論 |
|---|---|
| 技術路線 | **不用 Live2D**。預先生成的影片片段,在 `http://192.168.68.53:8188` 的 ComfyUI 上用 Wan 2.2 i2v 14B + lightx2v 4 步 LoRA 生成(`WanImageToVideo` / `WanFirstLastFrameToVideo`),綠底 `#00FF00` 方便去背 |
| 構圖 | **固定**:兩隻永遠抱在一起,姿勢只靠表情、頭與手的角度、耳朵尾巴區分。`empty` 拿掉箱子,改成兩隻一起垂耳失望 |
| 片段組成 | 每個姿勢 = **進場過渡 + 停留循環 + 退場過渡**,接縫共用同一張關鍵圖 |
| 過渡的連法 | **星狀經過 idle**,唯一例外是 `watch→cheer` 與 `watch→aww` 直連(揭曉那一刻不能慢半拍) |
| 打斷規則 | 過渡段**一定播完**;停留循環與小動作**可在任何一格離開**,往最近的關鍵圖快轉(每格跳 3 格)再接下一段;排隊的要求**只有一格**,新的覆蓋舊的。(修訂 2026-10-01:原本是 4 格交叉淡入,實際畫面上尾巴擺動大,兩層疊起來有錯位殘影,使用者看到後改成快轉) |
| 交付格式 | **canvas + 每段一張帶 alpha 的 WebP 逐格圖**,JS 逐格控制 |
| 待機 | 一段 idle 主循環(呼吸 + 眨眼)+ 隨機插播小動作(抖耳朵、白鼬蹭一下、打瞌睡)。`doze` 變成一段小動作,不再是一張圖。CSS 呼吸拿掉 |
| CSS 動作效果 | **只留飛行位移 + 傾斜**。擠壓拉伸與 cheer 彈跳拿掉 |
| 載入 | 依使用順序預先下載;片段未到時**交叉淡入到目標姿勢的關鍵圖**當保底 |
| reduced-motion | 吉祥物**完全不讀這個設定**,一律照播(飛行傾斜也照播)。雪花維持它自己的處理,不在這次範圍 |
| 關鍵圖來源 | 全部從現有 `shared/img/mascot/idle.webp` 繁衍:i2v 從 idle 出發,最後一格當該姿勢的關鍵圖;其他片段全部是首尾幀夾在關鍵圖之間。其他五張舊圖淘汰 |
| 把關 | 每段 **3 個 seed**,Claude 先過濾明顯壞掉的並標出原因,做比較頁,**使用者挑** |
| 互動 | 維持**不可點**(`pointer-events: none`)。「跟著滑鼠」這類即時互動不在這次範圍 |
| 位置(修訂 2026-10-01) | 實作後使用者看過實際畫面改了主意:**永遠固定在右下角**,揭曉與空狀態都不再飛到畫面中間,只在原地換姿勢;**排在頁面內容之後**(z-index -1),按鈕、卡片、揭曉面板都疊在牠上面。對外 API 改成只剩 `setPose` / `getState` / `stop`,`flyTo` / `home` / 錨點全部移除 |

---

## 確認過的模型

實作時若發現程式與此牴觸,是**計畫的 bug** —— 停下來反映,不要就地改模型。

- **Entities**:`Pose`(idle / watch / cheer / aww / empty;對外 API 原本是 `setPose` / `flyTo` / `home`,2026-10-01 起只剩 `setPose`);`Keyframe`(每個 Pose 一張停止格,生成用 + 保底用);`Segment {id, kind: 'transition'|'loop'|'fidget', from, to, frames, fps, sheet}`;`Player`(目前片段、第幾格、單格 `pending`)
- **Cardinality**:Pose↔Keyframe 1:1;Pose↔loop 1:1;idle→fidget 1:N;過渡片段**剛好 10 條邊**(idle↔watch/cheer/aww/empty 共 8 條 + watch→cheer、watch→aww)
- **Seen vs stored**:呼叫端看到 5 個姿勢;存的是約 18 段逐格圖;doze 是 idle 的小動作不是 Pose;畫面上的 idle 是解碼後的影格,不是 `idle.webp` 原圖
- **最可能的 3 個錯誤(錯誤版本)**:
  1. ❌「換一次姿勢 = 播一段片段」—— 可能是多段(cheer→idle→empty),也可能是從循環淡出接出去
  2. ❌「pending 是佇列」—— 只有一格,新的覆蓋舊的
  3. ❌「循環只能在最後一格離開、過渡段可被打斷」—— 剛好相反

---

## 1. 檔案結構與 manifest

```
shared/img/mascot/
  segments.json          唯一的資料來源(前端讀)
  key/<pose>.webp        5 張標準關鍵圖(解碼後的影格)
  seg/<id>.webp          每段一張逐格圖(帶 alpha)
shared/js/
  mascot.js              DOM、canvas、飛行;對外 API 不變
  mascot-route.js        純函式:路由 + manifest 驗證
  mascot-player.js       逐格時鐘、pending、淡出、保底
tools/mascot-gen/        生成管線(Python,不被網站載入)
  gen.py
  prompts.json           提示詞、seed、使用者的挑選
  review/                比較頁
```

`segments.json`:

```json
{
  "frame": { "w": 480, "h": 432 },
  "keyframes": { "idle": "key/idle.webp", "watch": "key/watch.webp", "cheer": "key/cheer.webp", "aww": "key/aww.webp", "empty": "key/empty.webp" },
  "segments": [
    { "id": "idle-watch", "kind": "transition", "from": "idle", "to": "watch",
      "frames": 25, "fps": 16, "sheet": "seg/idle-watch.webp", "cols": 5 }
  ]
}
```

- 前端不知道 seed 與提示詞,那些只在 `tools/mascot-gen/prompts.json`
- 片段 id 慣例:過渡 `<from>-<to>`,循環 `<pose>-loop`,小動作 `idle-<name>`(`idle-ear`、`idle-nuzzle`、`idle-doze`)
- 每格尺寸 480×432 與 16fps 是**暫定值**,第一段實際壓完、量到檔案大小後才定案;若總量過大,依序降 fps(→12)、降尺寸
- 刪除舊的 `idle / watch / cheer / aww / empty / doze.webp`;`idle.webp` 的角色由 `key/idle.webp` 承接

### 完整片段清單(18 段)

| kind | id |
|---|---|
| loop | `idle-loop` `watch-loop` `cheer-loop` `aww-loop` `empty-loop` |
| transition | `idle-watch` `watch-idle` `idle-cheer` `cheer-idle` `idle-aww` `aww-idle` `idle-empty` `empty-idle` `watch-cheer` `watch-aww` |
| fidget | `idle-ear` `idle-nuzzle` `idle-doze` |

---

## 2. 執行期行為

### 路由 `route(manifest, at, target) → string[]`

純函式。

- `at === target` → `[]`
- 有 `at→target` 直連邊 → `[那一段]`
- 否則 → `[at→idle, idle→target]`

例:`route(m, 'cheer', 'empty')` → `['cheer-idle', 'idle-empty']`。

### manifest 驗證 `validate(manifest)`

載入時跑一次。缺任何一條必要的邊(上面清單的 10 條過渡與 5 段循環)、`loop`/`fidget` 的 `from !== to`、`fidget` 的 `from !== 'idle'`、或 `frames`/`fps`/`sheet` 缺漏 → 丟錯並寫明是哪一段。

### 播放器

狀態:`playing`(目前片段 + 第幾格)、`route`(剩下要播的片段)、`pending`(單格目標姿勢)、`at`(目前所在姿勢)。

1. `setPose(p)` 只寫 `pending = p`,不直接改畫面
2. 每走一格:
   - **過渡段**:只在最後一格之後看 `pending`
   - **循環 / 小動作**:有 `pending` 就開始離開 —— 往比較近的關鍵圖(第 0 格或最後一格)快轉,每格跳 3 格;到了關鍵圖,下一格接上新路徑第一段的第 1 格。任何時刻只畫一層
3. 路徑播完 → `at = target`,進入 `<target>-loop` 無限播
4. 停在 `idle-loop` **且在角落**時,每 4~9 秒(隨機)在循環結束點插播一段隨機小動作,播完回 `idle-loop`

`getState().pose` 回傳**最後一次要求的目標**:`pending ?? 路徑終點 ?? at`。這跟現在的語意一致(呼叫端把它當「我剛叫它變成什麼」)。`placement` 語意不變。

### 保底

路徑中下一段的逐格圖尚未載入時:300ms 交叉淡入到**目標姿勢**的 `key/*.webp`,`at = target`,標記「循環未就緒」;該姿勢的 `-loop` 載好後從第 0 格接上。

### 預先下載順序

`idle-loop` → `idle-watch` → `watch-loop` → `watch-cheer` → `watch-aww` → `cheer-loop` → `aww-loop` → `cheer-idle` → `aww-idle` → 其餘。關鍵圖 5 張在頁面載入時一起下載。

### 飛行

`flyTo` / `home` 照舊只動外框的位移與傾斜,與播放器互不干涉,飛行途中照常播放。拿掉 `pulseSquash`、`pulseBounce` 與所有 `reduceMotion` 分支。

---

## 3. 生成管線(`tools/mascot-gen/gen.py`)

後一輪要用前一輪挑出來的關鍵圖,所以**分三輪,每輪使用者挑完才進下一輪**:

| 輪 | 生成 | 產出的標準關鍵圖 |
|---|---|---|
| 0 | `idle-loop`:FLF(`idle.webp`, `idle.webp`) | `K_idle` = 選中那段的第 0 格(解碼、去背後) |
| 1 | `idle-watch` `idle-cheer` `idle-aww` `idle-empty`:從 `K_idle` i2v,提示詞「做完動作後停住」 | `K_watch` `K_cheer` `K_aww` `K_empty` = 各段最後一格 |
| 2 | 其餘 13 段全部 FLF:4 段循環 `K_X→K_X`、4 段退場 `K_X→K_idle`、`watch-cheer`、`watch-aww`、3 段小動作 `K_idle→K_idle` | — |

18 段 × 3 seed = 54 次生成,約 40 分鐘機器時間。

每段的後處理:

1. **去背**:綠色 → alpha,邊緣做綠色溢色抑制
2. **接縫**:頭尾各 2 格往對應的標準關鍵圖混合(離邊界第 2 格 50%、邊界格 100%),讓交界像素等於標準關鍵圖
3. 縮放 → 拼逐格圖 → `cwebp` 壓成帶 alpha 的 WebP
4. **把關**:Claude 看逐格縮圖,淘汰畸形(手指數不對、白鼬變大、構圖跑掉),在比較頁上標出淘汰原因

比較頁 `tools/mascot-gen/review/index.html`:每段 3 個版本並排,疊在真實雪地背景上用 canvas 循環播。使用者回「idle-watch 選 2」→ 寫進 `prompts.json` 的 `pick` → 輸出正式素材與 `segments.json`。

ComfyUI 位址讀環境變數 `COMFY_URL`,預設 `http://192.168.68.53:8188`。

---

## 4. 錯誤處理與測試

### 錯誤處理

- manifest 驗證失敗 → 丟錯(開發時就抓到)
- 逐格圖載入失敗 / 逾時 → 走保底,console 警告一次,不無限重試
- 連關鍵圖都載不到 → 空白,抽獎流程照常。吉祥物是裝飾,不能擋住任何功能

### 自動測試(`node --test`,零依賴)

- `test/mascot-route.test.js`:10 條直連邊各回單段;經 idle 的組合回兩段;`at === target` 回 `[]`;缺邊 / kind 不合的 manifest 驗證丟錯
- `test/mascot-player.test.js`(注入假時鐘逐格推進):
  - 過渡段途中 `setPose` 不中斷,播完才轉向
  - 循環途中 `setPose` 當格開始淡出
  - 連續三次 `setPose` 只有最後一次生效(pending 不是佇列)
  - 小動作只在 idle 且在角落時觸發
  - 片段未載入 → 走保底
- `test/mascot.test.js`:`getState` 語意不變;刪掉 squash / bounce / reduceMotion 相關斷言;canvas 用注入的假畫布
- 生成管線只測純函式(綠幕轉 alpha、接縫混合),用小合成圖驗證;呼叫 ComfyUI 的部分不寫自動測試

### 手動驗收

新開 port 冷啟動,在真實頁面上五個模式各跑一次完整流程;「夠不夠活」由使用者判斷。

---

## 交付前要誠實講清楚的事

- **只測 Chrome**。Safari 上 alpha WebP + canvas 理論上支援,沒實測
- **真機沒測過**。低階手機上 canvas 逐格繪製疊在 WebGL 模式後面會不會掉幀未知
- **生成品質每輪都可能讓計畫停下來**:某個姿勢 3 個 seed 都不行時,要換提示詞重跑,不是硬挑一個
- **檔案總量**第一段壓完才知道,可能迫使降 fps 或尺寸
- **授權**:Wan 2.2 與 lightx2v LoRA 生成的素材用在這個網站的授權條款沒有查證
