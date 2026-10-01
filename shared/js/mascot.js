// 一對吉祥物:小狐狸 + 白鼬。
//
// 最關鍵的結構決定:牠們是 <body> 底下一個 position: fixed 的獨立層,
// **從頭到尾不進入任何模式的 DOM**。揭曉時要飛到獎項旁邊,錨點也只當
// 座標來源(讀 getBoundingClientRect),不當父容器。
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
// 時鐘與飛行。擠壓拉伸與 cheer 彈跳拿掉(影片自己在動,再疊外框的
// 形變會跟影片打架),reduced-motion 分支也拿掉(使用者的決定)。

import { POSES, validate } from './mascot-route.js';
import { createPlayer } from './mascot-player.js';
import { createSheets, draw } from './mascot-sheets.js';

export { POSES };

// 五個模式跟首頁在檔案樹裡的深度不一樣,用 import.meta.url 算。
const MANIFEST_URL = new URL('../img/mascot/segments.json', import.meta.url).href;

const FLY_TILT_DEG = 5;
const FLY_TILT_LEVEL_MS = 260;
const VIEW_MARGIN = 8;

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
  home = false,
  fidget = true,
  timers = { set: (fn, ms) => setTimeout(fn, ms), clear: (id) => clearTimeout(id) },
  rng = Math.random,
  doc = globalThis.document,
  manifest = null,
  loadManifest = defaultLoadManifest,
  loadImage = defaultLoadImage,
} = {}) {
  let wanted = 'idle';          // manifest 還沒到之前,記住最後一次要求的姿勢
  let placement = 'corner';
  let player = null;
  let sheets = null;
  let ready = null;             // validate 過的 manifest
  let clockTimer = 0;
  let tiltTimer = 0;
  let stopped = false;
  let lastFlyX = 0;
  let lastFlyY = 0;

  const el = doc.createElement('div');
  el.setAttribute('aria-hidden', 'true');
  const canvas = doc.createElement('canvas');
  canvas.className = 'mascots__canvas';
  el.append(canvas);
  doc.body.append(el);
  const ctx = canvas.getContext?.('2d') ?? null;

  // flyTo() 要知道「沒有位移時(=角落)的矩形」,但**不能在 flyTo() 呼叫
  // 當下量自己**:呼叫的當下如果上一段飛行的轉場還沒播完,
  // el.getBoundingClientRect() 讀到的是動畫**插值中**的位置,而這次要
  // 設的 --fly-x/--fly-y 已經是**終點值**——兩者根本不是同一個時間點的
  // 資料,拿插值位置去算下一段位移,插值差多少、結果就錯多少(一番賞
  // 曾在真瀏覽器裡實測撞到)。正解是只在「確定沒有轉場在跑」的時機量
  // 一次存起來,之後 flyTo() 只信任這個快取、完全不摸
  // el.getBoundingClientRect()。「確定沒有轉場」的時機有兩個:
  // mountMascots() 剛掛上(這時候還沒飛過,畫面就是角落原始位置)、
  // 以及 window resize(版面改變,角落座標可能跟著變)。已知限制:
  // 如果使用者剛好在飛行轉場播放中途拖動視窗改變大小,resize 當下量到
  // 的一樣會是插值位置,快取仍可能被寫進錯的值 —— 沒有處理這個組合,
  // 因為它需要「轉場進行中」+「同一時刻剛好 resize」同時發生,機率
  // 極低,而且下一次 flyTo()/home() 就會用新錨點的位置蓋過去,不會卡住。
  let homeRect = null;
  function measureHome() {
    const r = el.getBoundingClientRect?.();
    // mount 當下版面可能還沒排好(例如圖片還沒載入,高度算出來是 0),
    // 這種矩形不能拿來當基準,留到下一次有機會的時機(下一次 resize,
    // 或者 flyTo() 第一次被呼叫時)再試一次量測。
    if (r && (r.width || r.height)) homeRect = r;
    return homeRect;
  }
  // 先套上 .mascots(position: fixed)再量 —— 沒套 class 的元素還在排版流裡,
  // 掛在 body 最底下,量到的不是角落,之後每次 flyTo() 都會飛歪。
  paint();
  measureHome();

  let onResize = null;
  if (typeof globalThis.addEventListener === 'function') {
    onResize = () => measureHome();
    globalThis.addEventListener('resize', onResize);
  }

  function pose() {
    return player ? player.target() : wanted;
  }

  function paint() {
    el.className = [
      'mascots',
      `mascots--${pose()}`,
      `mascots--at-${placement}`,
      home ? 'mascots--home' : '',
    ].filter(Boolean).join(' ');
    player?.setFidgetAllowed(fidget && placement === 'corner');
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
    if (wanted !== 'idle') player.request(wanted);
    paint();
    if (ctx) draw(ctx, player.view(), { manifest: ready, sheets });
    clockTimer = timers.set(tick, 1000 / ready.segments[0].fps);
  }

  if (manifest) {
    start(manifest);
  } else {
    loadManifest().then(start, (err) => {
      console.warn('[mascot] 抓不到 segments.json,吉祥物不顯示', err);
    });
  }

  // 位移統一從這裡設定,flyTo()/home() 都走這條路 —— 傾斜方向跟著
  // 「這一次跟上一次的水平位移差」走(見上面 lastFlyX 的說明)。位移
  // 差太小(幾乎沒有水平移動,例如原地換姿勢時 flyTo 到同一個錨點)
  // 就不歪,不然浮點誤差會讓牠一直微微斜著。
  function moveTo(nx, ny) {
    const dx = nx - lastFlyX;
    el.style.setProperty('--fly-x', `${nx}px`);
    el.style.setProperty('--fly-y', `${ny}px`);
    if (Math.abs(dx) > 1) {
      el.style.setProperty('--fly-tilt', `${dx > 0 ? FLY_TILT_DEG : -FLY_TILT_DEG}deg`);
      timers.clear(tiltTimer);
      tiltTimer = timers.set(() => {
        el.style.setProperty('--fly-tilt', '0deg');
      }, FLY_TILT_LEVEL_MS);
    }
    lastFlyX = nx;
    lastFlyY = ny;
  }

  // 揭曉落點夾在畫面內(留 VIEW_MARGIN)。手機上錨點在卡片右上角、卡片又
  // 幾乎貼齊螢幕右緣,照錨點飛會有一半在螢幕外。揭曉時會放大 --reveal-scale
  // 倍、以腳為支點,所以寬度看放大後的,高度往上長。量不到畫面大小(測試
  // 環境)就不夾。
  function clampToViewport(cx, cy, box) {
    const vw = globalThis.innerWidth;
    const vh = globalThis.innerHeight;
    if (!vw || !vh) return [cx, cy];
    const s = parseFloat(globalThis.getComputedStyle?.(el)?.getPropertyValue('--reveal-scale')) || 1;
    const halfW = (box.width * s) / 2;
    const x = Math.min(Math.max(cx, VIEW_MARGIN + halfW), vw - VIEW_MARGIN - halfW);
    // 未放大時的底邊(腳)= cy + h/2;放大後頭頂 = 腳 - h*s
    const feet = Math.min(
      Math.max(cy + box.height / 2, VIEW_MARGIN + box.height * s),
      vh - VIEW_MARGIN,
    );
    return [x, feet - box.height / 2];
  }

  function applyPose(next) {
    if (!POSES.includes(next)) return;   // 這一關順便擋掉 'doze'
    wanted = next;
    player?.request(next);
    paint();
  }

  paint();

  return {
    el,
    getState: () => ({ pose: pose(), placement }),
    setPose: applyPose,

    flyTo(anchor, { pose: next } = {}) {
      if (next) applyPose(next);
      const rect = anchor?.getBoundingClientRect?.();
      // 錨點還掛著 hidden 的話 rect 是全 0。照算會把兩隻送到畫面
      // 左上角 (0,0) 卡在那裡 —— 寧可留在角落。
      if (!rect || rect.width === 0 || rect.height === 0) {
        placement = 'corner';
        moveTo(0, 0);
        paint();
        return;
      }
      // 「角落位置」一律用 mount / resize 時量到的快取(見上方 measureHome
      // 的說明),絕不在這裡量 el.getBoundingClientRect() —— 理由同上:
      // 呼叫這裡的當下轉場可能正在播,量到的會是插值中的位置。
      // 唯一的例外是快取還沒有值(mount 當下版面還沒排好):這裡是第一次
      // 呼叫 flyTo(),代表從來沒飛過、身上還沒有任何位移,畫面上此刻
      // 就是角落原始位置,這個時間點量測是安全的,量到之後就存進快取,
      // 之後都不再走這條路。
      const home = homeRect || measureHome();
      if (!home) {
        // 兩次都量不到(例如環境完全沒有 getBoundingClientRect):沒有
        // 基準可用,寧可放棄這次飛行、留在角落,也不要拿錯的數字把
        // 兩隻送到畫面外面去。
        placement = 'corner';
        moveTo(0, 0);
        paint();
        return;
      }
      const homeCenterX = home.left + home.width / 2;
      const homeCenterY = home.top + home.height / 2;
      // 位移用 transform,不改 left/bottom —— transform 跑在合成器上,
      // 而且不會觸發整頁重排。moveTo() 順便算飛行途中要往哪個方向傾斜。
      const [cx, cy] = clampToViewport(
        rect.left + rect.width / 2,
        rect.top + rect.height / 2,
        home,
      );
      moveTo(cx - homeCenterX, cy - homeCenterY);
      placement = 'reveal';
      paint();
    },
    home({ pose: next = 'idle' } = {}) {
      moveTo(0, 0);
      placement = 'corner';
      applyPose(next);
      paint();
    },

    stop() {
      stopped = true;
      timers.clear(clockTimer);
      timers.clear(tiltTimer);
      if (onResize) globalThis.removeEventListener('resize', onResize);
    },
  };
}
