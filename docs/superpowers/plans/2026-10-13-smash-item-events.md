# 大亂鬥道具改版(四個道具都是事件)Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把分支上已有的衝刺 / 冰塊 / 冰旋渦原型正式化:道具 id 改成 `dash / freeze / vortex / meteor`(含舊存檔遷移)、機率平均、拿掉劍盾加層機制、冰隕石換成生成的冰晶外觀。

**Architecture:** 純函式的 world 管線不變(`applyPickups → tickDashes → tickFrosts → tickWhirls → explodeMeteors → think → step`),只改名、刪掉 `buffs` 層數系統、把凍住改成 `tickFrosts` 自己倒數。畫面在 `scene3d.js`,圖在 `tools/mascot-gen/smash.py` 生成後 build 到 `smash/img/` 與 `smash/js/art.js`。

**Tech Stack:** vanilla ES modules + three.js;`node --test test/*.test.js`(`node --test test/` 在 Node 26 會失敗);ComfyUI(`COMFY_URL=http://qoo-is-good.tplinkdns.com:8188`),`tools/mascot-gen/.venv/bin/python`。

**Spec:** `docs/superpowers/specs/2026-10-13-smash-item-events-design.md`

## 確認過的模型(原文;實作與之矛盾 = plan bug,停下來提出)

- **實體**:`Setup.items` 開關 `{ dash, freeze, vortex, meteor }`(舊鍵對應);`Item { type, x, y }`,四種各 25%;比賽中才有、不存檔:`Combatant.dash`(蓄力 0.5 s 後退 → 追蹤衝 0.45 s,碰到敵人結束、自己頓住、衝刺中不爆);`Frost { fighterId, from, targetId, t }`(一次 2 顆,打最近 2 個敵人,命中 → `Combatant.frozen = 1.5 s`);`Combatant.whirl`(2 s,吃到時轉速也補滿);`MeteorStrike { fighterId, x, y, fuse }`(鎖當下位置,不追蹤)。
- **對應**:dash 1 → 1 目標(追蹤,目標出局換人);freeze 1 → ≤2 Frost → 各 1 目標;vortex 1 → 半徑 40 內所有敵人;meteor 1 → 1 落點,範圍內敵我都炸。
- **看到 vs 存**:存檔只有四個開關(新鍵);衝刺 / 凍住 / 旋渦只存在比賽中。
- **最可能做錯(錯誤版本)**:(1)「冰塊會凍隊友 / 只凍一顆」(2)「冰塊被撞照樣扣轉速 / 會爆」(3)「改名後舊存檔道具開關失效(全部重置成開)」。

## Global Constraints

- 道具 id:`dash`(衝刺)、`freeze`(冰塊)、`vortex`(冰旋渦)、`meteor`(冰隕石);機率各 25。
- 存檔遷移鏈:`dash ← attack`;`freeze ← shield`;`vortex ← spin ← speed`;`meteor ← missile ← bomb`;新鍵優先;只有 `false` 是關。
- 原型數值不改:DASH_WIND 0.5、DASH_TIME 0.45、DASH_SPEED 200、DASH_BACKOFF 50、DASH_STOP 0.2;FROST_TARGETS 2、FROST_FLIGHT 0.35、FREEZE_TIME 1.5、FROZEN_FRICTION 0.9995、FROZEN_KNOCK 1.8;WHIRL_TIME 2、WHIRL_RADIUS 40、WHIRL_PULL 220、WHIRL_SWIRL 260;METEOR_FUSE 1.2、BLAST_RADIUS 46、BLAST_POWER 620。
- 新圖都進 `gashapon/img/preload.json`(build 會重產)且網址帶 `?v=` 內容雜湊。
- 使用者看得到的文字一律繁體中文;程式識別字、commit message 英文;commit 結尾加 attribution 兩行。
- 測試指令:`node --test test/*.test.js`。

## Review Focus

1. **冰塊被冰隕石炸到**:模型說冰塊不會爆 —— 隕石也不能讓冰塊爆(現在 `explodeMissiles` 沒擋)。→ Task 2 加測試。
2. **舊存檔同時有新舊鍵**(例如 `{ dash: false, attack: true }`):新鍵優先,要是關。→ Task 1 加測試。
3. **被凍住的陀螺還是會被冰旋渦捲走**(冰塊在冰上滑,捲得動是預期)。→ Task 2 加測試。
4. **四個道具全關**:不掉任何道具、不報錯(`pickItem` 收到空陣列)。→ Task 1 加測試。
5. **快取裡的舊 index.html 配新 JS**:設定頁 `itemDash` 等元素不存在時不能整頁壞掉(`$()` 回 null)。→ Task 1 的 `renderItems` / 事件綁定對 null 跳過,並加註解;真實頁面在 Task 4 用 cmd+shift+r 驗。

