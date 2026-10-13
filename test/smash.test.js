// 大亂鬥的物理與勝負判定。
//
// 最要釘死的兩句:
//   1. **Fighter 就是隊伍**,沒有獨立的 Team;count 就是隊伍人數。
//   2. **同隊不互相擊飛** —— 會分離避免穿透,但不施加任何衝量。
// 這也是整個站上唯一「結果不預先決定」的模式,所以物理必須真的算對。
import test from 'node:test';
import assert from 'node:assert/strict';

import { createFighter, pickColor, PALETTE } from '../smash/js/fighters.js';
import { createWorld, step, think, aliveOf, winnerTeam, HIT_POWER } from '../smash/js/physics.js';
import { bowlDistance, zoneAt, pocketAt, POCKETS, ZONE } from '../smash/js/stadium.js';
import { BEY_TYPES, ANIMALS, TYPE_STATS } from '../smash/js/beys.js';

function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const arena = { items: [], strikes: [], time: 0 };
// 測試用的陀螺:預設耐久型以外的「中性」類型(沒有 beyType)—— 數值全是 1,
// 這樣原本那些撞擊測試的數字不必跟著類型表改。
const at = (fighterId, x, y, vx = 0, vy = 0, extra = {}) => ({
  id: `c_${fighterId}_${x}_${y}`, fighterId, x, y, vx, vy,
  radius: 8, mass: 1, alive: true, spin: 1, outBy: null, pocket: null, railing: false,
  buffs: { attack: [], shield: [] }, healedAt: -Infinity, ...extra,
});
const noRng = () => 0.999;   // 擲骰永遠不中:撞擊測試不要被爆裂干擾

/* ---------- 隊伍就是 Fighter ---------- */

test('count 就是隊伍人數 —— 一筆 Fighter 展開成好幾個 Combatant', () => {
  const fighters = [createFighter({ name: '紅隊', count: 3 }), createFighter({ name: '藍隊', count: 2 })];
  const world = createWorld({ fighters, rng: seeded(1) });
  assert.equal(world.combatants.length, 5);
  assert.equal(world.combatants.filter(c => c.fighterId === fighters[0].id).length, 3);
  assert.ok(world.combatants.every(c => c.alive));
});

test('count 不可信時當成 0', () => {
  assert.equal(createFighter({ count: Infinity }).count, 0);
  assert.equal(createFighter({ count: NaN }).count, 0);
  assert.equal(createFighter({ count: -2 }).count, 0);
});

test('pickColor 在調色盤用完之前不重複', () => {
  const chosen = [];
  for (let i = 0; i < PALETTE.length; i++) chosen.push({ color: pickColor(chosen) });
  assert.equal(new Set(chosen.map(c => c.color)).size, PALETTE.length);
});

/* ---------- 同隊不互相擊飛 ---------- */

test('同隊撞在一起只會分開,速度不變', () => {
  const a = at('red', -4, 0, 50, 0);
  const b = at('red', 4, 0, -50, 0);
  const out = step({ ...arena, combatants: [a, b] }, 1 / 60, noRng);
  const [na, nb] = out.combatants;
  // 速度只受摩擦影響,沒有任何來自碰撞的衝量
  assert.ok(Math.abs(na.vx - 50 * 0.995) < 1e-6, `同隊被擊飛了:vx ${na.vx}`);
  assert.ok(Math.abs(nb.vx + 50 * 0.995) < 1e-6, `同隊被擊飛了:vx ${nb.vx}`);
  // 但還是要分開,不然會互相穿透
  assert.ok(nb.x - na.x >= 8, '同隊穿透了');
});

test('不同隊撞在一起會互相彈開', () => {
  const a = at('red', -4, 0, 50, 0);
  const b = at('blue', 4, 0, -50, 0);
  const out = step({ ...arena, combatants: [a, b] }, 1 / 60, noRng);
  const [na, nb] = out.combatants;
  assert.ok(na.vx < -10, `紅隊沒有被彈開:vx ${na.vx}`);
  assert.ok(nb.vx > 10, `藍隊沒有被彈開:vx ${nb.vx}`);
});

