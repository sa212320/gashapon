// 四種道具。全部是純函式,回傳新的 world。
//
//   attack  劍:每一層 8 秒,撞別人時對方飛更遠、更容易爆(在 physics.step 裡吃 buffs.attack)
//   shield  盾:每一層 8 秒,自己被撞時飛得近、比較難爆
//   spin    補包:轉速補滿(轉速就是命)
//   missile 飛彈:鎖定最近敵人**當下的位置**,1.2 秒後從天空落下炸開。不追蹤,圈內敵我都炸
//
// 劍盾最多疊 3 層 —— 不設上限的話疊到 5 層劍幾乎一碰就爆,8 秒內誰也擋不住。
import { newId } from '../../shared/js/ids.js';
import { randomSpot } from './stadium.js';
import { burstChance, HIT_POWER, SHIELD_KNOCK, layers } from './beys.js';

export const ITEM_TYPES = Object.freeze(['attack', 'shield', 'spin', 'missile']);

export const BUFF_TIME = 8;
export const MAX_LAYERS = 3;
export const HEAL_FLASH = 0.6;      // 補包的綠框閃幾秒(畫面用)
export const MISSILE_FUSE = 1.2;
export const BLAST_RADIUS = 46;     // 看到的準星圈就是真的會被炸到的範圍
export const BLAST_POWER = 620;

const ITEM_RADIUS = 7;
const ITEM_MARGIN = 22;             // 不掉在牆邊,也就不會掉在口袋上

export function spawnItem(world, type, rng = Math.random) {
  const { x, y } = randomSpot(rng, ITEM_MARGIN);
  return { ...world, items: [...world.items, { id: newId('it'), type, x, y, radius: ITEM_RADIUS }] };
}

// 多一層;滿了就把最舊(剩最少秒數)那層刷新。
export function addLayer(list) {
  if (list.length < MAX_LAYERS) return [...list, BUFF_TIME];
  const oldest = list.indexOf(Math.min(...list));
  return list.map((t, i) => (i === oldest ? BUFF_TIME : t));
}

export function tickBuffs(world, dt) {
  const tick = list => list.map(t => t - dt).filter(t => t > 0);
  return {
    ...world,
    combatants: world.combatants.map(c => ({
      ...c,
      buffs: { attack: tick(c.buffs?.attack ?? []), shield: tick(c.buffs?.shield ?? []) },
    })),
  };
}

function nearestEnemy(who, combatants) {
  let best = null;
  let bestD = Infinity;
  for (const c of combatants) {
    if (!c.alive || c.fighterId === who.fighterId) continue;
    const d = Math.hypot(c.x - who.x, c.y - who.y);
    if (d < bestD) { bestD = d; best = c; }
  }
  return best;
}

// 撿到道具:套用效果、把道具拿掉。同一個道具不會被兩個人同時撿走。
export function applyPickups(world) {
  if (world.items.length === 0) return world;

  const combatants = world.combatants.map(c => ({
    ...c, buffs: { attack: [...(c.buffs?.attack ?? [])], shield: [...(c.buffs?.shield ?? [])] },
  }));
  const strikes = [...(world.strikes ?? [])];
  const taken = new Set();

  for (const item of world.items) {
    const who = combatants.find(c => c.alive && Math.hypot(c.x - item.x, c.y - item.y) <= c.radius + item.radius);
    if (!who) continue;
    taken.add(item.id);

    if (item.type === 'attack' || item.type === 'shield') {
      who.buffs[item.type] = addLayer(who.buffs[item.type]);
    } else if (item.type === 'spin') {
      who.spin = 1;
      who.healedAt = world.time;
    } else if (item.type === 'missile') {
      // 鎖的是**這一刻**的座標,之後目標怎麼跑都不管 —— 有準星預告,躲得掉才公平
      const target = nearestEnemy(who, combatants);
      if (target) strikes.push({ id: newId('ms'), fighterId: who.fighterId, x: target.x, y: target.y, fuse: MISSILE_FUSE });
    }
  }

  if (taken.size === 0) return world;
  return { ...world, combatants, strikes, items: world.items.filter(i => !taken.has(i.id)) };
}

// 準星倒數;歸零就炸開。圈內**不分敵我**都被推開,每一顆都擲一次爆裂骰。
export function explodeMissiles(world, dt, rng = Math.random) {
  const all = world.strikes ?? [];
  if (all.length === 0) return world;

  const strikes = all.map(s => ({ ...s, fuse: s.fuse - dt }));
  const blown = strikes.filter(s => s.fuse <= 0);
  if (blown.length === 0) return { ...world, strikes };

  const combatants = world.combatants.map(c => ({ ...c }));
  for (const s of blown) {
    for (const c of combatants) {
      if (!c.alive) continue;
      const dx = c.x - s.x;
      const dy = c.y - s.y;
      const dist = Math.hypot(dx, dy) || 0.0001;
      if (dist > BLAST_RADIUS) continue;
      const falloff = 1 - dist / BLAST_RADIUS;
      // 除以質量、乘盾:重的、有盾的被炸得比較輕,跟撞擊同一套規則
      const power = (BLAST_POWER * falloff * SHIELD_KNOCK ** layers(c, 'shield')) / c.mass;
      c.vx += (dx / dist) * power;
      c.vy += (dy / dist) * power;
      if (power >= HIT_POWER && rng() < burstChance({ power, attacker: null, target: c })) {
        c.alive = false;
        c.outBy = 'burst';
        c.vx = 0;
        c.vy = 0;
      }
    }
  }

  return { ...world, combatants, strikes: strikes.filter(s => s.fuse > 0) };
}
