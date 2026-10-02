// 一番賞票卡的美術:輪廓、蓋著的那面、獎項那面。
//
// 這裡只負責「畫在 2D context 上」,不碰 DOM、不碰 three.js。
// 捲曲版(curl.js,拿去當貼圖)跟沒有 WebGL 時的退路(curl-flat.js,直接畫在畫面上)
// 共用這一份 —— 兩條路的票卡長得不一樣的話,退路一啟動使用者就會發現。

export const CARD_W = 1020;
export const CARD_H = 450; // 34:15

// 票卡輪廓(2026-10-02 使用者選 D):圓角長方形,上下兩條長邊各一排半圓撕線孔(ミシン目),
// 像真的一番賞籤券。原本「方齒 + 半圓耳」直放在桌上像梳子,使用者覺得怪。
// 孔的大小跟間距是票卡座標(1020×450);桌上最小 28px 寬時孔約 1px,看起來就是一排小點。
const EDGE = { x0: CARD_W * 0.02, x1: CARD_W * 0.98, y0: CARD_H * 0.05, y1: CARD_H * 0.95, r: 30 };
const HOLE_R = 18;
const HOLE_STEP = 64;

function holeCenters() {
  const { x0, x1, r } = EDGE;
  const n = Math.floor((x1 - x0 - 2 * r - HOLE_STEP) / HOLE_STEP);
  const start = (x0 + x1) / 2 - (n * HOLE_STEP) / 2;
  return Array.from({ length: n + 1 }, (_, i) => start + i * HOLE_STEP);
}
const HOLES = holeCenters();

export function makeCardCanvas() {
  const c = document.createElement('canvas');
  c.width = CARD_W;
  c.height = CARD_H;
  return c;
}

