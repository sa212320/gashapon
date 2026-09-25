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

export const POSES = Object.freeze(['idle', 'watch', 'cheer', 'aww', 'empty']);

// doze 不是第六個 pose,它是 idle 的待機變化(打瞌睡),跟「打哈欠」
// 「抖耳朵」是同一類東西 —— 只在待機排程裡用,不會被 setPose 接受
// (POSES 沒有它,applyPose 的檢查會直接擋掉)。
const DOZE = 'doze';

// 五個模式跟首頁在檔案樹裡的深度不一樣(/gashapon/ 是一層,首頁是零層),
// 寫死相對路徑(例如 '../shared/img/...')一定有一邊是壞的。用
// import.meta.url 算,不管是誰載入這個模組,算出來的路徑永遠對。
function assetURL(name) {
  return new URL(`../img/mascot/${name}.webp`, import.meta.url).href;
}

const SRC = Object.freeze({
  idle: assetURL('idle'),
  watch: assetURL('watch'),
  cheer: assetURL('cheer'),
  aww: assetURL('aww'),
  empty: assetURL('empty'),
  [DOZE]: assetURL('doze'),
});

// 待機排程:每隔一段時間有機率切到 doze 停一下再回 idle。
const DOZE_GAP = [4000, 9000];  // ms —— 下一次「有機會」打瞌睡的間隔
const DOZE_LEN = 1600;          // ms —— 打瞌睡停留多久

// 動作感相關的時間常數,要跟 shared/css/mascot.css 的動畫時長對齊
// (JS 只負責「什麼時候把 class 拿掉」,實際怎麼動全部在 CSS 裡)。
const SQUASH_MS = 350;   // 換姿勢/落地的擠壓拉伸,對齊 .mascots--squash
const BOUNCE_MS = 520;   // cheer 進場彈跳,對齊 .mascots--bounce
const FLY_TILT_DEG = 5;      // 飛行途中的傾斜角度
const FLY_TILT_LEVEL_MS = 260; // 傾斜維持多久後回正 —— 提前於 .5s 的飛行轉場結束,
                                // 落地前就已經站正,不會「歪著撞上去」

