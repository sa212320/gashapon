// 五個模式的「設定項 → 個體」都是同一個形狀:依 count 展開。
// 這裡只處理那個形狀,不知道獎項、參賽者、籤紙有什麼差別。

export function expand(entries, makeItem) {
  const items = [];
  for (const entry of entries) {
    for (let i = 0; i < entry.count; i++) items.push(makeItem(entry, i));
  }
  return items;
}

export function countOf(entries) {
  return entries.reduce((sum, e) => sum + e.count, 0);
}

export function remaining(items) {
  return items.filter(i => !i.drawn).length;
}

// 池子的形狀變了嗎?只在乎「有哪些項目」跟「各幾個」。
// 改名字、改稀有度、改賞別、改顏色都不會改變池子裡有幾個個體,
// 所以不該沒收使用者已經抽掉的進度。
export function needsRebuild(before, after) {
  const key = e => `${e.id}|${e.count}`;
  const a = before.map(key).sort();
  const b = after.map(key).sort();
  if (a.length !== b.length) return true;
  return a.some((k, i) => k !== b[i]);
}

// 內容有沒有動過,給「按確定時要不要做事」用。不在乎排列順序。
export function entriesChanged(before, after) {
  if (before.length !== after.length) return true;
  const key = e => JSON.stringify(Object.keys(e).sort().map(k => [k, e[k]]));
  const a = before.map(key).sort();
  const b = after.map(key).sort();
  return a.some((k, i) => k !== b[i]);
}

export function createSetupList(seed) {
  return { setups: [seed], activeSetupId: seed.id };
}

export function getActive(state) {
  return state.setups.find(s => s.id === state.activeSetupId) ?? state.setups[0];
}

export function replaceSetup(state, setup) {
  return { ...state, setups: state.setups.map(s => (s.id === setup.id ? setup : s)) };
}

export function addSetup(state, setup) {
  return { ...state, setups: [...state.setups, setup], activeSetupId: setup.id };
}

export function removeSetup(state, id, makeSeed) {
  const setups = state.setups.filter(s => s.id !== id);
  if (setups.length === 0) {
    const seed = makeSeed();
    return { ...state, setups: [seed], activeSetupId: seed.id };
  }
  const activeSetupId = setups.some(s => s.id === state.activeSetupId)
    ? state.activeSetupId
    : setups[0].id;
  return { ...state, setups, activeSetupId };
}