test('攻擊道具會讓自己撞出去的力更大', () => {
  const base = step({ ...arena, combatants: [at('red', -4, 0, 50, 0), at('blue', 4, 0, -50, 0)] }, 1 / 60, noRng);
  const buffed = at('red', -4, 0, 50, 0);
  buffed.buffs.attack = [8];
  const boosted = step({ ...arena, combatants: [buffed, at('blue', 4, 0, -50, 0)] }, 1 / 60, noRng);
  assert.ok(boosted.combatants[1].vx > base.combatants[1].vx, '攻擊道具沒有加成');
});

/* ---------- 道具的效果 ---------- */

// 衝量對稱的話,攻擊力等於「兩邊一起飛得更遠」—— 對「誰被撞出場」幾乎沒有影響,
// 撿到的人自己也被彈得更遠。要有感覺,多出來的力必須只加在對方身上。
test('攻擊力是打在對方身上,不是兩邊一起飛', () => {
  const a = { ...at('red', -8, 0, 140, 0), buffs: { attack: [8, 8], shield: [] } };
  const b = at('blue', 8, 0, -140, 0);
  const out = step({ ...arena, combatants: [a, b] }, 1 / 60, noRng);
  const me = Math.abs(out.combatants[0].vx);
  const him = Math.abs(out.combatants[1].vx);
  assert.ok(him > me * 1.5, `對方 ${him.toFixed(0)} 應該明顯大於自己 ${me.toFixed(0)}`);
});

test('沒有攻擊力時兩邊彈開的力一樣大', () => {
  const out = step({ ...arena, combatants: [at('red', -8, 0, 140, 0), at('blue', 8, 0, -140, 0)] }, 1 / 60, noRng);
  const me = Math.abs(out.combatants[0].vx);
  const him = Math.abs(out.combatants[1].vx);
  assert.ok(Math.abs(me - him) < 1, `${me.toFixed(2)} vs ${him.toFixed(2)}`);
});

/* ---------- 撞擊回報(給演出與音效用)---------- */

// 實測一場比賽平均每秒 15 次碰撞,但 power 中位數只有 3 —— 絕大多數是
// 陀螺靠在一起互相推擠。全部回報的話畫面會變閃光燈、聲音會變機關槍。
test('輕輕靠在一起不算撞到,不會回報', () => {
  const out = step({ ...arena, combatants: [at('red', -7.9, 0, 1, 0), at('blue', 7.9, 0, -1, 0)] }, 1 / 60, noRng);
  assert.equal(out.impacts.length, 0);
});

test('用力對撞才回報,而且記下位置與強度', () => {
  const out = step({ ...arena, combatants: [at('red', -7.9, 0, 200, 0), at('blue', 7.9, 0, -200, 0)] }, 1 / 60, noRng);
  assert.equal(out.impacts.length, 1);
  assert.ok(Math.abs(out.impacts[0].x) < 1, '接觸點應該在兩顆中間');
  assert.ok(out.impacts[0].power >= HIT_POWER);
});

test('同隊撞在一起不回報 —— 隊友之間根本沒有衝量可言', () => {
  const out = step({ ...arena, combatants: [at('red', -7.9, 0, 200, 0), at('red', 7.9, 0, -200, 0)] }, 1 / 60, noRng);
  assert.equal(out.impacts.length, 0);
});

test('impacts 每一格重算,不會累積', () => {
  const hard = { ...arena, combatants: [at('red', -7.9, 0, 200, 0), at('blue', 7.9, 0, -200, 0)] };
  const first = step(hard, 1 / 60, noRng);
  assert.equal(first.impacts.length, 1);
  // 撞完彈開之後再跑一格,上一格的撞擊不該還留著
  const second = step(first, 1 / 60, noRng);
  assert.equal(second.impacts.length, 0);
});

/* ---------- 盤子:牆、口袋 ---------- */

