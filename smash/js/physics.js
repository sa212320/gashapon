// 大亂鬥的物理。純函式:step 回傳新的 world,不就地改動傳進來的東西。
//
// 這是整個站上**唯一結果不預先決定**的模式 —— 其他模式都是先算好再重播演出,
// 這裡是真的算出來的,所以物理錯了就是結果錯了。
//
// 同隊之間**只分離、不施加衝量**:他們會互相推開避免穿透,但永遠不會把隊友撞出場外。
import { newId } from '../../shared/js/ids.js';
import { expand } from '../../shared/js/roster.js';

const RESTITUTION = 1.15;
// 每疊一層攻擊力,對方被彈開的力多這麼多倍。撿到就要打得動人,不然沒人想搶。
const ATTACK_GAIN = 1.9;
// 多大的一下才算「撞到」,值得演出與音效。挑法見 step 裡的說明。
export const HIT_POWER = 90;
// power 到這個值就是最大的演出與最大聲,再大也不會更誇張
export const HIT_FULL = 260;
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
  // 記住一開始的大小:場地會縮,邊緣閃避的力道要跟著它收掉。
  return { arenaRadius, arenaRadius0: arenaRadius, combatants, bombs: [], items: [], time: 0 };
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
  const impacts = [];

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

      // 攻擊力是**不對稱**的:多出來的力只加在對方身上,自己的後座力維持原樣。
      // 兩邊都乘同一個係數的話,撿到攻擊力的人自己也被彈得一樣遠 ——
      // 對「誰被撞出場」等於沒有影響,玩起來完全沒感覺。
      // 代價是這一撞不守恆動量,但這是給小孩看的卡通碰撞,不是撞球。
      const impulse = (-(1 + RESTITUTION) * along) / (1 / a.mass + 1 / b.mass);
      const ontoA = 1 + (b.buffs.attack ?? 0) * ATTACK_GAIN;
      const ontoB = 1 + (a.buffs.attack ?? 0) * ATTACK_GAIN;
      a.vx -= (impulse * ontoA * nx) / a.mass;
      a.vy -= (impulse * ontoA * ny) / a.mass;
      b.vx += (impulse * ontoB * nx) / b.mass;
      b.vy += (impulse * ontoB * ny) / b.mass;

      // 回報這一撞給演出用。power 取「兩個人之中被推得比較多的那個速度變化」——
      // 觀眾看到的就是有人飛出去,不是抽象的衝量。接觸點取在兩顆中間。
      // 這是 step 的**輸出**,不是 world 的狀態:下一格重新算,不累積。
      //
      // HIT_POWER 這道門檻是必要的,不是保守:實測一場比賽平均**每秒 15 次**碰撞,
      // 但 power 的中位數只有 3 —— 那些是陀螺靠在一起互相推擠,不是撞擊。
      // 不篩的話畫面會變成閃光燈、聲音會變成機關槍。90 大約是一秒一次真正的重擊。
      const power = Math.max((impulse * ontoA) / a.mass, (impulse * ontoB) / b.mass);
      if (power >= HIT_POWER) {
        impacts.push({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, power });
      }
    }
  }

  for (const c of next) {
    // 淘汰線就是畫面上圓盤的邊,不加半徑的寬容 —— 看到整個人站在盤子外面還活著,
    // 小孩會覺得是壞掉了。
    if (c.alive && Math.hypot(c.x, c.y) > world.arenaRadius) c.alive = false;
  }

  return { ...world, combatants: next, time: world.time + dt, impacts };
}

// 每一格重新決定要往哪裡推。四個行為疊加,優先序由權重決定:
//
//   1. 遠離邊緣 —— 最重要。只會追人的話,他們會一路往前推,連自己站在懸崖邊都不閃。
//   2. 躲快爆的炸彈 —— 引信還長的不用理,不然整場都在逃命。
//   3. 撿道具 —— 只有在道具比敵人近的時候才繞路,不然會忘記打架。
//   4. 追敵人 —— 優先挑**靠近邊緣**的,那種一撞就出局,比追場中央的划算。
//
// 沒有這些的話摩擦力會讓大家停下來變成僵局,所以這支同時也是「比賽會結束」的一部分;
// 但真正的終止保證是 shrink()。
const SEEK = 90;
const EDGE_ZONE = 0.32;   // 離邊緣多近才開始閃(佔半徑的比例)
const EDGE_FORCE = 260;
const BOMB_FEAR = 1.3;    // 引信剩幾秒開始躲
const BOMB_FORCE = 200;
const ITEM_PULL = 110;

