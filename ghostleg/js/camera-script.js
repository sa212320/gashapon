// 鏡頭腳本。五段,總長固定 —— 不管 4 個人還是 40 個人都一樣長,而且沒有快轉鍵。
//
//   看獎品  獎品浮在角色頭上,鏡頭由下往上看   先讓小孩看清楚在搶什麼
//   飛過去  獎品飛向終點,鏡頭跟著飛           **終點的排列是每局隨機的,這一飛就是把它演出來**
//   飛回來  鏡頭沿跑道退回起跑線後方           路上把整條梯子看過一遍
//   跑      跟著跑最前面那群                   速度感
//   收尾    退開到俯視                         落後的人回到畫面,並亮出被走滿的梯子
//
// 「跟前緣」的已知代價是落後的人會跑出畫面。收尾段就是補這件事 ——
// 所有人的抵達必須是集體的,不能有人在鏡頭外默默結束。
const SHOW = 1600;
const FLY = 1900;
const BACK = 1300;
const RUN = 6000;
const FINISH = 1500;

export const TOTAL = SHOW + FLY + BACK + RUN + FINISH;

const lerp = (a, b, k) => a + (b - a) * k;
const easeInOut = k => (k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2);

export function createCameraScript({ camera, ladder, laneWidth: w, rowDepth }) {
  const far = ladder.rows * rowDepth;      // 跑道總長(正值)
  const wide = Math.max(1, ladder.lanes * w);

  // 獎品開跑前浮在起跑線上方(track.js 的 prizeFrom 就是以這一帶為中心)
  const cloudY = w * 2.7;
  const cloudZ = rowDepth * 0.9;

  // 俯視要能框住**整條**跑道 —— 含近處的起跑線跟遠處的獎品。
  const fit = () => Math.max(far * 0.95, wide / Math.max(0.5, camera.aspect) * 1.15);
  const topZ = -far * 0.5 + far * 0.62;

  // 跟在前緣後方。距離隨隊伍拉開的程度變 —— 固定距離的話,一旦有人衝出去,
  // 鏡頭就黏在他後面,整個隊伍被留在畫面外,只剩前方的空跑道。
  // back 一定要**大於**隊伍拉開的距離,不然最後面的人會跑到鏡頭後面、直接消失。
  const behind = (lead, spread = 0) => {
    const back = Math.min(17, Math.max(5.5, spread + 5));
    return {
      pos: [0, 2.2 * w + 2.0 + back * 0.3, lead + back],
      // 看向前緣稍微前面一點就好。看太遠會把整隊往畫面下緣壓,上面空一大片。
      look: [0, 0.5, lead - 2],
    };
  };

  // 看獎品那一段的機位:站在隊伍後方、比獎品低,由下往上看。
  const showPos = () => [0, w * 1.1, cloudZ + wide * 1.15 + 3.5];
  const showLook = () => [0, cloudY, cloudZ];
  // 獎品落地那一刻的機位:貼近終點,看著那一排格子。
  const landPos = () => [0, w * 1.7 + 2, -far + wide * 0.95 + 3.5];
  const landLook = () => [0, w * 0.55, -far];

  function place(pos, look) {
    camera.position.set(pos[0], pos[1], pos[2]);
    camera.lookAt(look[0], look[1], look[2]);
  }

  const between = (a, b, k) => [lerp(a[0], b[0], k), lerp(a[1], b[1], k), lerp(a[2], b[2], k)];

  // elapsed:毫秒。runners:setProgress 回傳的每個人此刻的座標。
  // 回傳 { run, fly } —— 分別驅動 setProgress 與 setPrizeFly。
  return function apply(elapsed, runners) {
    // 1. 看獎品:獎品浮在角色頭上,鏡頭由下往上看。
    if (elapsed < SHOW) {
      const k = easeInOut(elapsed / SHOW);
      // 開場先微微推近,不要一動也不動
      place(between([0, w * 1.1, cloudZ + wide * 1.5 + 5], showPos(), k), showLook());
      return { run: 0, fly: 0 };
    }

    // 2. 飛過去:獎品飛向終點,鏡頭跟著飛。
    if (elapsed < SHOW + FLY) {
      const k = easeInOut((elapsed - SHOW) / FLY);
      place(between(showPos(), landPos(), k), between(showLook(), landLook(), k));
      return { run: 0, fly: (elapsed - SHOW) / FLY };
    }

    // 3. 飛回來:鏡頭沿跑道退回起跑線後方,路上把整條梯子看過一遍。
    if (elapsed < SHOW + FLY + BACK) {
      const k = easeInOut((elapsed - SHOW - FLY) / BACK);
      const b = behind(0);
      place(between(landPos(), b.pos, k), between(landLook(), b.look, k));
      return { run: 0, fly: 1 };
    }

    // 4. 跑:跟最前面那個(z 最小 = 跑最遠),距離看隊伍拉多開
    if (elapsed < SHOW + FLY + BACK + RUN) {
      const t = (elapsed - SHOW - FLY - BACK) / RUN;
      const zs = runners.map(r => r.z);
      const lead = zs.length ? Math.min(...zs) : 0;
      const tail = zs.length ? Math.max(...zs) : 0;
      const b = behind(lead, tail - lead);
      place(b.pos, b.look);
      return { run: t, fly: 1 };
    }

    // 5. 收尾:退回俯視。
    // 這一段同時做兩件事 —— 落後的人回到畫面裡(跟前緣的代價就是他們被拋在鏡頭外),
    // 以及亮出「整條被走出來的梯子」。開場看到空的梯子,結尾看到被走滿的,是同一張圖。
    const k = easeInOut(Math.min(1, (elapsed - SHOW - FLY - BACK - RUN) / FINISH));
    const lead = runners.length ? Math.min(...runners.map(r => r.z)) : -far;
    const b = behind(lead);
    place(
      [0, lerp(b.pos[1], fit(), k), lerp(b.pos[2], topZ, k)],
      [0, lerp(b.look[1], 0, k), lerp(b.look[2], -far * 0.5, k)]);
    return { run: 1, fly: 1 };
  };
}