---

### Task 1: 道具 id 改名、機率平均、舊存檔遷移

**Files:**
- Modify: `smash/js/items.js`(ITEM_TYPES、ITEM_WEIGHTS、applyPickups 的 type 判斷、strikes → meteors、explodeMissiles → explodeMeteors、MISSILE_FUSE → METEOR_FUSE、檔頭註解)
- Modify: `smash/js/store.js:14-20, 43-48`
- Modify: `smash/js/main.js:8, 135-147, 273-276, 338-339`
- Modify: `smash/js/physics.js:61, 328`(`strikes` → `meteors`)
- Modify: `smash/js/scene3d.js`(`itemTex.get('shield'|'spin'|'missile')` → `'freeze'|'vortex'|'meteor'`;`world.strikes` → `world.meteors`;`MISSILE_FUSE` → `METEOR_FUSE`)
- Modify: `smash/index.html:80-90`
- Modify: `tools/mascot-gen/smash.py`(`ITEMS`、`SHEET_ORDER`)、`tools/mascot-gen/smash_prompts.json`(`picks` 改新鍵)
- Rebuild: `smash/img/items/*.webp`(新檔名)、`smash/js/art.js`、`gashapon/img/preload.json`
- Test: `test/smash-store.test.js`、`test/smash-items.test.js`、`test/smash-dash.test.js`、`test/smash-freeze.test.js`、`test/smash-whirl.test.js`、`test/smash.test.js`、`test/smash-art.test.js`

**Interfaces:**
- Produces: `ITEM_TYPES = ['dash','freeze','vortex','meteor']`;`ITEM_WEIGHTS = {dash:25,freeze:25,vortex:25,meteor:25}`;`explodeMeteors(world, dt, rng)`;`METEOR_FUSE`;`world.meteors: MeteorStrike[]`;`createWorld` 回傳 `{ combatants, items: [], meteors: [], frosts: [], time: 0 }`;`ITEM_URLS` 的鍵 = `ITEM_TYPES`。

- [ ] **Step 1: 寫失敗的存檔測試**

把 `test/smash-store.test.js` 的前三個 test 換成:

```js
test('新設定:四個道具都開(新鍵)', () => {
  assert.deepEqual(createSmashSetup().items, { dash: true, freeze: true, vortex: true, meteor: true });
});

test('上一代存檔:劍→衝刺、盾→冰塊、補包→冰旋渦、飛彈→冰隕石,關掉的照樣關掉', () => {
  const s = loadFrom(oldSave({ attack: false, shield: true, spin: false, missile: false })).setups[0];
  assert.deepEqual(s.items, { dash: false, freeze: true, vortex: false, meteor: false });
});

test('更舊的存檔:速度→冰旋渦、炸彈→冰隕石;沒設定過的預設開;變大丟掉', () => {
  const s = loadFrom(oldSave({ attack: true, speed: false, giant: false, bomb: false })).setups[0];
  assert.deepEqual(s.items, { dash: true, freeze: true, vortex: false, meteor: false });
});

test('新鍵優先於舊鍵', () => {
  const s = loadFrom(oldSave({ dash: false, attack: true, vortex: true, spin: false, speed: false })).setups[0];
  assert.equal(s.items.dash, false);
  assert.equal(s.items.vortex, true);
});

test('壞掉的 items 也讀得進來,四個開關都有值', () => {
  for (const bad of [null, 'oops', 42, [], { giant: false }]) {
    const s = loadFrom(oldSave(bad)).setups[0];
    assert.equal(s.name, '舊的', '壞掉的 items 不該讓整份存檔被丟掉');
    assert.deepEqual(Object.keys(s.items).sort(), ['dash', 'freeze', 'meteor', 'vortex']);
  }
});
```

並把檔頭註解改成「道具改名兩次了(速度/炸彈 → 補包/飛彈 → 冰旋渦/冰隕石,劍 → 衝刺、盾 → 冰塊)」。

- [ ] **Step 2: 寫失敗的道具清單 / 機率 / 全關測試**

`test/smash-items.test.js` 的前兩個 test 換成:

