# 扭蛋機畫面優化 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 `gashapon/` 的機台、扭蛋殼、揭曉卡片外框、圖示換成跟首頁木牌、吉祥物同一套畫風的素材,版面讓機台撐滿畫面,最後用同一張機台圖做首頁卡片。

**Architecture:** 垂直切片:機台 → 殼 → 外框 → 圖示 → 首頁卡片。每片都是「`tools/mascot-gen/gashapon.py` 生圖 → **停下來讓使用者在比較頁挑圖** → build 出素材 → 接程式 → **用實際頁面截圖讓使用者驗收**」。素材上的功能色(稀有度)一律由程式上色:殼用 CSS `mask-image` + `mix-blend-mode: multiply`,九宮格外框用 SVG `feColorMatrix` 濾鏡。

**Tech Stack:** 純靜態 HTML/CSS/ES modules(零建置、沒有 package.json);測試 `node --test`(零依賴,DOM 用手寫假物件);素材工具 Python(numpy、Pillow、`cwebp`)+ ComfyUI z_image(`COMFY_URL`)。

**Spec:** `docs/superpowers/specs/2026-10-01-gashapon-visual-refresh-design.md`(執行者兩份都要讀)

---

## 模型(grill 確認,從 spec 原文收錄)

> **執行 task N 時發現實作跟這段矛盾 = plan bug。停下來回報,不要自己改模型。**

- **Entities**:`Machine`(資料**不變**,不加 `skin` / `color`);機台素材組 `machine.webp`(機身 + 圓頂 + 裝飾用的蛋)+ `knob.webp` + `anchors.json`(把手中心、出蛋口,圖片座標);殼 `shell-{N,R,SR,SSR,UR}-{top,bottom}`(10 張灰階);卡片外框 `frame-{N…UR}`(5 張灰階九宮格,放 `shared/`);圖示 SVG `home / sound-on / sound-off / settings`(放 `shared/`)
- **Cardinality**:機台素材 1 : N `Machine`(每台共用);稀有度 1:1 殼花紋(每款拆上下兩張);稀有度 1:1 卡片外框
- **Seen vs stored**:圓頂裡看到的蛋是**畫死在插畫裡的裝飾**,跟剩幾顆、稀有度都無關;`machine.name` 有存但主畫面不顯示;「剩 X 顆」是算出來的,`removeOnDraw = false` 時不顯示
- **畫面**:拔標題;機台撐滿高度但避開吉祥物;剩 X 顆標籤在「轉!」旁;點把手 = 轉!;空機畫面不動;首頁卡片最後用同一張機台圖生

**最可能做錯的三個(以下都是錯的)**

1. 「圓頂裡的蛋要依剩餘數量或稀有度畫」—— 錯,那是靜態插畫,抽完了也長一樣
2. 「殼和卡片外框的顏色直接畫在圖上」—— 錯,生灰階圖,由 `RARITY_META` 上色;UR 的彩虹是 CSS 動畫
3. 「3D 扭蛋機也一起換成花紋殼」—— 錯,只有卡片外框放 `shared/` 讓 3D 可以用

(spec 註:把手是實心圓盤,原地旋轉時一直蓋著原圖上的把手,所以**不用補底座**;橫桿凸出圓外的那張在挑圖時就淘汰。)

---

## Global Constraints

- 零建置:不新增 package.json、bundler、npm 依賴;網站只能用瀏覽器原生 ES modules
- 測試:`node --test`(repo 根目錄)必須全綠;Python 測試:`tools/mascot-gen/.venv/bin/python -m unittest discover tools/mascot-gen`
- **不碰 `gashapon3d/` 的任何檔案**
- 中獎機率只看 `count`,`gacha.js` 的邏輯與 `buildRevealSteps` 不動
- 稀有度色只從 `RARITY_META`(`gashapon/js/constants.js`)/ `--r-X-a`、`--r-X-b`(`shared/css/tokens.css`)來;UR 的 `color` 是哨兵值 `'rainbow'`,要上色時用 `edge`(`#8B5CF6`)
- 素材網址一律帶內容雜湊 `?v=<sha1 前 8 碼>`,由 build 指令自動改寫引用處
- 生圖:z_image(`comfy.graph_t2i`)、3 個 seed `[11, 22, 33]`、綠底 `#00FF00`、去背用 `key_border` + `keep_largest`;畫風描述沿用 `home_prompts.json` 的 `style`
- 使用者用中文就回繁體中文;程式碼、識別字、commit message 用英文(commit 格式照 repo:`feat(gashapon): ...`,內文可中文)
- 每個 commit 結尾:
  ```
  Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01SemYkQLkTmSDDeYUKQcPZG
  ```
- 分支:`gashapon-visual-refresh`
- 截圖驗收用**實際跑起來的頁面**(`python3 -m http.server 8765` 在 repo 根目錄)。headless Chrome 的 `--window-size` 寬度下限是 500px(實測 390 會拿到 innerWidth=500),手機寬要用 claude-in-chrome 調視窗大小,或 DevTools Protocol `Emulation.setDeviceMetricsOverride`;**截圖時要寫明用的是哪一種**

## Review Focus

