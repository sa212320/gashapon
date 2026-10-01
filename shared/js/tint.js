// 用 SVG 濾鏡幫灰階素材上色。給 border-image 用:border-image 沒辦法直接上色,
// 能替九宮格做遮罩的 mask-border 只有 Safari 支援。
// 對灰階圖來說,把 RGB 各乘上目標色就等於 multiply:白 → 目標色、黑 → 黑,alpha 不動。
const NS = 'http://www.w3.org/2000/svg';
const HOST_ID = 'tint-filters';

export function colorToMatrix(hex) {
  const n = parseInt(hex.replace('#', ''), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(v => v / 255);
  return [r,0,0,0,0, 0,g,0,0,0, 0,0,b,0,0, 0,0,0,1,0];
}

// RARITY_META.UR.color 是哨兵值 'rainbow'(給 CSS 畫漸層用),不是顏色
export function tintColorFor(meta) {
  return meta.color === 'rainbow' ? meta.edge : meta.color;
}

export function mountTintFilters(metaByKey, doc = document) {
  const svg = doc.createElementNS(NS, 'svg');
  svg.setAttribute('id', HOST_ID);
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('style', 'position:absolute;width:0;height:0;overflow:hidden');
  for (const [key, meta] of Object.entries(metaByKey)) {
    const filter = doc.createElementNS(NS, 'filter');
    filter.setAttribute('id', `tint-${key}`);
    filter.setAttribute('color-interpolation-filters', 'sRGB');
    const m = doc.createElementNS(NS, 'feColorMatrix');
    m.setAttribute('type', 'matrix');
    m.setAttribute('values', colorToMatrix(tintColorFor(meta)).join(' '));
    filter.appendChild(m);
    svg.appendChild(filter);
  }
  const old = doc.getElementById(HOST_ID);
  if (old) old.replaceWith(svg);
  else doc.body.appendChild(svg);
  return svg;
}
