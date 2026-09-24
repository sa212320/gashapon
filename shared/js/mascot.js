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
      dozing ? 'mascots--dozing' : '',
    ].filter(Boolean).join(' ');
  }

  // 換成另一張圖,交叉淡入:舊的淡出、新的淡入。已經是這張就不用切,
  // 不然每次呼叫 setPose('idle') 兩次會白白重播一次淡入動畫。
  function crossfadeTo(url) {
    if (front.src === url) return;
    back.src = url;
    back.className = 'mascots__img mascots__img--visible';
    front.className = 'mascots__img';
    const swap = front;
    front = back;
    back = swap;
  }

  // 抽成區域函式而不是只放在回傳物件上:flyTo / home 內部也要用它,
  // 走 this.setPose 的話,被解構出來呼叫(const { flyTo } = mascots)就會壞掉。
  function applyPose(next) {
    if (!POSES.includes(next)) return;   // 這一關順便擋掉 'doze'
    pose = next;
    dozing = false;
    crossfadeTo(SRC[next]);
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
        el.style.setProperty('--fly-x', '0px');
        el.style.setProperty('--fly-y', '0px');
        paint();
        return;
      }
      // self.getBoundingClientRect() 回的是「目前已經套用 --fly-x/--fly-y
      // 位移之後」的矩形,不是回到角落(沒有位移)時的矩形。如果現在已經
      // 有位移在身上(例如正在飛去別的錨點,或還沒歸零),直接拿它去算
      // 下一段位移,結果會整整偏掉「目前的位移量」那麼多 —— 兩隻可能被
      // 送到畫面外面去。做法是先讀出目前的 --fly-x/--fly-y,從量到的矩形
      // 裡減掉,還原成「沒有位移時」(=角落)的中心點,再從那個基準點算
      // 到新錨點的差。這樣不管現在飛到哪、呼叫幾次,算出來的結果只跟
      // 「角落位置」和「錨點位置」有關,永遠一致 —— 不需要呼叫端先
      // home() 再等轉場結束才能再飛一次。
      const currentOffset = name => parseFloat(el.style.getPropertyValue(name)) || 0;
      const dx0 = currentOffset('--fly-x');
      const dy0 = currentOffset('--fly-y');
      const self = el.getBoundingClientRect();
      const homeCenterX = self.left + self.width / 2 - dx0;
      const homeCenterY = self.top + self.height / 2 - dy0;
      // 位移用 transform,不改 left/bottom —— transform 跑在合成器上,
      // 而且不會觸發整頁重排。
      el.style.setProperty('--fly-x', `${rect.left + rect.width / 2 - homeCenterX}px`);
      el.style.setProperty('--fly-y', `${rect.top + rect.height / 2 - homeCenterY}px`);
      placement = 'reveal';
      paint();
    },

    home({ pose: next = 'idle' } = {}) {
      el.style.setProperty('--fly-x', '0px');
      el.style.setProperty('--fly-y', '0px');
      placement = 'corner';
      applyPose(next);
      paint();
    },

    stop() {
      // 兩層計時器都要清 —— 只清 fidgetTimer 的話,正在打瞌睡的 1.6
      // 秒視窗內呼叫 stop() 還是會有 dozeTimer 殘留,之後把圖片和
      // paint() 改回 idle,違反「完全停掉」的契約。
      timers.clear(fidgetTimer);
      timers.clear(dozeTimer);
    },
  };
}
