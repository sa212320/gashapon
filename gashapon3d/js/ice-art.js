// 碗外壁的貼圖,用程式畫(2026-10-02:生成的冰牆帶條紋太密、顏色跟盤底對不上,
// 使用者「牆壁跟中間合不太起來」「沒有冰塊碗的樣子」;參考首頁卡片 s2 的冰盤)。
// 上面一圈白雪、下緣波浪狀往下滴(深棕描邊),下面是跟盤底同色調的冰,加幾道刻面線。
// 盤底冰面貼圖量過是 #B8E5FB,冰的漸層就圍著它取。

const W = 1024;
const H = 256;
const INK = '#574239';
export const SNOW_EDGE_V = 0.62;   // 雪的下緣大約在貼圖的這個 v(由下往上 0 → 1)

// 固定種子的亂數:每次載入長得一樣
function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function paintWall(doc = document) {
  const c = doc.createElement('canvas');
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d');
  const rnd = seeded(7);

  // 冰:上淺下深,跟盤底 #B8E5FB 同一個色調
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#D6F2FE');
  g.addColorStop(0.55, '#B8E5FB');
  g.addColorStop(1, '#94D0F1');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  // 刻面:幾道斜斜的亮線跟淡淡的暗線(冰塊切面),左右各留邊,接縫才不會斷
  ctx.lineCap = 'round';
  for (let i = 0; i < 9; i++) {
    const x = 40 + (i / 9) * (W - 80) + rnd() * 40;
    const lean = (rnd() - 0.5) * 60;
    ctx.strokeStyle = i % 3 === 2 ? 'rgba(120,180,225,.55)' : 'rgba(255,255,255,.6)';
    ctx.lineWidth = i % 3 === 2 ? 3 : 5 + rnd() * 4;
    ctx.beginPath();
    ctx.moveTo(x, H * (1 - SNOW_EDGE_V) + 10);
    ctx.lineTo(x + lean, H - 8);
    ctx.stroke();
  }
  // 小亮點
  ctx.fillStyle = 'rgba(255,255,255,.85)';
  for (let i = 0; i < 14; i++) {
    const x = rnd() * W;
    const y = H * (1 - SNOW_EDGE_V) + 20 + rnd() * (H * SNOW_EDGE_V - 40);
    ctx.beginPath();
    ctx.arc(x, y, 2 + rnd() * 3, 0, Math.PI * 2);
    ctx.fill();
  }

  // 雪:上面一整片白,下緣是一串圓圓的滴(長短不一)。左右兩端同高,接起來看不出縫
  const base = H * (1 - SNOW_EDGE_V);
  const drips = 8;
  const pts = [];
  for (let i = 0; i <= drips * 6; i++) {
    const x = (i / (drips * 6)) * W;
    const k = (i % 6) / 6;                        // 每個滴的相位 0 → 1
    const which = Math.floor(i / 6) % drips;
    const len = [10, 26, 14, 34, 12, 22, 30, 16][which];
    const y = base + Math.sin(k * Math.PI) ** 2 * len;
    pts.push([x, y]);
  }
  ctx.fillStyle = '#FFFFFF';
  ctx.beginPath();
  ctx.moveTo(0, 0);
  for (const [x, y] of pts) ctx.lineTo(x, y);
  ctx.lineTo(W, 0);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = INK;
  ctx.lineWidth = 5;
  ctx.lineJoin = 'round';
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.stroke();
  return c;
}