```js
test('四種道具:衝刺、冰塊、冰旋渦、冰隕石', () => {
  assert.deepEqual([...ITEM_TYPES], ['dash', 'freeze', 'vortex', 'meteor']);
});

test('出現機率四種各 25%', () => {
  assert.deepEqual({ ...ITEM_WEIGHTS }, { dash: 25, freeze: 25, vortex: 25, meteor: 25 });
  const rng = seeded(11);
  const n = { dash: 0, freeze: 0, vortex: 0, meteor: 0 };
  for (let i = 0; i < 20000; i++) n[pickItem(ITEM_TYPES, rng)]++;
  for (const t of ITEM_TYPES) assert.ok(Math.abs(n[t] / 20000 - 0.25) < 0.015, `${t} ${n[t]}`);
});

test('四個都關:pickItem 回 undefined,不報錯', () => {
  assert.equal(pickItem([], seeded(1)), undefined);
});
```

再把檔案裡其餘的 `'attack'` 道具 → `'dash'`、`'missile'` → `'meteor'`、`'spin'`(道具)→ `'vortex'`、`strikes` → `meteors`、`explodeMissiles` → `explodeMeteors`、`MISSILE_FUSE` → `METEOR_FUSE`(只改道具與 world 欄位,`beyType: 'attack'` 不動)。`test/smash-dash.test.js` 的 `type: 'attack'` → `'dash'`;`test/smash-freeze.test.js` 的 `type: 'shield'` → `'freeze'`、`world()` 的 `strikes: []` → `meteors: []`;`test/smash-whirl.test.js` 的 `type: 'spin'` → `'vortex'`、`strikes` → `meteors`;`test/smash.test.js` 的 `arena` 與 think 測試裡的 `strikes` → `meteors`、道具 `type: 'attack'` → `'dash'`。

- [ ] **Step 3: 跑測試確認失敗**

Run: `node --test test/*.test.js 2>&1 | grep -E "^ℹ (pass|fail)"`
Expected: fail > 0(`ITEM_TYPES` 還是舊的、`explodeMeteors` 不存在)

- [ ] **Step 4: items.js 改名**

```js
export const ITEM_TYPES = Object.freeze(['dash', 'freeze', 'vortex', 'meteor']);

// 出現機率(權重):四種一樣多
export const ITEM_WEIGHTS = Object.freeze({ dash: 25, freeze: 25, vortex: 25, meteor: 25 });
```

`pickItem` 開頭加:`if (enabled.length === 0) return undefined;`。
`applyPickups`:`item.type === 'attack'` → `'dash'`;`'shield'` → `'freeze'`;`'spin'` → `'vortex'`;`'missile'` → `'meteor'`;`const strikes = [...(world.strikes ?? [])]` → `const meteors = [...(world.meteors ?? [])]`,push 的 id 前綴 `'mt'`,回傳 `meteors`。
`MISSILE_FUSE` 改名 `METEOR_FUSE`;`explodeMissiles` 改名 `explodeMeteors`,內部 `world.strikes` / `strikes` → `world.meteors` / `meteors`。
檔頭註解改成:

```js
// 四種道具,每一個都是「事件」(看得見、有前兆、有結果)。全部是純函式,回傳新的 world。
//
//   dash    衝刺:鎖定最近的敵人,蓄力往後退,再追著它衝過去;碰到敵人就結束、自己頓住
//   freeze  冰塊:丟兩顆冰塊打最近兩個敵人,打中凍 FREEZE_TIME 秒(不動、不掉轉速、滑很遠、被撞飛得遠、不會爆)
//   vortex  冰旋渦:轉速補滿,再把 WHIRL_RADIUS 內的敵人往自己捲 WHIRL_TIME 秒
//   meteor  冰隕石:鎖定最近敵人**當下的位置**,METEOR_FUSE 秒後從天空落下砸開。不追蹤,圈內敵我都炸
```

- [ ] **Step 5: store.js 遷移**

```js
    items: items ?? { dash: true, freeze: true, vortex: true, meteor: true },
```

```js
  // 道具改名兩次:速度 / 炸彈 → 補包 / 飛彈(2026-10-12),
  // 劍 / 盾 / 補包 / 飛彈 → 衝刺 / 冰塊 / 冰旋渦 / 冰隕石(2026-10-13)。
  // 依序找新鍵 → 上一代 → 更舊的,第一個有值的決定;只有 false 是關。變大(giant)直接忽略。
  const ITEM_ALIASES = { dash: ['attack'], freeze: ['shield'], vortex: ['spin', 'speed'], meteor: ['missile', 'bomb'] };
  const rawItems = raw.items && typeof raw.items === 'object' && !Array.isArray(raw.items) ? raw.items : {};
  const items = {};
  for (const t of ITEM_TYPES) {
    const key = [t, ...ITEM_ALIASES[t]].find(k => rawItems[k] !== undefined);
    items[t] = key === undefined || rawItems[key] !== false;
  }
```