1. **`anchors.json` 讀不到**(離線、直接用 file:// 開、伺服器漏檔)→ 機台照樣顯示,把手落在預設位置,抽獎照常。→ Task 4 `loadAnchors` 的測試
2. **殼的遮罩圖還沒載入就升階**(慢網路第一次抽)→ `mask-image` 載入前會被當成全透明,蛋會**整顆隱形**。預期:蛋至少要看得到(退回純色半圓)。→ Task 9 的 `.shells-ready` 閘門與 `preloadImages` 測試
3. **橫向手機 / 很矮的視窗**(844×390)→ 機台縮小、工具列和「剩 X 顆」都看得到、整頁不出現捲軸。→ Task 6 截圖清單、Task 5 CSS 用 `cqh`
4. **很長的獎項名稱**(20 字以上、沒有空格)配九宮格外框 → 字不能壓在四個角的裝飾上、不能撐破外框。→ Task 14 截圖清單 + `padding ≥ border-image-width` 的 CSS 測試
5. **抽空之後點把手** → 跟按 disabled 的「轉!」一樣什麼都不發生(不能繞過 disabled 抽到 `null`)。→ Task 4 `render` 測試:空機時 `knob.disabled === true`

---

## 檔案結構

| 檔案 | 責任 |
|---|---|
| `tools/mascot-gen/gashapon_art.py`(新) | 純函式:錨點換算、切把手、灰階化、切上下半、九宮格邊修正、內容雜湊與引用改寫、卡片合成 |
| `tools/mascot-gen/test_gashapon_art.py`(新) | 上面那些純函式的 unittest |
| `tools/mascot-gen/gashapon.py`(新) | CLI:`machine / shells / frames / review / pick / build-machine / build-shells / build-frames` |
| `tools/mascot-gen/gashapon_prompts.json`(新) | 提示詞與挑選紀錄(含錨點、分界線) |
| `gashapon/img/machine.webp`、`knob.webp`、`anchors.json`(新) | 機台素材 |
| `gashapon/img/shell-{N,R,SR,SSR,UR}-{top,bottom}.webp`(新) | 殼 |
| `gashapon/js/machine-art.js`(新) | `DEFAULT_ANCHORS`、`isValidAnchors`、`loadAnchors`、`anchorVars`、`outletPoint` |
| `gashapon/js/shells.js`(新) | `SHELL_URLS`、`preloadImages` |
| `shared/js/tint.js`(新) | `colorToMatrix`、`tintColorFor`、`mountTintFilters` |
| `shared/css/prize-frame.css`(新) | 九宮格外框 + 濾鏡上色 |
| `shared/img/frames/frame-{N,R,SR,SSR,UR}.webp`(新) | 外框 |
| `shared/img/icons.svg`(新) | 4 個 `<symbol>` |
| `gashapon/index.html`、`css/style.css`、`css/animations.css`、`js/main.js`、`js/reveal.js`、`js/ui-machine.js` | 改 |
| `tools/mascot-gen/home.py`、`home_prompts.json`、`index.html`、`css/home.css`、`test/home-images.test.js` | 切片 ⑤ |
| `test/gashapon-art.test.js`(新) | 機台/殼/外框/圖示素材存在與格式、CSS 規則 |
| `test/gashapon-ui.test.js`(新) | `machine-art.js`、`shells.js`、`ui-machine.js` |
| `test/tint.test.js`(新) | `tint.js` |

---

# 切片 ① 機台與版面

### Task 1: 素材工具的純函式(機台部分)

**Files:**
- Create: `tools/mascot-gen/gashapon_art.py`
- Test: `tools/mascot-gen/test_gashapon_art.py`

**Interfaces:**
- Produces:
  - `anchors_from_pick(knob: tuple[int,int,int], outlet: tuple[int,int], bbox: tuple[int,int,int,int]) -> dict` — 回傳 `{"aspect", "knob": {"cx","cy","r"}, "outlet": {"x","y"}}`,全部相對於 bbox 寬高的 0–1 比例(`r` 相對於寬),四捨五入到小數 4 位
  - `cut_disk(rgba: np.ndarray, cx: int, cy: int, r: int) -> np.ndarray` — 回傳 `(2r, 2r, 4)`,圓外 alpha 0
  - `content_hash(path: Path) -> str` — sha1 前 8 碼
  - `stamp(text: str, rel: str, digest: str) -> str` — 把 `rel` 或 `rel?v=xxxxxxxx` 換成 `rel?v=<digest>`

- [ ] **Step 1: 寫失敗的測試**

```python
"""gashapon_art 純函式。跑法:tools/mascot-gen/.venv/bin/python -m unittest discover tools/mascot-gen"""
import tempfile
import unittest
from pathlib import Path

import numpy as np

from gashapon_art import anchors_from_pick, cut_disk, content_hash, stamp


class Anchors(unittest.TestCase):
    def test_relative_to_cropped_bbox(self):
        a = anchors_from_pick(knob=(150, 250, 25), outlet=(150, 350), bbox=(50, 50, 250, 450))
        self.assertEqual(a, {'aspect': 0.5, 'knob': {'cx': 0.5, 'cy': 0.5, 'r': 0.125}, 'outlet': {'x': 0.5, 'y': 0.75}})

    def test_rounds_to_four_places(self):
        a = anchors_from_pick(knob=(1, 1, 1), outlet=(1, 1), bbox=(0, 0, 3, 3))
        self.assertEqual(a['knob']['cx'], 0.3333)


class CutDisk(unittest.TestCase):
    def test_square_with_transparent_corners(self):
        rgba = np.full((100, 100, 4), 200, np.uint8)
        d = cut_disk(rgba, 50, 50, 20)
        self.assertEqual(d.shape, (40, 40, 4))
        self.assertEqual(d[0, 0, 3], 0)          # 角落在圓外
        self.assertEqual(d[20, 20, 3], 200)      # 圓心保留原本的 alpha

    def test_keeps_existing_transparency_inside(self):
        rgba = np.zeros((60, 60, 4), np.uint8)
        self.assertEqual(cut_disk(rgba, 30, 30, 10)[10, 10, 3], 0)


class Stamp(unittest.TestCase):
    def test_adds_version(self):
        self.assertEqual(stamp('src="img/a.webp"', 'img/a.webp', 'deadbeef'), 'src="img/a.webp?v=deadbeef"')

    def test_replaces_old_version(self):
        self.assertEqual(stamp('url(img/a.webp?v=00000000)', 'img/a.webp', 'deadbeef'), 'url(img/a.webp?v=deadbeef)')

    def test_does_not_touch_other_files(self):
        self.assertEqual(stamp('img/ab.webp', 'img/a.webp', 'deadbeef'), 'img/ab.webp')

    def test_content_hash_is_8_hex(self):
        with tempfile.TemporaryDirectory() as d:
            p = Path(d) / 'x.bin'
            p.write_bytes(b'abc')
            self.assertEqual(content_hash(p), 'a9993e36')
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `cd tools/mascot-gen && .venv/bin/python -m unittest test_gashapon_art -v`
Expected: FAIL,`ModuleNotFoundError: No module named 'gashapon_art'`

- [ ] **Step 3: 實作**

```python
"""扭蛋機素材的後處理純函式。不碰網路、不碰 ComfyUI,方便測試。"""
import hashlib
import re
from pathlib import Path

import numpy as np


def anchors_from_pick(knob, outlet, bbox):
    """把比較頁上點出來的像素座標(原圖座標),換成相對於「去背裁切後」圖片的 0–1 比例。
    r 相對於寬,這樣 CSS 用 width 百分比就能直接畫出把手的大小。"""
    x0, y0, x1, y1 = bbox
    w, h = x1 - x0, y1 - y0
    cx, cy, r = knob
    ox, oy = outlet
    q = lambda v: round(v, 4)
    return {
        'aspect': q(w / h),
        'knob': {'cx': q((cx - x0) / w), 'cy': q((cy - y0) / h), 'r': q(r / w)},
        'outlet': {'x': q((ox - x0) / w), 'y': q((oy - y0) / h)},
    }


def cut_disk(rgba, cx, cy, r):
    """切出以 (cx, cy) 為圓心、半徑 r 的圓盤。把手是實心圓盤,原地旋轉時佔的範圍不變,
    所以機身那張不用挖洞也不用補底 —— 它永遠被這張蓋住。"""
    sq = rgba[cy - r:cy + r, cx - r:cx + r].copy()
    yy, xx = np.mgrid[0:2 * r, 0:2 * r]
    outside = (xx - r + 0.5) ** 2 + (yy - r + 0.5) ** 2 > r * r
    sq[outside, 3] = 0
    return sq


def content_hash(path):
    return hashlib.sha1(Path(path).read_bytes()).hexdigest()[:8]


def stamp(text, rel, digest):
    """網址加上內容雜湊:素材換了網址就跟著換,瀏覽器跟 GitHub Pages 的快取不會繼續給舊圖。"""
    return re.sub(re.escape(rel) + r'(\?v=[0-9a-f]{8})?(?![\w.])', f'{rel}?v={digest}', text)
```

- [ ] **Step 4: 跑測試確認通過**

Run: `cd tools/mascot-gen && .venv/bin/python -m unittest test_gashapon_art -v`
Expected: 全部 PASS

- [ ] **Step 5: Commit**

```bash
git add tools/mascot-gen/gashapon_art.py tools/mascot-gen/test_gashapon_art.py
git commit -m "feat(gashapon-art): anchor, knob-cut and asset-stamp helpers"
```

---

### Task 2: `gashapon.py` 生成、比較頁、挑選、build-machine

**Files:**
- Create: `tools/mascot-gen/gashapon.py`
- Create: `tools/mascot-gen/gashapon_prompts.json`

**Interfaces:**
- Consumes: Task 1 全部;`comfy.run`、`comfy.graph_t2i`、`comfy.fetch`;`post.key_border`、`post.keep_largest`
- Produces:
  - CLI `gashapon.py machine | review | pick machine <n> --knob cx,cy,r --outlet x,y | build-machine`
  - 輸出 `gashapon/img/machine.webp`、`gashapon/img/knob.webp`、`gashapon/img/anchors.json`;並改寫 `gashapon/index.html` 裡兩張圖的 `?v=`
  - `webp(img, path, q)`、`generate(prompt, w, h, name)`、`OUT`、`SEEDS`、`load_cfg()`、`save_cfg()` 給後面的 task 擴充

- [ ] **Step 1: 寫提示詞檔**

`tools/mascot-gen/gashapon_prompts.json`:
```json
{
  "style": "flat 2D cartoon illustration, cute chibi style, flat colors, thick dark brown outlines, soft warm pastel colors, clean simple shapes",
  "negative": "text, letters, words, numbers, watermark, signature, people, person, animal, character, face, eyes, mouth, photorealistic, 3d render, gradient mesh, blurry, shadow on background",
  "machine": "a single cute capsule toy vending machine seen straight from the front, tall portrait proportions, a big round clear glass dome on top filled with many colorful round capsules, a coral red rounded box body with a soft yellow rim, one large round knob in the middle of the body with a short handle bar fully inside the round knob, a small dark capsule exit slot below the knob, two short stubby feet, no face, the machine alone with nothing else around it, isolated on a solid flat bright pure green #00FF00 background",
  "picks": {}
}
```

- [ ] **Step 2: 寫 CLI**

`tools/mascot-gen/gashapon.py`:
```python
"""扭蛋機素材生成(機台、扭蛋殼、揭曉卡片外框)。z_image 文字生圖。

在 repo 根目錄執行(先 export COMFY_URL=http://<ComfyUI 那台的 IP>:8188):
  PY=tools/mascot-gen/.venv/bin/python
  $PY tools/mascot-gen/gashapon.py machine        # 機台,3 個 seed
  $PY tools/mascot-gen/gashapon.py review         # 比較頁 tools/mascot-gen/review/gashapon.html
  $PY tools/mascot-gen/gashapon.py pick machine 2 --knob 384,560,70 --outlet 384,700
  $PY tools/mascot-gen/gashapon.py build-machine  # 輸出 gashapon/img/{machine,knob}.webp + anchors.json
"""
import argparse
import html
import json
import subprocess
import sys
from pathlib import Path

import numpy as np
from PIL import Image

import comfy
from post import key_border, keep_largest
from gashapon_art import anchors_from_pick, cut_disk, content_hash, stamp

ROOT = Path(__file__).resolve().parents[2]
HERE = Path(__file__).resolve().parent
OUT = HERE / 'out' / 'gashapon'
CFG = HERE / 'gashapon_prompts.json'
IMG = ROOT / 'gashapon' / 'img'
SEEDS = [11, 22, 33]
MACHINE_W, MACHINE_H = 768, 1024


def load_cfg():
    return json.loads(CFG.read_text())


def save_cfg(cfg):
    CFG.write_text(json.dumps(cfg, ensure_ascii=False, indent=2) + '\n')


def generate(prompt, negative, w, h, name):
    d = OUT / name
    d.mkdir(parents=True, exist_ok=True)
    for n, seed in enumerate(SEEDS, 1):
        imgs = comfy.run(comfy.graph_t2i(prompt, negative, w, h, seed, f'gashapon_{name}_s{n}'))
        (d / f's{n}.png').write_bytes(comfy.fetch(imgs[0]))
        print(f'{name} s{n} seed={seed}', flush=True)


def webp(img, path, q=82):
    tmp = path.with_suffix('.png')
    img.save(tmp)
    subprocess.run(['cwebp', '-quiet', '-q', str(q), '-alpha_q', '90', str(tmp), '-o', str(path)], check=True)
    tmp.unlink()


def restamp(text_file, rel, asset):
    """把 text_file 裡對 rel 的引用改成帶 asset 的內容雜湊。"""
    text_file.write_text(stamp(text_file.read_text(), rel, content_hash(asset)))


def cmd_machine(args):
    cfg = load_cfg()
    generate(f'{cfg["style"]}, {cfg["machine"]}', cfg['negative'], MACHINE_W, MACHINE_H, 'machine')


# 比較頁:每張圖可以用滑鼠標點,點滿之後頁面組出一行 pick 指令讓使用者複製。
# 每個 figure 帶 data-steps(要點哪幾下)與 data-cmd-src(一段 JS 運算式,pts 是點過的
# 原圖像素座標陣列),頁面用 new Function 轉成函式。
REVIEW = """<!doctype html>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>扭蛋機素材候選</title>
<style>
  body {{ font-family: system-ui, sans-serif; margin: 16px; background: #B9E0F8; color: #3b2f2a; }}
  section {{ margin-bottom: 28px; }}
  .row {{ display: flex; gap: 12px; flex-wrap: wrap; }}
  figure {{ margin: 0; background: #fffaf2; border: 4px solid #574239; border-radius: 16px; padding: 8px; }}
  .pad {{ position: relative; }}
  img {{ display: block; border-radius: 10px; cursor: crosshair; }}
  svg.marks {{ position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; }}
  figcaption {{ margin-top: 6px; font-weight: 700; }}
  code {{ display: block; margin-top: 6px; font-size: 12px; user-select: all; white-space: pre-wrap; max-width: 360px; }}
</style>
<h1>扭蛋機素材:每段挑一個</h1>
<p>{hint}</p>
{body}
<script>
document.querySelectorAll('figure[data-steps]').forEach(fig => {{
  const img = fig.querySelector('img'), out = fig.querySelector('code'), svg = fig.querySelector('svg');
  const steps = JSON.parse(fig.dataset.steps);
  const cmd = new Function('pts', 'return ' + fig.dataset.cmdSrc);
  const ring = fig.dataset.ring === '1', lines = fig.dataset.lines === '1';
  let pts = [];
  out.textContent = steps.length ? `下一步:${{steps[0]}}` : cmd([]);
  img.addEventListener('click', e => {{
    if (!steps.length) return;
    const r = img.getBoundingClientRect(), k = img.naturalWidth / r.width;
    if (pts.length >= steps.length) pts = [];
    pts.push([Math.round((e.clientX - r.left) * k), Math.round((e.clientY - r.top) * k)]);
    svg.setAttribute('viewBox', `0 0 ${{img.naturalWidth}} ${{img.naturalHeight}}`);
    let marks = pts.map(([x, y]) => `<circle cx="${{x}}" cy="${{y}}" r="8" fill="red"/>`).join('');
    if (ring && pts.length >= 2) {{
      const rr = Math.hypot(pts[1][0] - pts[0][0], pts[1][1] - pts[0][1]);
      marks += `<circle cx="${{pts[0][0]}}" cy="${{pts[0][1]}}" r="${{rr}}" fill="none" stroke="red" stroke-width="4"/>`;
    }}
    if (lines) marks += pts.map(([, y]) => `<line x1="0" x2="${{img.naturalWidth}}" y1="${{y}}" y2="${{y}}" stroke="red" stroke-width="3"/>`).join('');
    svg.innerHTML = marks;
    out.textContent = pts.length < steps.length ? `下一步:${{steps[pts.length]}}` : cmd(pts);
  }});
}});
</script>
"""


def figure(name, f, width, steps, cmd_js, ring=False, lines=False):
    """一張候選圖。steps 是要依序點的說明;cmd_js 是組指令的 JS 運算式(變數 pts)。"""
    attrs = (f'data-steps="{html.escape(json.dumps(steps, ensure_ascii=False))}" '
             f'data-cmd-src="{html.escape(cmd_js)}" data-ring="{int(ring)}" data-lines="{int(lines)}"')
    return (f'<figure {attrs}><div class="pad">'
            f'<img src="../out/gashapon/{name}/{f.name}" style="width:{width}px">'
            f'<svg class="marks"></svg></div><figcaption>{name} {f.stem}</figcaption><code></code></figure>')


def section(name, figs):
    return f'<section><h2>{name}</h2><div class="row">{"".join(figs)}</div></section>' if figs else ''


def review_machine():
    d = OUT / 'machine'
    figs = []
    for f in sorted(d.glob('s*.png')) if d.exists() else []:
        n = f.stem[1:]
        js = (f"`pick machine {n} --knob ${{pts[0][0]}},${{pts[0][1]}},"
              f"${{Math.round(Math.hypot(pts[1][0]-pts[0][0], pts[1][1]-pts[0][1]))}} --outlet ${{pts[2][0]}},${{pts[2][1]}}`")
        figs.append(figure('machine', f, 360, ['點把手圓心', '點把手邊緣', '點出蛋口'], js, ring=True))
    return section('machine', figs)


# 之後的 task 會往這個清單加 review_shells、review_frames
REVIEW_SECTIONS = [review_machine]


def cmd_review(args):
    page = HERE / 'review' / 'gashapon.html'
    page.parent.mkdir(exist_ok=True)
    body = '\n'.join(s() for s in REVIEW_SECTIONS)
    page.write_text(REVIEW.format(hint='淘汰:有臉的、把手橫桿凸出圓外的、把手不是圓的、帶顏色的(殼與外框)。', body=body))
    print(page)


def cmd_pick(args):
    src = OUT / args.name / f's{args.n}.png'
    if not src.exists():
        sys.exit(f'沒有 {src}')
    cfg = load_cfg()
    pick = {'n': args.n}
    if args.name == 'machine':
        if not (args.knob and args.outlet):
            sys.exit('machine 要給 --knob cx,cy,r 跟 --outlet x,y')
        pick['knob'] = [int(v) for v in args.knob.split(',')]
        pick['outlet'] = [int(v) for v in args.outlet.split(',')]
    if args.seams:
        pick['seams'] = [int(v) for v in args.seams.split(',')]
    cfg.setdefault('picks', {})[args.name] = pick
    save_cfg(cfg)
    print(f'{args.name} ← {pick}')


def cutout(path):
    """綠底 → 透明,只留最大的主體,裁掉四周透明邊。回傳 (rgba ndarray, 在原圖的 bbox)。"""
    rgb = np.asarray(Image.open(path).convert('RGB'))
    rgba = keep_largest(key_border(rgb))
    bbox = Image.fromarray(rgba).getbbox()
    x0, y0, x1, y1 = bbox
    return rgba[y0:y1, x0:x1], bbox


def cmd_build_machine(args):
    pick = load_cfg().get('picks', {}).get('machine')
    if not pick:
        sys.exit('還沒 pick:machine')
    full, bbox = cutout(OUT / 'machine' / f's{pick["n"]}.png')
    cx, cy, r = pick['knob']
    knob = cut_disk(full, cx - bbox[0], cy - bbox[1], r)
    IMG.mkdir(parents=True, exist_ok=True)
    webp(Image.fromarray(full), IMG / 'machine.webp')
    webp(Image.fromarray(knob), IMG / 'knob.webp')
    anchors = anchors_from_pick(tuple(pick['knob']), tuple(pick['outlet']), bbox)
    (IMG / 'anchors.json').write_text(json.dumps(anchors, indent=2) + '\n')
    page = ROOT / 'gashapon' / 'index.html'
    for name in ['machine.webp', 'knob.webp']:
        restamp(page, f'img/{name}', IMG / name)
    print(json.dumps(anchors))


COMMANDS = {'machine': cmd_machine, 'review': cmd_review, 'pick': cmd_pick, 'build-machine': cmd_build_machine}


def main():
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest='cmd', required=True)
    sub.add_parser('machine')
    sub.add_parser('review')
    p = sub.add_parser('pick')
    p.add_argument('name'); p.add_argument('n', type=int)
    p.add_argument('--knob'); p.add_argument('--outlet'); p.add_argument('--seams')
    sub.add_parser('build-machine')
    args = ap.parse_args()
    COMMANDS[args.cmd](args)


