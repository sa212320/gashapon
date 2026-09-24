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
//
// v3(減法):v2 每條回饋都加了一個形狀上去,結果臉被擠爆。這版
// 把眼睛放到最大(可愛度唯一最大的來源,放在臉的中下方、拉開間距),
// 腮紅整個拿掉(做不好比沒有更糟),狐狸耳朵退回圓潤三角形、顏色用
// 身體的橘色只有耳尖略深(不是深咖啡色塊),白鼬尾巴重畫成看得出來
// 是「一條尾巴」而不是背上一塊斑,狐狸口鼻的淺色區塊縮小成一個
// 蓋在鼻子嘴巴上的圓角色塊,不再橫貫整張臉把頭切成兩截。
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
        <path class="m-fox__ear m-fox__ear--l" d="M72 50 L66 18 L92 36 Z"/>
        <path class="m-fox__ear m-fox__ear--r" d="M128 50 L134 18 L108 36 Z"/>
        <path class="m-fox__ear-tip m-fox__ear-tip--l" d="M66 18 L68 26 L73 23 Z"/>
        <path class="m-fox__ear-tip m-fox__ear-tip--r" d="M134 18 L132 26 L127 23 Z"/>
        <ellipse class="m-fox__cheek" cx="100" cy="82" rx="19" ry="14"/>
        <ellipse class="m-fox__eye m-fox__eye--l" cx="82" cy="60" rx="10" ry="13"/>
        <ellipse class="m-fox__eye m-fox__eye--r" cx="118" cy="60" rx="10" ry="13"/>
        <circle class="m-fox__eye m-fox__eye-highlight m-fox__eye-highlight--l" cx="78" cy="55" r="3.2"/>
        <circle class="m-fox__eye m-fox__eye-highlight m-fox__eye-highlight--r" cx="114" cy="55" r="3.2"/>
        <ellipse class="m-fox__nose" cx="100" cy="76" rx="4.5" ry="3.5"/>
        <path class="m-fox__mouth" d="M92 82 Q100 87 108 82"/>
      </g>
    </g>
    <g class="m-erm">
      <path class="m-erm__tail" d="M40 108 C30 114 18 112 12 100 C8 92 12 82 22 80 C30 79 36 86 36 96 C36 100 38 105 40 108 Z"/>
      <ellipse class="m-erm__tip" cx="18" cy="88" rx="7" ry="9"/>
      <ellipse class="m-erm__body" cx="56" cy="104" rx="19" ry="15"/>
      <g class="m-erm__head">
        <circle class="m-erm__skull" cx="58" cy="82" r="20"/>
        <ellipse class="m-erm__ear m-erm__ear--l" cx="40" cy="68" rx="8" ry="9"/>
        <ellipse class="m-erm__ear m-erm__ear--r" cx="76" cy="68" rx="8" ry="9"/>
        <ellipse class="m-erm__eye m-erm__eye--l" cx="48" cy="86" rx="6" ry="8"/>
        <ellipse class="m-erm__eye m-erm__eye--r" cx="68" cy="86" rx="6" ry="8"/>
        <circle class="m-erm__eye m-erm__eye-highlight m-erm__eye-highlight--l" cx="45.5" cy="82" r="2"/>
        <circle class="m-erm__eye m-erm__eye-highlight m-erm__eye-highlight--r" cx="65.5" cy="82" r="2"/>
        <ellipse class="m-erm__nose" cx="58" cy="95" rx="3.2" ry="2.4"/>
        <path class="m-erm__mouth" d="M52 99 Q58 102 64 99"/>
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
