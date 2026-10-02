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
const FACE = 'system-ui, -apple-system, "PingFang TC", "Noto Sans TC", sans-serif';

/* ---------- 素材(紙紋、角色頭) ---------- */
// 由 tools/mascot-gen/ichiban.py build 產生;網址的 ?v= 由工具蓋章。
// 載不到也照畫 —— 少了紙紋跟頭而已,不能讓小孩抽不到籤。
const ART_URLS = {};
const art = { paper: null, fox: null, ermine: null };

export function useCardArt(images) {
  Object.assign(art, images);
}

function loadImage(url) {
  if (typeof Image === 'undefined') return Promise.reject(new Error('no Image'));
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}

let loading = null;
// 一番賞頁一開始就呼叫(預熱);桌面與大卡在它 resolve 後重畫一次。
export function loadCardArt(load = loadImage) {
  loading ??= Promise.all(Object.entries(ART_URLS).map(([key, url]) =>
    load(url).then(img => { art[key] = img; }, err => {
      if (typeof Image !== 'undefined') console.warn('[ichiban] 票卡素材載不到', key, err);
    })));
  return loading;
}

/* ---------- 共用座標 ---------- */
// 票卡的一切都畫在「橫式票卡座標」(CARD_W×CARD_H)裡,再對應進呼叫者給的 w×h 框。
// portrait = 順時針轉 90°:左緣的半圓耳轉到上面。w:h 必須是 15:34(直)或 34:15(橫),
// 兩軸縮放才會一致 —— desk-layout 的 CARD_ASPECT 保證這件事。
function enterCardSpace(ctx, orientation, w, h) {
  if (orientation === 'portrait') {
    ctx.translate(w, 0);
    ctx.rotate(Math.PI / 2);
    ctx.scale(h / CARD_W, w / CARD_H);
  } else {
    ctx.scale(w / CARD_W, h / CARD_H);
  }
}

// 只建路徑(路徑在建立時就套用了當下的變換,restore 之後還在)。桌面拿它畫影子。
export function traceTicket(ctx, { orientation = 'landscape', w = CARD_W, h = CARD_H } = {}) {
  ctx.save();
  enterCardSpace(ctx, orientation, w, h);
  traceShape(ctx);
  ctx.restore();
}

function paperOver(ctx) {
  if (!art.paper) return;
  ctx.globalCompositeOperation = 'multiply';
  ctx.drawImage(art.paper, 0, 0, CARD_W, CARD_H);
  ctx.globalCompositeOperation = 'source-over';
}

function snowflake(ctx, x, y, r) {
  ctx.beginPath();
  for (let i = 0; i < 3; i++) {
    const a = (i * Math.PI) / 3;
    ctx.moveTo(x - r * Math.cos(a), y - r * Math.sin(a));
    ctx.lineTo(x + r * Math.cos(a), y + r * Math.sin(a));
  }
  ctx.stroke();
}

// 印在紙上的白色雪花 + 一圈虛線框。紙不是冰:不做透明、亮面(2026-10-02 定案)。
function snowPrint(ctx) {
  ctx.strokeStyle = 'rgba(255,255,255,.55)';
  ctx.lineWidth = 5;
  ctx.lineCap = 'round';
  for (let y = 40, row = 0; y < CARD_H; y += 70, row++) {
    for (let x = 30 + (row % 2) * 45; x < CARD_W; x += 90) snowflake(ctx, x, y, 14);
  }
  ctx.setLineDash([22, 16]);
  ctx.lineWidth = 7;
  ctx.strokeStyle = 'rgba(255,255,255,.9)';
  traceRoundRect(ctx, CARD_W * 0.14, CARD_H * 0.2, CARD_W * 0.76, CARD_H * 0.6, 30);
  ctx.stroke();
  ctx.setLineDash([]);
}

