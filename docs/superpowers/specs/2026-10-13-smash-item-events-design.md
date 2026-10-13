# 大亂鬥道具改版:四個道具都是「事件」

日期:2026-10-13 · 分支:`smash-beyblade`(issue #4 延伸)· 前情:`2026-10-12-smash-beyblade-stadium-design.md`

## 為什麼

使用者實玩回饋:「道具只有飛彈最好玩,其他都沒有什麼特別感覺。」飛彈好玩是因為**看得見、有前兆、有結果**(準星 → 倒數 → 一炸好幾顆);劍、盾是數值加成,肉眼看不出差別,補包是默默補滿轉速。另外飛彈的發光火焰爆炸跟遊戲的平塗冰雪畫面不搭,使用者選了冰雪主題的冰隕石。

成功的樣子:四個道具吃到時都會發生一件看得見的事,小孩看得出「誰吃了什麼、對誰做了什麼」。

## 已定案(grill 2026-10-13,不再重問)

1. 每個道具都是「事件」(看得見、有前兆、有結果),不做數值加成。
2. **衝刺(原劍)**:蓄力 0.5 s 往目標反方向退(像拉彈弓)+ 隊伍色虛線箭頭與目標腳下準星圈 → 追蹤目標以速度 200 衝 0.45 s,拖殘影 → 碰到任何敵人即結束、自己速度 ×0.2 頓住;衝刺中自己不擲爆裂骰;沒有劍的加成。超重擊鏡頭震一下。圖示 `dash/s3`(閃電箭頭)。
3. **冰塊(原盾)**:丟 2 顆冰塊(就是道具圖)拋弧線、邊轉邊變大飛向最近 2 個敵人,飛 0.35 s;打中凍 1.5 s:不會自己動(think 跳過)、不掉轉速(撞擊與自然衰減都不扣)、摩擦 0.9995(平常 0.995)、被撞 ×1.8、不會爆;正在衝刺被凍則取消衝刺。冰塊圖半透明罩在陀螺前面,刃停住,解凍前 0.4 s 閃。圖示與罩上的冰塊同圖 `ice/s2`。
4. **冰旋渦(原補包)**:轉速補滿(綠框閃一下保留)+ 2 s 把半徑 40 內的敵人往自己拉(220)與切向繞(260),力道隨距離遞減、÷mass,隊友不受影響。畫面:漩渦圖貼碗面(跟著碗的弧度),中心轉得比外圈快,雪花沿螺旋捲入;跟著吃到的那顆走。圖示 `whirl/s2`。
5. **冰隕石(原飛彈)**:玩法不變(鎖最近敵人**當下**的位置、1.2 s、BLAST_RADIUS 46、圈內敵我都炸、準星預告);外觀換成冰晶從天上落下、砸出冰晶碎片 + 雪霧,取代發光蘑菇雲。地上的衝擊波沿用已生成的那組。
6. **名稱**:衝刺、冰塊、冰旋渦、冰隕石;程式 / 存檔 id 改 `dash` / `freeze` / `vortex` / `meteor`。
7. **出現機率**四種各 25%。

## 確認過的模型(plan 也要原文收錄;實作與之矛盾 = plan bug,停下來提出)

- **實體**:`Setup.items` 開關 `{ dash, freeze, vortex, meteor }`(舊鍵對應);`Item { type, x, y }`,四種各 25%;比賽中才有、不存檔:`Combatant.dash`(蓄力 0.5 s 後退 → 追蹤衝 0.45 s,碰到敵人結束、自己頓住、衝刺中不爆);`Frost { fighterId, from, targetId, t }`(一次 2 顆,打最近 2 個敵人,命中 → `Combatant.frozen = 1.5 s`);`Combatant.whirl`(2 s,吃到時轉速也補滿);`MeteorStrike { fighterId, x, y, fuse }`(鎖當下位置,不追蹤)。
- **對應**:dash 1 → 1 目標(追蹤,目標出局換人);freeze 1 → ≤2 Frost → 各 1 目標;vortex 1 → 半徑 40 內所有敵人;meteor 1 → 1 落點,範圍內敵我都炸。
- **看到 vs 存**:存檔只有四個開關(新鍵);衝刺 / 凍住 / 旋渦只存在比賽中。
- **最可能做錯(錯誤版本)**:(1)「冰塊會凍隊友 / 只凍一顆」(2)「冰塊被撞照樣扣轉速 / 會爆」(3)「改名後舊存檔道具開關失效(全部重置成開)」。

## 設計

### 1. 改名與存檔遷移

- 道具 id 全面改名:`ITEM_TYPES = ['dash', 'freeze', 'vortex', 'meteor']`,`ITEM_WEIGHTS` 各 25。
- 比賽中的欄位:`world.strikes` → `world.meteors`(元素即 `MeteorStrike`);`world.frosts`、`Combatant.dash / frozen / whirl` 沿用原型的名字。
- 圖示:`smash/img/items/{dash,freeze,vortex,meteor}.webp`,`art.js` 的 `ITEM_URLS` 用新鍵;`tools/mascot-gen/smash.py` 的 `ITEMS` 與 picks 跟著改。
- 存檔(`store.js`)讀取 `items[t]`:依序看**新鍵 → 上一代鍵 → 更舊的鍵**,第一個有值的決定;值是 `false` 才關,其餘(沒有、true)都是開。
  - `dash` ← `attack`
  - `freeze` ← `shield`
  - `vortex` ← `spin` ← `speed`
  - `meteor` ← `missile` ← `bomb`
- 設定頁四個開關:id `itemDash / itemFreeze / itemVortex / itemMeteor`,文字「衝刺 / 冰塊 / 冰旋渦 / 冰隕石」,說明文字跟著新玩法改。

### 2. 清掉舊的加層機制

劍、盾的「加層」整套拿掉:`buffs.attack / buffs.shield`、`BUFF_TIME`、`MAX_LAYERS`、`addLayer`、`tickBuffs` 的層數部分、`layers()`、`ATTACK_GAIN`、`SWORD_BURST`、`SHIELD_KNOCK`、`SHIELD_BURST`、`SWORD_RED` 外框變紅與層數變粗、`burstChance` 裡的層數倍率、`physics.step` 撞擊公式裡的層數倍率、隕石爆炸的盾倍率。`tickBuffs` 改成只倒數 `frozen`(或併進 `tickFrosts`)。補包的綠框(`healedAt`、`HEAL_FLASH`)保留給冰旋渦。

### 3. 冰隕石外觀

用 ComfyUI 生成,每樣 3 張讓使用者挑:

- **冰隕石圖示**(`smash.py gen meteor`,同道具畫風:平塗、深棕描邊):一顆帶冰藍尾巴的冰晶隕石,尖端朝下。也是落下時那顆(沿用現在飛彈的落下:圖示 sprite、斜落、尖端轉向準星)。
- **冰晶爆開**(`smash.py fx shatter`,黑底 → Wan → 黑轉透明,同 ClassBonusSystem):砸下瞬間冰晶碎片往外噴、白色雪霧散開。取代 `cloud`(蘑菇雲);`shock`(地上衝擊波,擴到 BLAST_RADIUS)保留。

### 4. 畫面其他

原型已經做好的畫面全部保留:衝刺的箭頭 / 準星 / 後退 / 殘影;冰塊的拋物線、變大、罩上、閃;漩渦貼碗面、差速旋轉、雪花捲入、每格網格釋放。

## 測試

- 存檔遷移:三代鍵名各一組;**舊存檔關掉的,遷移後維持關掉**;新鍵優先於舊鍵;沒設定過的預設開。
- `ITEM_TYPES` 是新四個;機率各 25%(抽樣)。
- 模型的三個錯誤版本各一個測試擋住:冰塊不打隊友且打 2 個;冰塊被撞不扣轉速、不爆;舊存檔開關不失效。
- 原型已有的測試(衝刺 10、冰凍 8、旋渦 4)保留,改用新 id。
- 舊的加層測試(劍盾層數、盾減爆裂)刪除或改寫成新玩法。
- `test/smash-art.test.js`、`test/preload-manifest.test.js` 跟著新檔名。
- 全部 `node --test test/*.test.js` 綠。
- 真實頁面(cmd+shift+R)看一場;設定頁四個開關文字與存檔來回。

## 不做

- 不調衝刺 / 冰塊 / 旋渦的數值(原型數值已經跟使用者看過、模擬過)。
- 不重做撞擊火花(使用者說只有一下下所以還好,已縮小)。
