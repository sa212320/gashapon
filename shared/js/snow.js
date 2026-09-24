// 飄雪。注入一次就不管了,沒有狀態、沒有計時器 —— 動畫全部交給 CSS,
// 跑在合成器上,不跟三個 3D 模式的 rAF 迴圈搶主執行緒。
//
// 雪花放在**舞台後面**不是前面:小孩要讀的是獎項名稱和按鈕,雪花飄過文字會扣分。
// 而三個 3D 的 canvas 是透明的,雪花在後面一樣會透出來 ——
// 等於免費拿到前景的效果,而沒有前景的代價。

// 片數。低階手機掉幀的話就調小,設 0 等於關掉。
export const FLAKES = 24;

const SIZE = [2, 6];        // px
const DURATION = [8, 18];   // 秒
const DRIFT = [-24, 24];    // 左右飄移 px

const lerp = (range, t) => range[0] + (range[1] - range[0]) * t;

// 純函式,方便測試:給同一組亂數就給同一批雪花。
export function flakeSpecs(count = FLAKES, rng = Math.random) {
  return Array.from({ length: count }, () => {
    const t = rng();
    const duration = lerp(DURATION, t);
    return {
      size: lerp(SIZE, rng()),
      duration,
      left: lerp([0, 100], rng()),      // vw
      // delay 是**負的**,而且刻意用「反向」的 t 去算:
      // 如果直接用 -duration,相位會 wrap 回 0,每片雪花看起來都跟
      // delay:0 一樣、視覺上等於沒有負 delay。用 1-t 反查範圍,
      // 讓不同 duration 的雪花落在各自週期的不同相位,一載入就分散。
      delay: -lerp(DURATION, 1 - t),
      drift: lerp(DRIFT, rng()),
    };
  });
}

export function mountSnow({ rng = Math.random, reduceMotion, doc = globalThis.document } = {}) {
  const reduce = reduceMotion ?? (
    typeof globalThis.matchMedia === 'function'
      && globalThis.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
  // 產生後隱藏是不夠的:會動的節點就算看不到,合成器還是要處理它。
  if (reduce || !doc || FLAKES === 0) return 0;

  const layer = doc.createElement('div');
  layer.className = 'snow';
  layer.setAttribute('aria-hidden', 'true');

  for (const f of flakeSpecs(FLAKES, rng)) {
    const el = doc.createElement('i');
    el.className = 'snow__flake';
    el.style.cssText = [
      `--size:${f.size.toFixed(2)}px`,
      `--dur:${f.duration.toFixed(2)}s`,
      `--left:${f.left.toFixed(2)}vw`,
      `--delay:${f.delay.toFixed(2)}s`,
      `--drift:${f.drift.toFixed(2)}px`,
    ].join(';');
    layer.append(el);
  }

  doc.body.append(layer);
  return layer.childElementCount;
}
