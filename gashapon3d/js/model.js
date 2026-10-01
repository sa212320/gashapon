// 3D 扭蛋機的資料層。抽取規則與演出腳本完全沿用 2D,差別只有一個:
// 池子裡的每顆蛋多帶一個**隨機的殼色**。
//
// 殼色跟稀有度、跟獎項都**無關**。綁在一起的話,小孩看一眼球裡的顏色就知道
// 哪顆是大獎,整台機器就白做了。test/gashapon3d.test.js 有兩個測試釘死這件事。
import { newId } from '../../shared/js/ids.js';
import { expand } from '../../shared/js/roster.js';
import { buildRevealSteps } from '../../gashapon/js/gacha.js';

export const CAPSULE_COLORS = Object.freeze([
  '#FF6F91', '#FFA45B', '#FFD479', '#9BE7C4', '#8CC9FF', '#C4A2FF',
  '#FF8FB1', '#7ED9C3', '#FFC24C', '#A6D96A', '#6FB3F2', '#E080C8',
]);

export function buildPool3d(prizes, rng = Math.random) {
  return expand(prizes, prize => ({
    prizeId: prize.id,
    drawn: false,
    color: CAPSULE_COLORS[Math.floor(rng() * CAPSULE_COLORS.length)],
  }));
}

export function createSetup3d({ name = '我的立體扭蛋機', prizes = [], removeOnDraw = true, rng = Math.random } = {}) {
  return { id: newId('g3'), name, removeOnDraw, prizes, pool: buildPool3d(prizes, rng) };
}

export function refillSetup3d(setup, rng = Math.random) {
  return { ...setup, pool: buildPool3d(setup.prizes, rng) };
}

export function remaining3d(setup) {
  return setup.pool.filter(c => !c.drawn).length;
}

// 工具列上的「剩 X 顆」膠囊。文字規則跟扭蛋機頁(gashapon/js/ui-machine.js)一致。
export function remainLabel(setup) {
  if (setup.pool.length === 0) return { text: '還沒有獎項', hidden: false };
  // 抽到不拿走的話,「剩幾顆」永遠不變,顯示了反而誤導
  return { text: `剩 ${remaining3d(setup)} 顆`, hidden: !setup.removeOnDraw };
}

// 均勻挑一顆沒被抽走的蛋 —— 機率天然等於 count / total,稀有度從不進入計算。
export function draw3d(setup, rng = Math.random) {
  const candidates = setup.removeOnDraw ? setup.pool.filter(c => !c.drawn) : setup.pool;
  if (candidates.length === 0) return null;

  const capsule = candidates[Math.floor(rng() * candidates.length)];
  const prize = setup.prizes.find(p => p.id === capsule.prizeId);
  // prizes 是不會被消耗的設定,pool 才是可消耗的副本 —— 不要去動 prize.count。
  const pool = setup.removeOnDraw
    ? setup.pool.map(c => (c === capsule ? { ...c, drawn: true } : c))
    : setup.pool;

  return {
    capsule: setup.removeOnDraw ? { ...capsule, drawn: true } : capsule,
    prize,
    pool,
    revealSteps: buildRevealSteps(prize?.rarity ?? 'N', prize ?? null),
  };
}

// 桌上最多擺幾顆。**沒超過這個數就全部擺出來** —— 標題寫「還剩 N 顆」,
// 桌上就該有 N 顆,兩個數字對不起來的話使用者只會覺得畫面是壞的。
// 超過才抽樣,而且那時標題會另外講清楚有幾顆沒上桌。
export const MAX_ON_TABLE = 40;

// 從還沒抽走的蛋裡取一批擺上桌(超過上限時是**隨機抽樣**)。
//
// 不能取前幾顆:玩家是從桌上挑一顆點開的,只擺前面幾顆的話,排在後面的蛋
// 永遠不會被挑到,而畫面上完全看不出來 —— 跟阿彌陀籤那個沉默的不公平同一類。
export function tableBatch(setup, rng = Math.random) {
  const left = setup.pool.filter(c => !c.drawn);
  const shuffled = left.slice();
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled.slice(0, MAX_ON_TABLE);
}

// 點開桌上的某一顆。跟 draw3d 不同的是「抽到哪一顆」由玩家決定,不是隨機挑。
export function openCapsule(setup, capsule) {
  const prize = setup.prizes.find(p => p.id === capsule.prizeId);
  const pool = setup.removeOnDraw
    ? setup.pool.map(c => (c === capsule ? { ...c, drawn: true } : c))
    : setup.pool;
  return {
    capsule,
    prize,
    pool,
    revealSteps: buildRevealSteps(prize?.rarity ?? 'N', prize ?? null, { turn: false }),
  };
}

// 抽完一顆之後補哪一顆上桌(2026-10-02:抽完不再整桌重排,只拿掉被抽的那顆、再補一顆)。
// 從「還沒上桌」的蛋裡均勻挑;抽到就拿走的話,已經被抽走的不算。全部都在桌上就不補。
// onTable 是桌上那幾顆的 capsule 物件 —— 沒被抽到的蛋在 pool 裡始終是同一個物件。
export function nextForTable(setup, onTable, rng = Math.random) {
  const candidates = setup.pool.filter(c => !(setup.removeOnDraw && c.drawn) && !onTable.has(c));
  if (candidates.length === 0) return null;
  return candidates[Math.floor(rng() * candidates.length)];
}
