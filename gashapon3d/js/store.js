// localStorage 讀寫。讀進來的東西一律當成不可信,壞掉就回種子資料,絕不白畫面。
import { createStore } from '../../shared/js/storage.js';
import { createSetupList } from '../../shared/js/roster.js';
import { RARITIES } from '../../gashapon/js/constants.js';
import { createPrize } from '../../gashapon/js/state.js';
import { createSetup3d, buildPool3d, CAPSULE_COLORS } from './model.js';

const SEED_PRIZES = [
  { name: '大獎',   count: 1,  rarity: 'UR' },
  { name: '二獎',   count: 2,  rarity: 'SSR' },
  { name: '三獎',   count: 4,  rarity: 'SR' },
  { name: '小獎',   count: 8,  rarity: 'R' },
  { name: '銘謝惠顧', count: 15, rarity: 'N' },
];

export function seedState() {
  return createSetupList(createSetup3d({
    name: '我的立體扭蛋機',
    prizes: SEED_PRIZES.map(createPrize),
  }));
}

function sanitizeSetup(raw) {
  if (!raw || typeof raw !== 'object' || typeof raw.id !== 'string') return null;

  const prizes = (Array.isArray(raw.prizes) ? raw.prizes : [])
    .filter(p => p && typeof p.id === 'string')
    .map(p => ({
      id: p.id,
      name: typeof p.name === 'string' ? p.name : '獎項',
      rarity: RARITIES.includes(p.rarity) ? p.rarity : 'N',
      // Infinity / NaN 會讓展開的迴圈跑不完,當成 0 比憑空多一顆安全
      count: Number.isFinite(p.count) ? Math.max(0, Math.floor(p.count)) : 0,
    }));

  const ids = new Set(prizes.map(p => p.id));
  const poolOk = Array.isArray(raw.pool)
    && raw.pool.every(c => c && ids.has(c.prizeId) && CAPSULE_COLORS.includes(c.color));

  return {
    id: raw.id,
    name: typeof raw.name === 'string' ? raw.name : '我的立體扭蛋機',
    removeOnDraw: raw.removeOnDraw !== false,
    prizes,
    pool: poolOk
      ? raw.pool.map(c => ({ prizeId: c.prizeId, drawn: c.drawn === true, color: c.color }))
      : buildPool3d(prizes),
  };
}

export const store = createStore({
  key: 'gashapon3d.v1',
  schema: 1,
  seed: seedState,
  sanitize: parsed => {
    if (!parsed || !Array.isArray(parsed.setups)) return null;
    const setups = parsed.setups.map(sanitizeSetup).filter(Boolean);
    if (setups.length === 0) return null;
    const activeSetupId = setups.some(s => s.id === parsed.activeSetupId)
      ? parsed.activeSetupId : setups[0].id;
    return { setups, activeSetupId };
  },
});
