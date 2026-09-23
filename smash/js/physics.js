// 大亂鬥的物理。純函式:step 回傳新的 world,不就地改動傳進來的東西。
//
// 這是整個站上**唯一結果不預先決定**的模式 —— 其他模式都是先算好再重播演出,
// 這裡是真的算出來的,所以物理錯了就是結果錯了。
//
// 同隊之間**只分離、不施加衝量**:他們會互相推開避免穿透,但永遠不會把隊友撞出場外。
import { newId } from '../../shared/js/ids.js';
import { expand } from '../../shared/js/roster.js';

const RESTITUTION = 1.15;
const FRICTION = 0.995;
const BASE_RADIUS = 8;

export function createWorld({ fighters, arenaRadius, rng = Math.random }) {
  const combatants = expand(fighters, fighter => {
    const angle = rng() * Math.PI * 2;
    // sqrt 讓起始位置在圓盤上是均勻的 —— 不開根號的話大家會擠在圓心附近
    const dist = Math.sqrt(rng()) * arenaRadius * 0.7;
    return {
      id: newId('c'),
      fighterId: fighter.id,
      x: Math.cos(angle) * dist,
      y: Math.sin(angle) * dist,
      vx: (rng() - 0.5) * 60,
      vy: (rng() - 0.5) * 60,
      radius: BASE_RADIUS,
      mass: 1,
      alive: true,
      buffs: { attack: 0, speed: 0, giant: 0 },
    };
  });
  return { arenaRadius, combatants, bombs: [], items: [], time: 0 };
}

export function aliveOf(world) {
  return world.combatants.filter(c => c.alive);
}

// 只剩一個 fighterId 還有人活著才算分出勝負。全部出局時回 null ——
// 不要硬挑一個出來當贏家。
export function winnerTeam(world) {
  const teams = new Set(aliveOf(world).map(c => c.fighterId));
  return teams.size === 1 ? [...teams][0] : null;
}

export function step(world, dt) {
  const next = world.combatants.map(c => ({ ...c, buffs: { ...c.buffs } }));

  for (const c of next) {
    if (!c.alive) continue;
    c.x += c.vx * dt;
    c.y += c.vy * dt;
    c.vx *= FRICTION;
    c.vy *= FRICTION;
  }

  for (let i = 0; i < next.length; i++) {
    for (let j = i + 1; j < next.length; j++) {
      const a = next[i];
      const b = next[j];
      if (!a.alive || !b.alive) continue;

      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const dist = Math.hypot(dx, dy) || 0.0001;
      const overlap = a.radius + b.radius - dist;
      if (overlap <= 0) continue;

      const nx = dx / dist;
      const ny = dy / dist;

      // 先分離 —— 同隊與不同隊都要做,不然會互相穿透
      const push = overlap / 2;
      a.x -= nx * push;
      a.y -= ny * push;
      b.x += nx * push;
      b.y += ny * push;

      // 同隊到此為止:不施加任何衝量,隊友永遠不會把隊友撞出去
      if (a.fighterId === b.fighterId) continue;

      const rvx = b.vx - a.vx;
      const rvy = b.vy - a.vy;
      const along = rvx * nx + rvy * ny;
      if (along > 0) continue; // 已經在分開了,再給衝量會變成吸在一起

      const power = RESTITUTION * (1 + (a.buffs.attack ?? 0) * 0.6);
      const impulse = (-(1 + power) * along) / (1 / a.mass + 1 / b.mass);
      a.vx -= (impulse * nx) / a.mass;
      a.vy -= (impulse * ny) / a.mass;
      b.vx += (impulse * nx) / b.mass;
      b.vy += (impulse * ny) / b.mass;
    }
  }

  for (const c of next) {
    if (c.alive && Math.hypot(c.x, c.y) > world.arenaRadius + c.radius) c.alive = false;
  }

  return { ...world, combatants: next, time: world.time + dt };
}

// 主動追擊。摩擦力會讓大家慢慢停下來,沒有這個就會卡成僵局 ——
// 所以每個人持續往「最近的敵人」加速,速度道具讓這股推力更大。
// 目標只找**不同隊**的人:隊友之間沒有衝量,追著隊友跑只會擠成一團不動。
const SEEK = 90;

export function seek(world, dt) {
  const alive = aliveOf(world);
  if (alive.length < 2) return world;

  const combatants = world.combatants.map(c => {
    if (!c.alive) return c;
    let best = null;
    let bestDist = Infinity;
    for (const other of alive) {
      if (other === c || other.fighterId === c.fighterId) continue;
      const d = Math.hypot(other.x - c.x, other.y - c.y);
      if (d < bestDist) { bestDist = d; best = other; }
    }
    if (!best) return c;
    const push = SEEK * (1 + (c.buffs.speed ?? 0) * 0.8) * dt;
    return {
      ...c,
      vx: c.vx + ((best.x - c.x) / (bestDist || 1)) * push,
      vy: c.vy + ((best.y - c.y) / (bestDist || 1)) * push,
    };
  });

  return { ...world, combatants };
}

// 場地縮小。過了 SHRINK_AFTER 秒之後圓盤開始往內收,站不住的人就掉出去。
//
// 這不只是效果,是**終止保證**:光靠追擊,場上剩下兩坨互相推擠的人時會僵持不下
// (實測關掉道具時 30 場有 4 場打到時間上限還沒結束)。場地會縮就不可能無限拖下去。
const SHRINK_AFTER = 12;
const SHRINK_RATE = 5.5;   // 每秒縮多少
const MIN_ARENA = 18;

export function shrink(world, dt) {
  if (world.time < SHRINK_AFTER) return world;
  const arenaRadius = Math.max(MIN_ARENA, world.arenaRadius - SHRINK_RATE * dt);
  if (arenaRadius === world.arenaRadius) return world;
  return { ...world, arenaRadius };
}
