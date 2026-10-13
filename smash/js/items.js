// 四種道具。全部是純函式,回傳新的 world。
//
//   attack  劍 = 衝刺(原型,2026-10-13):鎖定最近的敵人,原地蓄力一下,再追著它高速衝過去;
//           威力純粹來自衝得快(撞擊力道跟相對速度走),不另外加爆裂機率 —— 帶劍加成時太強
//   shield  盾:每一層 8 秒,自己被撞時飛得近、比較難爆
//   spin    補包:轉速補滿(轉速就是命)
//   missile 飛彈:鎖定最近敵人**當下的位置**,1.2 秒後從天空落下炸開。不追蹤,圈內敵我都炸
//
// 劍盾最多疊 3 層 —— 不設上限的話疊到 5 層劍幾乎一碰就爆,8 秒內誰也擋不住。
import { newId } from '../../shared/js/ids.js';
import { randomSpot } from './stadium.js';
import { burstChance, HIT_POWER, SHIELD_KNOCK, layers } from './beys.js';

export const ITEM_TYPES = Object.freeze(['attack', 'shield', 'spin', 'missile']);

// 出現機率(權重)。飛彈一炸一大片,少一點比較稀奇。
export const ITEM_WEIGHTS = Object.freeze({ attack: 30, shield: 30, spin: 25, missile: 15 });

// 從開著的道具裡照權重抽一個(關掉的不算,比例照剩下的重算)
export function pickItem(enabled, rng = Math.random) {
  const total = enabled.reduce((s, t) => s + (ITEM_WEIGHTS[t] ?? 0), 0);
  let r = rng() * total;
  for (const t of enabled) {
    r -= ITEM_WEIGHTS[t] ?? 0;
    if (r < 0) return t;
  }
  return enabled[enabled.length - 1];
}

export const BUFF_TIME = 8;
export const MAX_LAYERS = 3;
export const HEAL_FLASH = 0.6;      // 補包的綠框閃幾秒(畫面用)
export const MISSILE_FUSE = 1.2;
export const DASH_WIND = 0.5;       // 蓄力幾秒(畫面拉箭頭預告要衝誰)
export const DASH_TIME = 0.45;      // 衝多久(0.9 秒太久,快衝過大半個盤子)
export const DASH_SPEED = 200;      // 衝刺速度(平常大約 100~150)。模擬:撞上後約 13% 爆裂、14% 被撞出局
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

    if (item.type === 'attack') {
      const target = nearestEnemy(who, combatants);
      if (target) who.dash = { targetId: target.id, wind: DASH_WIND, left: DASH_TIME };
    } else if (item.type === 'shield') {
      who.buffs.shield = addLayer(who.buffs.shield);
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

// 衝刺:先蓄力(踩煞車、畫面預告),再每一格把速度對準目標**現在**的位置 —— 追蹤,一定撞得到。
// 目標先出局了就改衝下一個最近的敵人;沒有敵人了就停。
export function tickDashes(world, dt) {
  if (!world.combatants.some(c => c.dash)) return world;
  const combatants = world.combatants.map(c => ({ ...c }));
  for (const c of combatants) {
    if (!c.dash) continue;
    if (!c.alive) { c.dash = null; continue; }
    if (c.dash.wind > 0) {
      c.dash = { ...c.dash, wind: c.dash.wind - dt };
      const brake = Math.exp(-12 * dt);   // 每秒剩不到萬分之一:幾格內就停住
      c.vx *= brake;
      c.vy *= brake;
      continue;
    }
    let target = combatants.find(o => o.id === c.dash.targetId && o.alive);
    if (!target) target = nearestEnemy(c, combatants);
    const left = c.dash.left - dt;
    if (!target || left <= 0) {
      c.dash = null;
      continue;
    }
    const dx = target.x - c.x;
    const dy = target.y - c.y;
    const d = Math.hypot(dx, dy) || 1e-4;
    c.vx = (dx / d) * DASH_SPEED;
    c.vy = (dy / d) * DASH_SPEED;
    c.dash = { ...c.dash, targetId: target.id, left };
  }
  return { ...world, combatants };
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
