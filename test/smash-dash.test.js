// 劍 = 衝刺(原型):吃到 → 原地蓄力 → 追著最近的敵人高速衝過去,衝刺中撞人是超重擊。
import test from 'node:test';
import assert from 'node:assert/strict';
import { applyPickups, tickDashes, DASH_WIND, DASH_TIME, DASH_SPEED } from '../smash/js/items.js';

const at = (fighterId, x, y, extra = {}) => ({
  id: `c_${fighterId}_${x}_${y}`, fighterId, x, y, vx: 0, vy: 0,
  radius: 8, mass: 1, alive: true, spin: 1, outBy: null, pocket: null, railing: false,
  buffs: { attack: [], shield: [] }, healedAt: -Infinity, ...extra,
});
const world = (combatants, extra = {}) => ({ combatants, items: [], strikes: [], time: 3, ...extra });
const sword = { id: 'i_attack', type: 'attack', x: 0, y: 0, radius: 7 };

test('吃到劍:鎖定最近的敵人,開始蓄力(不再是加一層)', () => {
  const w = applyPickups(world([at('red', 0, 0), at('blue', 40, 0), at('blue', -70, 0), at('red', 10, 0)], { items: [sword] }));
  const me = w.combatants[0];
  assert.equal(me.dash.targetId, 'c_blue_40_0');
  assert.equal(me.dash.wind, DASH_WIND);
  assert.deepEqual(me.buffs.attack, []);
});

test('場上沒有敵人就不衝', () => {
  const w = applyPickups(world([at('red', 0, 0), at('red', 30, 0)], { items: [sword] }));
  assert.equal(w.combatants[0].dash ?? null, null);
});

test('蓄力時往目標的反方向退(像拉彈弓),貼著對手發動也有助跑距離', () => {
  const me = at('red', 0, 0, { vx: 100, vy: 0, dash: { targetId: 'c_blue_17_0', wind: DASH_WIND, left: DASH_TIME } });
  let w = world([me, at('blue', 17, 0)]);
  for (let i = 0; i < 31; i++) {
    w = tickDashes(w, 1 / 60);
    w = { ...w, combatants: w.combatants.map(c => ({ ...c, x: c.x + c.vx / 60, y: c.y + c.vy / 60 })) };
  }
  assert.ok(w.combatants[0].x < -10, `退了 ${(-w.combatants[0].x).toFixed(1)}`);
  assert.ok(w.combatants[0].dash.wind <= 0);
});

test('貼著對手發動:蓄力完真的撞得到(有撞擊)', async () => {
  const { step } = await import('../smash/js/physics.js');
  const me = at('red', 0, 0, { dash: { targetId: 'c_blue_16_0', wind: DASH_WIND, left: DASH_TIME } });
  let w = world([me, at('blue', 16, 0)], { time: 10 });
  let hardest = 0;
  for (let i = 0; i < 70; i++) {
    w = tickDashes(w, 1 / 60);
    w = step(w, 1 / 60, () => 0.999);
    for (const im of w.impacts) hardest = Math.max(hardest, im.power);
  }
  assert.ok(hardest > 150, `最重一下 ${hardest.toFixed(0)}`);
});

test('蓄力完:速度直直指向目標「現在」的位置,快很多', () => {
  const me = at('red', 0, 0, { dash: { targetId: 'c_blue_0_50', wind: 0, left: DASH_TIME } });
  const w = tickDashes(world([me, at('blue', 0, 50)]), 1 / 60);
  const c = w.combatants[0];
  assert.ok(Math.abs(c.vx) < 1e-6);
  assert.ok(Math.abs(c.vy - DASH_SPEED) < 1e-6);
});

test('衝刺只有一下下(DASH_TIME 秒),不另外加劍的加成', () => {
  const me = at('red', 0, 0, { dash: { targetId: 'c_blue_0_90', wind: 0, left: DASH_TIME } });
  let w = tickDashes(world([me, at('blue', 0, 90)]), 1 / 60);
  assert.deepEqual(w.combatants[0].buffs.attack, []);
  for (let i = 0; i < Math.ceil(DASH_TIME * 60); i++) w = tickDashes(w, 1 / 60);
  assert.equal(w.combatants[0].dash, null);
  assert.ok(DASH_TIME <= 0.5);
});

test('目標先出局了就改衝下一個最近的敵人', () => {
  const me = at('red', 0, 0, { dash: { targetId: 'gone', wind: 0, left: DASH_TIME } });
  const w = tickDashes(world([me, at('blue', -30, 0)]), 1 / 60);
  assert.ok(w.combatants[0].vx < 0);
});

test('撞到敵人那一刻衝刺就結束,自己頓住(不會推著對方一起衝進洞)', () => {
  const me = at('red', 0, 0, { vx: 0, vy: 200, dash: { targetId: 'c_blue_0_16', wind: 0, left: DASH_TIME } });
  const w = tickDashes(world([me, at('blue', 0, 16)]), 1 / 60);
  assert.equal(w.combatants[0].dash, null);
  assert.ok(Math.hypot(w.combatants[0].vx, w.combatants[0].vy) < 60);
});

test('真的撞一次:衝的那顆停在附近,被撞的飛得比它遠', async () => {
  const { step } = await import('../smash/js/physics.js');
  const me = at('red', -30, 0, { dash: { targetId: 'c_blue_0_0', wind: 0, left: DASH_TIME } });
  let w = world([me, at('blue', 0, 0)]);
  for (let i = 0; i < 45; i++) { w = tickDashes(w, 1 / 60); w = step(w, 1 / 60, () => 0.999); }
  const [a, b] = w.combatants;
  assert.ok(b.x - 0 > a.x - (-30), `衝的走了 ${(a.x + 30).toFixed(0)}、被撞的走了 ${b.x.toFixed(0)}`);
});

test('衝過去撞人的自己不會爆裂(爆裂骰必中時,只有被撞的爆)', async () => {
  const { step } = await import('../smash/js/physics.js');
  const me = at('red', -17, 0, { vx: 200, vy: 0, dash: { targetId: 'c_blue_0_0', wind: 0, left: DASH_TIME } });
  const w = step(world([me, at('blue', 0, 0)], { time: 10 }), 1 / 60, () => 0);
  assert.equal(w.combatants[0].alive, true);
  assert.equal(w.combatants[1].outBy, 'burst');
});
