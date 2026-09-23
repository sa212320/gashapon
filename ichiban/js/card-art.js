// 一番賞票卡的美術:輪廓、蓋著的那面、獎項那面。
//
// 這裡只負責「畫在 2D context 上」,不碰 DOM、不碰 three.js。
// 捲曲版(curl.js,拿去當貼圖)跟沒有 WebGL 時的退路(curl-flat.js,直接畫在畫面上)
// 共用這一份 —— 兩條路的票卡長得不一樣的話,退路一啟動使用者就會發現。

export const CARD_W = 1020;
export const CARD_H = 450; // 34:15

// 票卡輪廓:上下長邊一排方齒、左緣一個往外凸的半圓耳、右端圓頭。
// 百分比座標;x 與 y 的 1% 長度不同(卡片是 34:15),所以圓弧的 x 半徑要乘 15/34,
// 不然半圓耳會變成扁橢圓。
function shapePoints() {
  const XL = 10, XR = 95, YT = 13, YB = 87;
  const TOOTH = 7, TEETH = 12;
  const capX = 7, capY = 37;
  const lobeY = 16, lobeX = lobeY * (15 / 34);
  const flatR = XR - capX;
  const w = (flatR - XL) / TEETH;
  const p = [];

  for (let i = 0; i < TEETH; i++) {            // 上緣方齒,由左往右
    const a = XL + i * w;
    const m = a + w / 2;
    p.push([a, YT], [a, YT - TOOTH], [m, YT - TOOTH], [m, YT]);
  }
  p.push([flatR, YT]);

  for (let i = 1; i < 12; i++) {               // 右端圓頭
    const t = -Math.PI / 2 + (Math.PI * i) / 12;
    p.push([flatR + capX * Math.cos(t), 50 + capY * Math.sin(t)]);
  }
  p.push([flatR, YB]);

  for (let i = TEETH - 1; i >= 0; i--) {       // 下緣方齒,由右往左(x 範圍與上緣一致)
    const a = XL + i * w;
    const m = a + w / 2;
    p.push([m, YB], [m, YB + TOOTH], [a, YB + TOOTH], [a, YB]);
  }

  p.push([XL, 50 + lobeY]);                    // 左緣往外凸的半圓耳
  for (let i = 1; i < 10; i++) {
    const t = Math.PI / 2 + (Math.PI * i) / 10;
    p.push([XL + lobeX * Math.cos(t), 50 + lobeY * Math.sin(t)]);
  }
  p.push([XL, 50 - lobeY], [XL, YT]);
  return p;
}

const PTS = shapePoints();

export function makeCardCanvas() {
  const c = document.createElement('canvas');
  c.width = CARD_W;
  c.height = CARD_H;
  return c;
}

function traceShape(ctx) {
  ctx.beginPath();
  PTS.forEach(([x, y], i) => {
    const px = (x / 100) * CARD_W;
    const py = (y / 100) * CARD_H;
    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  });
  ctx.closePath();
}

function traceRoundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

const INK = '#574239';

// 蓋著的那一面:賞別色的卡,上面印著票卡形狀的淺色框。
// 這一層是不透明的 —— 半透明的話底下的獎項會透出來,還沒開就爆雷。
export function drawFace(ctx, { color }) {
  ctx.clearRect(0, 0, CARD_W, CARD_H);
  traceRoundRect(ctx, 9, 9, CARD_W - 18, CARD_H - 18, 52);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.lineWidth = 16;
  ctx.strokeStyle = INK;
  ctx.stroke();
  traceShape(ctx);
  ctx.fillStyle = 'rgba(255,255,255,.5)';
  ctx.fill();
}

// 獎項那一面:齒孔 → 賞別色帶 → 一條淺色細線 → 深色卡身 → 灰底帶 → 齒孔。
// 色帶不能壓在齒孔的範圍上,不然看起來像黏了一條鋸齒膠帶。
export function drawPrize(ctx, { color, badge, name, bonus = false }) {
  ctx.clearRect(0, 0, CARD_W, CARD_H);
  ctx.save();
  traceShape(ctx);
  ctx.clip();

  const body = bonus ? '#4A3A1E' : '#2E2A28';
  const bands = [
    [0, .13, '#5A4A42'], [.13, .25, color], [.25, .28, '#FFFFFF'],
    [.28, .80, body], [.80, .87, '#6B625C'], [.87, 1, '#5A4A42'],
  ];
  for (const [a, b, fill] of bands) {
    ctx.fillStyle = fill;
    ctx.fillRect(0, a * CARD_H, CARD_W, (b - a) * CARD_H);
  }

  ctx.fillStyle = '#fff';
  ctx.textBaseline = 'middle';
  const face = 'system-ui, -apple-system, "PingFang TC", "Noto Sans TC", sans-serif';
  const x = CARD_W * 0.16;   // 讓開左緣那個半圓耳
  const y = CARD_H * 0.55;   // 深色卡身(28%~80%)的中央
  ctx.font = `900 84px ${face}`;
  ctx.fillText(badge, x, y);
  const gap = ctx.measureText(badge).width + 26;
  ctx.font = `800 58px ${face}`;
  ctx.fillText(name, x + gap, y + 4);
  ctx.restore();
}
