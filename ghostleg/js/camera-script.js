// 鏡頭腳本。四段,總長固定 —— 不管 4 個人還是 40 個人都一樣長,而且沒有快轉鍵。
//
//   掃視  俯視,整條梯子入鏡          讓小孩看清楚線是怎麼連的
//   就位  降到起跑線後方              轉場
//   跑    跟著跑最前面那群            速度感
//   收尾  退開到全部入鏡              落後的人也要被看到抵達
//
// 「跟前緣」的已知代價是落後的人會跑出畫面。收尾段就是補這件事 ——
// 所有人的抵達必須是集體的,不能有人在鏡頭外默默結束。
const SWEEP = 1500;
const SETTLE = 800;
const RUN = 6200;
const FINISH = 1500;

export const TOTAL = SWEEP + SETTLE + RUN + FINISH;

const lerp = (a, b, k) => a + (b - a) * k;
const easeInOut = k => (k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2);

export function createCameraScript({ camera, ladder, laneWidth: w, rowDepth }) {
  const far = ladder.rows * rowDepth;      // 跑道總長(正值)
  const wide = Math.max(1, ladder.lanes * w);

  // 俯視要能框住**整條**跑道 —— 含近處的起跑線跟遠處的獎項箱。
  // 算太低的話兩端會被裁掉:視野 48 度,俯視能看到的縱深大約是高度的 0.89 倍,
  // 所以高度至少要 far / 0.89,再乘一點餘裕。人多的時候換成寬邊是瓶頸。
  const fit = () => Math.max(far * 0.95, wide / Math.max(0.5, camera.aspect) * 1.15);
  const topZ = -far * 0.5 + far * 0.62;

  // 跟在前緣後方。距離隨隊伍拉開的程度變 —— 固定距離的話,一旦有人衝出去,
  // 鏡頭就黏在他後面,整個隊伍被留在畫面外,只剩前方的空跑道。
  // 但也要封頂,不然就退化成「框住所有人」,速度感會消失(相對位置看起來是靜止的)。
  const behind = (lead, spread = 0) => {
    // back 一定要**大於**隊伍拉開的距離,不然最後面的人會跑到鏡頭後面去,
    // 直接從畫面消失(不是變小,是不見)。+5 是留給最後那個人的餘裕。
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
    if (elapsed < SWEEP) {
      const k = easeInOut(elapsed / SWEEP);
      // 整條跑道全程都在畫面裡,只是鏡頭緩緩下沉 —— 平移會把兩端掃出畫面,
      // 那就違背了這一段存在的理由(讓小孩看清楚線是怎麼連的)。
      place([0, lerp(fit() * 1.12, fit(), k), lerp(topZ * 1.1, topZ, k)], [0, 0, -far * 0.5]);
      return 0;
    }

    if (elapsed < SWEEP + SETTLE) {
      const k = easeInOut((elapsed - SWEEP) / SETTLE);
      const b = behind(0);
      place(
        [0, lerp(fit(), b.pos[1], k), lerp(topZ, b.pos[2], k)],
        [0, lerp(0, b.look[1], k), lerp(-far * 0.5, b.look[2], k)]);
      return 0;
    }

    if (elapsed < SWEEP + SETTLE + RUN) {
      const t = (elapsed - SWEEP - SETTLE) / RUN;
      // 跟最前面那個(z 最小 = 跑最遠),距離看隊伍拉多開
      const zs = runners.map(r => r.z);
      const lead = zs.length ? Math.min(...zs) : 0;
      const tail = zs.length ? Math.max(...zs) : 0;
      const b = behind(lead, tail - lead);
      place(b.pos, b.look);
      return t;
    }

    // 收尾:退回俯視。
    // 這一段同時做兩件事 —— 落後的人回到畫面裡(跟前緣的代價就是他們被拋在鏡頭外),
    // 以及亮出「整條被走出來的梯子」。開場看到空的梯子,結尾看到被走滿的,是同一張圖。
    const k = easeInOut(Math.min(1, (elapsed - SWEEP - SETTLE - RUN) / FINISH));
    const lead = runners.length ? Math.min(...runners.map(r => r.z)) : -far;
    const b = behind(lead);
    place(
      [0, lerp(b.pos[1], fit(), k), lerp(b.pos[2], topZ, k)],
      [0, lerp(b.look[1], 0, k), lerp(b.look[2], -far * 0.5, k)]);
    return 1;
  };
}
