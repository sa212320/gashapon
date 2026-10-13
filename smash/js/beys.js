// 戰鬥陀螺的類型、轉速與爆裂。全部是純函式。
//
// 每一顆陀螺(Combatant)開打時**各自隨機**抽一隻動物與一種類型,兩者互相獨立,
// 不存檔、每場重抽 —— 動物不是隊伍的屬性,同一隊只靠隊伍色認。
// 造型就是類型,而且有強弱;轉速只代表「還剩多少命」,**不影響撞擊力**。

export const ANIMALS = Object.freeze(['snowman', 'rabbit', 'penguin', 'reindeer', 'cat', 'dog', 'bear', 'seal', 'owl', 'hamster']);
export const BEY_TYPES = Object.freeze(['attack', 'defense', 'stamina']);

//   power      撞別人時,對方被彈開的力道倍率
//   mass       重量(越重越難被撞飛,炸彈也一樣)
//   decay      轉速衰減倍率
//   burstDealt 撞別人時,對方爆裂機率倍率
//   burstTaken 自己被撞時的爆裂機率倍率
export const TYPE_STATS = Object.freeze({
  attack: Object.freeze({ power: 1.4, mass: 1, decay: 1.3, burstDealt: 1.5, burstTaken: 1 }),
  defense: Object.freeze({ power: 0.8, mass: 1.5, decay: 1, burstDealt: 1, burstTaken: 0.5 }),
  stamina: Object.freeze({ power: 1, mass: 0.8, decay: 0.95, burstDealt: 1, burstTaken: 1 }),
});
const NEUTRAL = Object.freeze({ power: 1, mass: 1, decay: 1, burstDealt: 1, burstTaken: 1 });

export function statsOf(c) {
  return TYPE_STATS[c?.beyType] ?? NEUTRAL;
}

// 多大的一下才算「撞到」(演出、音效、爆裂都用這道門檻)。
// 實測一場平均每秒 15 次碰撞,power 中位數只有 3 —— 那是互相推擠,不是撞擊。
export const HIT_POWER = 90;
// power 到這個值就是最大的演出與最大聲,爆裂機率也到頂
export const HIT_FULL = 260;

export const BASE_RADIUS = 8;
const CROWD = 20;

// 超過 20 人就整體縮小,盤子與鏡頭不動。面積跟人數成反比,所以半徑乘根號。
export function beyRadius(total) {
  return total > CROWD ? BASE_RADIUS * Math.sqrt(CROWD / total) : BASE_RADIUS;
}

export function rollBey(rng = Math.random) {
  return {
    animal: ANIMALS[Math.floor(rng() * ANIMALS.length)],
    beyType: BEY_TYPES[Math.floor(rng() * BEY_TYPES.length)],
  };
}

// 劍 / 盾的層數:buffs.attack / buffs.shield 是「每一層的剩餘秒數」陣列。
export function layers(c, kind) {
  return c?.buffs?.[kind]?.length ?? 0;
}

// 每一層劍:對方彈開力道 = 1 + 層數 × ATTACK_GAIN(沿用原本的加成公式)
export const ATTACK_GAIN = 1.9;
export const SWORD_BURST = 1.5;   // 每一層劍:對方爆裂機率 ×1.5
export const SHIELD_KNOCK = 0.6;  // 每一層盾:自己被彈開 ×0.6
export const SHIELD_BURST = 0.5;  // 每一層盾:自己爆裂機率 ×0.5

export function hitStrength(power) {
  return Math.min(1, Math.max(0, (power - HIT_POWER) / (HIT_FULL - HIT_POWER)));
}

const BURST_BASE = 0.5;    // 最重的一擊、雙方都中性、轉速快沒了的時候的爆裂機率
const FULL_SPIN_BURST = 0.04;   // 滿轉速時只剩這個倍數 —— 開場大家都滿轉速,不能一撞就爆
const BURST_CAP = 0.9;     // 再怎麼疊也不會必爆

// target 被 power 這麼重的一下打到時,爆裂的機率。attacker 是 null 代表飛彈。
// 爆裂主要發生在轉速掉下來之後(真的陀螺也是轉慢了、零件鬆了才容易被撞散):
// 滿轉速 ×0.04,轉速愈低愈脆,歸零時 ×1。這只影響爆裂,不影響撞擊力。
export function burstChance({ power, attacker, target }) {
  const k = hitStrength(power);
  if (k === 0) return 0;
  const dealt = attacker ? statsOf(attacker).burstDealt * SWORD_BURST ** layers(attacker, 'attack') : 1;
  const taken = statsOf(target).burstTaken * SHIELD_BURST ** layers(target, 'shield');
  const loose = 1 - Math.min(1, Math.max(0, target.spin ?? 1));
  const fragile = FULL_SPIN_BURST + (1 - FULL_SPIN_BURST) * loose ** 3;   // 還有七成轉速時幾乎不會爆,掉到兩三成才真的脆
  return Math.min(BURST_CAP, BURST_BASE * k * dealt * taken * fragile);
}

export const SPIN_DECAY = 1 / 30;   // 中性陀螺每秒掉這麼多(約 30 秒轉完)
export const HIT_SPIN_COST = 0.18;  // 被最重的一擊打到時扣這麼多,依撞擊強度縮放
export const WALL_SPIN_COST = 0.01; // 撞一次牆扣這麼多

export function decaySpin(c, dt) {
  return (c.spin ?? 1) - SPIN_DECAY * statsOf(c).decay * dt;
}
