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
  // 亮紋 + 折色(2026-10-02 使用者:「冰晶碗要有亮紋、透明折色的感覺」):
  // 幾道寬寬的斜白光,旁邊各貼一條很細的粉、紫色邊 —— 冰的稜角把光折出一點彩色
  for (let i = 0; i < 4; i++) {
    const x = 90 + i * 240 + rnd() * 60;
    const top = H * (1 - SNOW_EDGE_V) + 6;
    const lean = 70 + rnd() * 30;
    const wide = 22 + rnd() * 18;
    const glint = ctx.createLinearGradient(x, 0, x + wide, 0);
    glint.addColorStop(0, 'rgba(255,255,255,0)');
    glint.addColorStop(0.5, 'rgba(255,255,255,.75)');
    glint.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = glint;
    ctx.beginPath();
    ctx.moveTo(x, top);
    ctx.lineTo(x + wide, top);
    ctx.lineTo(x + wide + lean, H);
    ctx.lineTo(x + lean, H);
    ctx.closePath();
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(255,170,215,.55)';   // 粉
    ctx.beginPath();
    ctx.moveTo(x - 4, top);
    ctx.lineTo(x - 4 + lean, H);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(190,160,255,.55)';   // 紫
    ctx.beginPath();
    ctx.moveTo(x + wide + 4, top);
    ctx.lineTo(x + wide + 4 + lean, H);
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

// 盤底的冰面,也用程式畫(使用者:「中間要不要也跟牆壁一樣不要用貼圖」)——
// 跟外壁同一個色調,所以兩邊接得起來。正方形,從正上方投影到碗裡(scene.js 的 basinGeometry)。
// 中央亮、往外漸深;上面幾條柔和的波紋光(像光穿過冰折出來的),再撒一些小亮點。
export function paintFloor(doc = document) {
  const S = 1024;
  const c = doc.createElement('canvas');
  c.width = c.height = S;
  const ctx = c.getContext('2d');
  const rnd = seeded(11);

  const g = ctx.createRadialGradient(S * 0.45, S * 0.42, 0, S / 2, S / 2, S * 0.55);
  g.addColorStop(0, '#DDF4FE');
  g.addColorStop(0.6, '#B8E5FB');
  g.addColorStop(1, '#9CD5F3');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);

  // 波紋光:一段一段短短的、寬寬淡淡的彎光帶(折射的光斑)。長度、位置、透明度都不一樣,
  // 不然整齊排成一條一條,看起來像格線紙
  ctx.lineCap = 'round';
  for (let i = 0; i < 16; i++) {
    const cx = S * (0.15 + rnd() * 0.7);
    const cy = S * (0.15 + rnd() * 0.7);
    const len = S * (0.08 + rnd() * 0.16);
    const bend = 30 + rnd() * 40;
    ctx.strokeStyle = `rgba(255,255,255,${0.12 + rnd() * 0.18})`;
    ctx.lineWidth = 16 + rnd() * 26;
    ctx.beginPath();
    ctx.moveTo(cx - len / 2, cy);
    ctx.quadraticCurveTo(cx, cy - bend, cx + len / 2, cy + (rnd() - 0.5) * 30);
    ctx.stroke();
  }
  // 兩道斜斜的大反光,旁邊一點點粉紫折色
  for (const [x0, w] of [[S * 0.28, 60], [S * 0.6, 34]]) {
    const band = ctx.createLinearGradient(x0, 0, x0 + w, 0);
    band.addColorStop(0, 'rgba(255,255,255,0)');
    band.addColorStop(0.5, 'rgba(255,255,255,.45)');
    band.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.save();
    ctx.translate(S / 2, S / 2);
    ctx.rotate(-0.6);
    ctx.translate(-S / 2, -S / 2);
    ctx.fillStyle = band;
    ctx.fillRect(x0, 0, w, S);
    ctx.fillStyle = 'rgba(255,170,215,.22)';
    ctx.fillRect(x0 - 6, 0, 4, S);
    ctx.fillStyle = 'rgba(190,160,255,.22)';
    ctx.fillRect(x0 + w + 2, 0, 4, S);
    ctx.restore();
  }
  // 小亮點、小星光
  ctx.fillStyle = 'rgba(255,255,255,.9)';
  for (let i = 0; i < 40; i++) {
    ctx.beginPath();
    ctx.arc(rnd() * S, rnd() * S, 2 + rnd() * 4, 0, Math.PI * 2);
    ctx.fill();
  }
  return c;
}