test('慢慢撞到軌道會彈回碗裡,不會出局', () => {
  const out = step({ ...arena, combatants: [at('red', 84, 0, 20, 0)] }, 1 / 60, noRng);
  const c = out.combatants[0];
  assert.equal(c.alive, true);
  assert.ok(!c.ledge);
  assert.ok(c.vx < 0, `沒有彈回來:vx ${c.vx}`);
  assert.ok(bowlDistance(c.x, c.y) + c.radius <= 0.5, '還卡在軌道上');
});

test('撞得夠快就跳過軌道,上到平台', () => {
  const out = step({ ...arena, combatants: [at('red', 84, 0, 300, 0)] }, 1 / 60, noRng);
  assert.equal(out.combatants[0].ledge, true);
  assert.equal(out.combatants[0].alive, true);
});

test('平台上撞到外殼會彈回來,不會出局', () => {
  let w = { ...arena, combatants: [at('red', 95, 0, 300, 0, { ledge: true })] };
  for (let i = 0; i < 10; i++) w = step(w, 1 / 60, noRng);
  const o = w.combatants[0];
  assert.equal(o.alive, true);
  assert.notEqual(zoneAt(o.x, o.y), ZONE.OUT, '跑出盤外了');
});

test('後面沒有出口 —— 往後撞再快也只會彈回來', () => {
  let w = { ...arena, combatants: [at('red', 0, -70, 0, -500)] };
  for (let i = 0; i < 20; i++) w = step(w, 1 / 60, noRng);
  assert.equal(w.combatants[0].alive, true);
});

test('前角:夠快就跳過軌道、飛過邊緣,掉進方槽', () => {
  const k = Math.SQRT1_2;
  let w = { ...arena, combatants: [at('red', 50, 50, 400 * k, 400 * k)] };
  for (let i = 0; i < 20 && w.combatants[0].alive; i++) w = step(w, 1 / 60, noRng);
  const c = w.combatants[0];
  assert.equal(c.outBy, 'ringout');
  assert.equal(c.pocket, 'right');
  assert.equal(pocketAt(c.x, c.y)?.id, 'right', '要停在方槽裡');
  assert.equal(c.vx, 0);
  assert.equal(c.vy, 0);
});

test('前角:在平台上慢慢晃到邊緣,會被擋下來', () => {
  // 沿 y = 60 往外找到「平台 → 邊緣」的交界,從平台那一側慢慢往邊緣推
  let x = 60;
  while (zoneAt(x + 0.5, 60) !== ZONE.LIP) x += 0.5;
  let w = { ...arena, combatants: [at('red', x - 1, 60, 30, 0, { ledge: true })] };
  for (let i = 0; i < 30; i++) w = step(w, 1 / 60, noRng);
  assert.equal(w.combatants[0].alive, true);
});

test('正前方:跳過軌道就掉進凹槽', () => {
  let w = { ...arena, combatants: [at('red', 0, 60, 0, 400)] };
  for (let i = 0; i < 10 && w.combatants[0].alive; i++) w = step(w, 1 / 60, noRng);
  const c = w.combatants[0];
  assert.equal(c.outBy, 'ringout');
  assert.equal(c.pocket, 'center');
  assert.equal(pocketAt(c.x, c.y)?.id, 'center');
});

test('隨機高速也不會穿牆:除了出口,永遠不會出現在盤外或牆裡', () => {
  let seed = 1;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  for (let i = 0; i < 400; i++) {
    const a = rnd() * Math.PI * 2;
    const v = 200 + rnd() * 900;
    const c = at('red', (rnd() * 2 - 1) * 50, (rnd() * 2 - 1) * 50, Math.cos(a) * v, Math.sin(a) * v, { radius: 5 });
    let w = { ...arena, combatants: [c] };
    for (let f = 0; f < 30; f++) w = step(w, 0.033, noRng);
    const o = w.combatants[0];
    if (o.outBy === 'ringout') {
      assert.ok(POCKETS.some(p => p.id === o.pocket));
    } else {
      const z = zoneAt(o.x, o.y);
      assert.ok(z !== ZONE.OUT && z !== ZONE.WALL && z !== ZONE.PILLAR, `#${i} 跑到 (${o.x.toFixed(1)}, ${o.y.toFixed(1)}) 區域 ${z}`);
    }
  }
});

