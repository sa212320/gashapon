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

test('蓄力時幾乎停在原地', () => {
  const me = at('red', 0, 0, { vx: 100, vy: 0, dash: { targetId: 'c_blue_40_0', wind: DASH_WIND, left: DASH_TIME } });
  const w = tickDashes(world([me, at('blue', 40, 0)]), 0.1);
  assert.ok(Math.abs(w.combatants[0].vx) < 60);
  assert.ok(w.combatants[0].dash.wind < DASH_WIND);
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
