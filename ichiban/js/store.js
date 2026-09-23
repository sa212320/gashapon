// localStorage 讀寫。原則跟 2D 扭蛋機一樣:讀進來的東西一律當成不可信,
// 壞掉就回種子資料,絕不讓小孩看到白畫面。
import { createStore } from '../../shared/js/storage.js';
import { createSetupList } from '../../shared/js/roster.js';
import { createIchibanSetup, createIchibanPrize, buildTickets, TIERS } from './ichiban.js';

const SEED_PRIZES = [
  { name: '大獎',   tier: 'A', count: 1 },
  { name: '二獎',   tier: 'B', count: 2 },
  { name: '三獎',   tier: 'C', count: 3 },
  { name: '小獎',   tier: 'E', count: 6 },
  { name: '銘謝惠顧', tier: 'G', count: 8 },
];

export function seedState() {
  return createSetupList(createIchibanSetup({
    name: '我的一番賞',
    prizes: SEED_PRIZES.map(createIchibanPrize),
    lastOnePrize: '最後一抽大獎',
  }));
}

function sanitizeSetup(raw) {
  if (!raw || typeof raw !== 'object' || typeof raw.id !== 'string') return null;
  const prizes = Array.isArray(raw.prizes)
    ? raw.prizes.filter(p => p && typeof p.id === 'string').map(p => ({
        id: p.id,
        name: typeof p.name === 'string' ? p.name : '獎項',
        tier: TIERS.includes(p.tier) ? p.tier : 'G',
        count: Number.isFinite(p.count) ? Math.max(0, Math.floor(p.count)) : 1,
      }))
    : [];
  const ids = new Set(prizes.map(p => p.id));
  const ok = Array.isArray(raw.tickets) && raw.tickets.every(t => t && ids.has(t.prizeId));
  return {
    id: raw.id,
    name: typeof raw.name === 'string' ? raw.name : '我的一番賞',
    lastOnePrize: typeof raw.lastOnePrize === 'string' ? raw.lastOnePrize : '',
    prizes,
    tickets: ok ? raw.tickets.map(t => ({ prizeId: t.prizeId, drawn: t.drawn === true })) : buildTickets(prizes),
  };
}

export const store = createStore({
  key: 'ichiban.v1',
  schema: 1,
  seed: seedState,
  sanitize: parsed => {
    if (!Array.isArray(parsed.setups)) return null;
    const setups = parsed.setups.map(sanitizeSetup).filter(Boolean);
    if (setups.length === 0) return null;
    const activeSetupId = setups.some(s => s.id === parsed.activeSetupId)
      ? parsed.activeSetupId : setups[0].id;
    return { setups, activeSetupId };
  },
});
