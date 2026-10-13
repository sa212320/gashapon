// 大亂鬥的存檔。道具改名兩次了(速度 / 炸彈 → 補包 / 飛彈,劍 / 盾 / 補包 / 飛彈 → 衝刺 / 冰塊 / 冰旋渦 / 冰隕石,變大拿掉),
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

test('新設定:四個道具都開(新鍵)', () => {
  assert.deepEqual(createSmashSetup().items, { dash: true, freeze: true, vortex: true, meteor: true });
});

test('上一代存檔:劍→衝刺、盾→冰塊、補包→冰旋渦、飛彈→冰隕石,關掉的照樣關掉', () => {
  const s = loadFrom(oldSave({ attack: false, shield: true, spin: false, missile: false })).setups[0];
  assert.deepEqual(s.items, { dash: false, freeze: true, vortex: false, meteor: false });
});

test('更舊的存檔:速度→冰旋渦、炸彈→冰隕石;沒設定過的預設開;變大丟掉', () => {
  const s = loadFrom(oldSave({ attack: true, speed: false, giant: false, bomb: false })).setups[0];
  assert.deepEqual(s.items, { dash: true, freeze: true, vortex: false, meteor: false });
});

test('新鍵優先於舊鍵', () => {
  const s = loadFrom(oldSave({ dash: false, attack: true, vortex: true, spin: false, speed: false })).setups[0];
  assert.equal(s.items.dash, false);
  assert.equal(s.items.vortex, true);
});

test('壞掉的 items 也讀得進來,四個開關都有值', () => {
  for (const bad of [null, 'oops', 42, [], { giant: false }]) {
    const s = loadFrom(oldSave(bad)).setups[0];
    assert.equal(s.name, '舊的', '壞掉的 items 不該讓整份存檔被丟掉');
    assert.deepEqual(Object.keys(s.items).sort(), ['dash', 'freeze', 'meteor', 'vortex']);
  }
});

test('隊伍資料沒有多出動物欄位', () => {
  const s = loadFrom(oldSave({})).setups[0];
  assert.deepEqual(Object.keys(s.fighters[0]).sort(), ['color', 'count', 'id', 'name']);
});