- [ ] **Step 6: physics.js、main.js、scene3d.js 跟著改名**

`physics.js:61`:`return { combatants, items: [], meteors: [], frosts: [], time: 0 };`;`think` 裡 `world.strikes` → `world.meteors`。
`main.js`:import 改 `explodeMeteors`;`world = explodeMissiles(world, dt);` → `explodeMeteors`;

```js
// 設定頁的開關。快取裡的舊 index.html 可能沒有這些元素 —— 找不到就跳過,不讓整頁壞掉。
const ITEM_INPUT = { dash: 'itemDash', freeze: 'itemFreeze', vortex: 'itemVortex', meteor: 'itemMeteor' };

function renderItems() {
  for (const t of ITEM_TYPES) { const el = $(ITEM_INPUT[t]); if (el) el.checked = draft.items[t]; }
}
```

```js
for (const t of ITEM_TYPES) {
  $(ITEM_INPUT[t])?.addEventListener('change', e => { draft.items[t] = e.target.checked; });
}
```

`scene3d.js`:`MISSILE_FUSE` → `METEOR_FUSE`(import 與兩處用法);`itemTex.get('shield')` → `'freeze'`(4 處)、`'spin'` → `'vortex'`、`'missile'` → `'meteor'`;`world.strikes` → `world.meteors`(3 處)。

- [ ] **Step 7: 設定頁文字**

`smash/index.html:80-90` 換成:

```html
    <section class="panel" data-panel="items" hidden>
      <p class="panel__hint">打鬥中會隨機掉下來,誰先撿到算誰的。</p>
      <label class="switch"><input type="checkbox" id="itemDash"><span class="switch__box"></span>
        <span class="switch__text">⚡ 衝刺<small>往後一縮,朝最近的敵人衝過去撞</small></span></label>
      <label class="switch"><input type="checkbox" id="itemFreeze"><span class="switch__box"></span>
        <span class="switch__text">🧊 冰塊<small>丟出兩顆冰塊,把最近的兩個敵人凍住</small></span></label>
      <label class="switch"><input type="checkbox" id="itemVortex"><span class="switch__box"></span>
        <span class="switch__text">🌀 冰旋渦<small>轉速補滿,還把旁邊的敵人捲過來</small></span></label>
      <label class="switch"><input type="checkbox" id="itemMeteor"><span class="switch__box"></span>
        <span class="switch__text">☄️ 冰隕石<small>瞄準最近的敵人從天上砸下來,圈裡的誰都會被砸開</small></span></label>
    </section>
```

- [ ] **Step 8: 圖示改檔名重 build**

`tools/mascot-gen/smash.py`:`ITEMS = ['dash', 'freeze', 'vortex', 'meteor']`;`SHEET_ORDER = ['dash', 'freeze', 'vortex', 'meteor']`(左上、右上、左下、右下,舊拼圖的位置不變)。`smash_prompts.json` 的 `picks` 改成 `{"dash": "dash/s3", "freeze": "ice/s2", "vortex": "whirl/s2", "meteor": "sheet-s2"}`(冰隕石圖在 Task 3 才生,先沿用舊飛彈的拼圖格)。然後:

```bash
git rm -q smash/img/items/attack.webp smash/img/items/shield.webp smash/img/items/spin.webp smash/img/items/missile.webp
tools/mascot-gen/.venv/bin/python tools/mascot-gen/smash.py build
```

Expected: `smash/img/items/{dash,freeze,vortex,meteor}.webp` 產生,`art.js` 的 `ITEM_URLS` 是新鍵,`preload.json` 重產。

- [ ] **Step 9: 跑全部測試**

Run: `node --test test/*.test.js 2>&1 | grep -E "^ℹ (pass|fail)|✖ "`
Expected: fail 0

- [ ] **Step 10: Commit**

```bash
git add -A smash/ test/ tools/mascot-gen/smash.py tools/mascot-gen/smash_prompts.json gashapon/img/preload.json
git commit -m "refactor(smash): items are dash / freeze / vortex / meteor, equal odds; saves migrate from attack/shield/spin/missile and speed/bomb"
```

---

### Task 2: 拿掉劍盾加層機制,凍住改由 tickFrosts 倒數