test('擠在牆邊互撞,也不會被推進牆裡或盤外', () => {
  // 一群陀螺擠在平台上靠近外殼與柱子的地方,互相推來推去
  let seed = 3;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const spots = [[93, 0], [-93, 0], [0, -86], [-60, 80], [60, 80], [70, -60]];
  for (const [sx, sy] of spots) {
    const crowd = Array.from({ length: 8 }, (_, i) => at(i % 2 ? 'red' : 'blue', sx + (rnd() - 0.5) * 12, sy + (rnd() - 0.5) * 12,
      (rnd() - 0.5) * 400, (rnd() - 0.5) * 400, { ledge: true, id: `c${i}` }));
    let w = { ...arena, combatants: crowd };
    for (let f = 0; f < 60; f++) {
      w = step(w, 1 / 60, noRng);
      for (const c of w.combatants) {
        if (!c.alive) continue;
        const z = zoneAt(c.x, c.y);
        assert.ok(z !== ZONE.OUT && z !== ZONE.WALL && z !== ZONE.PILLAR, `(${sx},${sy}) 第 ${f} 格:(${c.x.toFixed(1)}, ${c.y.toFixed(1)}) 在區域 ${z}`);
      }
    }
  }
});

/* ---------- 坡度與軌道 ---------- */

test('坡度把靜止在坡上的陀螺往中央拉', () => {
  const out = step({ ...arena, combatants: [at('red', 70, 0)] }, 1 / 60, noRng);
  assert.ok(out.combatants[0].vx < 0);
});

test('軌道上順著牆加速', () => {
  const out = step({ ...arena, combatants: [at('red', 83, 0, 0, 60)] }, 1 / 60, noRng);
  assert.ok(out.combatants[0].vy > 60 * 0.995, '沒有沿牆加速');
});

test('離開軌道的那一格會被往中央甩', () => {
  // 上一格還在軌道上(railing),這一格已經離開 —— 速度要多出朝內的分量
  const c = at('red', 40, -40, 0, 0, { railing: true });   // 離碗緣 26,不在軌道上
  const out = step({ ...arena, combatants: [{ ...c, vx: 0, vy: 200 }] }, 1 / 60, noRng);
  const o = out.combatants[0];
  assert.ok(o.vx < -20, `沒有往中央甩:vx ${o.vx}`);
  assert.equal(o.railing, false);
});

/* ---------- 轉速 ---------- */

test('轉速會自然下降,歸零就停轉出局', () => {
  const out = step({ ...arena, combatants: [at('red', 0, 0, 0, 0, { spin: 0.0003 })] }, 1 / 60, noRng);
  assert.equal(out.combatants[0].alive, false);
  assert.equal(out.combatants[0].outBy, 'spinout');
});

test('被重擊會多扣轉速', () => {
  const calm = step({ ...arena, combatants: [at('red', -40, 0), at('blue', 40, 0)] }, 1 / 60, noRng);
  const hit = step({ ...arena, combatants: [at('red', -7.9, 0, 260, 0), at('blue', 7.9, 0, -260, 0)] }, 1 / 60, noRng);
  assert.ok(hit.combatants[1].spin < calm.combatants[1].spin);
});

test('重擊時擲骰中了就爆裂出局', () => {
  const always = () => 0;
  const out = step({ ...arena, time: 5, combatants: [at('red', -7.9, 0, 260, 0), at('blue', 7.9, 0, -260, 0)] }, 1 / 60, always);
  assert.ok(out.combatants.some(c => c.outBy === 'burst'));
});

