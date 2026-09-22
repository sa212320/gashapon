let counter = 0;

export function newId(prefix) {
  const rand = globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2);
  return `${prefix}_${(counter++).toString(36)}_${rand.slice(0, 8)}`;
}
