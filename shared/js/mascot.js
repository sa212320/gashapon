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
const RIG = `
<svg class="mascots__svg" viewBox="0 0 200 140" aria-hidden="true">
  <g class="m-rig">
    <g class="m-fox">
      <path class="m-fox__tail" d="M100 118 C84 134 46 138 24 118 C6 102 2 78 14 60 C24 46 42 42 52 50 C58 55 56 62 48 62 C44 78 56 96 76 106 C86 111 94 114 100 118 Z"/>
      <ellipse class="m-fox__body" cx="96" cy="98" rx="30" ry="26"/>
      <g class="m-fox__head">
        <path class="m-fox__ear m-fox__ear--l" d="M74 56 L70 30 L90 44 Z"/>
        <path class="m-fox__ear m-fox__ear--r" d="M112 44 L124 24 L126 52 Z"/>
        <ellipse class="m-fox__skull" cx="98" cy="62" rx="26" ry="23"/>
        <path class="m-fox__cheek" d="M72 66 C78 82 118 82 124 66"/>
        <circle class="m-fox__eye m-fox__eye--l" cx="88" cy="60" r="3.4"/>
        <circle class="m-fox__eye m-fox__eye--r" cx="108" cy="60" r="3.4"/>
        <ellipse class="m-fox__nose" cx="98" cy="70" rx="4" ry="3"/>
      </g>
    </g>
    <g class="m-erm">
      <ellipse class="m-erm__body" cx="56" cy="106" rx="20" ry="16"/>
      <path class="m-erm__tail" d="M38 110 C24 112 18 104 22 96"/>
      <path class="m-erm__tip" d="M22 96 C18 92 20 86 26 86 C30 86 32 90 30 94 Z"/>
      <g class="m-erm__head">
        <path class="m-erm__ear m-erm__ear--l" d="M44 80 L42 68 L54 76 Z"/>
        <path class="m-erm__ear m-erm__ear--r" d="M66 76 L74 66 L76 80 Z"/>
        <circle class="m-erm__skull" cx="60" cy="86" r="17"/>
        <circle class="m-erm__eye m-erm__eye--l" cx="53" cy="85" r="2.8"/>
        <circle class="m-erm__eye m-erm__eye--r" cx="67" cy="85" r="2.8"/>
        <ellipse class="m-erm__nose" cx="60" cy="93" rx="3" ry="2.2"/>
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
