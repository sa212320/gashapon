// 把 walk 的「結果」展開成「過程」——  一條由垂直段與單格水平段組成的折線。
// 這就是之後畫在地上的彩色軌跡帶。
//
// 它刻意跟 walk 用同一套規則重走一次,而不是另外推算:兩邊各自算會漂移,
// 那會變成「動畫顯示我走到 A,結果清單卻說我拿到 B」。
// test/race.test.js 有一個測試專門釘死「折線的終點恆等於 walk 的答案」。
export function pathOf(ladder, startLane) {
  const path = [];
  // 橫線落在第 0 列時,「先走到這一列」跟起點是同一個點,直接推會產生長度為零的段,
  // 之後畫軌跡帶時那一段的方向是未定義的。一律跳過重複點。
  const go = (lane, row) => {
    const last = path.at(-1);
    if (last && last.lane === lane && last.row === row) return;
    path.push({ lane, row });
  };

  let lane = startLane;
  go(lane, 0);

  for (let row = 0; row < ladder.rows; row++) {
    const here = ladder.rungs.find(r => r.row === row && (r.left === lane || r.left + 1 === lane));
    if (!here) continue;
    const next = here.left === lane ? lane + 1 : lane - 1;
    go(lane, row);       // 先走到這一列
    go(next, row);       // 再橫移一格
    lane = next;
  }

  go(lane, ladder.rows);
  return path;
}