**Files:**
- Modify: `smash/js/beys.js:47-56, 69-77`(刪 `layers`、`ATTACK_GAIN`、`SWORD_BURST`、`SHIELD_KNOCK`、`SHIELD_BURST`;`burstChance` 去掉層數倍率)
- Modify: `smash/js/physics.js:20, 57, 174, 244-248`(刪 `buffs`;撞擊公式去掉層數)
- Modify: `smash/js/items.js`(刪 `BUFF_TIME`、`MAX_LAYERS`、`addLayer`、`tickBuffs`;`tickFrosts` 負責 `frozen` 倒數;`explodeMeteors` 去掉盾倍率、冰塊不爆;`tickDashes` 不再碰 `buffs`)
- Modify: `smash/js/main.js:8, 143`(拿掉 `tickBuffs`)
- Modify: `smash/js/scene3d.js:141, 161-170, 490-520, 781-793, 816-819`(刪 `SWORD_RED`、盾泡泡 dome/rim/badge、`shields` 那段;`setOutline` 只剩補包綠框)
- Test: `test/smash-beys.test.js`、`test/smash.test.js`、`test/smash-items.test.js`、`test/smash-freeze.test.js`、`test/smash-dash.test.js`、`test/smash-whirl.test.js`

**Interfaces:**
- Consumes: Task 1 的 `explodeMeteors`、`world.meteors`、新道具 id。
- Produces: `burstChance({ power, attacker, target })`(只看類型與轉速);`tickFrosts(world, dt)` 也倒數 `Combatant.frozen`;Combatant 不再有 `buffs`。

- [ ] **Step 1: 寫失敗的測試**

`test/smash-freeze.test.js` 加(並把 import 的 `tickBuffs` 拿掉,原本「冰塊時間到就解凍」改用 `tickFrosts`):

```js
test('冰塊時間到就解凍(tickFrosts 倒數)', () => {
  let w = world([at('blue', 0, 0, frozen)]);
  w = tickFrosts(w, FREEZE_TIME / 2);
  assert.ok(w.combatants[0].frozen > 0);
  w = tickFrosts(w, FREEZE_TIME);
  assert.equal(w.combatants[0].frozen, 0);
});

test('冰塊被冰隕石砸到:被砸開,但不會爆(爆裂骰必中也一樣)', async () => {
  const { explodeMeteors } = await import('../smash/js/items.js');
  const meteor = { id: 'm', fighterId: 'red', x: 10, y: 0, fuse: 0.001 };
  const w = explodeMeteors(world([at('blue', 0, 0, frozen)], { meteors: [meteor] }), 1 / 60, () => 0);
  assert.equal(w.combatants[0].alive, true);
  assert.ok(w.combatants[0].vx < 0);
});

test('冰塊照樣會被冰旋渦捲走(在冰上滑)', async () => {
  const { tickWhirls, WHIRL_TIME } = await import('../smash/js/items.js');
  const w = tickWhirls(world([at('red', 0, 0, { whirl: WHIRL_TIME }), at('blue', 30, 0, frozen)]), 1 / 60);
  assert.ok(w.combatants[1].vx < 0);
});

test('冰塊只打敵人、一次兩顆:隊友在最近也不會被凍', () => {
  const w = applyPickups(world([
    at('red', 0, 0), at('red', 3, 0), at('blue', 30, 0), at('blue', -35, 0),
  ], { items: [{ id: 'i', type: 'freeze', x: 0, y: 0, radius: 7 }] }));
  assert.equal(w.frosts.length, 2);
  assert.ok(w.frosts.every(f => f.targetId.startsWith('c_blue')));
});
```

`test/smash-beys.test.js`:刪掉 `layers` 的 import 與「layers 數的是陣列長度」那個 test;`bey()` 不再帶 `buffs`;爆裂倍率 test 拿掉帶 `buffs` 的兩行(第 90、92 行)與第 105 行改成 `attacker: bey('attack')`;加:

```js
test('爆裂只看類型與轉速,沒有劍盾層數', async () => {
  const beys = await import('../smash/js/beys.js');
  for (const gone of ['layers', 'ATTACK_GAIN', 'SWORD_BURST', 'SHIELD_KNOCK', 'SHIELD_BURST']) assert.equal(beys[gone], undefined, gone);
});
```

