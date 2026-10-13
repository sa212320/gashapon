// 大亂鬥的物理。純函式:step 回傳新的 world,不就地改動傳進來的東西。
//
// 這是整個站上**唯一結果不預先決定**的模式 —— 其他模式都是先算好再重播演出,
// 這裡是真的算出來的,所以物理錯了就是結果錯了。
//
// 盤子的形狀只在 stadium.js 定義;陀螺的類型、轉速、爆裂在 beys.js。
// 出局三種:場外(ringout:掉進前角方槽、或軌道正前方外側的凹槽)、停轉(spinout)、爆裂(burst)。
// 每顆陀螺不是在碗裡,就是在軌道外的平台上(ledge)—— 要夠快才跳得過軌道;
// 方槽外圍的邊緣也要夠快才飛得過去。高牆、柱子、透明外殼一律彈回來。
// 停轉是**終止保證**:每顆陀螺的轉速一定會掉到 0,所以每一場一定會結束。
//
// 同隊之間**只分離、不施加衝量**:他們會互相推開避免穿透,但永遠不會把隊友撞出去或撞爆。
import { newId } from '../../shared/js/ids.js';
import { expand } from '../../shared/js/roster.js';
import {
  WALL_BOUNCE, RAIL_FLING, RING_HOP, LIP_HOP, ZONE,
  bowlDistance, bowlNormal, zoneAt, pocketAt, slopeAccel, railAccel, onRail, randomSpot,
} from './stadium.js';
import {
  HIT_POWER, HIT_FULL, ATTACK_GAIN, SHIELD_KNOCK, HIT_SPIN_COST, WALL_SPIN_COST,
  statsOf, layers, beyRadius, rollBey, hitStrength, burstChance, decaySpin,
} from './beys.js';
import { BLAST_RADIUS } from './items.js';

export { HIT_POWER, HIT_FULL };

const RESTITUTION = 1.15;
const FRICTION = 0.995;
const FROZEN_FRICTION = 0.9995;
const FROZEN_KNOCK = 1.8;   // 冰塊被撞飛得遠這麼多倍(不會爆,出局方式是被撞出場)
const SPAWN_MARGIN = 30;
const BURST_GRACE = 3;   // 開場幾秒內不會爆裂:開場那一波重擊很密,不設保護期常常一開打就有人爆掉

export function createWorld({ fighters, rng = Math.random }) {
  const total = fighters.reduce((n, f) => n + (Number.isFinite(f.count) ? Math.max(0, Math.floor(f.count)) : 0), 0);
  const radius = beyRadius(total);
  const combatants = expand(fighters, fighter => {
    const { x, y } = randomSpot(rng, SPAWN_MARGIN);
    const { animal, beyType } = rollBey(rng);
    return {
      id: newId('c'),
      fighterId: fighter.id,
      x, y,
      // 發射:每顆帶著不小的初速衝進盤裡 —— 初速太小的話大家在中央慢慢磨,幾乎只會停轉出局
      vx: (rng() - 0.5) * 160,
      vy: (rng() - 0.5) * 160,
      radius,
      mass: statsOf({ beyType }).mass,
      alive: true,
      animal,
      beyType,
      spin: 1,
      outBy: null,
      pocket: null,
      railing: false,
      ledge: false,
      buffs: { attack: [], shield: [] },
      healedAt: -Infinity,
    };
  });
  return { combatants, items: [], strikes: [], frosts: [], time: 0 };
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

function knockOut(c, outBy) {
  c.alive = false;
  c.outBy = outBy;
  c.vx = 0;
  c.vy = 0;
}

const STEP_LEN = 1;

function bounce(c, nx, ny) {
  const vn = c.vx * nx + c.vy * ny;
  if (vn > 0) {
    c.vx -= (1 + WALL_BOUNCE) * vn * nx;
    c.vy -= (1 + WALL_BOUNCE) * vn * ny;
    c.spin -= WALL_SPIN_COST;
  }
}

// 擋住陀螺的區域:高牆、盤外;方槽邊緣在不夠快的時候也算
function solid(z, fast) {
  return z === ZONE.WALL || z === ZONE.PILLAR || z === ZONE.OUT || (z === ZONE.LIP && !fast);
}

// 牆在哪個方向:繞一圈取樣,把「是牆」的方向加起來(朝外的法線)
function wallDirection(x, y, fast) {
  let nx = 0;
  let ny = 0;
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    const dx = Math.cos(a);
    const dy = Math.sin(a);
    if (solid(zoneAt(x + dx * 2.5, y + dy * 2.5), fast)) { nx += dx; ny += dy; }
  }
  const l = Math.hypot(nx, ny);
  return l < 1e-9 ? null : { x: nx / l, y: ny / l };
}

