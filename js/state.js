// 純函式層:只處理資料形狀,不碰 DOM、不碰 localStorage。
// 所有函式都不就地改動傳進來的東西,一律回傳新的物件。
import { RARITIES, SEED_MACHINE_NAME, SEED_PRIZES } from './constants.js';

let idCounter = 0;
function newId(prefix) {
  const rand = (globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2));
  return `${prefix}_${(idCounter++).toString(36)}_${rand.slice(0, 8)}`;
}

export function createPrize({ name = '新獎項', count = 1, rarity = 'N' } = {}) {
  return {
    id: newId('p'),
    name,
    count: Math.max(0, Math.floor(count)),
    rarity: RARITIES.includes(rarity) ? rarity : 'N',
  };
}

export function buildPool(prizes) {
  const pool = [];
  for (const prize of prizes) {
    for (let i = 0; i < prize.count; i++) {
      pool.push({ prizeId: prize.id, drawn: false });
    }
  }
  return pool;
}

export function createMachine({ name = '我的扭蛋機', prizes = [], removeOnDraw = true } = {}) {
  return { id: newId('m'), name, removeOnDraw, prizes, pool: buildPool(prizes) };
}

export function createSeedMachine() {
  return createMachine({
    name: SEED_MACHINE_NAME,
    prizes: SEED_PRIZES.map(createPrize),
  });
}

export function remaining(machine) {
  return machine.pool.filter(c => !c.drawn).length;
}

export function totalCount(machine) {
  return machine.pool.length;
}

export function refillMachine(machine) {
  return { ...machine, pool: buildPool(machine.prizes) };
}

// 只在乎「機率有沒有變」與「清單內容有沒有變」,不在乎排列順序。
// 順序變了但內容一樣 → 不重建 pool,小孩的進度留著。
export function prizesChanged(before, after) {
  if (before.length !== after.length) return true;
  const key = p => `${p.id}|${p.name}|${p.count}|${p.rarity}`;
  const a = before.map(key).sort();
  const b = after.map(key).sort();
  return a.some((k, i) => k !== b[i]);
}

// 池子的形狀變了嗎?只在乎「有哪些獎項」跟「各幾顆」。
// 改名字、改稀有度不會改變池子裡有幾顆蛋,所以不該沒收已經抽掉的進度。
export function needsRebuild(before, after) {
  const key = p => `${p.id}|${p.count}`;
  const a = before.map(key).sort();
  const b = after.map(key).sort();
  if (a.length !== b.length) return true;
  return a.some((k, i) => k !== b[i]);
}

export function createInitialState() {
  const machine = createSeedMachine();
  return { machines: [machine], activeMachineId: machine.id, soundOn: true };
}

export function getActiveMachine(state) {
  return state.machines.find(m => m.id === state.activeMachineId) ?? state.machines[0];
}

export function addMachine(state, name) {
  const machine = createMachine({ name, prizes: [createPrize({})] });
  return { ...state, machines: [...state.machines, machine], activeMachineId: machine.id };
}

export function removeMachine(state, id) {
  const machines = state.machines.filter(m => m.id !== id);
  if (machines.length === 0) {
    const seed = createSeedMachine();
    return { ...state, machines: [seed], activeMachineId: seed.id };
  }
  const activeMachineId = machines.some(m => m.id === state.activeMachineId)
    ? state.activeMachineId
    : machines[0].id;
  return { ...state, machines, activeMachineId };
}

export function replaceMachine(state, machine) {
  return { ...state, machines: state.machines.map(m => (m.id === machine.id ? machine : m)) };
}
