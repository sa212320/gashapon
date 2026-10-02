// 一番賞。注意:這裡沒有稀有度 —— 一番賞用的是「賞別」,兩者是不同的東西。
import { newId } from '../../shared/js/ids.js';
import { expand } from '../../shared/js/roster.js';

export const TIERS = Object.freeze(['A', 'B', 'C', 'D', 'E', 'F', 'G']);

// 外層凍住還不夠——每個賞別的 meta 是巢狀物件,outer freeze 擋不住
// TIER_META.A.color = 'x' 這種改法,所以每個 value 也要各自凍。
export const TIER_META = Object.freeze(Object.fromEntries(
  Object.entries({
    A: { label: 'A賞', color: '#FF6F91', glow: 'rgba(255,111,145,.9)' },
    B: { label: 'B賞', color: '#FFA45B', glow: 'rgba(255,164,91,.85)' },
    C: { label: 'C賞', color: '#FFD479', glow: 'rgba(255,212,121,.8)' },
    D: { label: 'D賞', color: '#9BE7C4', glow: 'rgba(155,231,196,.8)' },
    E: { label: 'E賞', color: '#8CC9FF', glow: 'rgba(140,201,255,.75)' },
    F: { label: 'F賞', color: '#C4A2FF', glow: 'rgba(196,162,255,.7)' },
    G: { label: 'G賞', color: '#E7DFD4', glow: 'rgba(231,223,212,.7)' },
  }).map(([tier, meta]) => [tier, Object.freeze(meta)]),
));

export function createIchibanPrize({ name = '新獎項', tier = 'G', count = 1 } = {}) {
  return {
    id: newId('ip'),
    name,
    tier: TIERS.includes(tier) ? tier : 'G',
    // count 不可信:Infinity / NaN 會讓 buildTickets 依賴的 expand 迴圈爆掉,
    // 一律當成 0(沒有籤)比「憑空多一顆」安全。
    count: Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0,
  };
}

// 每張籤一個固定號碼(2026-10-02):小孩可以喊「我要 7 號」。抽走後其他號碼不重編,
// 只有重建(補籤、改獎項)才從 1 重新編。顏色、角色、歪斜都由號碼推算,不存。
export function buildTickets(prizes) {
  return expand(prizes, prize => ({ prizeId: prize.id, drawn: false }))
    .map((t, i) => ({ no: i + 1, ...t }));
}

// 存檔讀回來的號碼不可信:缺、重複、不是正整數 → 整組依陣列順序重編。
// 合法的就不動 —— 抽走一些之後號碼本來就不連續。
export function normalizeTicketNos(tickets) {
  const seen = new Set();
  const valid = tickets.every(t => Number.isInteger(t.no) && t.no > 0 && !seen.has(t.no) && seen.add(t.no));
  return valid ? tickets : tickets.map((t, i) => ({ ...t, no: i + 1 }));
}

export function createIchibanSetup({ name = '我的一番賞', prizes = [], lastOnePrize = '' } = {}) {
  return { id: newId('is'), name, prizes, lastOnePrize, tickets: buildTickets(prizes) };
}

export function refillSetup(setup) {
  return { ...setup, tickets: buildTickets(setup.prizes) };
}

// 抽一張。機率只由 count 決定 —— 每張籤機會均等,賞別從不參與計算。
// pickedNo(2026-10-02):使用者點的那張。隨機挑出的那張 j 跟它互換 prizeId,
// 再把點的那張標成 drawn —— 桌上消失的就是點的那張,而各獎的機率完全不變
// (prizeId 在撕開前沒有意義,互換不改變任何一張「被抽到什麼」的分布)。
export function drawTicket(setup, rng = Math.random, pickedNo) {
  const candidates = [];
  setup.tickets.forEach((ticket, index) => { if (!ticket.drawn) candidates.push(index); });
  if (candidates.length === 0) return null;

  const j = candidates[Math.floor(rng() * candidates.length)];
  const picked = setup.tickets.findIndex(t => !t.drawn && t.no === pickedNo);
  const index = picked === -1 ? j : picked;
  const prizeId = setup.tickets[j].prizeId;
  const tickets = setup.tickets.map((t, i) => {
    if (i === index) return { ...t, prizeId, drawn: true };
    if (i === j) return { ...t, prizeId: setup.tickets[index].prizeId };
    return t;
  });
  const ticket = tickets[index];
  const prize = setup.prizes.find(p => p.id === prizeId);

  const bonus = (setup.lastOnePrize ?? '').trim();
  const wasLast = candidates.length === 1 && bonus !== '';

  return {
    ticket,
    prize,
    tickets,
    isLastOne: wasLast,
    lastOnePrize: wasLast ? bonus : null,
  };
}
