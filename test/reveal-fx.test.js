// 雪花粒子與光暈搬到 shared/js/reveal-fx.js(2026-10-02,立體扭蛋機也用)。
import test from 'node:test';
import assert from 'node:assert/strict';
import { particleCount, createRevealFx } from '../shared/js/reveal-fx.js';
import { particleCount as fromGashapon } from '../gashapon/js/particles.js';

test('particleCount 搬到 shared 之後,扭蛋機頁拿到的是同一支', () => {
  assert.equal(fromGashapon, particleCount);
});

test('跳過中不噴雪花', () => {
  const particles = { appendChild() { throw new Error('不該噴'); } };
  const fx = createRevealFx({ aura: {}, particles, isSkipping: () => true });
  fx.spawnParticles('R', 6);
});
