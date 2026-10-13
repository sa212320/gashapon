// 陀螺的類型與轉速。類型是隨機發的,所以「有強弱」必須在數字上看得出來,
// 但又不能強到「抽到攻擊型就穩贏」—— 那一條留給整場的模擬測試。
import test from 'node:test';
import assert from 'node:assert/strict';
import { ANIMAL_URLS } from '../ghostleg/js/art.js';
import {
  ANIMALS, BEY_TYPES, TYPE_STATS, statsOf, HIT_POWER, HIT_FULL,
  beyRadius, rollBey, hitStrength, burstChance, decaySpin, SPIN_DECAY,
} from '../smash/js/beys.js';

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

const bey = (beyType, extra = {}) => ({ beyType, spin: 1, ...extra });

test('動物就是爬格子那 10 隻(圖直接共用)', () => {
  assert.deepEqual([...ANIMALS].sort(), Object.keys(ANIMAL_URLS).sort());
});

test('三種類型', () => {
  assert.deepEqual([...BEY_TYPES], ['attack', 'defense', 'stamina']);
});

test('類型有強弱:攻擊撞得兇但轉得短、防禦最重、耐久轉最久', () => {
  const { attack, defense, stamina } = TYPE_STATS;
  assert.ok(attack.power > defense.power);
  assert.ok(attack.decay > stamina.decay);
  assert.ok(defense.mass > attack.mass && defense.mass > stamina.mass);
  assert.ok(stamina.decay < defense.decay);
  assert.ok(stamina.mass < attack.mass, '耐久型要比較輕、容易被撞飛');
});

test('不認得的類型用中性數值,不會變成 NaN', () => {
  const s = statsOf({});
  for (const k of ['power', 'mass', 'decay', 'burstDealt', 'burstTaken']) assert.equal(s[k], 1);
});

test('動物與類型各自隨機,而且每一種都抽得到', () => {
  const rng = seeded(3);
  const animals = new Set();
  const types = new Set();
  for (let i = 0; i < 400; i++) {
    const b = rollBey(rng);
    animals.add(b.animal);
    types.add(b.beyType);
  }
  assert.equal(animals.size, ANIMALS.length);
  assert.equal(types.size, BEY_TYPES.length);
});

test('人多時陀螺縮小,20 人以內維持原尺寸', () => {
  assert.equal(beyRadius(3), 8);
  assert.equal(beyRadius(20), 8);
  assert.ok(beyRadius(80) < 8);
  assert.ok(Math.abs(beyRadius(80) - 8 * Math.sqrt(20 / 80)) < 1e-9);
});

test('撞擊強度:門檻以下是 0,HIT_FULL 以上是 1', () => {
  assert.equal(hitStrength(HIT_POWER - 1), 0);
  assert.equal(hitStrength(HIT_FULL + 100), 1);
});

test('輕輕碰到不會爆裂', () => {
  assert.equal(burstChance({ power: HIT_POWER - 1, attacker: bey('attack'), target: bey('stamina') }), 0);
});

// 開場大家都是滿轉速、又都帶著初速衝進來 —— 滿轉速也很容易爆的話,常常一開打就有人爆掉。
// 真的陀螺也是轉速掉了、零件鬆了才容易被撞散。
test('滿轉速很難爆:最重的一擊也不到 6%', () => {
  const p = burstChance({ power: HIT_FULL, attacker: bey('stamina'), target: bey('stamina') });
  assert.ok(p > 0 && p < 0.06, `${p}`);
});

test('攻擊型與劍讓對方更容易爆;防禦型與盾讓自己比較難爆', () => {
  const base = burstChance({ power: 200, attacker: bey('stamina'), target: bey('stamina') });
  assert.ok(burstChance({ power: 200, attacker: bey('attack'), target: bey('stamina') }) > base);
  assert.ok(burstChance({ power: 200, attacker: bey('stamina'), target: bey('defense') }) < base);
});

test('轉速愈低愈容易爆:快停的時候比滿轉速容易好幾倍', () => {
  const at = spin => burstChance({ power: 200, attacker: null, target: bey('stamina', { spin }) });
  assert.ok(at(0.5) > at(1) * 2);
  assert.ok(at(0) > at(1) * 6);
  assert.ok(at(0.2) > at(0.5));
});

test('機率有上限,三層劍加攻擊型也不會必爆', () => {
  const p = burstChance({
    power: HIT_FULL,
    attacker: bey('attack'),
    target: bey('stamina', { spin: 0 }),
  });
  assert.ok(p <= 0.9);
});

test('轉速每秒自然下降,耐久型掉得最慢', () => {
  const a = decaySpin(bey('attack'), 1);
  const s = decaySpin(bey('stamina'), 1);
  assert.ok(a < 1 && s < 1);
  assert.ok(s > a);
  assert.ok(Math.abs(decaySpin(bey('defense'), 1) - (1 - SPIN_DECAY)) < 1e-9);
});

test('爆裂只看類型與轉速,沒有劍盾層數', async () => {
  const beys = await import('../smash/js/beys.js');
  for (const gone of ['layers', 'ATTACK_GAIN', 'SWORD_BURST', 'SHIELD_KNOCK', 'SHIELD_BURST']) assert.equal(beys[gone], undefined, gone);
});
