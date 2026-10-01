// 3D 殼外觀的純數學:不 import three,Node 測得到。

export const UR_FRAMES = 24;
export const SHIMMER_MS = 3200;   // 同 gashapon/css 的 shimmer 3.2s

// 每一步「結束後」蛋是什麼外觀。起點是那顆蛋自己的隨機純色(plain),
// 只有 upgrade 會換 —— N 沒有 upgrade,所以從頭到尾都是 plain。
export function skinSequence(steps) {
  let cur = 'plain';
  return steps.map(s => (s.type === 'upgrade' ? (cur = s.to) : cur));
}

// CSS Filter Effects 規格的 hue-rotate / saturate 矩陣(列優先 3×3)
export function hueRotateMatrix(deg) {
  const r = (deg * Math.PI) / 180;
  const a = Math.cos(r);
  const b = Math.sin(r);
  return [
    0.213 + 0.787 * a - 0.213 * b, 0.715 - 0.715 * a - 0.715 * b, 0.072 - 0.072 * a + 0.928 * b,
    0.213 - 0.213 * a + 0.143 * b, 0.715 + 0.285 * a + 0.140 * b, 0.072 - 0.072 * a - 0.283 * b,
    0.213 - 0.213 * a - 0.787 * b, 0.715 - 0.715 * a + 0.715 * b, 0.072 + 0.928 * a + 0.072 * b,
  ];
}

export function saturateMatrix(s) {
  return [
    0.213 + 0.787 * s, 0.715 - 0.715 * s, 0.072 - 0.072 * s,
    0.213 - 0.213 * s, 0.715 + 0.285 * s, 0.072 - 0.072 * s,
    0.213 - 0.213 * s, 0.715 - 0.715 * s, 0.072 + 0.928 * s,
  ];
}

export function mulMatrix(a, b) {
  const out = new Array(9);
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      out[i * 3 + j] = a[i * 3] * b[j] + a[i * 3 + 1] * b[3 + j] + a[i * 3 + 2] * b[6 + j];
    }
  }
  return out;
}

export function applyColorMatrix(px, m) {
  for (let i = 0; i < px.length; i += 4) {
    const r = px[i], g = px[i + 1], b = px[i + 2];
    px[i] = m[0] * r + m[1] * g + m[2] * b;
    px[i + 1] = m[3] * r + m[4] * g + m[5] * b;
    px[i + 2] = m[6] * r + m[7] * g + m[8] * b;
  }
}

// 只處理 tokens.css 裡用到的寫法:linear-gradient(<角度>deg, <#hex> [<百分比>], …)
export function parseGradient(css) {
  const body = css.replace(/\s+/g, ' ').match(/linear-gradient\((.*)\)/)[1];
  const parts = body.split(',').map(s => s.trim());
  const angle = parseFloat(parts.shift());
  const raw = parts.map(p => {
    const [color, pos] = p.split(' ');
    return { color, pos: pos === undefined ? null : parseFloat(pos) / 100 };
  });
  return {
    angle,
    stops: raw.map((s, i) => ({ color: s.color, pos: s.pos ?? (raw.length === 1 ? 0 : i / (raw.length - 1)) })),
  };
}

// CSS 的漸層線:0deg 朝上、90deg 朝右,長度 = |W sin a| + |H cos a|,穿過中心
export function gradientLine(deg, w, h = w) {
  const r = (deg * Math.PI) / 180;
  const half = (Math.abs(w * Math.sin(r)) + Math.abs(h * Math.cos(r))) / 2;
  const dx = Math.sin(r) * half;
  const dy = -Math.cos(r) * half;
  return [w / 2 - dx, h / 2 - dy, w / 2 + dx, h / 2 + dy];
}

// 正面投影:蛋轉正後 local +z 朝鏡頭,所以只看 x、y,就跟 2D 把圖平貼在圓上一樣
export function planarUV(positions, radius) {
  const n = positions.length / 3;
  const uv = new Float32Array(n * 2);
  for (let i = 0; i < n; i++) {
    uv[i * 2] = positions[i * 3] / (2 * radius) + 0.5;
    uv[i * 2 + 1] = positions[i * 3 + 1] / (2 * radius) + 0.5;
  }
  return uv;
}
