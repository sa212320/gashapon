// 從區域圖描出每一區的外框(畫面拿去拉高成立體)。畫面跟物理用同一張區域圖,
// 所以「看起來是牆」跟「撞得到牆」一定在同一個地方。
import test from 'node:test';
import assert from 'node:assert/strict';
import { zoneLoops, polygonArea } from '../smash/js/zone-shape.js';
import { ZONE, zoneAt } from '../smash/js/stadium.js';
import { GRID } from '../smash/js/stadium-grid.js';

const cellCount = zones => {
  let n = 0;
  for (let y = GRID.y0; y < GRID.y0 + GRID.h; y++) {
    for (let x = GRID.x0; x < GRID.x0 + GRID.w; x++) {
      const z = zoneAt(x + 0.5, y + 0.5);
      if (zones.includes(z)) n++;
    }
  }
  return n;
};

test('每一圈外框都是閉合的多邊形', () => {
  for (const loop of zoneLoops([ZONE.PLATEAU])) assert.ok(loop.points.length >= 3);
});

test('外框面積(外圈減掉洞)跟格子數差不多 —— 簡化線條不能把形狀吃掉', () => {
  for (const zones of [[ZONE.OVER_LEFT], [ZONE.PILLAR], [ZONE.LIP], [ZONE.PLATEAU]]) {
    const loops = zoneLoops(zones);
    const area = loops.reduce((s, l) => s + (l.hole ? -1 : 1) * Math.abs(polygonArea(l.points)), 0);
    const cells = cellCount(zones);
    assert.ok(Math.abs(area - cells) / cells < 0.06, `${zones}: 面積 ${area.toFixed(0)} / 格子 ${cells}`);
  }
});

test('平台中間有洞(碗、方槽)', () => {
  assert.ok(zoneLoops([ZONE.PLATEAU]).some(l => l.hole));
});

test('兩個方槽各是一塊', () => {
  assert.equal(zoneLoops([ZONE.OVER_LEFT]).filter(l => !l.hole).length, 1);
  assert.equal(zoneLoops([ZONE.OVER_RIGHT]).filter(l => !l.hole).length, 1);
});

test('線條有簡化:頂點比格子邊少很多', () => {
  const pts = zoneLoops([ZONE.PLATEAU]).reduce((s, l) => s + l.points.length, 0);
  assert.ok(pts < 800, `${pts} 個頂點`);
});
