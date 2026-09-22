// localStorage 讀寫。原則:讀進來的東西一律當成不可信,
// 壞掉就回種子資料,絕不讓小孩看到白畫面。

// 存取 localStorage 這個 getter 本身就可能丟例外(Safari 封鎖所有 Cookie 時),
// 所以連「拿到它」都要保護,不能放在預設參數裡 —— 那是在 try 之外求值的。
function resolveStorage(storage) {
  if (storage !== undefined) return storage;
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

export function createStore({ key, schema, sanitize, seed }) {
  function load(storage) {
    try {
      const resolved = resolveStorage(storage);
      const raw = resolved?.getItem(key);
      if (!raw) return seed(resolved);
      const parsed = JSON.parse(raw);
      if (!parsed || parsed.schema !== schema) return seed(resolved);
      return sanitize(parsed.state) ?? seed(resolved);
    } catch {
      return seed(undefined);
    }
  }

  function save(state, storage) {
    try {
      const resolved = resolveStorage(storage);
      resolved?.setItem(key, JSON.stringify({ schema, state }));
      return true;
    } catch {
      // 配額爆掉或被瀏覽器擋住:功能照常,只是這次沒存到
      return false;
    }
  }

  // 打字時不要每個按鍵都寫一次 localStorage
  function createDebouncedSave(storage, delay = 200) {
    let timer = null;
    return state => {
      clearTimeout(timer);
      // storage 要在真正寫入的當下才解析,不是在建立 debouncer 時就解析掉
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