if __name__ == '__main__':
    main()
```

後面的 task 擴充這支 CLI 時都照同一個模式:新增 `cmd_xxx`、加進 `COMMANDS`、在 `main()` 註冊 subparser、需要比較頁的話寫一個 `review_xxx()` 加進 `REVIEW_SECTIONS`。

- [ ] **Step 3: 確認語法與 review 能跑(不需要 GPU)**

Run: `tools/mascot-gen/.venv/bin/python tools/mascot-gen/gashapon.py review`
Expected: 印出 `.../review/gashapon.html`(還沒有圖時頁面只有標題,不報錯)

- [ ] **Step 4: Commit**

```bash
git add tools/mascot-gen/gashapon.py tools/mascot-gen/gashapon_prompts.json
git commit -m "feat(gashapon-art): machine generation, click-to-mark review page, build-machine"
```

---

### Task 3: 生成機台 → **停下來讓使用者挑** → build

**Files:**
- Create: `gashapon/img/machine.webp`、`gashapon/img/knob.webp`、`gashapon/img/anchors.json`(由工具產生)
- Modify: `tools/mascot-gen/gashapon_prompts.json`(picks)

- [ ] **Step 1: 確認 ComfyUI 連得上**

Run: `curl -s --max-time 5 http://192.168.68.53:8188/system_stats | head -c 200`
Expected: 一段 JSON。連不上 → 停下來告訴使用者「ComfyUI 那台連不上」,不要換別的方式生圖。

- [ ] **Step 2: 生成**

Run: `COMFY_URL=http://192.168.68.53:8188 tools/mascot-gen/.venv/bin/python tools/mascot-gen/gashapon.py machine && tools/mascot-gen/.venv/bin/python tools/mascot-gen/gashapon.py review`

- [ ] **Step 3: Claude 先篩一輪**

用 Read 看 `tools/mascot-gen/out/gashapon/machine/s{1,2,3}.png`,標出明顯不合格的(有臉、橫桿凸出圓外、把手不是圓的、沒有出蛋口、背景不是綠的)並寫出原因。三張都不合格 → 調整 `gashapon_prompts.json` 的 `machine` 再生一輪,**最多兩輪**,還不行就停下來問使用者。

- [ ] **Step 4: 🛑 停下來:請使用者在比較頁挑圖**

告訴使用者:打開 `tools/mascot-gen/review/gashapon.html`,選一張,依序點「把手圓心 → 把手邊緣 → 出蛋口」,把頁面上顯示的 `pick machine ...` 那行貼回來。**等使用者回覆,不要自己挑。**

- [ ] **Step 5: 記錄挑選並 build**

Run(用使用者貼回來的那行):
```bash
tools/mascot-gen/.venv/bin/python tools/mascot-gen/gashapon.py pick machine <n> --knob <cx,cy,r> --outlet <x,y>
tools/mascot-gen/.venv/bin/python tools/mascot-gen/gashapon.py build-machine
```
Expected: 印出 anchors JSON;`gashapon/img/` 有 3 個檔案。用 Read 看 `knob.webp` 確認是完整的把手圓盤(邊緣沒被切掉一半)。不對 → 請使用者重點一次。

- [ ] **Step 6: Commit**

```bash
git add gashapon/img/machine.webp gashapon/img/knob.webp gashapon/img/anchors.json tools/mascot-gen/gashapon_prompts.json
git commit -m "feat(gashapon): machine illustration, knob layer and anchors"
```

---

### Task 4: `machine-art.js` 與 `ui-machine.js`(TDD)

**Files:**
- Create: `gashapon/js/machine-art.js`
- Modify: `gashapon/js/ui-machine.js`(整檔改寫)
- Test: `test/gashapon-ui.test.js`

**Interfaces:**
- Consumes: `gashapon/img/anchors.json`(Task 3)
- Produces:
  - `DEFAULT_ANCHORS: { aspect, knob: {cx, cy, r}, outlet: {x, y} }`(凍結,數值 = Task 3 產生的 anchors.json)
  - `isValidAnchors(a): boolean`
  - `loadAnchors(fetchFn = fetch, url = 'img/anchors.json'): Promise<Anchors>` —— 任何失敗都回 `DEFAULT_ANCHORS`,不丟例外
  - `anchorVars(a): Record<string, string>` —— `{'--machine-aspect','--knob-x','--knob-y','--knob-r'}`
  - `outletPoint(rect: {left, top, width, height}, a): {x, y}`
  - `createMachineView(els)`,`els = { remainTag, emptyState, drawBtn, knob, soundBtn, soundIcon }`,方法 `render(machine)`、`setSoundIcon(on)`

- [ ] **Step 1: 寫失敗的測試**

`test/gashapon-ui.test.js`:
```js
// 扭蛋機主畫面的純邏輯:錨點讀取與換算、剩餘標籤、把手跟「轉!」的 disabled。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  DEFAULT_ANCHORS, isValidAnchors, loadAnchors, anchorVars, outletPoint,
} from '../gashapon/js/machine-art.js';
import { createMachineView } from '../gashapon/js/ui-machine.js';
import { createMachine, createPrize } from '../gashapon/js/state.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const fileAnchors = JSON.parse(readFileSync(join(root, 'gashapon/img/anchors.json'), 'utf8'));

test('DEFAULT_ANCHORS 跟 anchors.json 一致(換圖時兩邊要一起改)', () => {
  assert.deepEqual(DEFAULT_ANCHORS, fileAnchors);
});

test('isValidAnchors:檔案本身合法、缺欄位或超出 0–1 不合法', () => {
  assert.equal(isValidAnchors(fileAnchors), true);
  assert.equal(isValidAnchors({ ...fileAnchors, outlet: { x: 0.5 } }), false);
  assert.equal(isValidAnchors({ ...fileAnchors, knob: { cx: 1.2, cy: 0.5, r: 0.1 } }), false);
  assert.equal(isValidAnchors(null), false);
});

test('isValidAnchors:把手圓不能超出圖', () => {
  const a = { ...fileAnchors, knob: { cx: 0.05, cy: 0.5, r: 0.1 } };
  assert.equal(isValidAnchors(a), false);
});

test('loadAnchors:fetch 失敗、404、壞 JSON、格式不對都退回預設值', async () => {
  const cases = [
    () => Promise.reject(new TypeError('offline')),
    () => Promise.resolve({ ok: false, json: async () => fileAnchors }),
    () => Promise.resolve({ ok: true, json: async () => { throw new SyntaxError('bad'); } }),
    () => Promise.resolve({ ok: true, json: async () => ({ aspect: 2 }) }),
  ];
  for (const f of cases) assert.equal(await loadAnchors(f), DEFAULT_ANCHORS);
});

test('loadAnchors:正常時回傳檔案內容', async () => {
  const a = await loadAnchors(() => Promise.resolve({ ok: true, json: async () => fileAnchors }));
  assert.deepEqual(a, fileAnchors);
});

test('anchorVars:輸出 CSS 變數字串', () => {
  const a = { aspect: 0.75, knob: { cx: 0.5, cy: 0.6, r: 0.1 }, outlet: { x: 0.5, y: 0.8 } };
  assert.deepEqual(anchorVars(a), {
    '--machine-aspect': '0.75', '--knob-x': '0.5', '--knob-y': '0.6', '--knob-r': '0.1',
  });
});

test('outletPoint:比例乘上機台實際位置', () => {
  const a = { aspect: 0.75, knob: { cx: 0.5, cy: 0.6, r: 0.1 }, outlet: { x: 0.5, y: 0.8 } };
  assert.deepEqual(outletPoint({ left: 100, top: 50, width: 300, height: 400 }, a), { x: 250, y: 370 });
});

function el() {
  return { hidden: false, disabled: false, textContent: '', classList: { toggle() {} }, setAttribute() {} };
}
function viewWith() {
  const els = { remainTag: el(), emptyState: el(), drawBtn: el(), knob: el(), soundBtn: el(), soundIcon: el() };
  return { els, view: createMachineView(els) };
}
const prizes = () => [createPrize({ name: 'a', count: 2 }), createPrize({ name: 'b', count: 1 })];

test('render:剩餘標籤顯示「剩 X 顆」', () => {
  const { els, view } = viewWith();
  view.render(createMachine({ prizes: prizes() }));
  assert.equal(els.remainTag.textContent, '剩 3 顆');
  assert.equal(els.remainTag.hidden, false);
});

test('render:抽到不拿走時不顯示剩餘標籤', () => {
  const { els, view } = viewWith();
  view.render(createMachine({ prizes: prizes(), removeOnDraw: false }));
  assert.equal(els.remainTag.hidden, true);
});

test('render:抽空了 → 空機畫面、轉!跟把手都 disabled', () => {
  const { els, view } = viewWith();
  const m = createMachine({ prizes: prizes() });
  view.render({ ...m, pool: m.pool.map(c => ({ ...c, drawn: true })) });
  assert.equal(els.emptyState.hidden, false);
  assert.equal(els.drawBtn.disabled, true);
  assert.equal(els.knob.disabled, true);
});

test('render:沒有獎項 → 轉!跟把手都 disabled,標籤提示去設定', () => {
  const { els, view } = viewWith();
  view.render(createMachine({ prizes: [] }));
  assert.equal(els.drawBtn.disabled, true);
  assert.equal(els.knob.disabled, true);
  assert.equal(els.remainTag.textContent, '還沒有獎項');
  assert.equal(els.remainTag.hidden, false);
});

test('render:正常時兩個都能按', () => {
  const { els, view } = viewWith();
  view.render(createMachine({ prizes: prizes() }));
  assert.equal(els.drawBtn.disabled, false);
  assert.equal(els.knob.disabled, false);
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `node --test test/gashapon-ui.test.js`
Expected: FAIL,`Cannot find module .../machine-art.js`

- [ ] **Step 3: 實作 `machine-art.js`**

把 `DEFAULT_ANCHORS` 的數值**照抄 `gashapon/img/anchors.json`**(Task 3 產生的實際數字)。

```js
// 機台插畫的錨點:把手圓心與半徑、出蛋口,全部是相對於 machine.webp 寬高的 0–1 比例。
// 由 tools/mascot-gen/gashapon.py build-machine 產生 img/anchors.json;這裡的
// DEFAULT_ANCHORS 是讀不到檔案時的保底(離線、file:// 開、部署漏檔),
// 數值必須跟 anchors.json 一樣 —— test/gashapon-ui.test.js 會檢查。

