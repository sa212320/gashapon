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

// 「普通物件」:字面量 `{}` 或 `Object.create(null)`,列舉它的 key 有意義。
// Date、RegExp 這類物件不算——它們的值藏在內部 slot,不是自身可列舉的 key
// (Object.keys(new Date()) 是 []),所以不能靠 typeof === 'object' 來判斷,
// 一律走「列舉 key」會把所有 Date 序列化成同一個 '{}'。用原型判斷才準確。
function isPlainObject(value) {
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

// 普通物件以外的物件(Date、RegExp、…):用型別標籤 + 物件自己的值序列化,
// 不要列舉 key。Date 用 getTime()(Invalid Date 的 getTime() 是 NaN,跟數字
// NaN 的表示法一致地標成 'NaN',但因為前面帶了 tag,不會跟數字 NaN 混淆);
// RegExp 用 String(value)(能同時抓到 pattern 與 flags);其他不預期出現在
// entries 裡的物件類型,一樣用「tag + String(value)」保底,避免拋例外。
function serializeNonPlainObject(value) {
  const tag = Object.prototype.toString.call(value);
  if (tag === '[object Date]') {
    const t = value.getTime();
    return `${tag}:${Number.isNaN(t) ? 'NaN' : t}`;
  }
  return `${tag}:${String(value)}`;
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
    if (!isPlainObject(value)) return serializeNonPlainObject(value);
    const keys = Object.keys(value).sort();
    return `{${keys.map(k => `${JSON.stringify(k)}:${stableSerialize(value[k])}`).join(',')}}`;
  }
  // function、symbol、bigint 等其他型別:不預期出現在 entries 裡,保底處理避免拋例外。
  return `${typeof value}:${String(value)}`;
}

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
