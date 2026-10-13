# 大亂鬥對戰盤:從 3D 檔做出 `stadium.bin` 與 `stadium-grid.js`

來源模型:Nick__Furry 照 Takara Tomy 原版復刻的 Beyblade X Xtreme 盤
(MakerWorld <https://makerworld.com/models/1147551>,授權 CC BY-NC)。
模型檔**不放進 repo**;要重做時從 MakerWorld 下載 `Beyblade X Stadium v8 mw.3mf`。

需要 Python 3 + numpy + Pillow(建議開一個 venv)。以下 `$X` 是 3mf 解壓後的資料夾。

1. `build.py . $X assembled.json` —— 碗底(arena)與軌道(riel)照檔案裡的 `source_offset` 放回原位;
   其他零件先放在原點。
2. `register.py assembled.json registered.json` —— 外圈(ring)零件用「切面形狀相同」一塊塊接上去
   (檢查:不能跑進碗裡、要在盤子範圍內、不能重疊、內緣要貼著軌道)。
   左右對稱的兩組零件會被接到同一側:保留 ring、ring (2)、ring (5) 那一側,再沿 z 鏡射出另一側
   (見 git log 裡 smash 盤子那幾個 commit 的說明)。
3. `join4.py` + `fit4.py` —— 前方正中的 ring (4) 兩半用 3127mm² 的切面接起來,
   再用內緣弧線(半徑 163mm ≈ 軌道正前方 165mm)對到碗心。
4. `heightmap.py full.json hm.npy` —— 整台的頂面高度圖。
5. `zones.py hm.npy stadium-grid.js` —— 物理用的區域圖(每格 1 單位),複製到 `smash/js/`。
6. `export.py full.json stadium.bin` —— 減面後的網格,複製到 `smash/models/`,
   並更新 `smash/js/stadium3d.js` 裡 `stadium.bin?v=` 的雜湊(sha1 前 8 碼)。

`render3d.py`、`render_idx.py` 是檢查用的預覽圖。外殼(shell)零件跟外圈沒有共用切面,沒有拼;
畫面上的透明冰牆是照 `BOUNDS` 畫的。
