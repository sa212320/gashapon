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
    # 每一輪生成都保留在 out/gashapon/machine-rN/,最新一輪在 machine/。全部列出來,舊的也挑得到。
    out = []
    dirs = sorted(OUT.glob("machine-r*"), key=lambda d: int(d.name[9:])) + ([OUT / "machine"] if (OUT / "machine").exists() else [])
    for d in reversed(dirs):
        out.append(review_machine_dir(d))
    return '\n'.join(out)


def review_machine_dir(d):
    name = d.name
    figs = []
    for f in sorted(d.glob('s*.png')) if d.exists() else []:
        n = f.stem[1:]
        js = (f"`pick {name} {n} --knob ${{pts[0][0]}},${{pts[0][1]}},"
              f"${{Math.round(Math.hypot(pts[1][0]-pts[0][0], pts[1][1]-pts[0][1]))}} --outlet ${{pts[2][0]}},${{pts[2][1]}}`")
        figs.append(figure(name, f, 300, ['點把手圓心', '點把手邊緣', '點出蛋口'], js, ring=True))
    return section(name, figs)


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
    key = args.name
    if args.name.startswith('machine'):
        # 機台可以從任何一輪挑(machine-r5 …),紀錄裡存來源資料夾
        key, pick['dir'] = 'machine', args.name
        if not (args.knob and args.outlet):
            sys.exit('machine 要給 --knob cx,cy,r 跟 --outlet x,y')
        pick['knob'] = [int(v) for v in args.knob.split(',')]
        pick['outlet'] = [int(v) for v in args.outlet.split(',')]
    if args.seams:
        pick['seams'] = [int(v) for v in args.seams.split(',')]
    cfg.setdefault('picks', {})[key] = pick
    save_cfg(cfg)
    print(f'{key} ← {pick}')


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
    full, bbox = cutout(OUT / pick.get('dir', 'machine') / f's{pick["n"]}.png')
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
