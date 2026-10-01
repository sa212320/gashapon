// 一對吉祥物:小狐狸 + 白鼬。
//
// 最關鍵的結構決定:牠們是 <body> 底下一個 position: fixed 的獨立層,
// **從頭到尾不進入任何模式的 DOM**。
//
// 這讓「揭曉面板的排版完全不知道吉祥物存在」從一個**約定**變成
// **結構上不可能違反** —— 沒有人能不小心把吉祥物插進面板裡,
// 因為它根本不在那棵樹上。一番賞出過「按鈕突然往上擠」的 bug,就是
// 排版被新元素推開。
//
// pose 屬於**這一對**,不屬於個別動物。沒有 fox.pose / ermine.pose:
// 拆開能多表達的組合全部都是我們不想要的組合(狐狸在抱空氣),
// 而且兩隻會不同步。
//
// 修訂一(2026-09-24):素材從手刻 SVG 骨架改成生成的 WebP 圖。
// 三輪手刻 SVG(aad0c4e / cd9eda9 / ed488f1)都沒通過使用者驗收,
// 根本原因是媒材不是技巧 —— 討喜的角色靠上千個微小曲線決定,
// 手寫 path 是模型看不到即時畫面刻出來的,這正是最弱的地方。
// 換成圖之後,姿勢切換從「換 class 讓 CSS transform 補間」變成
// 「換 <img> 的 src,配交叉淡入」。
//
// 修訂二(2026-09-30):換圖改成 canvas 逐格播放預先生成的影片片段
// (docs/superpowers/specs/2026-09-30-mascot-video-segments-design.md)。
// 換圖會跳,是因為六張圖是分開生成的六隻不同的角色;片段全部從同一張
// idle 圖繁衍,接縫共用關鍵圖。路由在 mascot-route.js、播放規則在
// mascot-player.js、載入與繪製在 mascot-sheets.js —— 這支只剩 DOM、
// 時鐘。擠壓拉伸與 cheer 彈跳拿掉(影片自己在動,再疊外框的
// 形變會跟影片打架),reduced-motion 分支也拿掉(使用者的決定)。
//
// 修訂三(2026-10-01):使用者決定吉祥物永遠固定在右下角,揭曉時不再飛到
// 獎項旁邊、空了也不飛去空狀態面板 —— 只在原地換姿勢。flyTo() / home() /
// 錨點 / 飛行傾斜 / 落點夾在畫面內這整套都拿掉了,各模式只呼叫 setPose()。

import { POSES, validate } from './mascot-route.js';
import { createPlayer } from './mascot-player.js';
import { createSheets, draw } from './mascot-sheets.js';

export { POSES };

// 五個模式跟首頁在檔案樹裡的深度不一樣,用 import.meta.url 算。
const MANIFEST_URL = new URL('../img/mascot/segments.json', import.meta.url).href;

async function defaultLoadManifest() {
  // no-cache:每次都向伺服器確認一次。圖的網址帶內容雜湊(見 tools/mascot-gen/gen.py
  // versioned()),manifest 一更新,圖就跟著換新網址。
  const res = await fetch(MANIFEST_URL, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`segments.json ${res.status}`);
  return res.json();
}

function defaultLoadImage(url) {
  const img = new Image();
  img.src = url;
  return img.decode().then(() => img);
}

export function mountMascots({
  fidget = true,
  timers = { set: (fn, ms) => setTimeout(fn, ms), clear: (id) => clearTimeout(id) },
  rng = Math.random,
  doc = globalThis.document,
  manifest = null,
  loadManifest = defaultLoadManifest,
  loadImage = defaultLoadImage,
} = {}) {
  let wanted = 'idle';          // manifest 還沒到之前,記住最後一次要求的姿勢
  let player = null;
  let sheets = null;
  let ready = null;             // validate 過的 manifest
  let clockTimer = 0;
  let stopped = false;

  const el = doc.createElement('div');
  el.setAttribute('aria-hidden', 'true');
  const canvas = doc.createElement('canvas');
  canvas.className = 'mascots__canvas';
  el.append(canvas);
  doc.body.append(el);
  const ctx = canvas.getContext?.('2d') ?? null;

  function pose() {
    return player ? player.target() : wanted;
  }

  // mascots--<姿勢> 沒有 CSS 在用,留著是給除錯用:在開發者工具裡一眼看出
  // 吉祥物現在被要求成哪個姿勢。
  function paint() {
    el.className = `mascots mascots--${pose()}`;
  }

  function tick() {
    if (stopped) return;
    player.step();
    if (ctx) draw(ctx, player.view(), { manifest: ready, sheets });
    clockTimer = timers.set(tick, 1000 / ready.segments[0].fps);
  }

  function start(m) {
    if (stopped) return;
    try {
      ready = validate(m);
    } catch (err) {
      console.warn('[mascot] segments.json 不合法,吉祥物不顯示', err);
      return;
    }
    canvas.width = ready.frame.w;
    canvas.height = ready.frame.h;
    el.style.setProperty('--mascot-aspect', `${ready.frame.w} / ${ready.frame.h}`);
    sheets = createSheets({ manifest: ready, baseURL: MANIFEST_URL, loadImage });
    player = createPlayer({ manifest: ready, isLoaded: sheets.isLoaded, rng });
    player.setFidgetAllowed(fidget);
    if (wanted !== 'idle') player.request(wanted);
    paint();
    if (ctx) draw(ctx, player.view(), { manifest: ready, sheets });
    clockTimer = timers.set(tick, 1000 / ready.segments[0].fps);
  }

  paint();
  if (manifest) {
    start(manifest);
  } else {
    // .catch 放在 .then(start) 後面:start() 自己丟錯也要接住,只警告,
    // 不能變成沒人接的 rejection(吉祥物是裝飾,不能讓頁面出現錯誤)
    loadManifest().then(start).catch((err) => {
      console.warn('[mascot] 吉祥物載入失敗,不顯示', err);
    });
  }

  return {
    el,
    getState: () => ({ pose: pose() }),
    setPose(next) {
      if (!POSES.includes(next)) return;   // 這一關順便擋掉 'doze'
      wanted = next;
      player?.request(next);
      paint();
    },
    stop() {
      stopped = true;
      timers.clear(clockTimer);
    },
  };
}
