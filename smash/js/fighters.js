// 大亂鬥的隊伍。
//
// **Fighter 就是隊伍**,沒有獨立的 Team 實體 —— `count` 就是隊伍人數,
// 一筆 Fighter 會展開成 count 個 Combatant,他們共用同一個 fighterId。
// 另外開一個 Team 出來是這個模式最容易做錯的一件事。
import { newId } from '../../shared/js/ids.js';

export const PALETTE = Object.freeze([
  '#E4572E', '#4C9F70', '#3D7EA6', '#E8B830', '#8E6BBF',
  '#D96BA0', '#3FA7A0', '#6CA644', '#E08A3C', '#5B6BC0',
]);

export function pickColor(existing) {
  const used = new Set(existing.map(f => f.color));
  return PALETTE.find(c => !used.has(c)) ?? PALETTE[existing.length % PALETTE.length];
}

export function createFighter({ name = '新隊伍', color = null, count = 1 } = {}) {
  return {
    id: newId('ft'),
    name,
    color: color ?? PALETTE[0],
    // count 不可信:Infinity / NaN 會讓展開的迴圈跑不完。當成 0 比憑空多一個人安全。
    count: Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0,
  };
}
