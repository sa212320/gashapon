// 抽獎邏輯。純函式:不就地改動機台,把新的 pool 回傳給呼叫端。
//
// 重要:中獎機率「只」由 prize.count 決定 —— 每顆蛋機會均等,
// 所以某個獎項被抽中的機率天然等於 它的顆數 / 總顆數。
// rarity 從頭到尾不參與任何計算,它只決定演出。
import { RARITIES } from './constants.js';

export function draw(machine, rng = Math.random, { turn = true } = {}) {
  const candidates = [];
  machine.pool.forEach((capsule, index) => {
    if (machine.removeOnDraw && capsule.drawn) return;
    candidates.push(index);
  });
  if (candidates.length === 0) return null;

  const index = candidates[Math.floor(rng() * candidates.length)];
  const capsule = machine.pool[index];
  const prize = machine.prizes.find(p => p.id === capsule.prizeId);

  const pool = machine.removeOnDraw
    ? machine.pool.map((c, i) => (i === index ? { ...c, drawn: true } : c))
    : machine.pool;

  return { capsule, prize, pool, revealSteps: buildRevealSteps(prize.rarity, prize, { turn }) };
}

// 從已知的最終稀有度往回推出演出腳本。
// 骰子只擲一次(在 draw 裡),這裡純粹是把結果編排成一連串動作。
// 規則:搖一次升一階,升到目標階才裂開 —— 所以「搖越多次 = 越大獎」。
// turn = 轉把手那段扭蛋機本體的演出。按「再抽一次」時不重播,免得小孩每次都要等。
// 注意 'turn'(轉把手)跟 'crack'(蛋裂開)是兩回事,別看錯。
export function buildRevealSteps(rarity, prize = null, { turn = true } = {}) {
  const target = Math.max(0, RARITIES.indexOf(rarity));
  const steps = turn ? [{ type: 'turn' }, { type: 'drop' }] : [{ type: 'drop' }];

  if (target === 0) {
    steps.push({ type: 'shake', tension: 0 });
  } else {
    for (let i = 0; i < target; i++) {
      steps.push({ type: 'shake', tension: i });
      steps.push({ type: 'upgrade', to: RARITIES[i + 1] });
    }
  }

  steps.push({ type: 'crack', rarity });
  steps.push({ type: 'burst', rarity });
  steps.push({ type: 'show', rarity, prize });
  return steps;
}