export function mountMascots({
  home = false,
  fidget = true,
  // 計時器可注入:測試要能同步把「時間」推進去,驗證 doze 排程真的會
  // 咬(不然那段邏輯 —— 包括競態保護 —— 永遠不會被自動測試執行到)。
  // 用箭頭函式包一層,不要直接把 setTimeout/clearTimeout 存進物件屬性
  // 再解構呼叫,避免依賴它們不需要 this 綁定這件事的環境差異。
  timers = { set: (fn, ms) => setTimeout(fn, ms), clear: (id) => clearTimeout(id) },
  rng = Math.random,
  doc = globalThis.document,
} = {}) {
  let pose = 'idle';
  let placement = 'corner';
  let dozing = false;
  let fidgetTimer = 0;
  // 待機排程分兩層計時器:fidgetTimer 是「還要多久才有機會打瞌睡」,
  // dozeTimer 是「已經在打瞌睡,還要多久醒來」。stop() 兩個都要清,
  // 不然在打瞌睡的 1.6 秒視窗內呼叫 stop(),還是會有一個殘留計時器
  // 在背景把圖片和 paint() 改回 idle —— 那就不是「完全停掉」了。
  let dozeTimer = 0;
  // 換姿勢/落地擠壓、cheer 彈跳、飛行傾斜回正,各自的一次性計時器。
  // 跟 fidgetTimer/dozeTimer 同一套道理:stop() 要能全部清乾淨,連續
  // 觸發(例如換姿勢又立刻飛)也要能各自重新排程,不能疊加出殘留。
  let squashTimer = 0;
  let bounceTimer = 0;
  let tiltTimer = 0;
  let squashing = false;
  let bouncing = false;
  // 飛行傾斜的方向要看「這一次跟上一次的水平位移差」,不是看目的地
  // 座標本身的正負號(不然「往左飛回角落」跟「本來就在角落左邊」會
  // 分不出來)。這兩個變數只用來算這個差,跟 --fly-x/--fly-y 的值
  // 保持同步。
  let lastFlyX = 0;
  let lastFlyY = 0;

  // 使用者要求減少動態效果時,呼吸跟 doze 都不該發生 —— 不是靠 CSS
  // 藏起來,是排程本身就不要開。fakeDoc / node 環境沒有 matchMedia,
  // 這裡要防呆。
  const reduceMotion =
    typeof globalThis.matchMedia === 'function' &&
    globalThis.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const el = doc.createElement('div');
  el.setAttribute('aria-hidden', 'true');

  // 兩張 <img> 疊放:一張是「目前顯示」,一張是「下一張要淡入的」。
  // 只需要兩個角色輪流互換,永遠不會有第三張同時參與動畫。
  const imgA = doc.createElement('img');
  imgA.className = 'mascots__img mascots__img--visible';
  imgA.alt = '';
  imgA.src = SRC.idle;   // 只有 idle 在首屏就載,其餘延後到第一次要用才抓

  const imgB = doc.createElement('img');
  imgB.className = 'mascots__img';
  imgB.alt = '';
  // 故意不設 src —— 六張合計 278 KB,不能全部預載。設成空字串在真的
  // 瀏覽器裡會被解析成「目前頁面的網址」,反而多發一個沒用的請求,
  // 所以是完全不設,不是設空字串。

  el.append(imgA, imgB);
  doc.body.append(el);

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
  measureHome();

  let onResize = null;
  if (typeof globalThis.addEventListener === 'function') {
    onResize = () => measureHome();
    globalThis.addEventListener('resize', onResize);
  }

  // 降落瞬間的擠壓:transform 轉場(飛行位移)真的播完的那一刻觸發,
  // 不管是飛去揭曉區還是飛回角落都算「落地,有重量地停下來」。只認
  // propertyName === 'transform',避免飛行傾斜自己的 rotate 轉場也
  // 觸發一次(那不是落地,只是傾斜角度歸零)。假 DOM 沒有
  // addEventListener,guard 掉,不影響單元測試。
  if (typeof el.addEventListener === 'function') {
    el.addEventListener('transitionend', (event) => {
      if (event.propertyName === 'transform') pulseSquash();
    });
  }

  let front = imgA;
  let back = imgB;

  function paint() {
    // 每次整串重寫,不用 classList.add/remove —— 假 DOM 裡沒有 classList,
    // 而且「目前狀態 = 這一串」比「累積了哪些 class」好推理。
    el.className = [
      'mascots',
      `mascots--${pose}`,
      `mascots--at-${placement}`,
      home ? 'mascots--home' : '',
      squashing ? 'mascots--squash' : '',
      bouncing ? 'mascots--bounce' : '',
    ].filter(Boolean).join(' ');
  }

  // 換成另一張圖,交叉淡入:舊的淡出、新的淡入。已經是這張就不用切,
  // 不然每次呼叫 setPose('idle') 兩次會白白重播一次淡入動畫。回傳
  // 「真的換了圖嗎」給呼叫端判斷要不要順便播動作感動畫 —— doze 排程
  // 直接呼叫這個函式(不經過 applyPose),不該被下面的擠壓/彈跳誤觸發。
  function crossfadeTo(url) {
    if (front.src === url) return false;
    back.src = url;
    back.className = 'mascots__img mascots__img--visible';
    front.className = 'mascots__img';
    const swap = front;
    front = back;
    back = swap;
    return true;
  }

  // 換姿勢或降落瞬間的「擠壓拉伸」一次性播放。用注入的 timers 決定
  // 什麼時候把 class 拿掉,不用真的監聽 animationend —— 假 DOM 沒有
  // 這個事件,注入計時器才測得到、也才能跟現有的 doze 排程用同一套
  // 假時鐘驗證。
  //
  // 先拿掉 class 再強制讀一次 offsetWidth 再重新加上,是為了讓連續
  // 觸發(例如换姿勢後緊接著降落)也能各自重播一次動畫:如果 class
  // 從頭到尾沒有真的離開過元素,瀏覽器不會重新播放同一個動畫。假 DOM
  // 的元素沒有 offsetWidth,讀到 undefined 也不會噴錯,單純沒有強制
  // 重排的效果而已。
  function pulseSquash() {
    if (reduceMotion) return;
    timers.clear(squashTimer);
    squashing = false;
    paint();
    void el.offsetWidth;
    squashing = true;
    paint();
    squashTimer = timers.set(() => {
      squashing = false;
      paint();
    }, SQUASH_MS);
  }

  function pulseBounce() {
    if (reduceMotion) return;
    timers.clear(bounceTimer);
    bouncing = false;
    paint();
    void el.offsetWidth;
    bouncing = true;
    paint();
    bounceTimer = timers.set(() => {
      bouncing = false;
      paint();
    }, BOUNCE_MS);
  }

  // 位移統一從這裡設定,flyTo()/home() 都走這條路 —— 傾斜方向跟著
  // 「這一次跟上一次的水平位移差」走(見上面 lastFlyX 的說明)。位移
  // 差太小(幾乎沒有水平移動,例如原地換姿勢時 flyTo 到同一個錨點)
  // 就不歪,不然浮點誤差會讓牠一直微微斜著。
  function moveTo(nx, ny) {
    const dx = nx - lastFlyX;
    el.style.setProperty('--fly-x', `${nx}px`);
    el.style.setProperty('--fly-y', `${ny}px`);
    if (!reduceMotion && Math.abs(dx) > 1) {
      el.style.setProperty('--fly-tilt', `${dx > 0 ? FLY_TILT_DEG : -FLY_TILT_DEG}deg`);
      timers.clear(tiltTimer);
      tiltTimer = timers.set(() => {
        el.style.setProperty('--fly-tilt', '0deg');
      }, FLY_TILT_LEVEL_MS);
    }
    lastFlyX = nx;
    lastFlyY = ny;
  }

  // 抽成區域函式而不是只放在回傳物件上:flyTo / home 內部也要用它,
  // 走 this.setPose 的話,被解構出來呼叫(const { flyTo } = mascots)就會壞掉。
  function applyPose(next) {
    if (!POSES.includes(next)) return;   // 這一關順便擋掉 'doze'
    pose = next;
    dozing = false;
    const changed = crossfadeTo(SRC[next]);
    // 只有姿勢真的變了才播動作感動畫 —— setPose('idle') 連續打兩次
    // 不該白白重播一次擠壓,doze 排程也不會誤觸發(它直接呼叫
    // crossfadeTo(),不經過這裡)。
    if (changed) {
      pulseSquash();
      if (next === 'cheer') pulseBounce();
    }
    paint();
  }

  function scheduleFidget() {
    timers.clear(fidgetTimer);
    const gap = DOZE_GAP[0] + rng() * (DOZE_GAP[1] - DOZE_GAP[0]);
    fidgetTimer = timers.set(() => {
      // 只有閒置在角落時才打瞌睡 —— 正在歡呼或正在飛的時候睡著很怪
      if (pose === 'idle' && placement === 'corner') {
        dozing = true;
        crossfadeTo(SRC[DOZE]);
        paint();
        dozeTimer = timers.set(() => {
          // 這段時間裡姿勢可能被 setPose 換掉了,那樣的話圖已經是
          // 新姿勢,不該被這裡搶回 idle。
          if (pose === 'idle') {
            dozing = false;
            crossfadeTo(SRC.idle);
            paint();
          }
        }, DOZE_LEN);
      }
      scheduleFidget();
    }, gap);
  }

  paint();
  // fidget: false 是測試專用的關閉開關 —— 排程用計時器且會自己
  // 重排,node 的事件迴圈永遠清不空,node --test 會直接掛住不結束。
  if (fidget && !reduceMotion) scheduleFidget();

  return {
    el,
    getState: () => ({ pose, placement }),
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
      moveTo(
        rect.left + rect.width / 2 - homeCenterX,
        rect.top + rect.height / 2 - homeCenterY,
      );
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
      // 每一層計時器都要清 —— 只清 fidgetTimer 的話,正在打瞌睡的 1.6
      // 秒視窗內呼叫 stop() 還是會有 dozeTimer 殘留,之後把圖片和
      // paint() 改回 idle,違反「完全停掉」的契約。squashTimer /
      // bounceTimer / tiltTimer 是同一種風險,一起清。
      timers.clear(fidgetTimer);
      timers.clear(dozeTimer);
      timers.clear(squashTimer);
      timers.clear(bounceTimer);
      timers.clear(tiltTimer);
      // resize 監聽也要拆,不然每次 mountMascots() 都疊一個永遠不會被
      // 回收的監聽器上去。
      if (onResize) globalThis.removeEventListener('resize', onResize);
    },
  };
}
