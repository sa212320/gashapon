// 四種道具。全部是純函式,回傳新的 world。
//
//   attack  劍 = 衝刺(原型,2026-10-13):鎖定最近的敵人,原地蓄力一下,再追著它高速衝過去;
//           威力純粹來自衝得快(撞擊力道跟相對速度走),不另外加爆裂機率 —— 帶劍加成時太強
//   shield  盾 = 冰凍(原型,2026-10-13):寒氣射向最近的 FROST_TARGETS 顆敵人,飛 FROST_FLIGHT 秒打中,
//           目標變冰塊 FREEZE_TIME 秒 —— 不會自己動、轉速不掉、滑很遠、被撞飛得遠,但不會爆(physics.step 裡算)
//   spin    補包 = 冰旋風(原型,2026-10-13):轉速補滿,再捲起旋風 WHIRL_TIME 秒,
//           把 WHIRL_RADIUS 內的敵人往自己拉、繞著轉(被捲過來就撞上、彈開、再被捲回來)
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
export const FROST_TARGETS = 2;
export const FROST_FLIGHT = 0.35;   // 寒氣飛幾秒(畫面看得到它飛過去)
export const FREEZE_TIME = 1.5;     // 冰塊幾秒
export const WHIRL_TIME = 2;
export const WHIRL_RADIUS = 40;     // 地上那圈雪花漩渦就是這個範圍
const WHIRL_PULL = 220;             // 往中心拉(每秒加的速度,貼著中心時)
const WHIRL_SWIRL = 260;            // 繞著轉(切向)
export const HEAL_FLASH = 0.6;      // 補包的綠框閃幾秒(畫面用)
export const MISSILE_FUSE = 1.2;
export const DASH_WIND = 0.5;       // 蓄力幾秒(畫面拉箭頭預告要衝誰)
export const DASH_TIME = 0.45;      // 衝多久(0.9 秒太久,快衝過大半個盤子)
const DASH_BACKOFF = 50;            // 蓄力時往後退的速度(0.5 秒退 25 單位)
const DASH_CONTACT = 0.05;          // 貼在一起才算撞到(互撞那一步會把兩顆剛好推到相切)
const DASH_STOP = 0.2;              // 撞到後自己剩幾成速度
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
      ...(c.frozen ? { frozen: Math.max(0, c.frozen - dt) } : {}),
    })),
  };
}

function enemiesByDistance(who, combatants) {
  return combatants
    .filter(c => c.alive && c.fighterId !== who.fighterId)
    .sort((a, b) => Math.hypot(a.x - who.x, a.y - who.y) - Math.hypot(b.x - who.x, b.y - who.y));
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
  const frosts = [...(world.frosts ?? [])];
  const taken = new Set();

  for (const item of world.items) {
    const who = combatants.find(c => c.alive && Math.hypot(c.x - item.x, c.y - item.y) <= c.radius + item.radius);
    if (!who) continue;
    taken.add(item.id);

    if (item.type === 'attack') {
      const target = nearestEnemy(who, combatants);
      if (target) who.dash = { targetId: target.id, wind: DASH_WIND, left: DASH_TIME };
    } else if (item.type === 'shield') {
      for (const target of enemiesByDistance(who, combatants).slice(0, FROST_TARGETS)) {
        frosts.push({ id: newId('fr'), fighterId: who.fighterId, fromX: who.x, fromY: who.y, targetId: target.id, t: 0 });
      }
    } else if (item.type === 'spin') {
      who.spin = 1;
      who.healedAt = world.time;
      who.whirl = WHIRL_TIME;
    } else if (item.type === 'missile') {
      // 鎖的是**這一刻**的座標,之後目標怎麼跑都不管 —— 有準星預告,躲得掉才公平
      const target = nearestEnemy(who, combatants);
      if (target) strikes.push({ id: newId('ms'), fighterId: who.fighterId, x: target.x, y: target.y, fuse: MISSILE_FUSE });
    }
  }

  if (taken.size === 0) return world;
  return { ...world, combatants, strikes, frosts, items: world.items.filter(i => !taken.has(i.id)) };
}

// 冰旋風:範圍內的敵人往中心拉、逆時針繞著轉,愈靠近中心愈用力;重的拉得動得少。隊友不受影響。
export function tickWhirls(world, dt) {
  if (!world.combatants.some(c => c.whirl > 0)) return world;
  const combatants = world.combatants.map(c => ({ ...c }));
  for (const w of combatants) {
    if (!(w.whirl > 0)) continue;
    w.whirl = Math.max(0, w.whirl - dt);
    if (!w.alive) { w.whirl = 0; continue; }
    for (const c of combatants) {
      if (!c.alive || c.fighterId === w.fighterId) continue;
      const dx = w.x - c.x;
      const dy = w.y - c.y;
      const d = Math.hypot(dx, dy) || 1e-4;
      if (d > WHIRL_RADIUS) continue;
      const k = (1 - d / WHIRL_RADIUS) * dt / (c.mass ?? 1);
      c.vx += (dx / d) * WHIRL_PULL * k - (dy / d) * WHIRL_SWIRL * k;
      c.vy += (dy / d) * WHIRL_PULL * k + (dx / d) * WHIRL_SWIRL * k;
    }
  }
  return { ...world, combatants };
}

// 寒氣飛行:飛 FROST_FLIGHT 秒追上目標(畫面從出發點畫到目標現在的位置),打中就凍成冰塊。
// 目標在途中出局了就作廢。
export function tickFrosts(world, dt) {
  const all = world.frosts ?? [];
  if (all.length === 0) return world;
  const combatants = world.combatants.map(c => ({ ...c }));
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

// 衝刺:先蓄力(踩煞車、畫面預告),再每一格把速度對準目標**現在**的位置 —— 追蹤,一定撞得到。
// 目標先出局了就改衝下一個最近的敵人;沒有敵人了就停。
export function tickDashes(world, dt) {
  if (!world.combatants.some(c => c.dash)) return world;
  const combatants = world.combatants.map(c => ({ ...c }));
  for (const c of combatants) {
    if (!c.dash) continue;
    if (!c.alive) { c.dash = null; continue; }
    if (c.dash.wind > 0) {
      // 蓄力:往目標的反方向退(像拉彈弓)—— 貼著對手發動時才有助跑距離,也是更明顯的預告
      const target = combatants.find(o => o.id === c.dash.targetId && o.alive);
      c.dash = { ...c.dash, wind: c.dash.wind - dt };
      if (target) {
        const dx = c.x - target.x;
        const dy = c.y - target.y;
        const d = Math.hypot(dx, dy) || 1e-4;
        c.vx = (dx / d) * DASH_BACKOFF;
        c.vy = (dy / d) * DASH_BACKOFF;
      } else {
        c.vx = 0;
        c.vy = 0;
      }
      continue;
    }
    // 撞到任何敵人那一刻就結束、自己頓住 —— 不然每格又對準目標,等於推著對方一路衝進洞裡
    const touching = combatants.some(o => o.alive && o.fighterId !== c.fighterId
      && Math.hypot(o.x - c.x, o.y - c.y) <= c.radius + o.radius + DASH_CONTACT);
    if (touching) {
      c.dash = null;
      c.vx *= DASH_STOP;
      c.vy *= DASH_STOP;
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
