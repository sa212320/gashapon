// 五個模式的「設定項 → 個體」都是同一個形狀:依 count 展開。
// 這裡只處理那個形狀,不知道獎項、參賽者、籤紙有什麼差別。

export function expand(entries, makeItem) {
  const items = [];
  for (const entry of entries) {
    // entry.count 不可信:Infinity 會讓這個迴圈永遠跑下去把分頁打死,
    // NaN / 負數 / 小數也都不是合法的個體數。四個模式都經過這裡,
    // 只在各自的 createXxx 擋是不夠的——下一個模式又會漏一次。
    const n = Number.isFinite(entry.count) ? Math.max(0, Math.floor(entry.count)) : 0;
    for (let i = 0; i < n; i++) items.push(makeItem(entry, i));
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

// 「普通物件」:字面量 `{}` 或 `Object.create(null)`,列舉它的 key 有意義。
// 用原型判斷,而不是 value.constructor === Object——null-prototype 物件
// 沒有 constructor,那樣判會誤傷 Object.create(null)。
function isPlainObject(value) {
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

// 遞迴、型別安全的序列化器,專門給 entriesChanged 用。
// 不能用 JSON.stringify:它會把 undefined 跟 NaN 都變成 null,
// 而且只會照物件原本的 key 順序輸出,巢狀物件的 key 換個順序就會被誤判成「變了」。
// 物件的 key 遞迴排序後再比對(順序不重要);陣列保留原本順序(順序本身有意義)。
function stableSerialize(value) {
  if (value === undefined) return 'u';
  if (value === null) return 'n';
  if (typeof value === 'number') {
    return Number.isNaN(value) ? 'NaN' : `num:${value}`;
  }
  if (typeof value === 'string') return `str:${JSON.stringify(value)}`;
  if (typeof value === 'boolean') return `bool:${value}`;
  if (Array.isArray(value)) {
    return `[${value.map(stableSerialize).join(',')}]`;
  }
  if (typeof value === 'object') {
    // 非普通物件(Date、RegExp、…)不保證比對得出正確結果,詳見 entriesChanged 上方註解。
    if (!isPlainObject(value)) return 'object';
    const keys = Object.keys(value).sort();
    return `{${keys.map(k => `${JSON.stringify(k)}:${stableSerialize(value[k])}`).join(',')}}`;
  }
  // function、symbol、bigint 等其他型別:不預期出現在 entries 裡,保底處理避免拋例外。
  return `${typeof value}:${String(value)}`;
}

// entries 是要進 localStorage 的資料,依 spec 的契約只能是字串、數字、布林、null、
// 以及由這些組成的普通物件與陣列(docs/superpowers/specs/2026-09-22-multi-mode-site-design.md)。
// Date / RegExp / Map / Set 這類 JSON 往返會失真或直接消失的型別,結構上不會合法
// 出現在 entries 裡,所以 stableSerialize 不為它們的內容差異負責——遇到了只保證
// 不拋例外(一律序列化成同一個值,所以兩個內容不同的 Date 在這裡會被誤判成沒變)。
//
// 內容有沒有動過,給「按確定時要不要做事」用。不在乎排列順序。
export function entriesChanged(before, after) {
  if (before.length !== after.length) return true;
  const a = before.map(stableSerialize).sort();
  const b = after.map(stableSerialize).sort();
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
