"""揭曉卡片外框四角的雪花(2026-10-01)。手寫幾何,輸出 shared/img/flakes/flake-{N,R,SR,SSR,UR}.svg。

白色雪花、深棕粗外框(跟插畫同畫風),不吃稀有度色。一階比一階華麗。
在 repo 根目錄執行:python3 tools/mascot-gen/flakes.py
"""
import math
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DEST = ROOT / 'shared' / 'img' / 'flakes'
INK = '#574239'


def pt(angle, r):
    a = math.radians(angle - 90)
    return round(r * math.cos(a), 2), round(r * math.sin(a), 2)


def line(*pts):
    return 'M' + ' L'.join(f'{x} {y}' for x, y in pts)


def arms(n, length, offset=0):
    return [line((0, 0), pt(offset + i * 360 / n, length)) for i in range(n)]


def tips(n, r, offset=0):
    # 圓頭線帽的零長度線段 = 一個圓點
    return [f'M{x} {y} l0 0' for x, y in (pt(offset + i * 360 / n, r) for i in range(n))]


def branches(n, at, size, spread=45):
    out = []
    for i in range(n):
        a = i * 360 / n
        base = pt(a, at)
        left = (base[0] + pt(a - spread, size)[0], base[1] + pt(a - spread, size)[1])
        right = (base[0] + pt(a + spread, size)[0], base[1] + pt(a + spread, size)[1])
        out.append(line(left, base, right))
    return out


def hexagon(r):
    return line(*[pt(i * 60, r) for i in range(6)], pt(0, r)) + ' Z'


def sparkle(cx, cy, s):
    return (f'M{cx} {cy - s} Q{cx + s * .2} {cy - s * .2} {cx + s} {cy} '
            f'Q{cx + s * .2} {cy + s * .2} {cx} {cy + s} Q{cx - s * .2} {cy + s * .2} {cx - s} {cy} '
            f'Q{cx - s * .2} {cy - s * .2} {cx} {cy - s} Z')


FLAKES = {
    'N':   arms(6, 22),
    'R':   arms(6, 34) + tips(6, 40),
    'SR':  arms(6, 38) + branches(6, 22, 11) + tips(6, 44),
    'SSR': arms(6, 40) + branches(6, 16, 9) + branches(6, 29, 9) + [hexagon(9)] + tips(6, 46),
    'UR':  arms(6, 42) + branches(6, 16, 9) + branches(6, 30, 10) + [hexagon(9)] + tips(6, 47)
           + arms(6, 20, offset=30) + tips(6, 25, offset=30),
}
SPARKLES = {'UR': [sparkle(-38, -38, 8), sparkle(40, -30, 6), sparkle(36, 40, 7)]}


def svg(rarity):
    paths = '\n    '.join(f'<path d="{d}"/>' for d in FLAKES[rarity])
    sparks = '\n  '.join(f'<path d="{d}" fill="#fff" stroke="{INK}" stroke-width="3"/>' for d in SPARKLES.get(rarity, []))
    return f'''<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="-58 -58 116 116">
  <!-- 揭曉卡片外框四角的雪花({rarity})。由 tools/mascot-gen/flakes.py 產生,不要手改 -->
  <defs>
  <g id="f" fill="none" stroke-linecap="round" stroke-linejoin="round">
    {paths}
  </g>
  </defs>
  <use href="#f" xlink:href="#f" stroke="{INK}" stroke-width="13"/>
  <use href="#f" xlink:href="#f" stroke="#fff" stroke-width="6"/>
  {sparks}
</svg>
'''


# 外框上緣的積雪:一片橫向拉伸的白色雪堆。preserveAspectRatio="none" 讓它跟著卡片寬度拉長,
# vector-effect 讓外框線不會被一起拉粗。
SNOW_CAP = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 40" preserveAspectRatio="none">
  <!-- 揭曉卡片外框上緣的積雪。由 tools/mascot-gen/flakes.py 產生,不要手改 -->
  <path d="M4 34 C4 22 14 18 24 22 C28 8 46 6 54 16 C62 4 84 4 92 16 C100 6 120 6 126 18 C134 8 154 8 160 20 C168 12 186 14 188 24 C196 24 198 30 196 34 Z"
        fill="#fff" stroke="{INK}" stroke-width="4" stroke-linejoin="round" vector-effect="non-scaling-stroke"/>
</svg>
'''


if __name__ == '__main__':
    DEST.mkdir(parents=True, exist_ok=True)
    for r in FLAKES:
        (DEST / f'flake-{r}.svg').write_text(svg(r))
    (DEST / 'snow-cap.svg').write_text(SNOW_CAP)
    print('flakes:', ', '.join(f'{r}={len(FLAKES[r]) + len(SPARKLES.get(r, []))}' for r in FLAKES))