`test/smash.test.js`:`at()` 拿掉 `buffs`;刪掉用 `buffs.attack` / `buffs.shield` 的 test(第 84、94、303 行所在的 test)與第 320 行 `assert.deepEqual(c.buffs, …)` 那一行。`test/smash-items.test.js`:刪掉 `addLayer`、`tickBuffs`、`BUFF_TIME`、`MAX_LAYERS` 的 import 與「最多疊 3 層」「層數倒數」兩個 test,以及第 159 行一帶帶盾的隕石 test;`at()` 拿掉 `buffs`。`test/smash-dash.test.js`、`test/smash-whirl.test.js`、`test/smash-freeze.test.js` 的 `at()` 拿掉 `buffs`;dash 的「不另外加劍的加成」test 改成只斷言 `dash === null` 與 `DASH_TIME <= 0.5`。

- [ ] **Step 2: 跑測試確認失敗**

Run: `node --test test/*.test.js 2>&1 | grep -E "^ℹ (pass|fail)|✖ "`
Expected: 失敗包含「冰塊時間到就解凍(tickFrosts 倒數)」「冰塊被冰隕石砸到」「爆裂只看類型與轉速」

- [ ] **Step 3: beys.js**

刪掉第 47-56 行(`layers` 到 `SHIELD_BURST`)。`burstChance` 改成:

```js
export function burstChance({ power, attacker, target }) {
  const k = hitStrength(power);
  if (k === 0) return 0;
  const dealt = attacker ? statsOf(attacker).burstDealt : 1;
  const taken = statsOf(target).burstTaken;
  const loose = 1 - Math.min(1, Math.max(0, target.spin ?? 1));
  const fragile = FULL_SPIN_BURST + (1 - FULL_SPIN_BURST) * loose ** 3;   // 還有七成轉速時幾乎不會爆,掉到兩三成才真的脆
  return Math.min(BURST_CAP, BURST_BASE * k * dealt * taken * fragile);
}
```

- [ ] **Step 4: physics.js**

import 拿掉 `ATTACK_GAIN, SHIELD_KNOCK, layers`;`createWorld` 的 combatant 拿掉 `buffs`;`step` 第一行改 `const next = world.combatants.map(c => ({ ...c }));`;撞擊公式:

```js
      // 加成是**不對稱**的:多出來的力只加在對方身上,自己的後座力維持原樣。
      // 代價是這一撞不守恆動量,但這是給小孩看的卡通碰撞,不是撞球。
      const impulse = (-(1 + RESTITUTION) * along) / (1 / a.mass + 1 / b.mass);
      const onto = (from, to) => statsOf(from).power * (to.frozen > 0 ? FROZEN_KNOCK : 1);
```

- [ ] **Step 5: items.js**

刪 `BUFF_TIME`、`MAX_LAYERS`、`addLayer`、`tickBuffs`、`applyPickups` 裡複製 `buffs` 的那段(改成 `world.combatants.map(c => ({ ...c }))`)、`tickDashes` 裡的 `buffs`(若還有)。`import` 改 `import { burstChance, HIT_POWER } from './beys.js';`。`tickFrosts` 開頭改成先倒數凍住,沒有飛行中的冰塊也要倒數:

```js
export function tickFrosts(world, dt) {
  const all = world.frosts ?? [];
  if (all.length === 0 && !world.combatants.some(c => c.frozen > 0)) return world;
  const combatants = world.combatants.map(c => (c.frozen > 0 ? { ...c, frozen: Math.max(0, c.frozen - dt) } : { ...c }));
  const frosts = [];
  for (const f of all) {
    const target = combatants.find(c => c.id === f.targetId);
    if (!target?.alive) continue;
    const t = f.t + dt;
    if (t >= FROST_FLIGHT) {
      target.frozen = FREEZE_TIME;
      target.dash = null;  // 正在衝刺也凍住
      target.vx *= 0.3;   // 凍住那一下頓住
      target.vy *= 0.3;
      continue;
    }
    frosts.push({ ...f, t });
  }
  return { ...world, combatants, frosts };
}
```

`explodeMeteors` 的迴圈本體:

```js
      const falloff = 1 - dist / BLAST_RADIUS;
      // 除以質量:重的被砸得比較輕,跟撞擊同一套規則
      const power = (BLAST_POWER * falloff) / c.mass;
      c.vx += (dx / dist) * power;
      c.vy += (dy / dist) * power;
      if (c.frozen > 0) continue;   // 冰塊:零件凍住了,不會爆
      if (power >= HIT_POWER && rng() < burstChance({ power, attacker: null, target: c })) {
```

- [ ] **Step 6: main.js**

import 拿掉 `tickBuffs`,刪 `world = tickBuffs(world, dt);`。

- [ ] **Step 7: scene3d.js**