function traceShape(ctx) {
  const { x0, x1, y0, y1, r } = EDGE;
  ctx.beginPath();
  ctx.moveTo(x0 + r, y0);
  for (const cx of HOLES) {                    // 上緣:由左往右,孔往卡片裡面凹
    ctx.lineTo(cx - HOLE_R, y0);
    ctx.arc(cx, y0, HOLE_R, Math.PI, 0, true);
  }
  ctx.lineTo(x1 - r, y0);
  ctx.arcTo(x1, y0, x1, y0 + r, r);
  ctx.lineTo(x1, y1 - r);
  ctx.arcTo(x1, y1, x1 - r, y1, r);
  for (const cx of [...HOLES].reverse()) {     // 下緣:由右往左
    ctx.lineTo(cx + HOLE_R, y1);
    ctx.arc(cx, y1, HOLE_R, 0, Math.PI, true);
  }
  ctx.lineTo(x0 + r, y1);
  ctx.arcTo(x0, y1, x0, y1 - r, r);
  ctx.lineTo(x0, y0 + r);
  ctx.arcTo(x0, y0, x0 + r, y0, r);
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

/* ---------- 素材(白章角色頭) ---------- */
// 由 tools/mascot-gen/ichiban.py build 產生;網址的 ?v= 由工具蓋章。
// 載不到也照畫 —— 少了頭而已,不能讓小孩抽不到籤。
// 紙紋(2026-10-02)試過拿掉了:縮到桌上小卡後完全看不出來,加強又顯得髒。
const ART_URLS = {
  fox: new URL('../img/fox.webp?v=a76f87af', import.meta.url).href,
  ermine: new URL('../img/ermine.webp?v=4c6d1de5', import.meta.url).href,
};
const art = { fox: null, ermine: null };

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
// 票卡的一切都畫在票卡座標(CARD_W×CARD_H)裡,再縮放進呼叫者給的 w×h 框。
// 桌上小卡跟大卡一模一樣、都是橫的,只差大小(2026-10-02 使用者更正:原本桌上直放)。
// w:h 必須是 34:15 —— desk-layout 的 CARD_ASPECT 保證這件事。
function enterCardSpace(ctx, w, h) {
  ctx.scale(w / CARD_W, h / CARD_H);
}

// 只建路徑(路徑在建立時就套用了當下的變換,restore 之後還在)。桌面拿它畫影子。
export function traceTicket(ctx, { w = CARD_W, h = CARD_H } = {}) {
  ctx.save();
  enterCardSpace(ctx, w, h);
  traceShape(ctx);
  ctx.restore();
}

// 固定種子的假隨機(mulberry32):同一張籤永遠同一組雪花,不同張排法不一樣。
function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function snowflake(ctx, x, y, r, turn) {
  ctx.beginPath();
  for (let i = 0; i < 3; i++) {
    const a = turn + (i * Math.PI) / 3;
    ctx.moveTo(x - r * Math.cos(a), y - r * Math.sin(a));
    ctx.lineTo(x + r * Math.cos(a), y + r * Math.sin(a));
  }
  ctx.stroke();
}

// 印刷一律白色(2026-10-02 使用者:要統一白色);底色由 desk-layout 保證夠深。
const INK_WHITE = [255, 255, 255];
const rgba = (ink, a) => `rgba(${ink.join(',')},${a})`;

// 印在紙上的白色雪花 + 一圈虛線框。紙不是冰:不做透明、亮面(2026-10-02 定案)。
// 雪花不排成格子(使用者:太規則了):每格一朵、在格子裡隨機偏移,大小 / 角度 / 深淺各不同,
// 偶爾換成小圓點。用格子是為了不會擠成一團或空一大塊。
function snowPrint(ctx, seed, ink) {
  const rand = seeded(seed * 2654435761);
  ctx.lineCap = 'round';
  const CW = 120, CH = 100;
  for (let gy = 0; gy < CARD_H; gy += CH) {
    for (let gx = 0; gx < CARD_W; gx += CW) {
      const x = gx + CW * (0.15 + rand() * 0.7);
      const y = gy + CH * (0.15 + rand() * 0.7);
      const alpha = 0.35 + rand() * 0.4;
      if (rand() < 0.25) {
        ctx.fillStyle = rgba(ink, alpha.toFixed(2));
        ctx.beginPath();
        ctx.arc(x, y, 3 + rand() * 4, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.strokeStyle = rgba(ink, alpha.toFixed(2));
        ctx.lineWidth = 4 + rand() * 3;
        snowflake(ctx, x, y, 9 + rand() * 15, rand() * Math.PI);
      }
    }
  }
  ctx.setLineDash([22, 16]);
  ctx.lineWidth = 7;
  ctx.strokeStyle = rgba(ink, '.9');
  traceRoundRect(ctx, CARD_W * 0.07, CARD_H * 0.17, CARD_W * 0.86, CARD_H * 0.66, 30);
  ctx.stroke();
  ctx.setLineDash([]);
}

// 號碼:白色印刷的大數字,跟雪花、角色頭同一種白(2026-10-02 使用者選 B;原本白圓圈 + 粗棕框太重)。
function drawNumber(ctx, no, x, y, r) {
  const text = no === '★' ? '🌟' : String(no);
  const size = r * (text.length >= 3 ? 1.15 : 1.6);
  ctx.save();
  ctx.fillStyle = '#fff';
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
// 桌上小卡跟大卡共用這一支 —— 兩邊長一樣,只差大小。
// 不清畫布:桌面是一張 canvas 畫很多張。整面不透明,底下的獎項不能透出來。
export function drawFace(ctx, { color, no, critter, w = CARD_W, h = CARD_H }) {
  const ink = INK_WHITE;
  ctx.save();
  enterCardSpace(ctx, w, h);
  traceShape(ctx);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.save();
  ctx.clip();
  snowPrint(ctx, typeof no === 'number' ? no : 0, ink);
  ctx.restore();
  traceShape(ctx);
  ctx.lineJoin = 'round';
  ctx.lineWidth = 16;
  ctx.strokeStyle = INK;
  ctx.stroke();
  ctx.restore();

  drawNumber(ctx, no, w * 0.36, h * 0.5, h * 0.27);
  drawHead(ctx, critter, w * 0.66, h * 0.5, h * 0.5);
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

export function drawPrize(ctx, { color, letter, name, bonus = false }) {
  ctx.clearRect(0, 0, CARD_W, CARD_H);
  ctx.save();
  traceShape(ctx);
  ctx.clip();

  const body = bonus ? '#4A3A1E' : '#2E2A28';
  // 輪廓改成圓角長方形 + 撕線孔之後(2026-10-02),不再有齒孔帶:上方賞別色帶、細白線、深色卡身。
  const bands = [[0, .24, color], [.24, .27, '#FFFFFF'], [.27, 1, body]];
  for (const [a, b, fill] of bands) {
    ctx.fillStyle = fill;
    ctx.fillRect(0, a * CARD_H, CARD_W, (b - a) * CARD_H);
  }

  const bx = CARD_W * 0.25;
  const by = CARD_H * 0.61;      // 深色卡身(27%~95%)的中央
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
