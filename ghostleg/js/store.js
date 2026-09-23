// localStorage 讀寫。讀進來的東西一律當成不可信,壞掉就回種子資料,絕不白畫面。
import { createStore } from '../../shared/js/storage.js';
import { createSetupList } from '../../shared/js/roster.js';
import { createGhostSetup, createPlayer, createGhostPrize, MAX_PLAYERS, PALETTE } from './ladder.js';

const SEED_PLAYERS = ['小紅', '小綠', '小藍', '小黃', '小紫', '小橘'];
const SEED_PRIZES = [
  { name: '頭獎', count: 1 },
  { name: '二獎', count: 1 },
  { name: '三獎', count: 2 },
];

export function seedState() {
  return createSetupList(createGhostSetup({
    name: '我的阿彌陀籤',
    players: SEED_PLAYERS.map((name, i) => createPlayer({ name, color: PALETTE[i % PALETTE.length] })),
    prizes: SEED_PRIZES.map(createGhostPrize),
  }));
}

function sanitizeSetup(raw) {
  if (!raw || typeof raw !== 'object' || typeof raw.id !== 'string') return null;

  const players = (Array.isArray(raw.players) ? raw.players : [])
    .filter(p => p && typeof p.id === 'string')
    .slice(0, MAX_PLAYERS) // 存進去的東西可能是舊版或被手改過的,一樣要吃上限
    .map((p, i) => ({
      id: p.id,
      name: typeof p.name === 'string' ? p.name : '玩家',
      color: PALETTE.includes(p.color) ? p.color : PALETTE[i % PALETTE.length],
    }));

  const prizes = (Array.isArray(raw.prizes) ? raw.prizes : [])
    .filter(p => p && typeof p.id === 'string')
    .map(p => ({
      id: p.id,
      name: typeof p.name === 'string' ? p.name : '獎項',
      // Infinity / NaN 會讓 expand 的迴圈跑不完,當成 0 比憑空多一份安全
      count: Number.isFinite(p.count) ? Math.max(0, Math.floor(p.count)) : 0,
    }));

  return {
    id: raw.id,
    name: typeof raw.name === 'string' ? raw.name : '我的阿彌陀籤',
    players,
    prizes,
  };
}

export const store = createStore({
  key: 'ghostleg.v1',
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
