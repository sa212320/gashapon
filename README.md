# 抽獎小工具

給小朋友用的抽獎小網站。純靜態頁面,零建置、沒有後端,設定存在瀏覽器裡。

**網站:<https://sa212320.github.io/gashapon/>**

首頁(`index.html`)列出五個抽獎模式,點進去各自獨立運作:

- **扭蛋機**(`gashapon/`)—— 搖越多次越大獎,五階稀有度 `N / R / SR / SSR / UR`,
  中獎機率**只**看顆數,稀有度只影響演出。冰雪主題:機台、扭蛋殼花紋、揭曉外框是
  ComfyUI 生成的插畫(工具在 `tools/mascot-gen/gashapon.py`)。可以存好幾台扭蛋機,
  在設定裡切換。音效是即時合成的,沒有任何音檔。
- **立體扭蛋機**(`gashapon3d/`)—— 自己挑一顆打開。
- **一番賞**(`ichiban/`)—— 抽一張,撕開看是幾賞。
- **阿彌陀籤**(`ghostleg/`)—— 沿著線一路跑到終點。
- **大亂鬥**(`smash/`)—— 撞出場外就淘汰。

設計文件在 `docs/superpowers/`。

## 共用層

`shared/` 放五個模式都會用到的東西(對話框骨架、localStorage 讀寫、全站共用的
音效開關偏好、id 產生器、確認對話框等),`shared/css/tokens.css` 放共用的顏色、
字體與元件樣式。新模式上線時應該先看這裡,不要重造輪子。

## 跑起來

```bash
python3 -m http.server 8000   # 然後開 http://localhost:8000
```

## 測試

```bash
node --test                   # 零依賴,不需要 npm install
```

## 部署

push 到 `main`,GitHub Pages 設成 `main` 分支根目錄即可。

## 設定會不會不見?

存在 `localStorage`,並且會向瀏覽器申請「持久化」配額。以下情況還是會不見:
清除瀏覽資料、Safari/iOS 超過 7 天沒開、無痕視窗、換一台裝置。
