// 阿彌陀籤存檔正規化(2026-10-02 加 animal / tier)。舊存檔沒有這兩個欄位,或被手改成怪東西。
import test from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeSetup, seedState } from '../ghostleg/js/store.js';
import { ANIMALS } from '../ghostleg/js/ladder.js';

const raw = (players, prizes = []) => ({ id: 'gs1', name: 'x', players, prizes });

test('舊存檔沒有 animal:照順序補 ANIMALS[i % ANIMALS.length]', () => {
  const n = ANIMALS.length + 2;
  const s = sanitizeSetup(raw(Array.from({ length: n }, (_, i) => ({ id: `p${i}`, name: `n${i}`, color: '#E4572E' }))));
  assert.deepEqual(s.players.map(p => p.animal), [...ANIMALS, ANIMALS[0], ANIMALS[1]]);
});

test('animal 不合法:同樣照順序補;合法的保留', () => {
  const s = sanitizeSetup(raw([
    { id: 'a', name: 'a', color: '#E4572E', animal: 'dragon' },
    { id: 'b', name: 'b', color: '#E4572E', animal: 'cat' },
  ]));
  assert.deepEqual(s.players.map(p => p.animal), ['snowman', 'cat']);
});

test('舊存檔沒有 tier 或 tier 不合法:補 plain;合法的保留', () => {
  const s = sanitizeSetup(raw([], [
    { id: 'x', name: '頭', count: 1 },
    { id: 'y', name: '二', count: 1, tier: 'gold' },
    { id: 'z', name: '三', count: 2, tier: 'chest' },
  ]));
  assert.deepEqual(s.prizes.map(p => p.tier), ['plain', 'plain', 'chest']);
});

test('種子資料:6 個人各配一種不同的動物,獎項都是 plain', () => {
  const setup = seedState().setups[0];
  assert.deepEqual(setup.players.map(p => p.animal), ANIMALS.slice(0, 6));
  assert.ok(setup.prizes.every(p => p.tier === 'plain'));
});