export const DEFAULT_ANCHORS = Object.freeze({
  aspect: 0, // ← 換成 anchors.json 的值
  knob: Object.freeze({ cx: 0, cy: 0, r: 0 }),
  outlet: Object.freeze({ x: 0, y: 0 }),
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
```

**`aspect`、`cx`、`cy`、`r`、`x`、`y` 六個 0 都要換成 `gashapon/img/anchors.json` 的實際數字**(Task 3 才產生得出來,所以這裡沒辦法先寫好);沒換的話 Step 1 第一個測試會紅,`isValidAnchors(DEFAULT_ANCHORS)` 也會是 false。

- [ ] **Step 4: 改寫 `ui-machine.js`**

```js
// 主畫面:剩餘標籤、空機畫面、「轉!」與把手的可按狀態、音效圖示。
// 機台本身是一張插畫,圓頂裡的蛋是畫死的裝飾,跟剩幾顆無關(2026-10-01 決定)。
import { remaining, totalCount } from './state.js';

export function createMachineView(els) {
  return {
    render(machine) {
      const total = totalCount(machine);
      const left = remaining(machine);
      const empty = machine.removeOnDraw && left === 0 && total > 0;

      if (total === 0) {
        els.remainTag.textContent = '還沒有獎項';
        els.remainTag.hidden = false;
      } else {
        els.remainTag.textContent = `剩 ${left} 顆`;
        // 抽到不拿走的話,「剩幾顆」永遠不變,顯示了反而誤導
        els.remainTag.hidden = !machine.removeOnDraw;
      }

      els.emptyState.hidden = !empty;
      const disabled = empty || total === 0;
      els.drawBtn.disabled = disabled;
      els.knob.disabled = disabled;
    },

    setSoundIcon(on) {
      els.soundIcon.textContent = on ? '🔊' : '🔇';
      els.soundBtn.classList.toggle('is-muted', !on);
    },
  };
}
```

- [ ] **Step 5: 跑測試確認通過**

Run: `node --test test/gashapon-ui.test.js`
Expected: 全部 PASS

- [ ] **Step 6: Commit**

```bash
git add gashapon/js/machine-art.js gashapon/js/ui-machine.js test/gashapon-ui.test.js
git commit -m "feat(gashapon): anchor loading and remaining-count tag"
```

---

### Task 5: 換上插畫機台:HTML、CSS、接線、轉把手演出

**Files:**
- Modify: `gashapon/index.html:15-63`(header 與 `<svg class="machine">` 整段)、`gashapon/index.html:76-80`(toolbar)
- Modify: `gashapon/css/style.css`(topbar、stage、machine 相關規則、toolbar)
- Modify: `gashapon/css/animations.css`(刪 `float-capsule`、`blink`、`twinkle` 與 `.machine__capsules circle` 規則)
- Modify: `gashapon/js/main.js:29-55`(els)、`:140`(綁把手)、啟動時套錨點
- Modify: `gashapon/js/reveal.js:63-71`(`slotOffset`)、`:139-171`(`turn`)
- Test: `test/gashapon-art.test.js`

**Interfaces:**
- Consumes: Task 4 的 `loadAnchors`、`anchorVars`、`outletPoint`、`createMachineView(els)`
- Produces: DOM id `machine`(div)、`knob`(button)、`remainTag`;`createRevealer(els)` 的 `els` 新增 `getAnchors: () => Anchors`,拿掉 `eyes`、`capsuleGroup`

- [ ] **Step 1: 寫失敗的測試(頁面引用與 markup)**

`test/gashapon-art.test.js`:
```js
// 扭蛋機頁引用的素材都要真的存在、引用要帶內容雜湊;舊的 SVG 機台不能殘留。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = p => readFileSync(join(root, p), 'utf8');
const strip = u => u.split('?')[0];

function pageRefs() {
  const html = read('gashapon/index.html');
  const css = read('gashapon/css/style.css');
  const fromHtml = [...html.matchAll(/<img\b[^>]*\bsrc="([^"]+)"/g)].map(m => join('gashapon', m[1]));
  const fromCss = [...css.matchAll(/url\(\s*["']?([^"')#]+)["']?\s*\)/g)].map(m => join('gashapon/css', m[1]));
  return [...fromHtml, ...fromCss].filter(p => !/data:|https?:/.test(p));
}

test('扭蛋機頁引用的每一張圖都存在', () => {
  for (const p of pageRefs()) assert.ok(existsSync(join(root, strip(p))), `找不到 ${p}`);
});

test('扭蛋機頁的圖都帶內容雜湊', () => {
  for (const p of pageRefs().filter(p => p.endsWith('.webp') || p.includes('.webp?'))) {
    assert.match(p, /\.webp\?v=[0-9a-f]{8}$/, p);
  }
});

test('機台用插畫與把手按鈕,舊的 SVG 機台、標題、眼睛都拿掉了', () => {
  const html = read('gashapon/index.html');
  assert.match(html, /<img[^>]+src="img\/machine\.webp/);
  assert.match(html, /<button[^>]+id="knob"/);
  assert.match(html, /id="remainTag"/);
  for (const gone of ['id="capsuleGroup"', 'class="eye', 'id="machineName"', 'id="remaining"', '<svg class="machine"']) {
    assert.ok(!html.includes(gone), `還有 ${gone}`);
  }
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `node --test test/gashapon-art.test.js`
Expected: FAIL(還有 `<svg class="machine"`、沒有 `remainTag`)

- [ ] **Step 3: 改 `gashapon/index.html`**

`<header class="topbar">…</header>` 整段換成:
```html
<a class="home-link home-link--corner" href="../" aria-label="回首頁">←</a>
```

`<svg class="machine" …>…</svg>` 整段換成:
```html
  <div class="machine" id="machine">
    <img class="machine__body" src="img/machine.webp" alt="" draggable="false">
    <button class="machine__knob" id="knob" type="button" aria-label="轉">
      <img src="img/knob.webp" alt="" draggable="false">
    </button>
  </div>
```

toolbar 換成(「剩 X 顆」在「轉!」正上方):
```html
<footer class="toolbar">
  <button class="icon-btn" id="soundBtn" type="button" aria-label="音效開關"><span id="soundIcon">🔊</span></button>
  <div class="draw-group">
    <p class="remain-tag" id="remainTag"></p>
    <button class="btn btn--draw" id="drawBtn" type="button">轉!</button>
  </div>
  <button class="icon-btn" id="settingsBtn" type="button" aria-label="設定">⚙️</button>
</footer>
```

然後跑一次 build 讓兩張圖帶上雜湊:
Run: `tools/mascot-gen/.venv/bin/python tools/mascot-gen/gashapon.py build-machine`

- [ ] **Step 4: 改 CSS**

`gashapon/css/style.css`:

- 刪掉 `.topbar`、`.machine-name`、`.remaining` 三條規則,和所有 `.machine__shadow/foot/body/panel/blush/dome/dome-glass/shine/rim/capsules/knob-base/knob-bar/slot`、`.eye*`、`.sparkle*`、`#knob`、`.machine__capsules` 規則
- `body` 改成兩列:
```css
body {
  min-height: 100dvh;
  display: grid;
  grid-template-rows: 1fr auto;
  overflow: hidden;
}

/* 標題拔掉了(2026-10-01),← 改成浮在左上角,不佔版面 */
.home-link--corner {
  position: fixed;
  top: max(10px, env(safe-area-inset-top));
  left: max(8px, env(safe-area-inset-left));
  transform: none;
  z-index: 5;
}
```
- stage 與機台:
```css
.stage {
  position: relative;
  display: grid;
  place-items: center;
  padding: 8px 16px;
  min-height: 0;
  /* 機台的大小跟著舞台算:用容器查詢單位,不是 vh —— 工具列高度在不同裝置不一樣 */
  container-type: size;
}

/* 機台撐滿舞台高度。寬度上限:筆電上要避開右下角的吉祥物(左右各留一個吉祥物寬,
   機台置中才不會撞到);手機上吉祥物排在內容後面(z-index -2),不限。
   吉祥物寬度跟 shared/css/mascot.css 的 .mascots 一樣。 */
.machine {
  --a: var(--machine-aspect, .75);
  --mascot-w: clamp(140px, 28vh, 300px);
  position: relative;
  width: min(92cqh * var(--a), 100cqw);
  aspect-ratio: var(--a);
  animation: idle-bob 3.6s ease-in-out infinite;
}
@media (min-width: 601px) {
  .machine { width: min(92cqh * var(--a), 100cqw - 2 * var(--mascot-w)); }
}
.machine__body {
  display: block;
  width: 100%;
  height: 100%;
  user-select: none;
  -webkit-user-drag: none;
}

/* 把手:一個圓形按鈕疊在插畫上原本把手的位置。點它跟按「轉!」一樣。
   位置用 translate 置中、旋轉用 transform —— 兩個是獨立屬性,轉的時候不會把置中蓋掉。 */
.machine__knob {
  position: absolute;
  left: calc(var(--knob-x, .5) * 100%);
  top: calc(var(--knob-y, .6) * 100%);
  width: calc(var(--knob-r, .12) * 200%);
  aspect-ratio: 1;
  translate: -50% -50%;
  padding: 0;
  border: 0;
  border-radius: 50%;
  background: none;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}
.machine__knob img { display: block; width: 100%; height: 100%; pointer-events: none; }
.machine__knob:disabled { cursor: default; }
.machine__knob:focus-visible { outline: 4px solid var(--sun); outline-offset: 4px; }
```
- 工具列與剩餘標籤:
```css
.draw-group { display: grid; justify-items: center; gap: 6px; }
.remain-tag {
  margin: 0;
  padding: 4px 14px;
  border-radius: 999px;
  border: 3px solid var(--ink);
  background: var(--cream);
  font-size: 15px;
  font-variant-numeric: tabular-nums;
}
```
- `@media (max-height: 560px)` 裡的 `.machine { width: … }` 那行刪掉(容器查詢已經處理矮螢幕)

`gashapon/css/animations.css`:刪掉 `float-capsule`、`.machine__capsules circle`、`blink`、`twinkle`,其餘保留。

- [ ] **Step 5: 改 `main.js`**

```js
import { loadAnchors, anchorVars, DEFAULT_ANCHORS } from './machine-art.js';
```

`createMachineView({...})` 改成:
```js
const view = createMachineView({
  remainTag: $('remainTag'),
  emptyState: $('emptyState'),
  drawBtn: $('drawBtn'),
  knob: $('knob'),
  soundBtn: $('soundBtn'),
  soundIcon: $('soundIcon'),
});
```

錨點(放在 `createRevealer` 之前):
```js
// 錨點先用內建預設值,讀到 anchors.json 再換掉。讀不到也不擋抽獎。
let anchors = DEFAULT_ANCHORS;
function applyAnchors(a) {
  anchors = a;
  for (const [k, v] of Object.entries(anchorVars(a))) $('machine').style.setProperty(k, v);
}
applyAnchors(DEFAULT_ANCHORS);
loadAnchors().then(applyAnchors);
```

`createRevealer({...})` 拿掉 `eyes`、`capsuleGroup`,加上 `getAnchors: () => anchors`。

`$('drawBtn').addEventListener(...)` 下面加:
```js
// 點把手跟按「轉!」一樣(小孩會直接去戳機台上看起來能轉的東西)
$('knob').addEventListener('click', () => doDraw());
```

- [ ] **Step 6: 改 `reveal.js`**

最上面加 `import { outletPoint } from './machine-art.js';`

`slotOffset()` 換成:
```js
  // 蛋是從扭蛋機的出蛋口滾出來的。出蛋口的位置來自 anchors.json(插畫上量出來的),
  // 乘上機台當下的實際位置,換成相對於畫面正中央那顆蛋的位移。
  function slotOffset() {
    const out = outletPoint(els.machine.getBoundingClientRect(), els.getAnchors());
    const capsule = els.capsule.getBoundingClientRect();
    return {
      x: out.x - (capsule.left + capsule.width / 2),
      y: out.y - (capsule.top + capsule.height / 2),
    };
  }
```

`turn()` 換成:
```js
    // 轉把手:把手轉一圈,機身先壓扁、彈回、再左右晃。機台沒有臉(2026-10-01 決定),
    // 圓頂裡的蛋是插畫的一部分,跟著機身一起晃。這段畫面不變暗,重點就是看機台。
    async turn() {
      sfx.crank();
      await Promise.all([
        animate(els.knob,
          [{ transform: 'rotate(0deg)' }, { transform: 'rotate(360deg)' }],
          DURATION.turn, { easing: 'cubic-bezier(.45,0,.2,1)', fill: 'none' }),
        animate(els.machine, [
          { transform: 'scale(1, 1) rotate(0deg)' },
          { transform: 'scale(1.04, .94) rotate(0deg)', offset: .18 },
          { transform: 'scale(.97, 1.04) rotate(0deg)', offset: .36 },
          { transform: 'scale(1, 1) rotate(-1.8deg)', offset: .55 },
          { transform: 'scale(1, 1) rotate(1.8deg)', offset: .75 },
          { transform: 'scale(1, 1) rotate(0deg)' },
        ], DURATION.turn, { easing: 'ease-in-out', fill: 'none' }),
      ]);
      sfx.clunk();
    },
```

`.machine` 加上 `transform-origin: 50% 100%;`(壓扁時從腳底往下壓,不是從中心縮)——寫進 Step 4 的 `.machine` 規則。

- [ ] **Step 7: 跑全部測試**

Run: `node --test`
Expected: 全部 PASS(含 `modules.test.js` 的語法檢查)

- [ ] **Step 8: Commit**

```bash
git add gashapon/ test/gashapon-art.test.js
git commit -m "feat(gashapon): illustrated machine with tappable knob, fills the stage"
```

---

### Task 6: 切片 ① 截圖驗收 → **停下來讓使用者看**

- [ ] **Step 1: 起伺服器**

Run(背景):`python3 -m http.server 8765`(repo 根目錄)

- [ ] **Step 2: 截圖**

用 claude-in-chrome(或 headless + DevTools Protocol 模擬裝置寬度)截以下畫面,**每張寫明用哪種方式截的**:
1. 1440×900 筆電,待機
2. 1280×720 窄筆電,確認機台沒碰到吉祥物
3. 390×844 手機直式
4. 844×390 手機橫式:機台縮小、工具列與「剩 X 顆」都看得到、整頁沒有捲軸(`document.documentElement.scrollHeight <= innerHeight`)
5. 按把手那一刻(轉的中途)與蛋從出蛋口冒出來的那一格 —— 確認蛋的起點真的在出蛋口
6. 在設定把「抽到的就拿走」關掉 → 剩餘標籤消失

- [ ] **Step 3: 手動流程**

點把手抽一次、按「轉!」抽一次、演出中點一下跳過、「再抽一次」、抽到空(把手跟「轉!」都不能按)、演出中切到別的分頁再切回來(不卡在遮罩上)。

- [ ] **Step 4: 量外框粗細(給 Task 15 用)**

在 1440×900 的畫面上,用 javascript_tool 或截圖放大量 `machine.webp` 外框在畫面上的實際粗細(px),記在回報裡。

- [ ] **Step 5: 🛑 停下來:把截圖給使用者驗收**

使用者要求改的地方就地改、重截、再問。**使用者明確說可以才進切片 ②。**

---

# 切片 ② 扭蛋殼

### Task 7: 殼的純函式

**Files:**
- Modify: `tools/mascot-gen/gashapon_art.py`
- Test: `tools/mascot-gen/test_gashapon_art.py`

**Interfaces:**
- Produces:
  - `to_tint_gray(rgba: np.ndarray, white: int = 225) -> np.ndarray` —— RGB 三通道相等(灰階),`>= white` 的拉到 255,其餘線性拉伸,alpha 不動
  - `split_at(rgba: np.ndarray, y: int) -> tuple[np.ndarray, np.ndarray]` —— 上半 `[:y]`、下半 `[y:]`
  - `split_cells(rgb: np.ndarray, n: int) -> list[np.ndarray]` —— 橫向等分 n 格

- [ ] **Step 1: 寫失敗的測試**(加在 `test_gashapon_art.py`)

```python
from gashapon_art import to_tint_gray, split_at, split_cells


class TintGray(unittest.TestCase):
    def test_channels_equal_and_alpha_kept(self):
        rgba = np.array([[[200, 100, 50, 128]]], np.uint8)
        g = to_tint_gray(rgba)
        self.assertEqual(g[0, 0, 0], g[0, 0, 1]); self.assertEqual(g[0, 0, 1], g[0, 0, 2])
        self.assertEqual(g[0, 0, 3], 128)

    def test_light_becomes_pure_white(self):
        # 模型畫的「白」常常是淡灰或偏暖;拉到 255 上色後才會是準確的稀有度色
        self.assertEqual(to_tint_gray(np.array([[[235, 230, 228, 255]]], np.uint8))[0, 0, 0], 255)

    def test_dark_outline_stays_dark(self):
        self.assertLess(to_tint_gray(np.array([[[87, 66, 57, 255]]], np.uint8))[0, 0, 0], 90)


class Split(unittest.TestCase):
    def test_split_at(self):
        top, bottom = split_at(np.zeros((10, 4, 4), np.uint8), 3)
        self.assertEqual(top.shape[0], 3); self.assertEqual(bottom.shape[0], 7)

    def test_split_cells(self):
        cells = split_cells(np.zeros((10, 50, 3), np.uint8), 5)
        self.assertEqual([c.shape[1] for c in cells], [10] * 5)
```

- [ ] **Step 2: 確認失敗**

Run: `cd tools/mascot-gen && .venv/bin/python -m unittest test_gashapon_art -v`
Expected: FAIL,`ImportError: cannot import name 'to_tint_gray'`

- [ ] **Step 3: 實作**(加在 `gashapon_art.py`)

```python
def to_tint_gray(rgba, white=225):
    """轉成給程式上色用的灰階:亮度 >= white 的當成純白(上色後就是準確的稀有度色),
    其餘線性拉伸。模型偶爾偷帶一點顏色也沒關係,這裡全部洗掉。"""
    rgb = rgba[..., :3].astype(np.float32)
    lum = rgb @ np.array([0.299, 0.587, 0.114], np.float32)
    g = np.clip(lum / white * 255, 0, 255).astype(np.uint8)
    return np.dstack([g, g, g, rgba[..., 3]])


def split_at(rgba, y):
    return rgba[:y], rgba[y:]


def split_cells(rgb, n):
    w = rgb.shape[1] // n
    return [rgb[:, i * w:(i + 1) * w] for i in range(n)]
```

- [ ] **Step 4: 確認通過**,**Step 5: Commit**

```bash
git add tools/mascot-gen/gashapon_art.py tools/mascot-gen/test_gashapon_art.py
git commit -m "feat(gashapon-art): grayscale-for-tint and split helpers"
```

---

### Task 8: 生成殼 → **停下來讓使用者挑** → build

**Files:**
- Modify: `tools/mascot-gen/gashapon.py`、`gashapon_prompts.json`
- Create: `gashapon/img/shell-{N,R,SR,SSR,UR}-{top,bottom}.webp`

**Interfaces:**
- Consumes: Task 7;Task 2 的 `generate`、`webp`、`cutout`、`restamp`
- Produces: CLI `shells [--separate]`、`pick shells-sheet <n> --seams y1,…,y5`、`pick shell-<R> <n> --seams y`、`build-shells`;改寫 `gashapon/css/style.css` 裡 10 個 `url(../img/shell-…webp)` 的 `?v=`

- [ ] **Step 1: 提示詞**(加進 `gashapon_prompts.json`)

```json
"shell_style": "flat 2D cartoon illustration, cute chibi style, thick dark brown outlines, grayscale only, white and light gray, no colors",
"shells_sheet": "five round capsule toys in one row with thin white gaps between them, each capsule seen from the front with a horizontal seam line across its middle, the decoration gets fancier from left to right: 1 plain with no pattern, 2 diagonal stripes, 3 small stars, 4 a little crown on top and a thick ornate band, 5 small wings on both sides and sparkles, isolated on a solid flat bright pure green #00FF00 background",
"shells": {
  "N": "one round capsule toy seen from the front with a horizontal seam line across its middle, plain with no pattern",
  "R": "one round capsule toy seen from the front with a horizontal seam line across its middle, diagonal stripes",
  "SR": "one round capsule toy seen from the front with a horizontal seam line across its middle, small stars all over",
  "SSR": "one round capsule toy seen from the front with a horizontal seam line across its middle, a little crown on top and a thick ornate band",
  "UR": "one round capsule toy seen from the front with a horizontal seam line across its middle, small wings on both sides and sparkles"
}
```
單張的提示詞結尾也接上 `, isolated on a solid flat bright pure green #00FF00 background`。

- [ ] **Step 2: CLI**(加進 `gashapon.py`)

```python
from gashapon_art import to_tint_gray, split_at, split_cells

RARITIES = ['N', 'R', 'SR', 'SSR', 'UR']
GREEN = ', isolated on a solid flat bright pure green #00FF00 background'


def cmd_shells(args):
    cfg = load_cfg()
    if args.separate:
        for r in RARITIES:
            generate(f'{cfg["shell_style"]}, {cfg["shells"][r]}{GREEN}', cfg['negative'], 768, 768, f'shell-{r}')
    else:
        generate(f'{cfg["shell_style"]}, {cfg["shells_sheet"]}', cfg['negative'], 2560, 512, 'shells-sheet')


def shell_sources(cfg):
    """回傳 {rarity: (rgb ndarray, seam_y)}。拼圖有被挑中就切 5 格,否則用各自挑中的那張。"""
    picks = cfg.get('picks', {})
    if 'shells-sheet' in picks:
        p = picks['shells-sheet']
        rgb = np.asarray(Image.open(OUT / 'shells-sheet' / f's{p["n"]}.png').convert('RGB'))
        return dict(zip(RARITIES, zip(split_cells(rgb, 5), p['seams'])))
    missing = [r for r in RARITIES if f'shell-{r}' not in picks]
    if missing:
        sys.exit(f'還沒 pick:{", ".join("shell-" + r for r in missing)}')
    out = {}
    for r in RARITIES:
        p = picks[f'shell-{r}']
        out[r] = (np.asarray(Image.open(OUT / f'shell-{r}' / f's{p["n"]}.png').convert('RGB')), p['seams'][0])
    return out


def cmd_build_shells(args):
    css = ROOT / 'gashapon' / 'css' / 'style.css'
    for r, (rgb, seam) in shell_sources(load_cfg()).items():
        rgba = keep_largest(key_border(rgb))
        x0, y0, x1, y1 = Image.fromarray(rgba).getbbox()
        gray = to_tint_gray(rgba[y0:y1, x0:x1])
        for half, part in zip(['top', 'bottom'], split_at(gray, seam - y0)):
            im = Image.fromarray(part)
            im = im.resize((256, round(256 * im.height / im.width)), Image.LANCZOS)
            path = IMG / f'shell-{r}-{half}.webp'
            webp(im, path)
            restamp(css, f'../img/shell-{r}-{half}.webp', path)
    print('shells done')
```

比較頁(加進 `REVIEW_SECTIONS`):
```python
def review_shells():
    out = []
    d = OUT / 'shells-sheet'
    figs = []
    for f in sorted(d.glob('s*.png')) if d.exists() else []:
        n = f.stem[1:]
        figs.append(figure('shells-sheet', f, 960, [f'點第 {i} 顆的上下分界線' for i in range(1, 6)],
                           f"`pick shells-sheet {n} --seams ${{pts.map(p => p[1]).join(',')}}`", lines=True))
    out.append(section('shells-sheet', figs))
    for r in RARITIES:
        d = OUT / f'shell-{r}'
        figs = []
        for f in sorted(d.glob('s*.png')) if d.exists() else []:
            n = f.stem[1:]
            figs.append(figure(f'shell-{r}', f, 280, ['點上下分界線'], f"`pick shell-{r} {n} --seams ${{pts[0][1]}}`", lines=True))
        out.append(section(f'shell-{r}', figs))
    return '\n'.join(out)

REVIEW_SECTIONS.append(review_shells)
```
`COMMANDS` 加 `'shells': cmd_shells, 'build-shells': cmd_build_shells`;`main()` 加 `s = sub.add_parser('shells'); s.add_argument('--separate', action='store_true')` 與 `sub.add_parser('build-shells')`。

- [ ] **Step 3: 生成拼圖、Claude 先篩**

Run: `COMFY_URL=http://192.168.68.53:8188 tools/mascot-gen/.venv/bin/python tools/mascot-gen/gashapon.py shells && tools/mascot-gen/.venv/bin/python tools/mascot-gen/gashapon.py review`

用 Read 看三張:格數不是 5、大小差很多、花紋沒有越來越華麗、帶顏色 → 標出原因。三張都不行 → 改跑 `shells --separate`(5 × 3 張)再 review。

- [ ] **Step 4: 🛑 停下來:請使用者在比較頁挑圖並點分界線**,貼回 `pick …` 那行。**不要自己挑。**

- [ ] **Step 5: pick 與 build**

Run: `… gashapon.py pick …`(使用者給的),然後 `… gashapon.py build-shells`
Expected: `gashapon/img/` 多 10 張 `shell-*.webp`。用 Read 看其中兩張,確認上下兩半切在分界線、灰階、背景透明。

(這時 `style.css` 還沒有引用,`restamp` 什麼都不會改,Task 9 寫完 CSS 後要再跑一次 `build-shells`。)

- [ ] **Step 6: Commit**

```bash
git add gashapon/img/shell-*.webp tools/mascot-gen/gashapon.py tools/mascot-gen/gashapon_prompts.json
git commit -m "feat(gashapon): grayscale capsule shells for five rarities"
```

---

### Task 9: 殼接上演出(CSS 上色 + 預載閘門)

**Files:**
- Create: `gashapon/js/shells.js`
- Modify: `gashapon/css/style.css`(`.capsule__half` 一段)、`gashapon/js/main.js`
- Test: `test/gashapon-ui.test.js`、`test/gashapon-art.test.js`

**Interfaces:**
- Consumes: `RARITIES`(`constants.js`)
- Produces:
  - `SHELL_URLS: string[]` —— 10 個相對於 `gashapon/` 的路徑(不含 `?v=`)
  - `preloadImages(urls, load = url => decodeImage(url)): Promise<boolean>` —— 全部成功回 `true`,任何一張失敗回 `false`,**不丟例外**
  - `<body>` 上的 class `shells-ready`:預載成功才加上;CSS 的遮罩規則全部掛在它底下

- [ ] **Step 1: 寫失敗的測試**

加進 `test/gashapon-ui.test.js`:
```js
import { SHELL_URLS, preloadImages } from '../gashapon/js/shells.js';

test('SHELL_URLS:5 個稀有度 × 上下兩半', () => {
  assert.equal(SHELL_URLS.length, 10);
  assert.ok(SHELL_URLS.includes('img/shell-UR-bottom.webp'));
});

test('preloadImages:全部成功 → true;有一張失敗 → false,不丟例外', async () => {
  assert.equal(await preloadImages(['a', 'b'], () => Promise.resolve()), true);
  assert.equal(await preloadImages(['a', 'b'], u => (u === 'b' ? Promise.reject(new Error('404')) : Promise.resolve())), false);
});
```

加進 `test/gashapon-art.test.js`:
```js
import { RARITIES } from '../gashapon/js/constants.js';

test('10 張殼都存在', () => {
  for (const r of RARITIES) for (const h of ['top', 'bottom']) {
    assert.ok(existsSync(join(root, `gashapon/img/shell-${r}-${h}.webp`)), `${r}-${h}`);
  }
});

test('每個稀有度都有遮罩規則,而且掛在 .shells-ready 底下(圖沒載好前蛋不能隱形)', () => {
  const css = read('gashapon/css/style.css');
  for (const r of RARITIES) {
    const re = new RegExp(`\\.shells-ready \\.capsule\\[data-rarity="${r}"\\] \\.capsule__half--top[^{]*\\{[^}]*mask-image:\\s*url\\(\\.\\./img/shell-${r}-top\\.webp`);
    assert.match(css, re, `${r} top`);
  }
  assert.ok(!/^\.capsule\[data-rarity="\w+"\] \.capsule__half[^{]*\{[^}]*mask-image/m.test(css), '遮罩規則不能在 .shells-ready 外面');
});
```

- [ ] **Step 2: 確認失敗**:`node --test test/gashapon-ui.test.js test/gashapon-art.test.js` → FAIL

- [ ] **Step 3: 實作 `shells.js`**

```js
// 扭蛋殼的圖(灰階,由 CSS 依稀有度上色)。
// mask-image 的圖還沒載入時,瀏覽器把它當成全透明 —— 蛋會整顆隱形。
// 所以先預載,全部到齊才在 <body> 加上 .shells-ready,遮罩規則都掛在它底下;
// 沒到齊之前蛋是純色半圓,難看一點但看得到。
import { RARITIES } from './constants.js';

export const SHELL_URLS = Object.freeze(
  RARITIES.flatMap(r => [`img/shell-${r}-top.webp`, `img/shell-${r}-bottom.webp`]),
);

function decodeImage(url) {
  const img = new Image();
  img.src = url;
  return img.decode();
}

export async function preloadImages(urls, load = decodeImage) {
  const results = await Promise.allSettled(urls.map(u => load(u)));
  return results.every(r => r.status === 'fulfilled');
}
```

`main.js` 加:
```js
import { SHELL_URLS, preloadImages } from './shells.js';
// 預載要用跟 CSS 同一個網址(含 ?v=),不然是兩份快取。從 CSS 規則裡讀不方便,
// 所以只拿路徑預載:就算 ?v= 不同,這一步的目的只是確認檔案在、讓 .shells-ready 不會太早加上。
preloadImages(SHELL_URLS).then(ok => { if (ok) document.body.classList.add('shells-ready'); });
```

- [ ] **Step 4: 改 CSS**

`.capsule__half` 一段整個換成:
```css
/* 殼:灰階圖當遮罩裁出形狀,底色是稀有度色,再疊一層同一張灰階圖 multiply,
   白的地方顯示稀有度色、外框與花紋的暗部留下來。顏色由程式(tokens 的 --r-X-a/b)決定,
   不畫在圖上(issue #5 共同規則)。
   .shells-ready 之前(圖還沒到)退回純色半圓 —— mask 圖沒載入時元素會整個隱形。 */
.capsule__half {
  position: absolute;
  left: 0;
  width: 100%;
  height: 50%;
  background: var(--half-a);
}
.capsule__half--top { top: 0; border-radius: 999px 999px 0 0; }
.capsule__half--bottom { top: 50%; border-radius: 0 0 999px 999px; background: var(--half-b); }

.shells-ready .capsule__half {
  border-radius: 0;
  -webkit-mask: var(--shell) center / 100% 100% no-repeat;
  mask: var(--shell) center / 100% 100% no-repeat;
}
.shells-ready .capsule__half::after {
  content: "";
  position: absolute;
  inset: 0;
  background: var(--shell) center / 100% 100% no-repeat;
  mix-blend-mode: multiply;
}
```
然後每個稀有度兩條(共 10 條;`mask-image` 字樣要出現,測試靠它):
```css
.shells-ready .capsule[data-rarity="N"] .capsule__half--top    { --shell: url(../img/shell-N-top.webp);    mask-image: url(../img/shell-N-top.webp); }
.shells-ready .capsule[data-rarity="N"] .capsule__half--bottom { --shell: url(../img/shell-N-bottom.webp); mask-image: url(../img/shell-N-bottom.webp); }
/* R / SR / SSR / UR 同樣格式,各兩條 */
```
(R、SR、SSR、UR 各兩條要**實際寫出來**,共 10 條,格式跟 N 一模一樣、只換稀有度代號。)

刪掉舊的 `.capsule__half--top::after` 白色高光規則與 `.capsule__half` 的 `border` 宣告。UR 那條 `.capsule[data-rarity="UR"] .capsule__half { background: var(--rainbow); animation: shimmer … }` 保留。

- [ ] **Step 5: 重新 stamp 並跑測試**

Run: `tools/mascot-gen/.venv/bin/python tools/mascot-gen/gashapon.py build-shells && node --test`
Expected: 全部 PASS;`style.css` 裡 10 個 url 都帶 `?v=`

- [ ] **Step 6: Commit**

```bash
git add gashapon/ test/
git commit -m "feat(gashapon): tinted capsule shells behind a preload gate"
```

---

### Task 10: 切片 ② 截圖驗收 → **停下來讓使用者看**

- [ ] **Step 1:** 用 javascript_tool 改 localStorage 或在設定裡建一台「只有一個 UR 獎項」的機器,抽一次,在每個 `upgrade` 之後截圖(N → R → SR → SSR → UR 五張殼都要入鏡)。可以用 DevTools 的動畫面板把速度調到 10% 再截。
- [ ] **Step 2:** 用 DevTools 把網路設成 Slow 3G、清快取重新整理後馬上抽一次:蛋要看得到(純色半圓),不能隱形。
- [ ] **Step 3:** 裂開那一格截圖:上下兩半分開飛走,切口對齊。
- [ ] **Step 4: 🛑 停下來把截圖給使用者驗收。** 使用者說可以才進切片 ③。

---

# 切片 ③ 揭曉卡片外框

### Task 11: `shared/js/tint.js`(TDD)

**Files:**
- Create: `shared/js/tint.js`
- Test: `test/tint.test.js`

**Interfaces:**
- Produces:
  - `colorToMatrix(hex: string): number[]` —— 20 個數,`feColorMatrix type="matrix"` 用
  - `tintColorFor(meta: {color, edge}): string` —— `color === 'rainbow'` 時回 `edge`,否則 `color`
  - `mountTintFilters(metaByKey: Record<string, {color, edge}>, doc = document): SVGSVGElement` —— 插入隱藏 `<svg>`,每個 key 一個 `<filter id="tint-<key>">`;重複呼叫不重複插入(同一個 id 的 svg 已存在就替換)

- [ ] **Step 1: 寫失敗的測試**

```js
// 九宮格外框的上色:灰階 → 稀有度色(效果等於 multiply,alpha 原樣保留)。
import test from 'node:test';
import assert from 'node:assert/strict';
import { colorToMatrix, tintColorFor, mountTintFilters } from '../shared/js/tint.js';
import { RARITIES, RARITY_META } from '../gashapon/js/constants.js';

test('colorToMatrix:白色 → 單位矩陣(灰階原樣)', () => {
  assert.deepEqual(colorToMatrix('#FFFFFF'), [1,0,0,0,0, 0,1,0,0,0, 0,0,1,0,0, 0,0,0,1,0]);
});

test('colorToMatrix:黑色 → RGB 全 0,alpha 保留', () => {
  assert.deepEqual(colorToMatrix('#000000'), [0,0,0,0,0, 0,0,0,0,0, 0,0,0,0,0, 0,0,0,1,0]);
});

test('colorToMatrix:#5FD68A 的對角係數', () => {
  const m = colorToMatrix('#5FD68A');
  assert.equal(m[0].toFixed(4), (0x5F / 255).toFixed(4));
  assert.equal(m[6].toFixed(4), (0xD6 / 255).toFixed(4));
  assert.equal(m[12].toFixed(4), (0x8A / 255).toFixed(4));
});

test('tintColorFor:UR 的哨兵值 rainbow 改用 edge', () => {
  assert.equal(tintColorFor(RARITY_META.UR), '#8B5CF6');
  assert.equal(tintColorFor(RARITY_META.R), '#5FD68A');
});

test('mountTintFilters:每個稀有度一個 filter,重複呼叫不會疊兩份', () => {
  const doc = fakeDoc();
  mountTintFilters(RARITY_META, doc);
  mountTintFilters(RARITY_META, doc);
  assert.equal(doc.body.children.length, 1);
  const ids = doc.body.children[0].children.map(f => f.attrs.id);
  assert.deepEqual(ids, RARITIES.map(r => `tint-${r}`));
});

function fakeDoc() {
  const make = tag => ({
    tag, attrs: {}, children: [],
    setAttribute(k, v) { this.attrs[k] = v; },
    appendChild(c) { this.children.push(c); return c; },
    replaceWith(n) { const i = doc.body.children.indexOf(this); doc.body.children[i] = n; },
  });
  const doc = {
    body: make('body'),
    createElementNS: (_, tag) => make(tag),
    getElementById: id => doc.body.children.find(c => c.attrs.id === id) ?? null,
  };
  return doc;
}
```

- [ ] **Step 2: 確認失敗**:`node --test test/tint.test.js` → FAIL

- [ ] **Step 3: 實作**

```js
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
```

(`color-interpolation-filters="sRGB"` 很重要:預設是 linearRGB,上出來的顏色會偏淡。)

- [ ] **Step 4: 確認通過**,**Step 5: Commit**

```bash
git add shared/js/tint.js test/tint.test.js
git commit -m "feat(shared): SVG tint filters for grayscale assets"
```

---

### Task 12: 外框的純函式與生成指令

**Files:**
- Modify: `tools/mascot-gen/gashapon_art.py`、`test_gashapon_art.py`、`gashapon.py`、`gashapon_prompts.json`

**Interfaces:**
- Produces:
  - `normalize_edges(rgba: np.ndarray, frac: float = 0.25) -> np.ndarray` —— 四條邊的中段(`frac` 到 `1-frac`)改成邊上正中間那一欄/列重複出來的像素;四角與中央不動
  - CLI `frames [--one]`、`pick frame-<R> <n>` / `pick frame-one <n>`、`build-frames` → `shared/img/frames/frame-{N,R,SR,SSR,UR}.webp`;改寫 `shared/css/prize-frame.css` 的 `?v=`

- [ ] **Step 1: 寫失敗的測試**

```python
from gashapon_art import normalize_edges


class NormalizeEdges(unittest.TestCase):
    def test_top_edge_middle_is_uniform_copy_of_center_column(self):
        a = np.random.default_rng(0).integers(0, 255, (40, 40, 4), dtype=np.uint8)
        out = normalize_edges(a, 0.25)
        band = out[:10, 10:30]
        self.assertTrue((band == out[:10, 20:21]).all())

    def test_corners_untouched(self):
        a = np.random.default_rng(1).integers(0, 255, (40, 40, 4), dtype=np.uint8)
        out = normalize_edges(a, 0.25)
        self.assertTrue((out[:10, :10] == a[:10, :10]).all())
        self.assertTrue((out[30:, 30:] == a[30:, 30:]).all())

    def test_left_edge_middle_is_uniform_copy_of_center_row(self):
        a = np.random.default_rng(2).integers(0, 255, (40, 40, 4), dtype=np.uint8)
        out = normalize_edges(a, 0.25)
        self.assertTrue((out[10:30, :10] == out[20:21, :10]).all())
```

- [ ] **Step 2: 確認失敗**

- [ ] **Step 3: 實作**

```python
def normalize_edges(rgba, frac=0.25):
    """九宮格外框的四條邊會被 border-image 拉伸。模型畫的邊不保證均勻,拉長後會看到
    被拉歪的花紋。這裡把每條邊的中段換成「邊上正中間那一條像素」重複出來,保證拉伸不變形。"""
    out = rgba.copy()
    h, w = out.shape[:2]
    sy, sx = round(h * frac), round(w * frac)
    cx, cy = w // 2, h // 2
    out[:sy, sx:w - sx] = out[:sy, cx:cx + 1]
    out[h - sy:, sx:w - sx] = out[h - sy:, cx:cx + 1]
    out[sy:h - sy, :sx] = out[cy:cy + 1, :sx]
    out[sy:h - sy, w - sx:] = out[cy:cy + 1, w - sx:]
    return out
```

- [ ] **Step 4: 提示詞與 CLI**

`gashapon_prompts.json` 加:
```json
"frame_style": "flat 2D cartoon illustration, cute style, thick dark brown outlines, grayscale only, white and light gray, no colors",
"frame_base": "a square decorative picture frame seen straight on, the frame is a band about one eighth of the width, the inside of the frame is completely empty and filled with the background, the four straight sides are plain simple bands without pattern, decorations only at the four corners",
"frames": {
  "N": "plain rounded corners with no decoration",
  "R": "a small leaf at each corner",
  "SR": "a small star at each corner",
  "SSR": "a small crown at each corner with a dotted inner line",
  "UR": "small wings and sparkles at each corner with a dotted inner line"
},
"frame_one": "a small star at each corner"
```

`gashapon.py` 加:
```python
FRAMES = ROOT / 'shared' / 'img' / 'frames'


def cmd_frames(args):
    cfg = load_cfg()
    items = {'one': cfg['frame_one']} if args.one else cfg['frames']
    for key, deco in items.items():
        generate(f'{cfg["frame_style"]}, {cfg["frame_base"]}, {deco}{GREEN}', cfg['negative'], 1024, 1024, f'frame-{key}')


def cmd_build_frames(args):
    picks = load_cfg().get('picks', {})
    # 退路(Q13):九宮格分別生不出來時只挑一款,5 個稀有度共用、只靠濾鏡換色
    src = {r: picks['frame-one'] for r in RARITIES} if 'frame-one' in picks else {r: picks.get(f'frame-{r}') for r in RARITIES}
    missing = [r for r, p in src.items() if not p]
    if missing:
        sys.exit(f'還沒 pick:{", ".join("frame-" + r for r in missing)}')
    FRAMES.mkdir(parents=True, exist_ok=True)
    css = ROOT / 'shared' / 'css' / 'prize-frame.css'
    for r, p in src.items():
        name = 'frame-one' if 'frame-one' in picks else f'frame-{r}'
        full, _ = cutout(OUT / name / f's{p["n"]}.png')
        im = Image.fromarray(normalize_edges(to_tint_gray(full))).resize((512, 512), Image.LANCZOS)
        path = FRAMES / f'frame-{r}.webp'
        webp(im, path)
        if css.exists():
            restamp(css, f'../img/frames/frame-{r}.webp', path)
    print('frames done')
```

**注意 `cutout` 的 `keep_largest`**:外框中間是鏤空的,`key_border` 從邊緣往內填色**碰不到**框內那塊綠底。所以外框要另外處理框內:在 `cmd_build_frames` 裡改用 `key_green`(`post.py` 現成的純綠去背)對整張圖做一次,再 `keep_largest`。也就是把 `cutout(...)` 換成:
```python
        rgb = np.asarray(Image.open(OUT / name / f's{p["n"]}.png').convert('RGB'))
        rgba = keep_largest(key_green(rgb))
        x0, y0, x1, y1 = Image.fromarray(rgba).getbbox()
        full = rgba[y0:y1, x0:x1]
```
(`from post import key_green` 加到 import。)

比較頁(只要挑,不用點):
```python
def review_frames():
    out = []
    for key in [*RARITIES, 'one']:
        d = OUT / f'frame-{key}'
        figs = []
        for f in sorted(d.glob('s*.png')) if d.exists() else []:
            figs.append(figure(f'frame-{key}', f, 280, [], f"`pick frame-{key} {f.stem[1:]}`"))
        out.append(section(f'frame-{key}', figs))
    return '\n'.join(out)

REVIEW_SECTIONS.append(review_frames)
```
`COMMANDS` 加 `'frames': cmd_frames, 'build-frames': cmd_build_frames`;`main()` 加 `f = sub.add_parser('frames'); f.add_argument('--one', action='store_true')` 與 `sub.add_parser('build-frames')`。

- [ ] **Step 5: 確認 Python 測試通過**,**Step 6: Commit**

```bash
git add tools/mascot-gen/
git commit -m "feat(gashapon-art): nine-slice frame generation with edge normalisation"
```

---

### Task 13: 生成外框 → **停下來讓使用者挑** → build

- [ ] **Step 1:** `COMFY_URL=… gashapon.py frames && gashapon.py review`
- [ ] **Step 2: Claude 先篩**:用 Read 看 15 張。不合格條件:框內不是空的、四條邊上有花紋(拉伸會壞)、框寬度差太多、帶顏色。**五個稀有度裡有任何一個三張都不合格** → 告訴使用者,建議改走退路 `frames --one`。
- [ ] **Step 3: 🛑 停下來:請使用者挑**(每個稀有度一張,或決定走退路)。**不要自己挑,也不要自己決定走退路。**
- [ ] **Step 4:** `pick frame-<R> <n>` × 5(或 `pick frame-one <n>`),`build-frames`。用 Read 看 `shared/img/frames/frame-SR.webp`:四邊中段是均勻的、中間透明。
- [ ] **Step 5: Commit**

```bash
git add shared/img/frames/ tools/mascot-gen/gashapon_prompts.json
git commit -m "feat(shared): grayscale prize-card frames"
```

---

### Task 14: 外框接上揭曉卡片

**Files:**
- Create: `shared/css/prize-frame.css`
- Modify: `gashapon/index.html`(加 stylesheet、`#prizeCard` 加 class)、`gashapon/css/style.css`(刪 `.prize-card::before` 虛線)、`gashapon/js/main.js`(`mountTintFilters`)、`gashapon/js/reveal.js`(`show()` 設 `card.dataset.rarity` —— 已經有了,確認即可)
- Test: `test/gashapon-art.test.js`

**Interfaces:**
- Consumes: Task 11 `mountTintFilters`;`RARITY_META`
- Produces: class `.prize-frame`,吃 `data-rarity`;給 3D 之後用(這次不接)

- [ ] **Step 1: 寫失敗的測試**

```js
test('5 張外框都存在,prize-frame.css 每個稀有度都有圖和濾鏡', () => {
  const css = read('shared/css/prize-frame.css');
  for (const r of RARITIES) {
    assert.ok(existsSync(join(root, `shared/img/frames/frame-${r}.webp`)), r);
    assert.match(css, new RegExp(`\\[data-rarity="${r}"\\][^{]*\\{[^}]*frame-${r}\\.webp\\?v=[0-9a-f]{8}[^}]*url\\(#tint-${r}\\)`), r);
  }
});

test('卡片內距不小於外框寬度(長名字不會壓到四角裝飾)', () => {
  const css = read('shared/css/prize-frame.css');
  const w = Number(/--frame-w:\s*(\d+)px/.exec(css)?.[1]);
  const pad = Number(/\.prize-frame\s*\{[^}]*padding:\s*calc\(var\(--frame-w\)\s*\+\s*(\d+)px\)/.exec(css)?.[1]);
  assert.ok(w > 0 && pad >= 0, 'padding 要寫成 calc(var(--frame-w) + Npx)');
});

test('扭蛋機的揭曉卡片用了 prize-frame,也引用了 prize-frame.css', () => {
  const html = read('gashapon/index.html');
  assert.match(html, /class="prize-card prize-frame"/);
  assert.match(html, /href="\.\.\/shared\/css\/prize-frame\.css"/);
});
```

- [ ] **Step 2: 確認失敗**

- [ ] **Step 3: `shared/css/prize-frame.css`**

```css
/* 揭曉卡片的九宮格外框。外框圖是灰階的,由 shared/js/tint.js 插入的 SVG 濾鏡
   依稀有度上色(border-image 沒辦法直接上色;mask-border 只有 Safari 支援)。
   濾鏡只套在 ::before 上,卡片裡的文字跟按鈕不會被染到。
   扭蛋機在用;立體扭蛋機之後加上 .prize-frame 與 data-rarity 就能用(issue #6)。 */
.prize-frame {
  --frame-w: 34px;
  position: relative;
  padding: calc(var(--frame-w) + 6px);
  border: 0;
}
.prize-frame::before {
  content: "";
  position: absolute;
  inset: 0;
  border-style: solid;
  border-width: var(--frame-w);
  border-image-slice: 25% fill;
  border-image-width: var(--frame-w);
  border-image-repeat: stretch;
  pointer-events: none;
}
.prize-frame[data-rarity="N"]::before   { border-image-source: url(../img/frames/frame-N.webp);   filter: url(#tint-N); }
.prize-frame[data-rarity="R"]::before   { border-image-source: url(../img/frames/frame-R.webp);   filter: url(#tint-R); }
.prize-frame[data-rarity="SR"]::before  { border-image-source: url(../img/frames/frame-SR.webp);  filter: url(#tint-SR); }
.prize-frame[data-rarity="SSR"]::before { border-image-source: url(../img/frames/frame-SSR.webp); filter: url(#tint-SSR); }
/* UR 轉色:filter 清單裡有 url() 就不能內插(會直接跳格),所以改成動畫一個註冊過型別的
   自訂屬性 --frame-hue,filter 讀它。 */
@property --frame-hue { syntax: '<angle>'; inherits: false; initial-value: 0deg; }
.prize-frame[data-rarity="UR"]::before  { border-image-source: url(../img/frames/frame-UR.webp);  filter: url(#tint-UR) hue-rotate(var(--frame-hue)); animation: frame-rainbow 3.2s linear infinite; }

@keyframes frame-rainbow {
  to { --frame-hue: 360deg; }
}
```

注意:`border-image-slice: 25% fill` 的 `fill` 會把圖的中央也畫出來 —— 中央是透明的,所以卡片的奶油色底(`.prize-card` 的 `background: var(--cream)`)會透出來。卡片原本的 `border` 與 `border-radius` 要拿掉(由外框圖負責外形),`background` 改成只鋪在外框內側:`.prize-card.prize-frame { background: none; } .prize-card.prize-frame::after { content: ""; position: absolute; inset: calc(var(--frame-w) * .5); background: var(--cream); border-radius: 18px; z-index: -1; }`,`.prize-card` 加 `isolation: isolate` 讓 `z-index: -1` 不跑到遮罩後面。

測試要的 regex(`[data-rarity="X"]…frame-X.webp?v=…url(#tint-X)`)需要 `?v=`:寫完 CSS 後跑 `gashapon.py build-frames` 一次讓它 stamp。

- [ ] **Step 4: 接線**

`gashapon/index.html` `<head>` 加 `<link rel="stylesheet" href="../shared/css/prize-frame.css">`(在 `css/style.css` 之後);`<div class="prize-card" id="prizeCard" hidden>` 改成 `<div class="prize-card prize-frame" id="prizeCard" data-rarity="N" hidden>`。

`gashapon/css/style.css`:刪掉 `.prize-card::before`(虛線)規則,`.prize-card` 的 `padding`、`border`、`border-radius`、`box-shadow` 刪掉(交給 `.prize-frame`)。

`main.js`:
```js
import { mountTintFilters } from '../../shared/js/tint.js';
import { RARITY_META } from './constants.js';
// 外框的上色濾鏡要在第一次揭曉前就在頁面上;filter: url(#…) 指到不存在的濾鏡時,
// 有的瀏覽器會整個元素不畫。
mountTintFilters(RARITY_META);
```

- [ ] **Step 5: `node --test` 全綠**,**Step 6: Commit**

```bash
git add shared/css/prize-frame.css gashapon/ test/
git commit -m "feat(gashapon): nine-slice tinted frame on the prize card"
```

- [ ] **Step 7: 截圖驗收 → 🛑 停下來讓使用者看**

截 5 個稀有度的揭曉卡片(用只有一個獎項的機器逐一切換稀有度);再截一張**獎項名稱 24 個字、沒有空格**的(在設定裡改名);一張 390 寬手機的。檢查:字沒有壓在四角、外框沒被撐破、UR 會轉色、卡片內文字沒有被染色。**使用者說可以才進切片 ④。**

---

# 切片 ④ SVG 圖示

### Task 15: `shared/img/icons.svg` 與扭蛋機頁換圖示

**Files:**
- Create: `shared/img/icons.svg`
- Modify: `gashapon/index.html`(←、🔊、⚙️ 三處)、`gashapon/js/ui-machine.js`(`setSoundIcon`)、`gashapon/css/style.css`(`.icon` 規則、刪 `.is-muted`)、`shared/css/tokens.css`(加 `--icon-stroke`)
- Test: `test/gashapon-art.test.js`、`test/gashapon-ui.test.js`

**Interfaces:**
- Consumes: Task 6 Step 4 量到的機台外框粗細(px)
- Produces: symbol id `home`、`sound-on`、`sound-off`、`settings`;`soundIcon` 現在是 `<use>` 元素,`setSoundIcon(on)` 改它的 `href`

- [ ] **Step 1: 寫失敗的測試**

`test/gashapon-art.test.js`:
```js
test('icons.svg 有 4 個 symbol,扭蛋機頁引用的 id 都存在', () => {
  const svg = read('shared/img/icons.svg');
  const ids = [...svg.matchAll(/<symbol\b[^>]*\bid="([^"]+)"/g)].map(m => m[1]);
  assert.deepEqual(ids.sort(), ['home', 'settings', 'sound-off', 'sound-on']);
  const used = [...read('gashapon/index.html').matchAll(/icons\.svg#([\w-]+)/g)].map(m => m[1]);
  assert.ok(used.length >= 3, '扭蛋機頁至少用到 3 個圖示');
  for (const id of used) assert.ok(ids.includes(id), id);
  assert.ok(!/[🔊🔇⚙]/u.test(read('gashapon/index.html')), '扭蛋機頁不能再有 emoji 圖示');
});

test('圖示只用 currentColor 跟 --icon-stroke,沒有寫死的顏色或漸層', () => {
  const svg = read('shared/img/icons.svg');
  assert.ok(!/#[0-9a-fA-F]{3,6}\b/.test(svg), '不要寫死顏色');
  assert.ok(!/Gradient/.test(svg), '不要漸層');
});
```

`test/gashapon-ui.test.js` 的 `el()` 加 `href: { baseVal: '' }` 與 `setAttribute(k, v) { this[k] = v; }`,加:
```js
test('setSoundIcon:開 → sound-on,關 → sound-off', () => {
  const { els, view } = viewWith();
  view.setSoundIcon(true);
  assert.match(els.soundIcon.href, /#sound-on$/);
  view.setSoundIcon(false);
  assert.match(els.soundIcon.href, /#sound-off$/);
});
```

- [ ] **Step 2: 確認失敗**

- [ ] **Step 3: 畫 sprite**

`shared/img/icons.svg`(viewBox 32×32;`stroke-width` 用 CSS 變數,所以寫在 `<use>` 外層的 CSS,不寫在 symbol 裡):
```svg
<svg xmlns="http://www.w3.org/2000/svg">
  <!-- 全站共用圖示。畫風跟插畫一樣:currentColor 外框、圓頭圓角、平塗、不用漸層。
       線條粗細由使用端的 CSS 變數 --icon-stroke 決定(對齊機台插畫外框在畫面上的粗細)。 -->
  <symbol id="home" viewBox="0 0 32 32">
    <path d="M19 7 L10 16 L19 25" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"/>
  </symbol>
  <symbol id="sound-on" viewBox="0 0 32 32">
    <path d="M6 12 H11 L17 7 V25 L11 20 H6 Z" fill="var(--icon-fill, white)" stroke="currentColor" stroke-linejoin="round"/>
    <path d="M21 12 Q24 16 21 20 M24 9 Q29 16 24 23" fill="none" stroke="currentColor" stroke-linecap="round"/>
  </symbol>
  <symbol id="sound-off" viewBox="0 0 32 32">
    <path d="M6 12 H11 L17 7 V25 L11 20 H6 Z" fill="var(--icon-fill, white)" stroke="currentColor" stroke-linejoin="round"/>
    <path d="M21 12 L28 20 M28 12 L21 20" fill="none" stroke="currentColor" stroke-linecap="round"/>
  </symbol>
  <symbol id="settings" viewBox="0 0 32 32">
    <path d="M16 4 L18.5 7.5 L22.6 6.4 L23.2 10.6 L27.2 12 L25.4 16 L27.2 20 L23.2 21.4 L22.6 25.6 L18.5 24.5 L16 28 L13.5 24.5 L9.4 25.6 L8.8 21.4 L4.8 20 L6.6 16 L4.8 12 L8.8 10.6 L9.4 6.4 L13.5 7.5 Z" fill="var(--icon-fill, white)" stroke="currentColor" stroke-linejoin="round"/>
    <circle cx="16" cy="16" r="4" fill="none" stroke="currentColor"/>
  </symbol>
</svg>
```
(內部填色用 `var(--icon-fill, white)`,不寫 `#fff` —— 「不要寫死顏色」的測試抓的是 hex。)

- [ ] **Step 4: 接到頁面**

`gashapon/index.html`:
```html
<a class="home-link home-link--corner" href="../" aria-label="回首頁"><svg class="icon" aria-hidden="true"><use href="../shared/img/icons.svg#home"/></svg></a>
...
<button class="icon-btn" id="soundBtn" type="button" aria-label="音效開關"><svg class="icon" aria-hidden="true"><use id="soundIcon" href="../shared/img/icons.svg#sound-on"/></svg></button>
...
<button class="icon-btn" id="settingsBtn" type="button" aria-label="設定"><svg class="icon" aria-hidden="true"><use href="../shared/img/icons.svg#settings"/></svg></button>
```

`shared/css/tokens.css` 的 `:root` 加 `--icon-stroke: <Task 6 量到的 px 換算成 32 格 viewBox 的單位>;`。換算:`icon 顯示寬度 28px`,外框實際 `T px` → `--icon-stroke: calc(T * 32 / 28)`,寫成數字(例如量到 4px → `4.6`)。

`gashapon/css/style.css`:
```css
.icon { width: 28px; height: 28px; color: var(--ink); stroke-width: var(--icon-stroke); overflow: visible; }
.icon-btn .icon { display: block; margin: auto; }
```
刪掉 `.is-muted`。

`ui-machine.js` 的 `setSoundIcon`:
```js
    setSoundIcon(on) {
      els.soundIcon.setAttribute('href', `../shared/img/icons.svg#${on ? 'sound-on' : 'sound-off'}`);
    },
```

- [ ] **Step 5: `node --test` 全綠**,**Step 6: Commit**

```bash
git add shared/img/icons.svg shared/css/tokens.css gashapon/ test/
git commit -m "feat(shared): hand-drawn SVG icon sprite, used on the gashapon page"
```

- [ ] **Step 7: 截圖驗收 → 🛑 停下來讓使用者看**

截一張 1440×900:圖示、機台、吉祥物在同一個畫面裡;再截一張圖示區塊放大 3 倍的。問使用者「風格對得上嗎?」。不行 → 依使用者的意見調整 path / 粗細再截,**兩輪還對不上就問使用者要不要改用生成**(spec Q8 的退路),不要自己決定。

---

# 切片 ⑤ 首頁扭蛋機卡片

### Task 16: 合成首頁卡片

**Files:**
- Modify: `tools/mascot-gen/gashapon_art.py`、`test_gashapon_art.py`(`compose_card`)
- Modify: `tools/mascot-gen/home.py`(`build-cards --only`)、`home_prompts.json`(`cards.gashapon` 改成只有背景)
- Modify: `index.html:18`、`css/home.css`(`.card__art--gashapon`)、`test/home-images.test.js`
- Create: `img/home/gashapon.webp`

**Interfaces:**
- Consumes: `gashapon/img/machine.webp`
- Produces: `compose_card(bg: Image, machine: Image, height_frac: float = 0.82) -> Image`(RGB,大小 = bg,機台底部置中、底邊離下緣 4%)

- [ ] **Step 1: 寫失敗的測試**

```python
from PIL import Image
from gashapon_art import compose_card


class ComposeCard(unittest.TestCase):
    def test_machine_centered_and_scaled(self):
        bg = Image.new('RGB', (400, 300), (0, 0, 255))
        m = Image.new('RGBA', (30, 40), (255, 0, 0, 255))
        out = compose_card(bg, m, 0.5)
        self.assertEqual(out.size, (400, 300))
        self.assertEqual(out.getpixel((200, 250)), (255, 0, 0))   # 機台在底部中間
        self.assertEqual(out.getpixel((10, 10)), (0, 0, 255))     # 其他地方是背景
```

- [ ] **Step 2: 確認失敗**,**Step 3: 實作**

```python
def compose_card(bg, machine, height_frac=0.82):
    """首頁卡片:背景是 z_image 生的雪地,機台直接用扭蛋機頁的那張 —— 兩邊保證是同一台。"""
    out = bg.convert('RGB').copy()
    h = round(out.height * height_frac)
    w = round(machine.width * h / machine.height)
    m = machine.convert('RGBA').resize((w, h), Image.LANCZOS)
    x = (out.width - w) // 2
    y = out.height - h - round(out.height * 0.04)
    out.paste(m, (x, y), m)
    return out
```

- [ ] **Step 4: 改 `home.py`**

- `home_prompts.json` 的 `cards.gashapon` 改成:`"soft snowy ground with gentle hills, a few colorful round capsule toys scattered on the snow near the bottom, a big empty space in the middle of the picture, no machine, no objects in the center"`
- `cmd_build_cards` 支援 `--only`:
```python
def cmd_build_cards(args):
    DEST.mkdir(parents=True, exist_ok=True)
    cfg = load_cfg()
    modes = [args.only] if args.only else MODES
    picks = cfg.get('picks', {})
    missing = [m for m in modes if m not in picks and 'sheet' not in picks]
    if missing:
        sys.exit(f'還沒 pick:{", ".join(missing)}')
    for m in modes:
        im = Image.open(OUT / m / f's{picks[m]}.png').convert('RGB') if m in picks else card_images(cfg)[m]
        if m == 'gashapon':
            # 機台用扭蛋機頁那張,不讓 z_image 另外畫一台(spec 切片 ⑤)
            im = compose_card(im, Image.open(ROOT / 'gashapon' / 'img' / 'machine.webp'))
        webp(im.resize((640, 480), Image.LANCZOS), DEST / f'{m}.webp')
    report()
```
`main()` 的 `build-cards` 加 `--only`;`from gashapon_art import compose_card`。

- [ ] **Step 5: 生成背景 → 🛑 停下來讓使用者挑**

Run: `COMFY_URL=… home.py cards --only gashapon && home.py review`。Claude 先篩(中間有東西、畫了機台的淘汰),請使用者挑,回覆「gashapon 選 n」。**不要自己挑。**

- [ ] **Step 6:** `home.py pick gashapon <n> && home.py build-cards --only gashapon`。用 Read 看 `img/home/gashapon.webp`。

- [ ] **Step 7: 改首頁與測試**

`test/home-images.test.js` 加:
```js
test('扭蛋機卡片用了插畫', () => {
  assert.ok(refs().some(p => p.endsWith('img/home/gashapon.webp')), refs().join('\n'));
});
```
`refs()` 裡的路徑先 `split('?')[0]` 再檢查存在。

`index.html:18` 改成 `<img class="card__art card__art--img" src="img/home/gashapon.webp?v=<hash>" alt="" aria-hidden="true">`,雜湊用 `gashapon_art.content_hash` 算(或在 `cmd_build_cards` 結尾呼叫 `stamp` 改寫 `index.html`,建議後者,寫進 Step 4 的函式)。

`css/home.css` 加(規格照 issue #5:4:3、撐滿卡片內緣):
```css
.card__art--img {
  width: 100%;
  height: auto;
  aspect-ratio: 4 / 3;
  border-radius: 14px;
  border: 3px solid var(--ink);
  object-fit: cover;
}
```
刪掉 `.card__art--gashapon` 的漸層規則。

- [ ] **Step 8: `node --test` 全綠、Python 測試全綠**,**Step 9: Commit**

```bash
git add tools/mascot-gen/ index.html css/home.css img/home/gashapon.webp test/home-images.test.js
git commit -m "feat(home): gashapon card composed from the machine illustration"
```

- [ ] **Step 10: 截圖驗收 → 🛑 停下來讓使用者看**(首頁 1440×900 與 390 寬)

---

# 收尾

### Task 17: issue #5、README、整體檢查

- [ ] **Step 1: README**:`立體扭蛋機` 從「規劃中」那行拿出來,改成跟扭蛋機一樣列為已上線(一句話描述:「看蛋在球裡滾來滾去」)。Commit:`docs: README 更新立體扭蛋機狀態`
- [ ] **Step 2: 🛑 issue #5 要改的內容先給使用者看**(這是對外的修改):把「扭蛋機本體維持 CSS」那行換成「扭蛋機本體改成插畫 + 把手圖層(2026-10-01 決定,見 `docs/superpowers/specs/2026-10-01-gashapon-visual-refresh-design.md`)」,並在最後加一段「已由 gashapon-visual-refresh 分支完成」。使用者同意後才跑 `gh issue edit 5 --body-file …`
- [ ] **Step 3: 全部測試**:`node --test` 與 `tools/mascot-gen/.venv/bin/python -m unittest discover tools/mascot-gen`,貼出結果
- [ ] **Step 4: 再走一次 Task 6 Step 3 的手動流程**,加上 3D 扭蛋機頁打開確認沒有被影響(這次沒改它,但它 import 了 `gashapon/js/constants.js` 與 `state.js`)
- [ ] **Step 5:** 交給 `superpowers:finishing-a-development-branch`
