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

export const POSES = Object.freeze(['idle', 'watch', 'cheer', 'aww', 'empty']);

// 骨架。四個姿勢(idle / watch / cheer / aww)共用這一套零件,
// 差別全部靠 CSS 的 transform —— 切換時會**滑過去**,不是換圖。
// empty 是完全不同的場景(有箱子、白鼬睡著),獨立一組,平常隱藏。
//
// v2(參考使用者提供的橫幅/貼圖重畫):chibi 比例(頭明顯大於身體)、
// 大眼睛 + 白色高光、腮紅、尾巴尖有對比色(狐狸白尖、白鼬黑尖)。
// 白鼬的耳朵在 v1 被畫在 skull 圓形「後面」,面積又幾乎全部落在
// skull 範圍內,結果整個被蓋住 —— 這版改成 skull 先畫、耳朵疊在
// 上面,徹底不會再被蓋住。
// 狐狸尾巴改成用「靠近尾巴根部的樞紐」旋轉(見 mascot.css 的
// transform-origin),而不是整體放大 —— 轉一個角度就能把 idle
// 留的開口蓋住,對之後 cheer 要甩尾巴去別的角度更好重用。
const RIG = `
<svg class="mascots__svg" viewBox="0 0 200 140" aria-hidden="true">
  <g class="m-rig">
    <g class="m-fox">
      <g class="m-fox__tailwrap">
        <path class="m-fox__tail" d="M86 120 C68 132 34 132 16 112 C2 96 0 72 12 56 C22 44 40 40 48 48 C52 52 50 58 44 58 C40 78 52 96 70 106 C78 110 82 116 86 120 Z"/>
        <ellipse class="m-fox__tail-tip" cx="44" cy="55" rx="8" ry="7"/>
      </g>
      <ellipse class="m-fox__body" cx="100" cy="104" rx="25" ry="21"/>
      <ellipse class="m-fox__belly" cx="100" cy="109" rx="13" ry="15"/>
      <g class="m-fox__head">
        <ellipse class="m-fox__skull" cx="100" cy="58" rx="33" ry="30"/>
        <path class="m-fox__ear m-fox__ear--l" d="M73 54 L80 28 L90 28 L97 54 Z"/>
        <path class="m-fox__ear m-fox__ear--r" d="M103 54 L110 28 L120 28 L127 54 Z"/>
        <path class="m-fox__ear-tip m-fox__ear-tip--l" d="M80 28 L90 28 L92 37 L78 37 Z"/>
        <path class="m-fox__ear-tip m-fox__ear-tip--r" d="M120 28 L110 28 L108 37 L122 37 Z"/>
        <path class="m-fox__cheek" d="M70 74 C78 96 122 96 130 74"/>
        <ellipse class="m-fox__blush m-fox__blush--l" cx="76" cy="66" rx="7" ry="5"/>
        <ellipse class="m-fox__blush m-fox__blush--r" cx="124" cy="66" rx="7" ry="5"/>
        <circle class="m-fox__eye m-fox__eye--l" cx="86" cy="56" r="6.5"/>
        <circle class="m-fox__eye m-fox__eye--r" cx="114" cy="56" r="6.5"/>
        <circle class="m-fox__eye m-fox__eye-highlight m-fox__eye-highlight--l" cx="83.5" cy="53" r="2"/>
        <circle class="m-fox__eye m-fox__eye-highlight m-fox__eye-highlight--r" cx="111.5" cy="53" r="2"/>
        <ellipse class="m-fox__nose" cx="100" cy="68" rx="5" ry="4"/>
        <path class="m-fox__mouth" d="M92 74 Q100 80 108 74"/>
      </g>
    </g>
    <g class="m-erm">
      <path class="m-erm__tail" d="M40 112 C24 118 8 110 8 92 C8 80 18 72 30 76 C38 79 40 90 32 94 Z"/>
      <ellipse class="m-erm__tip" cx="16" cy="84" rx="9" ry="10"/>
      <ellipse class="m-erm__body" cx="56" cy="104" rx="19" ry="15"/>
      <g class="m-erm__head">
        <circle class="m-erm__skull" cx="58" cy="82" r="20"/>
        <ellipse class="m-erm__ear m-erm__ear--l" cx="40" cy="68" rx="8" ry="9"/>
        <ellipse class="m-erm__ear m-erm__ear--r" cx="76" cy="68" rx="8" ry="9"/>
        <ellipse class="m-erm__blush m-erm__blush--l" cx="42" cy="88" rx="5.5" ry="4"/>
        <ellipse class="m-erm__blush m-erm__blush--r" cx="74" cy="88" rx="5.5" ry="4"/>
        <circle class="m-erm__eye m-erm__eye--l" cx="50" cy="80" r="5"/>
        <circle class="m-erm__eye m-erm__eye--r" cx="66" cy="80" r="5"/>
        <circle class="m-erm__eye m-erm__eye-highlight m-erm__eye-highlight--l" cx="48" cy="77.5" r="1.6"/>
        <circle class="m-erm__eye m-erm__eye-highlight m-erm__eye-highlight--r" cx="64" cy="77.5" r="1.6"/>
        <ellipse class="m-erm__nose" cx="58" cy="90" rx="3.4" ry="2.6"/>
        <path class="m-erm__mouth" d="M52 95 Q58 99 64 95"/>
      </g>
    </g>
    <g class="m-box">
      <path class="m-box__back" d="M118 94 L182 94 L176 76 L124 76 Z"/>
      <rect class="m-box__front" x="118" y="94" width="64" height="30" rx="4"/>
    </g>
  </g>
</svg>`;

export function mountMascots({ home = false, doc = globalThis.document } = {}) {
  let pose = 'idle';
  let placement = 'corner';

  const el = doc.createElement('div');
  el.setAttribute('aria-hidden', 'true');
  el.innerHTML = RIG;
  doc.body.append(el);

  function paint() {
    // 每次整串重寫,不用 classList.add/remove —— 假 DOM 裡沒有 classList,
    // 而且「目前狀態 = 這一串」比「累積了哪些 class」好推理。
    el.className = [
      'mascots',
      `mascots--${pose}`,
      `mascots--at-${placement}`,
      home ? 'mascots--home' : '',
    ].filter(Boolean).join(' ');
  }

  // 抽成區域函式而不是只放在回傳物件上:flyTo / home 內部也要用它,
  // 走 this.setPose 的話,被解構出來呼叫(const { flyTo } = mascots)就會壞掉。
  function applyPose(next) {
    if (!POSES.includes(next)) return;
    pose = next;
    paint();
  }

  paint();

  return {
    el,
    getState: () => ({ pose, placement }),
    setPose: applyPose,
    // Task 4 會在這裡補上 flyTo / home
  };
}
