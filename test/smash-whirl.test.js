// 補包 = 冰旋風(原型):轉速補滿,再捲起旋風 WHIRL_TIME 秒,把 WHIRL_RADIUS 內的敵人往自己拉、繞著轉。
import test from 'node:test';
import assert from 'node:assert/strict';
import { applyPickups, tickWhirls, WHIRL_TIME, WHIRL_RADIUS } from '../smash/js/items.js';

const at = (fighterId, x, y, extra = {}) => ({
  id: `c_${fighterId}_${x}_${y}`, fighterId, x, y, vx: 0, vy: 0,
  radius: 8, mass: 1, alive: true, spin: 0.3, outBy: null, pocket: null, railing: false,
  beyType: 'attack', healedAt: -Infinity, ...extra,
});
const world = (combatants, extra = {}) => ({ combatants, items: [], meteors: [], frosts: [], time: 10, ...extra });
const whirling = { whirl: WHIRL_TIME, spin: 1 };

test('吃到補包:轉速補滿,捲起旋風', () => {
  const w = applyPickups(world([at('red', 0, 0)], { items: [{ id: 'i', type: 'vortex', x: 0, y: 0, radius: 7 }] }));
  assert.equal(w.combatants[0].spin, 1);
  assert.equal(w.combatants[0].whirl, WHIRL_TIME);
});

test('範圍內的敵人被往旋風中心拉,而且繞著轉(有切向速度)', () => {
  const w = tickWhirls(world([at('red', 0, 0, whirling), at('blue', 30, 0)]), 1 / 60);
  const b = w.combatants[1];
  assert.ok(b.vx < 0, '往中心');
  assert.ok(Math.abs(b.vy) > 0, '繞著轉');
});

test('隊友和範圍外的敵人不受影響', () => {
  const w = tickWhirls(world([at('red', 0, 0, whirling), at('red', 20, 0), at('blue', WHIRL_RADIUS + 15, 0)]), 1 / 60);
  assert.equal(w.combatants[1].vx, 0);
  assert.equal(w.combatants[2].vx, 0);
});

test('旋風 WHIRL_TIME 秒後停', () => {
  let w = world([at('red', 0, 0, whirling), at('blue', 30, 0)]);
  for (let i = 0; i < Math.ceil(WHIRL_TIME * 60) + 1; i++) w = tickWhirls(w, 1 / 60);
  assert.equal(w.combatants[0].whirl, 0);
  const after = tickWhirls({ ...w, combatants: w.combatants.map(c => ({ ...c, vx: 0, vy: 0 })) }, 1 / 60);
  assert.equal(after.combatants[1].vx, 0);
});
