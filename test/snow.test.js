// 飄雪。兩件事要釘住:
//   1. prefers-reduced-motion 時**不產生節點**,不是產生後隱藏 —— 會動的節點
//      就算看不到,合成器還是要處理它。
//   2. 每片的參數都要在範圍內。亂數注入進來,才驗得到而不是碰運氣。
import test from 'node:test';
import assert from 'node:assert/strict';

import { FLAKES, flakeSpecs, mountSnow } from '../shared/js/snow.js';

// 固定序列的假亂數:第一次回 0、第二次回 0.999,用來打範圍的兩端
function seq(values) {
  let i = 0;
  return () => values[i++ % values.length];
}

// 最小的假 DOM,只做 mountSnow() 真正會用到的部分:createElement、
// className、style.cssText(整段字串直接指派,不是靠 setProperty)、
// setAttribute、append、childElementCount(mountSnow 回傳值靠它算)。
// 參考 test/mascot.test.js 的 fakeDoc() 寫法。
function fakeDoc() {
  const make = () => {
    const kids = [];
    return {
      className: '',
      style: { cssText: '' },
      children: kids,
      get childElementCount() { return kids.length; },
      setAttribute() {},
      append(...items) { kids.push(...items); },
    };
  };
  return { createElement: make, body: make() };
}

test('雪花數量等於常數', () => {
  assert.equal(flakeSpecs().length, FLAKES);
  assert.equal(flakeSpecs(7).length, 7);
});

test('rng 回 0 時,每個參數都落在範圍下緣', () => {
  const [f] = flakeSpecs(1, seq([0]));
  assert.equal(f.size, 2);
  assert.equal(f.duration, 8);
  assert.equal(f.left, 0);
  assert.equal(f.delay, -18);
  assert.equal(f.drift, -24);
});

test('rng 接近 1 時,每個參數都落在範圍上緣', () => {
  const [f] = flakeSpecs(1, seq([0.999999]));
  assert.ok(f.size > 5.99 && f.size <= 6, `size=${f.size}`);
  assert.ok(f.duration > 17.9 && f.duration <= 18, `duration=${f.duration}`);
  assert.ok(f.left > 99.9 && f.left <= 100, `left=${f.left}`);
  assert.ok(f.drift > 23.9 && f.drift <= 24, `drift=${f.drift}`);
});

test('delay 一律是負的 —— 一載入就該滿天都是雪,不是等十八秒才飄第一片', () => {
  for (const f of flakeSpecs(FLAKES, seq([0.3, 0.7, 0.1, 0.9]))) {
    assert.ok(f.delay <= 0, `delay=${f.delay}`);
  }
});

test('prefers-reduced-motion 時產生 0 個節點', () => {
  const made = mountSnow({ reduceMotion: true });
  assert.equal(made, 0);
});

/* ---------- mountSnow() 實際產生節點的路徑 ----------
   最終審查實測:把 mountSnow 整個函式換成 `return 0`,236 條測試照樣
   全綠 —— 上面那些測試全部只測 flakeSpecs() 這個純函式,沒有一條真的
   檢查 mountSnow() 掛進 DOM 的節點長什麼樣子。下面補上。 */

test('mountSnow 產生的節點數等於 FLAKES', () => {
  const doc = fakeDoc();
  const made = mountSnow({ doc, reduceMotion: false, rng: () => 0.5 });
  assert.equal(made, FLAKES);
});

test('容器 class 是 snow,裡面每片的 class 是 snow__flake', () => {
  const doc = fakeDoc();
  mountSnow({ doc, reduceMotion: false, rng: () => 0.5 });
  const layer = doc.body.children[0];
  assert.equal(layer.className, 'snow');
  assert.equal(layer.children.length, FLAKES);
  for (const flake of layer.children) {
    assert.equal(flake.className, 'snow__flake');
  }
});

test('每片的 style.cssText 帶著五個自訂屬性', () => {
  const doc = fakeDoc();
  mountSnow({ doc, reduceMotion: false, rng: () => 0.5 });
  const layer = doc.body.children[0];
  for (const flake of layer.children) {
    for (const prop of ['--size', '--dur', '--left', '--delay', '--drift']) {
      assert.ok(
        flake.style.cssText.includes(`${prop}:`),
        `${prop} 不在 cssText 裡:${flake.style.cssText}`,
      );
    }
  }
});
