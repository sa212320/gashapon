// 機台插畫的錨點:把手圓心與半徑、出蛋口,全部是相對於 machine.webp 寬高的 0–1 比例。
// 由 tools/mascot-gen/gashapon.py build-machine 產生 img/anchors.json;這裡的
// DEFAULT_ANCHORS 是讀不到檔案時的保底(離線、file:// 開、部署漏檔),
// 數值必須跟 anchors.json 一樣 —— test/gashapon-ui.test.js 會檢查。

export const DEFAULT_ANCHORS = Object.freeze({
  aspect: 0.5867,
  knob: Object.freeze({ cx: 0.4971, cy: 0.6532, r: 0.1708 }),
  outlet: Object.freeze({ x: 0.4971, y: 0.8401 }),
});

const unit = v => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1;

export function isValidAnchors(a) {
  if (!a || typeof a !== 'object') return false;
  const { aspect, knob, outlet } = a;
  if (!(typeof aspect === 'number' && aspect > 0 && Number.isFinite(aspect))) return false;
  if (!knob || !unit(knob.cx) || !unit(knob.cy) || !unit(knob.r)) return false;
  if (!outlet || !unit(outlet.x) || !unit(outlet.y)) return false;
  // r 相對於寬;換成相對於高要乘上 aspect(寬/高)
  const ry = knob.r * aspect;
  return knob.cx - knob.r >= 0 && knob.cx + knob.r <= 1 && knob.cy - ry >= 0 && knob.cy + ry <= 1;
}

export async function loadAnchors(fetchFn = fetch, url = 'img/anchors.json') {
  try {
    const res = await fetchFn(url, { cache: 'no-cache' });
    if (!res.ok) return DEFAULT_ANCHORS;
    const a = await res.json();
    return isValidAnchors(a) ? a : DEFAULT_ANCHORS;
  } catch {
    return DEFAULT_ANCHORS;
  }
}

export function anchorVars(a) {
  return {
    '--machine-aspect': String(a.aspect),
    '--knob-x': String(a.knob.cx),
    '--knob-y': String(a.knob.cy),
    '--knob-r': String(a.knob.r),
  };
}

export function outletPoint(rect, a) {
  return { x: rect.left + rect.width * a.outlet.x, y: rect.top + rect.height * a.outlet.y };
}
