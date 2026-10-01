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
from post import key_border, keep_largest, key_green
from gashapon_art import anchors_from_pick, cut_disk, content_hash, stamp, clear_green_fringe, to_tint_gray, split_at, split_cells, square_about_seam, normalize_edges

ROOT = Path(__file__).resolve().parents[2]
HERE = Path(__file__).resolve().parent
OUT = HERE / 'out' / 'gashapon'
CFG = HERE / 'gashapon_prompts.json'
IMG = ROOT / 'gashapon' / 'img'
FRAMES = ROOT / 'shared' / 'img' / 'frames'
SEEDS = [11, 22, 33]
MACHINE_W, MACHINE_H = 768, 1024
RARITIES = ['N', 'R', 'SR', 'SSR', 'UR']
GREEN = ', isolated on a solid flat bright pure green #00FF00 background'


def load_cfg():
    return json.loads(CFG.read_text())


def save_cfg(cfg):
    CFG.write_text(json.dumps(cfg, ensure_ascii=False, indent=2) + '\n')


def generate(prompt, negative, w, h, name, seeds=SEEDS):
    d = OUT / name
    d.mkdir(parents=True, exist_ok=True)
    for n, seed in enumerate(seeds, 1):
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
    seeds = [int(v) for v in args.seeds.split(',')] if args.seeds else SEEDS
    generate(f'{cfg["style"]}, {cfg["machine"]}', cfg['negative'], MACHINE_W, MACHINE_H, 'machine', seeds)


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


def review_frames():
    out = []
    for key in [*RARITIES, 'one']:
        d = OUT / f'frame-{key}'
        figs = []
        for f in sorted(d.glob('s*.png')) if d.exists() else []:
            figs.append(figure(f'frame-{key}', f, 280, [], f"`pick frame-{key} {f.stem[1:]}`"))
        out.append(section(f'frame-{key}', figs))
    return '\n'.join(out)


REVIEW_SECTIONS = [review_machine, review_shells, review_frames]


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
    rgba = keep_largest(clear_green_fringe(key_border(rgb)))
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
        rgba = keep_largest(clear_green_fringe(key_border(rgb)))
        x0, y0, x1, y1 = Image.fromarray(rgba).getbbox()
        gray, mid = square_about_seam(to_tint_gray(rgba[y0:y1, x0:x1]), seam - y0)
        for half, part in zip(['top', 'bottom'], split_at(gray, mid)):
            im = Image.fromarray(part).resize((256, 128), Image.LANCZOS)
            path = IMG / f'shell-{r}-{half}.webp'
            webp(im, path)
            restamp(css, f'../img/shell-{r}-{half}.webp', path)
    print('shells done')


def cmd_frames(args):
    cfg = load_cfg()
    items = {'one': cfg['frame_one']} if args.one else cfg['frames']
    for key, deco in items.items():
        generate(f'{cfg["frame_style"]}, {cfg["frame_base"]}, {deco}{GREEN}', cfg['negative'], 1024, 1024, f'frame-{key}')


def cmd_build_frames(args):
    picks = load_cfg().get('picks', {})
    # 退路(Q13):九宮格分別生不出來時只挑一款,5 個稀有度共用、只靠濾鏡換色
    one = 'frame-one' in picks
    src = {r: picks['frame-one'] for r in RARITIES} if one else {r: picks.get(f'frame-{r}') for r in RARITIES}
    missing = [r for r, p in src.items() if not p]
    if missing:
        sys.exit(f'還沒 pick:{", ".join("frame-" + r for r in missing)}')
    FRAMES.mkdir(parents=True, exist_ok=True)
    css = ROOT / 'shared' / 'css' / 'prize-frame.css'
    for r, p in src.items():
        name = 'frame-one' if one else f'frame-{r}'
        # 外框中間是鏤空的:key_border 從邊緣往內填色碰不到框內的綠底,所以用純綠去背對整張做
        rgb = np.asarray(Image.open(OUT / name / f's{p["n"]}.png').convert('RGB'))
        rgba = keep_largest(key_green(rgb))
        x0, y0, x1, y1 = Image.fromarray(rgba).getbbox()
        im = Image.fromarray(normalize_edges(to_tint_gray(rgba[y0:y1, x0:x1]))).resize((512, 512), Image.LANCZOS)
        path = FRAMES / f'frame-{r}.webp'
        webp(im, path)
        if css.exists():
            restamp(css, f'../img/frames/frame-{r}.webp', path)
    print('frames done')


COMMANDS = {'machine': cmd_machine, 'review': cmd_review, 'pick': cmd_pick, 'build-machine': cmd_build_machine,
            'shells': cmd_shells, 'build-shells': cmd_build_shells,
            'frames': cmd_frames, 'build-frames': cmd_build_frames}


def main():
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest='cmd', required=True)
    m = sub.add_parser('machine'); m.add_argument('--seeds', help='逗號分隔,例如 44,55,66(多抽幾張)')
    sub.add_parser('review')
    p = sub.add_parser('pick')
    p.add_argument('name'); p.add_argument('n', type=int)
    p.add_argument('--knob'); p.add_argument('--outlet'); p.add_argument('--seams')
    sub.add_parser('build-machine')
    sh = sub.add_parser('shells'); sh.add_argument('--separate', action='store_true')
    sub.add_parser('build-shells')
    fr = sub.add_parser('frames'); fr.add_argument('--one', action='store_true')
    sub.add_parser('build-frames')
    args = ap.parse_args()
    COMMANDS[args.cmd](args)


if __name__ == '__main__':
    main()