const add = (v, x, y, k) => { v.x += x * k; v.y += y * k; };

function pickTarget(c, alive, arenaRadius) {
  let best = null;
  let bestScore = Infinity;
  for (const other of alive) {
    if (other === c || other.fighterId === c.fighterId) continue;
    const d = Math.hypot(other.x - c.x, other.y - c.y);
    // 越靠近邊緣的敵人越值得追:一撞就出局。
    const edgeness = Math.min(1, Math.hypot(other.x, other.y) / arenaRadius);
    const score = d / (0.55 + edgeness);
    if (score < bestScore) { bestScore = score; best = other; }
  }
  return best;
}

export function think(world, dt) {
  const alive = aliveOf(world);
  if (alive.length === 0) return world;

  const combatants = world.combatants.map(c => {
    if (!c.alive) return c;
    const want = { x: 0, y: 0 };

    // 1. 遠離邊緣。離得越近推得越猛(平方),站在邊上時壓過其他所有行為。
    //
    // 但場地縮小時這股力要跟著收掉:圈子收到最後根本無處可躲,還死命往中間擠的話
    // 大家會頂成一團誰也推不出去,比賽永遠打不完(實測 30 場有 6 場撐到時間上限)。
    // 場地縮小是終止保證,閃避不能凌駕它。
    const shrunk = Math.min(1, world.arenaRadius / (world.arenaRadius0 ?? world.arenaRadius));
    const r = Math.hypot(c.x, c.y);
    const margin = world.arenaRadius - r;
    const zone = world.arenaRadius * EDGE_ZONE;
    if (margin < zone && r > 1e-6) {
      const urgency = Math.min(1, Math.max(0, 1 - margin / zone));
      add(want, -c.x / r, -c.y / r, EDGE_FORCE * urgency * urgency * shrunk);
    }

    // 2. 躲快爆的炸彈
    for (const bomb of world.bombs) {
      if (bomb.fuse > BOMB_FEAR) continue;
      const dx = c.x - bomb.x;
      const dy = c.y - bomb.y;
      const d = Math.hypot(dx, dy) || 1e-4;
      if (d > 60) continue;
      add(want, dx / d, dy / d, BOMB_FORCE * (1 - d / 60));
    }

    // 3/4. 道具跟敵人:誰近就往誰去
    const target = pickTarget(c, alive, world.arenaRadius);
    let item = null;
    let itemDist = Infinity;
    for (const it of world.items) {
      const d = Math.hypot(it.x - c.x, it.y - c.y);
      if (d < itemDist) { itemDist = d; item = it; }
    }
    const targetDist = target ? Math.hypot(target.x - c.x, target.y - c.y) : Infinity;

    if (item && itemDist < targetDist) {
      const d = itemDist || 1e-4;
      add(want, (item.x - c.x) / d, (item.y - c.y) / d, ITEM_PULL);
    } else if (target) {
      const d = targetDist || 1e-4;
      add(want, (target.x - c.x) / d, (target.y - c.y) / d, SEEK * (1 + (c.buffs.speed ?? 0) * 2.2));
    }

    return { ...c, vx: c.vx + want.x * dt, vy: c.vy + want.y * dt };
  });

  return { ...world, combatants };
}

const SHRINK_AFTER = 12;
const SHRINK_RATE = 5.5;   // 每秒縮多少
// 下限要小到「連兩個人都容不下」才算得上終止保證:淘汰線就是 arenaRadius,
// 下限 4 遠小於兩個半徑 8 的人並排所需的 16,擠到最後一定有人被推出去。
// 實測最後卡住的都是 1v1 互頂到時間上限,就是下限給太大。
const MIN_ARENA = 4;

export function shrink(world, dt) {
  if (world.time < SHRINK_AFTER) return world;
  const arenaRadius = Math.max(MIN_ARENA, world.arenaRadius - SHRINK_RATE * dt);
  if (arenaRadius === world.arenaRadius) return world;
  return { ...world, arenaRadius };
}
