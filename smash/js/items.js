// 四種道具。全部是純函式,回傳新的 world。
//
//   attack 攻擊:自己撞出去的力更大(在 physics.step 裡吃 buffs.attack)
//   speed  速度:立刻加速,而且之後每次都動得更快
//   giant  極巨化:變大、變重 —— 抗擊飛是「質量大」自然產生的,不是另外寫一條規則
//   bomb   場地轟炸:定時炸彈,炸開時把附近的人往外推
import { newId } from '../../shared/js/ids.js';

export const ITEM_TYPES = Object.freeze(['attack', 'speed', 'giant', 'bomb']);

const ITEM_RADIUS = 7;
const BOMB_RADIUS = 6;
const BOMB_FUSE = 1.6;
const BLAST_RADIUS = 46;
const BLAST_POWER = 420;

function randomSpot(arenaRadius, rng) {
  const angle = rng() * Math.PI * 2;
  const dist = Math.sqrt(rng()) * arenaRadius * 0.82;
  return { x: Math.cos(angle) * dist, y: Math.sin(angle) * dist };
}

export function spawnItem(world, type, rng = Math.random) {
  const { x, y } = randomSpot(world.arenaRadius, rng);
  return { ...world, items: [...world.items, { id: newId('it'), type, x, y, radius: ITEM_RADIUS }] };
}

export function spawnBomb(world, rng = Math.random) {
  const { x, y } = randomSpot(world.arenaRadius, rng);
  return { ...world, bombs: [...world.bombs, { id: newId('bm'), x, y, radius: BOMB_RADIUS, fuse: BOMB_FUSE }] };
}

// 撿到道具:套用效果、把道具拿掉。同一個道具不會被兩個人同時撿走。
export function applyPickups(world) {
  if (world.items.length === 0) return world;

  const combatants = world.combatants.map(c => ({ ...c, buffs: { ...c.buffs } }));
  const taken = new Set();

  for (const item of world.items) {
    const who = combatants.find(c => c.alive && Math.hypot(c.x - item.x, c.y - item.y) <= c.radius + item.radius);
    if (!who) continue;
    taken.add(item.id);

    if (item.type === 'attack') {
      who.buffs.attack += 1;
    } else if (item.type === 'speed') {
      who.buffs.speed += 1;
      who.vx *= 1.7;
      who.vy *= 1.7;
    } else if (item.type === 'giant') {
      who.buffs.giant += 1;
      who.radius *= 1.45;
      // 抗擊飛就是質量大 —— 不另外寫一條「巨人不會被打飛」的規則,
      // 那種規則會跟物理打架,而且會出現「巨人卡在邊緣推不動」這種怪事。
      who.mass *= 2.4;
    }
  }

  if (taken.size === 0) return world;
  return { ...world, combatants, items: world.items.filter(i => !taken.has(i.id)) };
}

// 引信倒數;歸零就炸開,把附近的人往外推。推力隨距離遞減。
export function explodeBombs(world, dt) {
  if (world.bombs.length === 0) return world;

  const bombs = world.bombs.map(b => ({ ...b, fuse: b.fuse - dt }));
  const blown = bombs.filter(b => b.fuse <= 0);
  if (blown.length === 0) return { ...world, bombs };

  const combatants = world.combatants.map(c => ({ ...c }));
  for (const bomb of blown) {
    for (const c of combatants) {
      if (!c.alive) continue;
      const dx = c.x - bomb.x;
      const dy = c.y - bomb.y;
      const dist = Math.hypot(dx, dy) || 0.0001;
      if (dist > BLAST_RADIUS) continue;
      const falloff = 1 - dist / BLAST_RADIUS;
      // 除以質量:極巨化的人被炸得比較輕,跟撞擊的規則一致
      const power = (BLAST_POWER * falloff) / c.mass;
      c.vx += (dx / dist) * power;
      c.vy += (dy / dist) * power;
    }
  }

  return { ...world, combatants, bombs: bombs.filter(b => b.fuse > 0) };
}
