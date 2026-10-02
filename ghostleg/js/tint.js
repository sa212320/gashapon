// 動物立牌的染色。生成圖是「白身體 + 深棕外框」,multiply 上玩家色之後
// 白的地方變成玩家色、深棕幾乎不變,再用原圖的 alpha 剪回輪廓。
// 同一組 (圖, 顏色, 尺寸) 只畫一次 —— 40 個人、設定小圖、結果卡都共用。
const INK = '#574239';
const cache = new Map();

// WCAG 相對亮度與對比。白字、深棕字各算一次,挑對比高的那個 ——
// 固定亮度閾值會在中間調(例如 #3FA7A0 青綠)選錯,白字只剩 2.8:1。
function luminance(hex) {
  const c = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map(v => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
const contrast = (a, b) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);

export function textColorFor(hex) {
  const L = luminance(hex);
  return contrast(L, luminance('#FFFFFF')) >= contrast(L, luminance(INK)) ? '#FFFFFF' : INK;
}

// 圖還沒載完 / 載不到時的暫代:白色圓頭小人(跟舊版同型),一樣走染色
function placeholder(size) {
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const ctx = c.getContext('2d');
  const s = size / 180;
  ctx.scale(s, s);
  ctx.lineWidth = 9;
  ctx.strokeStyle = INK;
  ctx.fillStyle = '#FFFFFF';
  ctx.beginPath();
  ctx.moveTo(52, 172); ctx.quadraticCurveTo(90, 60, 128, 172); ctx.closePath();
  ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.arc(90, 82, 40, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.fillStyle = INK;
  ctx.beginPath(); ctx.arc(78, 78, 6, 0, Math.PI * 2); ctx.arc(102, 78, 6, 0, Math.PI * 2); ctx.fill();
  return c;
}

export function tintedAnimal(img, color, size = 256) {
  const key = `${img?.src ?? 'placeholder'}|${color}|${size}`;
  if (cache.has(key)) return cache.get(key);
  const src = img ?? placeholder(size);
  const c = document.createElement('canvas');
  const h = size;
  const w = Math.round(size * (src.width / src.height));
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  ctx.drawImage(src, 0, 0, w, h);
  ctx.globalCompositeOperation = 'multiply';
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, w, h);
  ctx.globalCompositeOperation = 'destination-in';
  ctx.drawImage(src, 0, 0, w, h);
  ctx.globalCompositeOperation = 'source-over';
  cache.set(key, c);
  return c;
}