function drawNumber(ctx, no, x, y, r) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = '#fff';
  ctx.fill();
  ctx.lineWidth = Math.max(1, r * 0.14);
  ctx.strokeStyle = INK;
  ctx.stroke();
  const text = no === '★' ? '🌟' : String(no);
  const size = r * (text.length >= 3 ? 0.78 : 1.1);
  ctx.fillStyle = INK;
  ctx.font = `900 ${size.toFixed(1)}px ${FACE}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x, y + size * 0.05);
  ctx.restore();
}

// 白色印章頭(素材本身就是白色 + 透明,工具烘好的)。both = 最後一抽賞兩隻並排。
function drawHead(ctx, critter, x, y, size) {
  if (critter === 'both') {
    if (!art.fox || !art.ermine) return;
    const s = size * 0.75;
    ctx.drawImage(art.fox, x - s * 1.05, y - s / 2, s, s);
    ctx.drawImage(art.ermine, x + s * 0.05, y - s / 2, s, s);
    return;
  }
  const img = art[critter];
  if (img) ctx.drawImage(img, x - size / 2, y - size / 2, size, size);
}

/* ---------- 蓋著的那一面 ---------- */
// 桌上小卡(portrait)跟大卡(landscape)共用這一支 —— 兩邊長一樣,只差比例。
// 不清畫布:桌面是一張 canvas 畫很多張。整面不透明,底下的獎項不能透出來。
// 號碼跟頭不跟著轉,永遠正立:直卡上下排、橫卡左右排。
export function drawFace(ctx, { color, no, critter, orientation = 'landscape', w = CARD_W, h = CARD_H }) {
  ctx.save();
  enterCardSpace(ctx, orientation, w, h);
  traceShape(ctx);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.save();
  ctx.clip();
  paperOver(ctx);
  snowPrint(ctx);
  ctx.restore();
  traceShape(ctx);
  ctx.lineJoin = 'round';
  ctx.lineWidth = 16;
  ctx.strokeStyle = INK;
  ctx.stroke();
  ctx.restore();

  const portrait = orientation === 'portrait';
  const s = Math.min(w, h);
  const [nx, ny] = portrait ? [w * 0.5, h * 0.34] : [w * 0.36, h * 0.5];
  const [hx, hy] = portrait ? [w * 0.5, h * 0.66] : [w * 0.66, h * 0.5];
  drawNumber(ctx, no, nx, ny, s * 0.27);
  drawHead(ctx, critter, hx, hy, s * 0.5);
}

/* ---------- 獎項那一面 ---------- */
// 7 賞同一個徽章版型(真一番賞都長一樣;等級感交給撕開演出的 level)。
// 外框染賞別色(功能色,程式上色),中間白底大字母。
function drawBadge(ctx, x, y, r, color, letter) {
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.beginPath();
  for (let i = 0; i < 24; i++) {
    const a = (Math.PI * i) / 12;
    const rr = i % 2 ? r : r * 1.18;
    ctx.lineTo(x + rr * Math.cos(a), y + rr * Math.sin(a));
  }
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
  ctx.lineWidth = 8;
  ctx.strokeStyle = INK;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(x, y, r * 0.78, 0, Math.PI * 2);
  ctx.fillStyle = '#fff';
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(x, y, r * 0.66, 0, Math.PI * 2);
  ctx.setLineDash([10, 8]);
  ctx.lineWidth = 5;
  ctx.strokeStyle = color;
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = INK;
  ctx.font = `900 ${Math.round(r)}px ${FACE}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(letter, x, y + r * 0.05);
  ctx.restore();
}

// 齒孔 → 賞別色帶 → 一條淺色細線 → 深色卡身 → 灰底帶 → 齒孔。
// 色帶不能壓在齒孔的範圍上,不然看起來像黏了一條鋸齒膠帶。
export function drawPrize(ctx, { color, letter, name, bonus = false }) {
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
  paperOver(ctx);

  const bx = CARD_W * 0.25;
  const by = CARD_H * 0.54;      // 深色卡身(28%~80%)的中央
  const br = CARD_H * 0.21;
  drawBadge(ctx, bx, by, br, color, letter);

  const x0 = bx + br * 1.18 + 36;
  const maxW = CARD_W * 0.9 - x0;
  let size = 64;
  ctx.font = `800 ${size}px ${FACE}`;
  while (size > 30 && ctx.measureText(name).width > maxW) {
    size -= 4;
    ctx.font = `800 ${size}px ${FACE}`;
  }
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(name, x0, by + 4);
  ctx.restore();
}
