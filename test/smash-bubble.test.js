// 盾 = 反彈泡泡(原型):罩上冰泡泡 BUBBLE_TIME 秒,誰撞上來誰被猛力彈飛,自己幾乎不動、不會爆。
import test from 'node:test';
import assert from 'node:assert/strict';
import { applyPickups, explodeMissiles, BUBBLE_TIME } from '../smash/js/items.js';
import { step } from '../smash/js/physics.js';

const at = (fighterId, x, y, extra = {}) => ({
  id: `c_${fighterId}_${x}_${y}`, fighterId, x, y, vx: 0, vy: 0,
  radius: 8, mass: 1, alive: true, spin: 0.3, outBy: null, pocket: null, railing: false,
  beyType: 'attack', buffs: { attack: [], shield: [] }, healedAt: -Infinity, ...extra,
});
const world = (combatants, extra = {}) => ({ combatants, items: [], strikes: [], time: 10, ...extra });
const bubble = { buffs: { attack: [], shield: [BUBBLE_TIME] } };
const always = () => 0;

test('吃到盾:罩上泡泡 BUBBLE_TIME 秒;再吃一個是刷新,不疊層', () => {
  const item = { id: 'i', type: 'shield', x: 0, y: 0, radius: 7 };
  let w = applyPickups(world([at('red', 0, 0)], { items: [item] }));
  assert.deepEqual(w.combatants[0].buffs.shield, [BUBBLE_TIME]);
  w = { ...w, combatants: [{ ...w.combatants[0], buffs: { attack: [], shield: [1] } }] };
  w = applyPickups({ ...w, items: [item] });
  assert.deepEqual(w.combatants[0].buffs.shield, [BUBBLE_TIME]);
  assert.ok(BUBBLE_TIME <= 4);
});

// 紅撞上靜止的藍:比較藍有沒有泡泡時,雙方被彈開的速度
function hit(blue) {
  const w = step(world([at('red', -15.5, 0, { vx: 150 }), blue]), 1 / 60, () => 0.999);
  const [r, b] = w.combatants;
  return { red: Math.hypot(r.vx, r.vy), blue: Math.hypot(b.vx, b.vy), w };
}

test('撞上泡泡:撞的人被彈得比平常遠很多,有泡泡的那顆幾乎不動', () => {
  const plain = hit(at('blue', 0, 0));
  const shielded = hit(at('blue', 0, 0, bubble));
  assert.ok(shielded.red > plain.red * 2, `彈回 ${shielded.red.toFixed(0)} vs 平常 ${plain.red.toFixed(0)}`);
  assert.ok(shielded.blue < plain.blue * 0.3, `被推 ${shielded.blue.toFixed(0)} vs 平常 ${plain.blue.toFixed(0)}`);
});

test('有泡泡的那顆被撞不會爆裂(爆裂骰必中也一樣),而且記下被撞的時間給畫面「啵」一下', () => {
  const w = step(world([at('red', -15.5, 0, { vx: 300 }), at('blue', 0, 0, bubble)]), 1 / 60, always);
  assert.equal(w.combatants[1].alive, true);
  assert.equal(w.combatants[1].bubbleHitAt, 10);
});

test('隕石炸到泡泡:推得很少、不會爆', () => {
  const strike = { id: 's', fighterId: 'red', x: 10, y: 0, fuse: 0.001 };
  const plain = explodeMissiles(world([at('blue', 0, 0)], { strikes: [strike] }), 1 / 60, () => 0.999).combatants[0];
  const shielded = explodeMissiles(world([at('blue', 0, 0, bubble)], { strikes: [strike] }), 1 / 60, always).combatants[0];
  assert.equal(shielded.alive, true);
  assert.ok(Math.abs(shielded.vx) < Math.abs(plain.vx) * 0.4, `${shielded.vx} vs ${plain.vx}`);
  assert.deepEqual(shielded.buffs.shield, [], '泡泡破了');
});

test('一次性:真的撞上一次泡泡就破,第二下就是普通撞擊;輕輕擦到不會破', () => {
  const popped = step(world([at('red', -15.5, 0, { vx: 150 }), at('blue', 0, 0, bubble)]), 1 / 60, () => 0.999);
  assert.deepEqual(popped.combatants[1].buffs.shield, []);
  const brushed = step(world([at('red', -15.5, 0, { vx: 20 }), at('blue', 0, 0, bubble)]), 1 / 60, () => 0.999);
  assert.deepEqual(brushed.combatants[1].buffs.shield, [BUBBLE_TIME]);
});
