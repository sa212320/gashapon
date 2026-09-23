// 阿彌陀籤的純邏輯:梯子、走法、配對。不碰 DOM、不碰 three.js。
//
// 這個模式的公平性**來自 lineup 與 bottomSlots 兩端各自的洗牌**,不是來自橫槓密度。
// 起始位置隨機、終點獎項隨機,所以不論梯子連得多亂多不亂,每個人拿到每個獎的機率都均勻;
// 梯子在數學上只是一個雙射,它是演出。任何「橫槓多一點比較公平」的改法都是做錯了。
import { newId } from '../../shared/js/ids.js';
import { expand } from '../../shared/js/roster.js';

const EMPTY_SLOT_NAME = '銘謝惠顧';

// 20 色。做過 40 色的可辨識度測試:黃金角分散色相、三段明度拉開之後,
// 在角色實際的大小(18~26px)下仍有好幾組肉眼分不出來的重複對,那是假的唯一。
// 20 是這個尺寸下還能一眼分辨的上限。
//
// 而且不論調色盤多大,**名字才是識別** —— 約 8% 的男生有紅綠色覺辨異,
// 他們從一開始就分不出顏色。顏色是加分,不是識別。
export const PALETTE = Object.freeze([
  '#E4572E', '#4C9F70', '#3D7EA6', '#E8B830', '#8E6BBF',
  '#D96BA0', '#3FA7A0', '#C2543D', '#6CA644', '#5B6BC0',
  '#E08A3C', '#A24E8F', '#2F8F6B', '#B8863B', '#7A5BD6',
  '#D44C6E', '#4E8FD9', '#8AA82E', '#C05C9A', '#3B9AAE',
]);

export function pickColor(existing) {
  const used = new Set(existing.map(p => p.color));
  return PALETTE.find(c => !used.has(c)) ?? PALETTE[existing.length % PALETTE.length];
}

export function createPlayer({ name = '玩家', color = null } = {}) {
  return { id: newId('pl'), name, color: color ?? PALETTE[0] };
}

export function createGhostPrize({ name = '新獎項', count = 1 } = {}) {
  return {
    id: newId('gp'),
    name,
    // count 不可信:Infinity / NaN 會讓 expand 的迴圈跑不完(一番賞踩過,真的會 OOM)。
    // 一律當成 0(沒有這個獎)比憑空多一份安全。
    count: Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0,
  };
}

export function shuffle(list, rng = Math.random) {
  const out = list.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// 每局把玩家洗到車道上。畫面上誰站第幾條跟設定清單的順序無關。
export function lineup(players, rng = Math.random) {
  return shuffle(players, rng);
}

// 展開 → 洗牌 → 取前 playerCount 份 → 補空籤 → 再洗一次。
//
// 不能用 slice(0, playerCount) 取原順序:獎項比人多的時候,排在清單後面的獎項會
// 永遠抽不到,而畫面上不會有任何提示。先洗再取之後,每個獎項每局都有機會上場,
// 數量多的獎項自然比較常被選中(它展開後佔比較多份)。
// 最後那次洗是為了讓補進來的空籤不會全部擠在尾端。
export function bottomSlots(prizes, playerCount, rng = Math.random) {
  const filled = shuffle(expand(prizes, p => ({ prizeId: p.id, name: p.name })), rng);
  const slots = filled.slice(0, playerCount);
  while (slots.length < playerCount) slots.push({ prizeId: null, name: EMPTY_SLOT_NAME });
  return shuffle(slots, rng);
}

// rows 決定「跑道多長 / 看多久」,density 決定「看起來多亂」。
// 這兩件事以前綁在 rows = lanes * 2 上,結果 40 人時跑道變成 80 列、跑一次很久。
// 公平性不在這裡,所以 rows 可以純粹照「一次看得完多久」封頂。
export function buildLadder({
  lanes,
  rows = Math.min(16, Math.max(12, lanes)),
  density = 0.45,
  rng = Math.random,
} = {}) {
  const rungs = [];
  for (let row = 0; row < rows; row++) {
    let left = 0;
    while (left < lanes - 1) {
      if (rng() < density) {
        rungs.push({ row, left });
        left += 2; // 跳過一條,避免同一列出現相鄰橫線(會讓走法產生歧義)
      } else {
        left += 1;
      }
    }
  }
  return { lanes, rows, rungs };
}

export function walk(ladder, startLane) {
  let lane = startLane;
  for (let row = 0; row < ladder.rows; row++) {
    const here = ladder.rungs.find(r => r.row === row && (r.left === lane || r.left + 1 === lane));
    if (!here) continue;
    lane = here.left === lane ? lane + 1 : lane - 1;
  }
  return lane;
}

// players 必須是已經 lineup 過的順序 —— 第 i 個人站第 i 條線。
export function assign(ladder, players, slots) {
  return players.map((player, lane) => {
    const slotIndex = walk(ladder, lane);
    return { playerId: player.id, slotIndex, slot: slots[slotIndex] };
  });
}

// 一份設定 = 一組玩家 + 一組獎項。每局的梯子、站位、終點擺設都是現場產生的,不存。
export function createGhostSetup({ name = '我的阿彌陀籤', players = [], prizes = [] } = {}) {
  return { id: newId('gs'), name, players, prizes };
}

// 人數上限。再多的話車道會細到名字疊在一起,而且畫面上看不出哪裡壞掉 ——
// 與其讓它悄悄爛掉,不如在設定裡直接擋住。
export const MAX_PLAYERS = 40;