test('開場 3 秒內不會爆裂(剛射出去的保護期)', () => {
  const always = () => 0;
  const w = { ...arena, time: 1, combatants: [at('red', -7.9, 0, 260, 0, { spin: 0.1 }), at('blue', 7.9, 0, -260, 0, { spin: 0.1 })] };
  const out = step(w, 1 / 60, always);
  assert.ok(out.combatants.every(c => c.outBy !== 'burst'));
  const later = step({ ...w, time: 3.5 }, 1 / 60, always);
  assert.ok(later.combatants.some(c => c.outBy === 'burst'));
});

test('同隊再怎麼撞都不會爆裂', () => {
  const always = () => 0;
  const out = step({ ...arena, combatants: [at('red', -7.9, 0, 260, 0), at('red', 7.9, 0, -260, 0)] }, 1 / 60, always);
  assert.ok(out.combatants.every(c => c.alive));
});

test('防禦型比較重,同樣一撞被彈得比較近', () => {
  const light = step({ ...arena, combatants: [at('red', -7.9, 0, 200, 0), at('blue', 7.9, 0, -200, 0, { beyType: 'stamina', mass: TYPE_STATS.stamina.mass })] }, 1 / 60, noRng);
  const heavy = step({ ...arena, combatants: [at('red', -7.9, 0, 200, 0), at('blue', 7.9, 0, -200, 0, { beyType: 'defense', mass: TYPE_STATS.defense.mass })] }, 1 / 60, noRng);
  assert.ok(heavy.combatants[1].vx < light.combatants[1].vx);
});

test('盾讓自己被彈得比較近', () => {
  const plain = step({ ...arena, combatants: [at('red', -7.9, 0, 200, 0), at('blue', 7.9, 0, -200, 0)] }, 1 / 60, noRng);
  const shielded = step({ ...arena, combatants: [at('red', -7.9, 0, 200, 0), at('blue', 7.9, 0, -200, 0, { buffs: { attack: [], shield: [8] } })] }, 1 / 60, noRng);
  assert.ok(shielded.combatants[1].vx < plain.combatants[1].vx);
});

/* ---------- 開場 ---------- */

test('開場:每顆陀螺各自抽動物與類型,生在盤內、轉速滿', () => {
  const fighters = [createFighter({ name: '紅', count: 6 }), createFighter({ name: '藍', count: 6 })];
  let seed = 9;
  const rng = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const w = createWorld({ fighters, rng });
  for (const c of w.combatants) {
    assert.ok(ANIMALS.includes(c.animal));
    assert.ok(BEY_TYPES.includes(c.beyType));
    assert.equal(c.spin, 1);
    assert.equal(c.mass, TYPE_STATS[c.beyType].mass);
    assert.ok(bowlDistance(c.x, c.y) < -c.radius);
    assert.deepEqual(c.buffs, { attack: [], shield: [] });
  }
  // Fighter 本身沒有被加上動物欄位
  assert.ok(!('animal' in fighters[0]));
});

test('120 個人也全部生在盤內,而且縮小了', () => {
  const fighters = Array.from({ length: 10 }, (_, i) => createFighter({ name: `隊${i}`, count: 12 }));
  const w = createWorld({ fighters, rng: Math.random });
  assert.equal(w.combatants.length, 120);
  for (const c of w.combatants) {
    assert.ok(c.radius < 8);
    assert.ok(bowlDistance(c.x, c.y) < -c.radius);
  }
});

/* ---------- 勝負 ---------- */

test('還在場內就不會被誤判淘汰', () => {
  const out = step({ ...arena, combatants: [at('red', 0, 0)] }, 1 / 60, noRng);
  assert.equal(out.combatants[0].alive, true);
});

test('winnerTeam:只剩一隊有人活著才分勝負', () => {
  const both = { ...arena, combatants: [at('red', -20, 0), at('blue', 20, 0)] };
  assert.equal(winnerTeam(both), null);

  const dead = at('blue', 20, 0);
  dead.alive = false;
  assert.equal(winnerTeam({ ...arena, combatants: [at('red', -20, 0), dead] }), 'red');
});

