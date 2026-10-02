import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DESK_COLORS, faceColorFor, critterFor, tiltFor, layoutDesk, MIN_CARD_W, MAX_CARD_W, CARD_ASPECT,
} from '../ichiban/js/desk-layout.js';

test('7 個冷色,互不相同', () => {
  assert.equal(DESK_COLORS.length, 7);
  assert.equal(new Set(DESK_COLORS).size, 7);
});

test('顏色 / 角色 / 歪斜只看號碼:同一個號碼永遠一樣', () => {
  for (const no of [1, 7, 8, 99, 150]) {
    assert.equal(faceColorFor(no), faceColorFor(no));
    assert.equal(critterFor(no), critterFor(no));
    assert.equal(tiltFor(no), tiltFor(no));
  }
  assert.equal(faceColorFor(1), DESK_COLORS[0]);
  assert.equal(faceColorFor(8), DESK_COLORS[0]);
  assert.equal(faceColorFor(7), DESK_COLORS[6]);
});

test('角色兩隻都會出現,歪斜在 ±4 度內', () => {
  const kinds = new Set();
  for (let no = 1; no <= 20; no++) {
    kinds.add(critterFor(no));
    assert.ok(Math.abs(tiltFor(no)) <= 4);
  }
  assert.deepEqual([...kinds].sort(), ['ermine', 'fox']);
});

test('layoutDesk:張數少就用最大卡', () => {
  const l = layoutDesk({ count: 5, width: 358, height: 500 });
  assert.equal(l.cardW, MAX_CARD_W);
  assert.equal(l.cardH, Math.round(MAX_CARD_W * CARD_ASPECT));
});

test('layoutDesk:縮到剛好放得下', () => {
  const l = layoutDesk({ count: 40, width: 358, height: 500 });
  assert.ok(l.cardW < MAX_CARD_W && l.cardW >= MIN_CARD_W);
  assert.ok(l.rows * l.cardH + (l.rows - 1) * l.gap <= 500);
  assert.ok(l.cols * l.rows >= 40);
  // 桌面變矮,卡只會變小或一樣,不會變大
  assert.ok(layoutDesk({ count: 40, width: 358, height: 380 }).cardW <= l.cardW);
});

test('layoutDesk:太多張就停在最小卡寬,改捲動', () => {
  const l = layoutDesk({ count: 400, width: 358, height: 500 });
  assert.equal(l.cardW, MIN_CARD_W);
  assert.ok(l.rows * l.cardH > 500);
});

test('layoutDesk:欄數不會是 7 的倍數(否則同一欄上下同色)', () => {
  for (let width = 200; width <= 1400; width += 7) {
    for (const count of [30, 90, 300]) {
      const l = layoutDesk({ count, width, height: 600 });
      if (count > l.cols) assert.notEqual(l.cols % 7, 0, `width ${width} count ${count} cols ${l.cols}`);
    }
  }
});

test('layoutDesk:0 張、極窄都不會爆', () => {
  assert.equal(layoutDesk({ count: 0, width: 358, height: 500 }).rows, 0);
  assert.ok(layoutDesk({ count: 10, width: 10, height: 500 }).cols >= 1);
});
