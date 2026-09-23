// 一番賞。注意:這裡沒有稀有度 —— 一番賞用的是「賞別」,兩者是不同的東西。
import { newId } from '../../shared/js/ids.js';
import { expand } from '../../shared/js/roster.js';

export const TIERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G'];

export const TIER_META = {
  A: { label: 'A賞', color: '#FF6F91', glow: 'rgba(255,111,145,.9)' },
  B: { label: 'B賞', color: '#FFA45B', glow: 'rgba(255,164,91,.85)' },
  C: { label: 'C賞', color: '#FFD479', glow: 'rgba(255,212,121,.8)' },
  D: { label: 'D賞', color: '#9BE7C4', glow: 'rgba(155,231,196,.8)' },
  E: { label: 'E賞', color: '#8CC9FF', glow: 'rgba(140,201,255,.75)' },
  F: { label: 'F賞', color: '#C4A2FF', glow: 'rgba(196,162,255,.7)' },
  G: { label: 'G賞', color: '#E7DFD4', glow: 'rgba(231,223,212,.7)' },
};

export function createIchibanPrize({ name = '新獎項', tier = 'G', count = 1 } = {}) {
  return {
    id: newId('ip'),
    name,
    tier: TIERS.includes(tier) ? tier : 'G',
    count: Math.max(0, Math.floor(count)),
  };
}

export function buildTickets(prizes) {
  return expand(prizes, prize => ({ prizeId: prize.id, drawn: false }));
}

export function createIchibanSetup({ name = '我的一番賞', prizes = [], lastOnePrize = '' } = {}) {
  return { id: newId('is'), name, prizes, lastOnePrize, tickets: buildTickets(prizes) };
}

export function refillSetup(setup) {
  return { ...setup, tickets: buildTickets(setup.prizes) };
}

// 抽一張。機率只由 count 決定 —— 每張籤機會均等,賞別從不參與計算。
export function drawTicket(setup, rng = Math.random) {
  const candidates = [];
  setup.tickets.forEach((ticket, index) => { if (!ticket.drawn) candidates.push(index); });
  if (candidates.length === 0) return null;

  const index = candidates[Math.floor(rng() * candidates.length)];
  const ticket = setup.tickets[index];
  const prize = setup.prizes.find(p => p.id === ticket.prizeId);
  const tickets = setup.tickets.map((t, i) => (i === index ? { ...t, drawn: true } : t));

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
