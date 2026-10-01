// 演出的雪花粒子數量。升階時噴一小圈(2026-10-01 加入),一階比一階熱鬧;
// 最後爆開那一下維持原本的數量,永遠比升階多 —— 最後一下要最盛大。
// level 是稀有度在 RARITIES 裡的位置(N 0 … UR 4)。
export function particleCount(kind, level) {
  return kind === 'upgrade' ? 2 + level * 4 : 18 + level * 12;
}