刪 `SWORD_RED`;`setOutline` 改成:

```js
  // 外框:剛補完轉速(冰旋渦)那一下閃綠
  const HEAL_GREEN = 0x4CC38A;
  function setOutline(group, c, time) {
    const healing = time - (c.healedAt ?? -Infinity) < HEAL_FLASH;
    const color = healing ? HEAL_GREEN : INK;
    const grow = healing ? 1.2 : 1;
```

(其餘維持原本的描邊套用程式)。刪掉 `SHIELD_DOME`、`SHIELD_RIM`、`SHIELD_POP` 與 `actorFor` 裡建 `shield`(dome/rim/badge)那段、actor 的 `shield` 欄位、`draw` 裡 `const shields = …` 到 `}` 那段、出局時的 `a.shield.visible = false;`。`setOutline(a.group, { buffs: {} }, world.time)` 改 `setOutline(a.group, {}, world.time)`。

- [ ] **Step 8: 跑全部測試**

Run: `node --test test/*.test.js 2>&1 | grep -E "^ℹ (pass|fail)|✖ "`
Expected: fail 0。再 `grep -rn "buffs\|layers(\|ATTACK_GAIN\|SWORD\|SHIELD_\|addLayer\|tickBuffs" smash/js test` → 沒有輸出。

- [ ] **Step 9: 平衡沒歪**

Run: `node /private/tmp/claude-501/-Users-willian-github-gashapon/cf40b371-2c76-4544-8632-2e67dcb429fc/scratchpad/sim.mjs`(scratchpad 沒了就略過,ledger 記一行)
Expected: 對戰仍會結束;出局方式三種都有。

- [ ] **Step 10: Commit**

```bash
git add -A smash/js test
git commit -m "refactor(smash): drop the sword/shield layer system; frozen counts down in tickFrosts; ice blocks can't burst from a meteor either"
```

---

### Task 3: 冰隕石外觀(圖示 + 冰晶爆開)— 使用者挑圖 checkpoint

**Files:**
- Modify: `tools/mascot-gen/smash_prompts.json`(`meteor` 圖示提示詞、`fx.shatter`、`fx_picks`)
- Modify: `tools/mascot-gen/smash.py`(`FX` 加 `shatter`)
- Modify: `smash/js/scene3d.js`(`blastVisual`:`cloud` → `shatter`;冰隕石落下用 `meteor` 圖示)
- Rebuild: `smash/img/items/meteor.webp`、`smash/img/fx/shatter.webp`(刪 `cloud.webp`)、`smash/js/art.js`、`gashapon/img/preload.json`
- Test: `test/smash-art.test.js`

**Interfaces:**
- Consumes: Task 1 的 `meteor` id 與 `ITEM_URLS.meteor`;`FX_URLS` 結構 `{ name: { url, frames } }`。
- Produces: `FX_URLS = { impact, shatter, shock }`。

- [ ] **Step 1: 生冰隕石圖示(3 張)**

`smash_prompts.json` 加:

```json
"meteor": "The item is a chunky cartoon ice meteor falling down: a big jagged pale-blue ice crystal rock with white shine, pointing down, with a short icy blue and white streaking tail above it and a few small ice sparkles."
```

```bash
cd tools/mascot-gen && COMFY_URL=http://qoo-is-good.tplinkdns.com:8188 .venv/bin/python -c "import smash; smash.generate('meteor', smash.load_cfg()['meteor'], smash.SEEDS)"
```

Expected: `out/smash/meteor/s1..s3.png`。

- [ ] **Step 2: 生冰晶爆開逐格動畫(3 組)**

`smash.py`:`FX = ['impact', 'blast', 'cloud', 'shock', 'shatter']`。`smash_prompts.json` 的 `fx` 加:

```json
"shatter": {
  "start": "a small bright white and pale blue starburst flash of ice in the lower middle of the picture",
  "motion": "a cartoon ice explosion: the flash bursts into many sharp pale-blue and white ice crystal shards flying outward in all directions, then a big puffy white snow mist cloud spreads out and rises a little, glittering ice sparkles, then everything fades away into pure black"
}
```

```bash
COMFY_URL=http://qoo-is-good.tplinkdns.com:8188 tools/mascot-gen/.venv/bin/python tools/mascot-gen/smash.py fx shatter
tools/mascot-gen/.venv/bin/python tools/mascot-gen/smash.py fx-review
```

Expected: `out/smash/fx-shatter/s1..s3.png`(各 17 格)。

