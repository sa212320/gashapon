// 鏡頭腳本。五段,總長固定 —— 不管 4 個人還是 40 個人都一樣長,而且沒有快轉鍵。
//
//   看獎項  推到跑道盡頭,把獎項箱拍大      先讓小孩知道在搶什麼
//   退回來  沿著跑道一路退到起跑線後方      路上把整條梯子看過一遍
//   就位    停在隊伍後方                    轉場
//   跑      跟著跑最前面那群                速度感
//   收尾    退開到俯視                      落後的人回到畫面,並亮出被走滿的梯子
//
// 「跟前緣」的已知代價是落後的人會跑出畫面。收尾段就是補這件事 ——
// 所有人的抵達必須是集體的,不能有人在鏡頭外默默結束。
const PRIZES = 1700;
const PULLBACK = 1900;
const SETTLE = 600;
const RUN = 6000;
const FINISH = 1500;

export const TOTAL = PRIZES + PULLBACK + SETTLE + RUN + FINISH;

const lerp = (a, b, k) => a + (b - a) * k;
const easeInOut = k => (k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2);

export function createCameraScript({ camera, ladder, laneWidth: w, rowDepth }) {
  const far = ladder.rows * rowDepth;      // 跑道總長(正值)
  const wide = Math.max(1, ladder.lanes * w);
  // 獎項箱擺在跑道盡頭再往前半格(track.js 用的是 far - ROW_D * 0.6)
  const prizeZ = -far - rowDepth * 0.6;

  // 俯視要能框住**整條**跑道 —— 含近處的起跑線跟遠處的獎項箱。
  // 算太低的話兩端會被裁掉:視野 48 度,俯視能看到的縱深大約是高度的 0.89 倍。
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

  function place(pos, look) {
    camera.position.set(pos[0], pos[1], pos[2]);
    camera.lookAt(look[0], look[1], look[2]);
  }

  // elapsed:毫秒。runners:setProgress 回傳的每個人此刻的座標。
  // 回傳 0~1 的賽跑進度,呼叫端用它去驅動 setProgress。
  return function apply(elapsed, runners) {
    // 1. 看獎項:低角度推近跑道盡頭,把獎項箱拍大。
    if (elapsed < PRIZES) {
      const k = easeInOut(elapsed / PRIZES);
      place(
        [0, lerp(wide * 0.52 + 2.0, wide * 0.34 + 1.2, k),
          lerp(prizeZ + wide * 1.5 + 5, prizeZ + wide * 0.9 + 2.4, k)],
        [0, w * 0.55, prizeZ]);
      return 0;
    }

    // 2. 退回來:沿著跑道一路退到起跑線後方,路上把整條梯子看過一遍。
    if (elapsed < PRIZES + PULLBACK) {
      const k = easeInOut((elapsed - PRIZES) / PULLBACK);
      const b = behind(0);
      place(
        [0, lerp(wide * 0.34 + 1.2, b.pos[1], k), lerp(prizeZ + wide * 0.9 + 2.4, b.pos[2], k)],
        [0, lerp(w * 0.55, b.look[1], k), lerp(prizeZ, b.look[2], k)]);
      return 0;
    }

    // 3. 就位
    if (elapsed < PRIZES + PULLBACK + SETTLE) {
      const b = behind(0);
      place(b.pos, b.look);
      return 0;
    }

    // 4. 跑:跟最前面那個(z 最小 = 跑最遠),距離看隊伍拉多開
    if (elapsed < PRIZES + PULLBACK + SETTLE + RUN) {
      const t = (elapsed - PRIZES - PULLBACK - SETTLE) / RUN;
      const zs = runners.map(r => r.z);
      const lead = zs.length ? Math.min(...zs) : 0;
      const tail = zs.length ? Math.max(...zs) : 0;
      const b = behind(lead, tail - lead);
      place(b.pos, b.look);
      return t;
    }

    // 5. 收尾:退回俯視。
    // 這一段同時做兩件事 —— 落後的人回到畫面裡(跟前緣的代價就是他們被拋在鏡頭外),
    // 以及亮出「整條被走出來的梯子」。開場看到空的梯子,結尾看到被走滿的,是同一張圖。
    const k = easeInOut(Math.min(1, (elapsed - PRIZES - PULLBACK - SETTLE - RUN) / FINISH));
    const lead = runners.length ? Math.min(...runners.map(r => r.z)) : -far;
    const b = behind(lead);
    place(
      [0, lerp(b.pos[1], fit(), k), lerp(b.pos[2], topZ, k)],
      [0, lerp(b.look[1], 0, k), lerp(b.look[2], -far * 0.5, k)]);
    return 1;
  };
}
