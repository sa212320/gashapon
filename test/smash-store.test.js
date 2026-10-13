// 大亂鬥的存檔。道具改名了(速度 → 補包、炸彈 → 飛彈、多了盾、變大拿掉),
// 舊存檔要照樣讀得進來;壞掉的存檔也不能白畫面。
import test from 'node:test';
import assert from 'node:assert/strict';
import { store, createSmashSetup } from '../smash/js/store.js';

// store.load(storage) 吃一個 localStorage 形狀的物件,用它餵舊資料進去
function loadFrom(raw) {
  const mem = new Map([['smash.v1', JSON.stringify(raw)]]);
  return store.load({
    getItem: k => mem.get(k) ?? null,
    setItem: (k, v) => mem.set(k, v),
    removeItem: k => mem.delete(k),
  });
}

const oldSave = items => ({
  schema: 1,
  state: {
    activeSetupId: 's1',
    setups: [{ id: 's1', name: '舊的', fighters: [{ id: 'f1', name: '紅隊', color: '#E4572E', count: 3 }], items }],
  },
});

test('新設定:四個道具都開', () => {
  assert.deepEqual(createSmashSetup().items, { attack: true, shield: true, spin: true, missile: true });
});

test('舊存檔:速度 → 補包、炸彈 → 飛彈,關掉的照樣關掉;盾預設開;變大丟掉', () => {
  const s = loadFrom(oldSave({ attack: true, speed: false, giant: false, bomb: false })).setups[0];
  assert.deepEqual(s.items, { attack: true, shield: true, spin: false, missile: false });
});

test('壞掉的 items 也讀得進來,四個開關都有值', () => {
  for (const bad of [null, 'oops', 42, [], { giant: false }]) {
    const s = loadFrom(oldSave(bad)).setups[0];
    assert.equal(s.name, '舊的', '壞掉的 items 不該讓整份存檔被丟掉');
    assert.deepEqual(Object.keys(s.items).sort(), ['attack', 'missile', 'shield', 'spin']);
  }
});

test('隊伍資料沒有多出動物欄位', () => {
  const s = loadFrom(oldSave({})).setups[0];
  assert.deepEqual(Object.keys(s.fighters[0]).sort(), ['color', 'count', 'id', 'name']);
});