// 中心已經在牆裡或盤外(多半是互撞時被推進去的):往最近的空位推出去,朝那個方向反彈
function escape(c) {
  for (let r = 0.5; r <= 30; r += 0.5) {   // 一群人擠在一起互推,一格能推出去十幾單位
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2;
      const x = c.x + Math.cos(a) * r;
      const y = c.y + Math.sin(a) * r;
      const z = zoneAt(x, y);
      if (z === ZONE.WALL || z === ZONE.PILLAR || z === ZONE.OUT) continue;
      c.x = x;
      c.y = y;
      bounce(c, -Math.cos(a), -Math.sin(a));
      return;
    }
  }
}

// 照盤子的規則處理這一步的位置:(px, py) 是這一步之前的位置。
function contain(c, px, py) {
  // 軌道:碗裡的陀螺碰到軌道,往外夠快就跳上平台,不然彈回碗裡。
  // 平台上的陀螺退回碗緣以內,就是滑回碗裡了。
  const b = bowlDistance(c.x, c.y);
  if (!c.ledge && b + c.radius > 0) {
    const n = bowlNormal(c.x, c.y);
    if (c.vx * n.x + c.vy * n.y > RING_HOP) {
      c.ledge = true;
    } else {
      c.x -= n.x * (b + c.radius);
      c.y -= n.y * (b + c.radius);
      bounce(c, n.x, n.y);
    }
  } else if (c.ledge && b + c.radius < 0) {
    c.ledge = false;
  }
  if (!c.ledge) return;

  // 中心掉進方槽或凹槽 —— 出局,就停在那裡
  const pocket = pocketAt(c.x, c.y);
  if (pocket) {
    knockOut(c, 'ringout');
    c.pocket = pocket.id;
    return;
  }

  // 前緣(往行進方向一點)撞到牆:退回上一步的位置,彈開
  const speed = Math.hypot(c.vx, c.vy);
  const fast = speed > LIP_HOP;
  const ux = speed > 1e-9 ? c.vx / speed : 0;
  const uy = speed > 1e-9 ? c.vy / speed : 0;
  const ahead = zoneAt(c.x + ux * c.radius * 0.7, c.y + uy * c.radius * 0.7);
  if (solid(zoneAt(c.x, c.y), fast) || solid(ahead, fast)) {
    const n = wallDirection(c.x, c.y, fast) ?? { x: ux, y: uy };
    c.x = px;
    c.y = py;
    bounce(c, n.x, n.y);
  }
  // 退回去的位置本身也在牆裡(互撞推進去的):找最近的空位推出去
  const here = zoneAt(c.x, c.y);
  if (here === ZONE.WALL || here === ZONE.PILLAR || here === ZONE.OUT) escape(c);
}

export function step(world, dt, rng = Math.random) {
  const next = world.combatants.map(c => ({ ...c, buffs: { attack: [...(c.buffs?.attack ?? [])], shield: [...(c.buffs?.shield ?? [])] } }));
  const impacts = [];

  // 1. 坡度、軌道、移動
  for (const c of next) {
    if (!c.alive) continue;
    const slope = slopeAccel(c.x, c.y);
    const rail = railAccel(c.x, c.y, c.vx, c.vy, c.radius);
    c.vx += (slope.x + rail.x) * dt;
    c.vy += (slope.y + rail.y) * dt;
    // 切成每步不超過 1 單位:飛彈能把人炸到一格跑 25 單位,牆只有幾單位厚,一步跨過去就穿牆了
    const n = Math.max(1, Math.ceil((Math.hypot(c.vx, c.vy) * dt) / STEP_LEN));
    for (let k = 0; k < n && c.alive; k++) {
      const px = c.x;
      const py = c.y;
      c.x += (c.vx * dt) / n;
      c.y += (c.vy * dt) / n;
      contain(c, px, py);
    }
    if (!c.alive) continue;
    // 冰塊在冰上滑:摩擦小很多
    const friction = c.frozen > 0 ? FROZEN_FRICTION : FRICTION;
    c.vx *= friction;
    c.vy *= friction;

    // 衝完軌道的那一格,往中央甩 —— 極限衝刺是衝進戰場撞人,不是把自己送進口袋
    const railing = onRail(c.x, c.y, c.radius);
    if (c.railing && !railing) {
      const n = bowlNormal(c.x, c.y);
      const speed = Math.hypot(c.vx, c.vy);
      c.vx -= n.x * speed * RAIL_FLING;
      c.vy -= n.y * speed * RAIL_FLING;
    }
    c.railing = railing;
  }

  // 2. 互撞
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

      // 加成是**不對稱**的:多出來的力只加在對方身上,自己的後座力維持原樣。
      // 兩邊都乘同一個係數的話,撿到劍的人自己也被彈得一樣遠 —— 玩起來完全沒感覺。
      // 代價是這一撞不守恆動量,但這是給小孩看的卡通碰撞,不是撞球。
      const impulse = (-(1 + RESTITUTION) * along) / (1 / a.mass + 1 / b.mass);
      const onto = (from, to) => statsOf(from).power
        * (1 + layers(from, 'attack') * ATTACK_GAIN)
        * SHIELD_KNOCK ** layers(to, 'shield')
        * (to.frozen > 0 ? FROZEN_KNOCK : 1);
      const ontoA = onto(b, a);
      const ontoB = onto(a, b);
      a.vx -= (impulse * ontoA * nx) / a.mass;
      a.vy -= (impulse * ontoA * ny) / a.mass;
      b.vx += (impulse * ontoB * nx) / b.mass;
      b.vy += (impulse * ontoB * ny) / b.mass;

      // power 取「被推得比較多的那個速度變化」—— 觀眾看到的就是有人飛出去。
      // HIT_POWER 這道門檻是必要的:實測每秒 15 次碰撞,中位數只有 3,那是互相推擠。
      const powerA = (impulse * ontoA) / a.mass;
      const powerB = (impulse * ontoB) / b.mass;
      const power = Math.max(powerA, powerB);
      if (power >= HIT_POWER) {
        impacts.push({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, power });
      }

      // 被打到的一方扣轉速、擲爆裂骰。兩邊各自算 —— 對撞時兩個都可能爆。
      for (const [me, them, p] of [[a, b, powerA], [b, a, powerB]]) {
        if (me.frozen > 0) continue;   // 冰塊:零件凍住了,不扣轉速、不會爆
        me.spin -= HIT_SPIN_COST * hitStrength(p);
        // 衝刺中(劍)撞人的那顆不擲骰:反彈力道跟對方一樣大,不擋的話主動撞人的反而常常自己爆
        const dashing = me.dash && me.dash.wind <= 0;
        if (!dashing && world.time >= BURST_GRACE && p >= HIT_POWER && rng() < burstChance({ power: p, attacker: them, target: me })) {
          knockOut(me, 'burst');
        }
      }
    }
  }

  // 3. 互撞把人推進牆裡的,再擋一次;轉速
  for (const c of next) {
    if (!c.alive) continue;
    contain(c, c.x, c.y);
    if (!c.alive) continue;

    if (!(c.frozen > 0)) c.spin = decaySpin(c, dt);   // 冰塊的刃凍住了,轉速停在那裡
    if (c.spin <= 0) {
      c.spin = 0;
      knockOut(c, 'spinout');
    }
  }

  return { ...world, combatants: next, time: world.time + dt, impacts };
}

