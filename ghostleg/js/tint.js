// 動物立牌的圖。2026-10-02 檢查點 3:動物畫成吉祥物同一套畫風、自己的毛色,**不染色**
// (原本「白身體疊上玩家色」的做法跟狐狸不搭,使用者打槍)。玩家色改在底座、名牌、緞帶上。
// 同一組 (圖, 尺寸) 只畫一次 —— 40 個人、設定小圖、結果卡都共用。
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

// 圖還沒載完 / 載不到時的暫代:白色圓頭小人(跟舊版同型)
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

export function animalCanvas(img, size = 256) {
  const key = `${img?.src ?? 'placeholder'}|${size}`;
  if (cache.has(key)) return cache.get(key);
  const src = img ?? placeholder(size);
  const c = document.createElement('canvas');
  c.height = size;
  c.width = Math.round(size * (src.width / src.height));
  c.getContext('2d').drawImage(src, 0, 0, c.width, c.height);
  cache.set(key, c);
  return c;
}
