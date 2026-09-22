// localStorage 讀寫。原則:讀進來的東西一律當成不可信,
// 壞掉就回種子資料,絕不讓小孩看到白畫面。
import { STORAGE_KEY, SCHEMA_VERSION, RARITIES } from './constants.js';
import { createInitialState, buildPool } from './state.js';

function sanitizePrize(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const id = typeof raw.id === 'string' && raw.id ? raw.id : null;
  if (!id) return null;
  return {
    id,
    name: typeof raw.name === 'string' ? raw.name : '獎項',
    count: Number.isFinite(raw.count) ? Math.max(0, Math.floor(raw.count)) : 1,
    rarity: RARITIES.includes(raw.rarity) ? raw.rarity : 'N',
  };
}

function sanitizeMachine(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const id = typeof raw.id === 'string' && raw.id ? raw.id : null;
  if (!id) return null;

  const prizes = Array.isArray(raw.prizes) ? raw.prizes.map(sanitizePrize).filter(Boolean) : [];
  const prizeIds = new Set(prizes.map(p => p.id));

  // pool 缺了、壞了、或指向已經不存在的獎項 → 直接依 prizes 重新裝滿
  const poolOk = Array.isArray(raw.pool)
    && raw.pool.every(c => c && typeof c === 'object' && prizeIds.has(c.prizeId));
  const pool = poolOk
    ? raw.pool.map(c => ({ prizeId: c.prizeId, drawn: c.drawn === true }))
    : buildPool(prizes);

  return {
    id,
    name: typeof raw.name === 'string' ? raw.name : '我的扭蛋機',
    removeOnDraw: raw.removeOnDraw !== false,
    prizes,
    pool,
  };
}

export function load(storage = globalThis.localStorage) {
  try {
    const raw = storage?.getItem(STORAGE_KEY);
    if (!raw) return createInitialState();

    const parsed = JSON.parse(raw);
    if (!parsed || parsed.schema !== SCHEMA_VERSION) return createInitialState();
    if (!Array.isArray(parsed.machines)) return createInitialState();

    const machines = parsed.machines.map(sanitizeMachine).filter(Boolean);
    if (machines.length === 0) return createInitialState();

    const activeMachineId = machines.some(m => m.id === parsed.activeMachineId)
      ? parsed.activeMachineId
      : machines[0].id;

    return { machines, activeMachineId, soundOn: parsed.soundOn !== false };
  } catch {
    return createInitialState();
  }
}

export function save(state, storage = globalThis.localStorage) {
  try {
    storage?.setItem(STORAGE_KEY, JSON.stringify({ schema: SCHEMA_VERSION, ...state }));
    return true;
  } catch {
    // 配額爆掉或被瀏覽器擋住:功能照常,只是這次沒存到
    return false;
  }
}

// 打字時不要每個按鍵都寫一次 localStorage
export function createDebouncedSave(storage = globalThis.localStorage, delay = 200) {
  let timer = null;
  return state => {
    clearTimeout(timer);
    timer = setTimeout(() => save(state, storage), delay);
  };
}

// 請瀏覽器把這個站的資料標成「持久」,避免空間吃緊時被驅逐。
// 拿不到就算了,不影響任何功能。
export async function requestPersistence() {
  try {
    if (!navigator.storage?.persist) return false;
    if (await navigator.storage.persisted()) return true;
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}
