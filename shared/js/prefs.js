// 全站共用的偏好。目前只有音效開關。
import { createStore } from './storage.js';

const LEGACY_KEY = 'gashapon.v1';

// soundOn 原本住在 2D 扭蛋機的存檔裡。搬家時讀一次舊的,
// 之後就以 prefs.v1 為準。舊 key 的欄位留著不動,免得動到 2D 的存檔。
function migrate(storage) {
  try {
    const raw = storage?.getItem(LEGACY_KEY);
    if (!raw) return { soundOn: true };
    const parsed = JSON.parse(raw);
    return { soundOn: parsed?.soundOn !== false };
  } catch {
    return { soundOn: true };
  }
}

let migrationStorage = null;

const store = createStore({
  key: 'prefs.v1',
  schema: 1,
  seed: () => migrate(migrationStorage),
  sanitize: parsed => ({ soundOn: parsed.soundOn !== false }),
});

export function loadPrefs(storage = globalThis.localStorage) {
  migrationStorage = storage;
  return store.load(storage);
}

export function savePrefs(prefs, storage = globalThis.localStorage) {
  return store.save(prefs, storage);
}
