// localStorage 讀寫。原則:讀進來的東西一律當成不可信,
// 壞掉就回種子資料,絕不讓小孩看到白畫面。

export function createStore({ key, schema, sanitize, seed }) {
  function load(storage = globalThis.localStorage) {
    try {
      const raw = storage?.getItem(key);
      if (!raw) return seed();
      const parsed = JSON.parse(raw);
      if (!parsed || parsed.schema !== schema) return seed();
      return sanitize(parsed) ?? seed();
    } catch {
      return seed();
    }
  }

  function save(state, storage = globalThis.localStorage) {
    try {
      storage?.setItem(key, JSON.stringify({ schema, ...state }));
      return true;
    } catch {
      // 配額爆掉或被瀏覽器擋住:功能照常,只是這次沒存到
      return false;
    }
  }

  // 打字時不要每個按鍵都寫一次 localStorage
  function createDebouncedSave(storage = globalThis.localStorage, delay = 200) {
    let timer = null;
    return state => {
      clearTimeout(timer);
      timer = setTimeout(() => save(state, storage), delay);
    };
  }

  return { key, load, save, createDebouncedSave };
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