- [ ] **Step 3: 審圖頁給使用者挑(checkpoint,停下來等回覆)**

在 `tools/mascot-gen/review/smash-items2.html` 加「冰隕石」一排(三張疊盤面,照 Task 前已有的寫法),冰晶爆開看 `review/smash-fx.html`。把兩個網址給使用者,**等使用者回覆選哪張**再往下。

- [ ] **Step 4: 寫失敗的 art 測試**

`test/smash-art.test.js` 的特效 test:

```js
  assert.deepEqual(Object.keys(FX_URLS ?? {}).sort(), ['impact', 'shatter', 'shock']);
```

Run: `node --test test/smash-art.test.js` → Expected: FAIL

- [ ] **Step 5: pick + build**

`picks.meteor = "meteor/s<使用者選的>"`;`fx_picks = { "impact": "s1", "shatter": "s<使用者選的>", "shock": "s2" }`。

```bash
git rm -q smash/img/fx/cloud.webp
tools/mascot-gen/.venv/bin/python tools/mascot-gen/smash.py build
```

- [ ] **Step 6: scene3d 換成冰晶爆開**

`blastVisual` 的 `layers` 裡 `fxSprite('cloud', …)` 換成:

```js
      k > 0.03 ? fxSprite('shatter', (k - 0.03) / 0.97, blast.x, blast.y, 0, BLAST_RADIUS * FX_SHATTER_SPAN, { anchorY: 0.3, opacity: fade }) : null,
```

`FX_CLOUD_SPAN` 改名 `FX_SHATTER_SPAN = 2.6`(註解:冰晶碎片噴到大約爆炸範圍邊緣);`if (fxTex.has('cloud'))` → `'shatter'`。落下的那顆已經用 `itemTex.get('meteor')`(Task 1),確認 `missileVisual` 改名 `meteorVisual`、`MISSILE_FROM` / `MISSILE_SIZE` → `METEOR_FROM` / `METEOR_SIZE`,註解改「冰隕石」。

- [ ] **Step 7: 跑測試 + probe 截圖**

Run: `node --test test/*.test.js 2>&1 | grep -E "^ℹ (pass|fail)"` → fail 0。
開 `http://localhost:8765/_probe-smash.html?blastloop=1&pitch=55`(`_probe-smash.html` 裡 `strikes` 改 `meteors`),截三張(準星+落下、碎片噴開、雪霧),確認冰晶碎片大約噴到準星圈。

- [ ] **Step 8: Commit**

```bash
git add -A smash/ test/smash-art.test.js tools/mascot-gen/smash.py tools/mascot-gen/smash_prompts.json gashapon/img/preload.json
git commit -m "feat(smash): ice meteor — generated falling ice-crystal icon and an ice-shatter burst over the shockwave ring"
```

---

### Task 4: 真實頁面驗收(checkpoint)

**Files:** 無程式變更(發現問題回到對應 Task 修)。

- [ ] **Step 1:** `http://localhost:8765/smash/` cmd+shift+r;rAF 在背景分頁用 MessageChannel stub。設定頁「道具」分頁截圖:四個開關文字是衝刺 / 冰塊 / 冰旋渦 / 冰隕石。
- [ ] **Step 2:** 關掉冰隕石 → 存檔 → 重新整理 → 仍是關;用舊格式存檔(`localStorage['smash.v1']` 寫入 `{ attack:false, … }`)重新整理 → 衝刺是關。
- [ ] **Step 3:** 跑一場,截到至少一次衝刺、冰塊、冰旋渦、冰隕石(可用 probe 的 `?dasht=…&item=…`)。390 寬(iframe)與 1440 各一張。
- [ ] **Step 4:** 把截圖與觀察給使用者,等確認。ledger 記一行。

---

## Self-Review 紀錄

- Spec 覆蓋:改名 / 遷移 → T1;機率 → T1;清加層 → T2;冰隕石外觀 → T3;保留原型畫面 → T1 只改名、T2 只刪盾泡泡與劍紅框;測試清單 → T1/T2/T3;真實頁面 → T4。
- 模型三個錯誤版本:(1) T2 Step 1「冰塊只打敵人、一次兩顆」+ 既有 freeze test;(2) 既有「冰塊轉速不掉」「被撞不會爆」+ T2「冰隕石不會讓冰塊爆」;(3) T1 Step 1 遷移四個 test。
- 名稱一致:`explodeMeteors`、`METEOR_FUSE`、`world.meteors`、`tickFrosts`(負責 frozen 倒數)、`FX_URLS.shatter`。