test('同一隊剩幾個人都算同一隊贏', () => {
  const dead = at('blue', 20, 0);
  dead.alive = false;
  const world = { ...arena, combatants: [at('red', -20, 0), at('red', -30, 0), dead] };
  assert.equal(winnerTeam(world), 'red');
  assert.equal(aliveOf(world).length, 2);
});

test('全部出局時沒有贏家,不會回一個假的隊伍', () => {
  const a = at('red', 0, 0); a.alive = false;
  const b = at('blue', 0, 0); b.alive = false;
  assert.equal(winnerTeam({ ...arena, combatants: [a, b] }), null);
});

test('step 不就地改動傳進來的 world', () => {
  const world = { ...arena, combatants: [at('red', 0, 0, 10, 0)] };
  const before = JSON.stringify(world);
  step(world, 1 / 60, noRng);
  assert.equal(JSON.stringify(world), before);
});

/* ---------- AI ---------- */

test('會往敵人移動', async () => {
  const { think } = await import('../smash/js/physics.js');
  const out = think({ ...arena, combatants: [at('red', 0, 0), at('blue', 50, 0)] }, 1 / 60);
  assert.ok(out.combatants[0].vx > 0, '紅隊沒有往敵人移動');
  assert.ok(out.combatants[1].vx < 0, '藍隊沒有往敵人移動');
});

test('不會追著隊友跑', async () => {
  const { think } = await import('../smash/js/physics.js');
  const out = think({ ...arena, combatants: [at('red', 0, 0), at('red', 50, 0)] }, 1 / 60);
  assert.equal(out.combatants[0].vx, 0);
  assert.equal(out.combatants[1].vx, 0);
});

test('場中央不會被邊緣的斥力干擾', async () => {
  const { think } = await import('../smash/js/physics.js');
  const out = think({ ...arena, combatants: [at('red', 0, 0), at('blue', 40, 0)] }, 1 / 60);
  assert.ok(out.combatants[0].vx > 0, '在場中央反而往後退');
});

test('道具比敵人近的時候會先去撿', async () => {
  const { think } = await import('../smash/js/physics.js');
  const w = { ...arena, combatants: [at('red', 0, 0), at('blue', -70, 0)], items: [{ id: 'i', type: 'attack', x: 20, y: 0, radius: 7 }] };
  assert.ok(think(w, 1 / 60).combatants[0].vx > 0, '沒有先去撿旁邊的道具');
});

test('站在牆邊不再主動往中央閃 —— 要靠坡度,不是靠 AI', () => {
  // 敵人在更右邊:只會追人的話 vx 會是正的。以前的躲邊緣會把它變成負的。
  const out = think({ ...arena, combatants: [at('red', 90, 0), at('blue', 96, 0)] }, 1 / 60);
  assert.ok(out.combatants[0].vx > 0);
});

test('找人的力道比以前弱一半(90 → 45)', () => {
  const out = think({ ...arena, combatants: [at('red', 0, 0), at('blue', 50, 0)] }, 1);
  assert.ok(Math.abs(out.combatants[0].vx - 45) < 1e-6, `${out.combatants[0].vx}`);
});

test('準星快落下時,圈內的陀螺會往外偏一點', () => {
  const w = { ...arena, combatants: [at('red', 10, 0), at('blue', -60, 0)], strikes: [{ id: 's', fighterId: 'blue', x: 0, y: 0, fuse: 0.3 }] };
  // 敵人在左邊,不躲的話 vx 會是負的(往左追)
  const out = think(w, 1 / 60);
  const plain = think({ ...w, strikes: [] }, 1 / 60);
  assert.ok(out.combatants[0].vx > plain.combatants[0].vx, '沒有往外偏');
});

test('準星還早就不理它', () => {
  const w = { ...arena, combatants: [at('red', 10, 0), at('blue', -60, 0)], strikes: [{ id: 's', fighterId: 'blue', x: 0, y: 0, fuse: 1.1 }] };
  assert.equal(think(w, 1 / 60).combatants[0].vx, think({ ...w, strikes: [] }, 1 / 60).combatants[0].vx);
});
