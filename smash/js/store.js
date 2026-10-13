// localStorage 讀寫。讀進來的東西一律當成不可信,壞掉就回種子資料,絕不白畫面。
import { createStore } from '../../shared/js/storage.js';
import { createSetupList } from '../../shared/js/roster.js';
import { newId } from '../../shared/js/ids.js';
import { createFighter, PALETTE } from './fighters.js';
import { ITEM_TYPES } from './items.js';

const SEED = [
  { name: '紅隊', count: 3 },
  { name: '綠隊', count: 3 },
  { name: '藍隊', count: 3 },
];

export function createSmashSetup({ name = '我的大亂鬥', fighters = [], items = null } = {}) {
  return {
    id: newId('sm'),
    name,
    fighters,
    items: items ?? { dash: true, freeze: true, vortex: true, meteor: true },
  };
}

export function seedState() {
  return createSetupList(createSmashSetup({
    name: '我的大亂鬥',
    fighters: SEED.map((f, i) => createFighter({ ...f, color: PALETTE[i % PALETTE.length] })),
  }));
}

function sanitizeSetup(raw) {
  if (!raw || typeof raw !== 'object' || typeof raw.id !== 'string') return null;

  const fighters = (Array.isArray(raw.fighters) ? raw.fighters : [])
    .filter(f => f && typeof f.id === 'string')
    .map((f, i) => ({
      id: f.id,
      name: typeof f.name === 'string' ? f.name : '隊伍',
      color: PALETTE.includes(f.color) ? f.color : PALETTE[i % PALETTE.length],
      // Infinity / NaN 會讓展開的迴圈跑不完,當成 0 比憑空多一個人安全
      count: Number.isFinite(f.count) ? Math.max(0, Math.min(12, Math.floor(f.count))) : 0,
    }));

  // 道具改名兩次:速度 / 炸彈 → 補包 / 飛彈(2026-10-12),
  // 劍 / 盾 / 補包 / 飛彈 → 衝刺 / 冰塊 / 冰旋渦 / 冰隕石(2026-10-13)。
  // 依序找新鍵 → 上一代 → 更舊的,第一個有值的決定;只有 false 是關。變大(giant)直接忽略。
  const ITEM_ALIASES = { dash: ['attack'], freeze: ['shield'], vortex: ['spin', 'speed'], meteor: ['missile', 'bomb'] };
  const rawItems = raw.items && typeof raw.items === 'object' && !Array.isArray(raw.items) ? raw.items : {};
  const items = {};
  for (const t of ITEM_TYPES) {
    const key = [t, ...ITEM_ALIASES[t]].find(k => rawItems[k] !== undefined);
    items[t] = key === undefined || rawItems[key] !== false;
  }

  return {
    id: raw.id,
    name: typeof raw.name === 'string' ? raw.name : '我的大亂鬥',
    fighters,
    items,
  };
}

export const store = createStore({
  key: 'smash.v1',
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