// 每一格重新決定要往哪裡推。真的陀螺不會思考,所以這支刻意很弱 ——
// 主角是坡度與軌道,這裡只是讓陀螺「微微偏向敵人」,免得人少時各自在角落轉到停。
//
//   1. 躲快落下的飛彈準星 —— 力道很小,不然飛彈永遠炸不到人
//   2. 撿道具 —— 只有在道具比敵人近的時候才繞路
//   3. 追最近的敵人
//
// 不再躲邊緣:躲口袋會讓出局變得很難,也不像陀螺。
const SEEK = 45;
const ITEM_PULL = 60;
const STRIKE_FEAR = 0.8;   // 準星倒數剩幾秒開始偏開
const STRIKE_FORCE = 80;

const add = (v, x, y, k) => { v.x += x * k; v.y += y * k; };

function nearestEnemy(c, alive) {
  let best = null;
  let bestD = Infinity;
  for (const other of alive) {
    if (other === c || other.fighterId === c.fighterId) continue;
    const d = Math.hypot(other.x - c.x, other.y - c.y);
    if (d < bestD) { bestD = d; best = other; }
  }
  return best;
}

export function think(world, dt) {
  const alive = aliveOf(world);
  if (alive.length === 0) return world;

  const combatants = world.combatants.map(c => {
    if (!c.alive || c.frozen > 0) return c;   // 冰塊不會自己動
    const want = { x: 0, y: 0 };

    for (const s of world.strikes ?? []) {
      if (s.fuse > STRIKE_FEAR) continue;
      const dx = c.x - s.x;
      const dy = c.y - s.y;
      const d = Math.hypot(dx, dy) || 1e-4;
      if (d > BLAST_RADIUS) continue;
      add(want, dx / d, dy / d, STRIKE_FORCE * (1 - d / BLAST_RADIUS));
    }

    const target = nearestEnemy(c, alive);
    let item = null;
    let itemDist = Infinity;
    for (const it of world.items ?? []) {
      const d = Math.hypot(it.x - c.x, it.y - c.y);
      if (d < itemDist) { itemDist = d; item = it; }
    }
    const targetDist = target ? Math.hypot(target.x - c.x, target.y - c.y) : Infinity;

    if (item && itemDist < targetDist) {
      const d = itemDist || 1e-4;
      add(want, (item.x - c.x) / d, (item.y - c.y) / d, ITEM_PULL);
    } else if (target) {
      const d = targetDist || 1e-4;
      add(want, (target.x - c.x) / d, (target.y - c.y) / d, SEEK);
    }

    return { ...c, vx: c.vx + want.x * dt, vy: c.vy + want.y * dt };
  });

  return { ...world, combatants };
}
