"""大亂鬥道具圖示(2026-10-12,issue #4):劍、盾、補包、飛彈。

在 repo 根目錄執行(先 export COMFY_URL=http://<ComfyUI 那台的 IP>:8188):
  PY=tools/mascot-gen/.venv/bin/python
  $PY tools/mascot-gen/smash.py sheet                 # 先試一張 2x2 拼圖,3 個 seed → out/smash/sheet/s{1,2,3}.png
  $PY tools/mascot-gen/smash.py gen attack            # 拼圖不行就分開生成,3 個 seed → out/smash/attack/s{1,2,3}.png
  $PY tools/mascot-gen/smash.py review [--bg PATH]    # 去背、疊在盤面截圖上並排 → review/smash.html
  $PY tools/mascot-gen/smash.py pick attack 2         # 或 pick sheet 2(四格一起)
  $PY tools/mascot-gen/smash.py build                 # 輸出 smash/img/items/*.webp、蓋 ?v= 到 smash/js/art.js、重產 preload.json
"""
import argparse
import io
import json
import re
import sys
from pathlib import Path

import numpy as np
from PIL import Image

import comfy
from gashapon import webp, write_preload_manifest
from gashapon_art import content_hash
from ghostleg_art import cut_green, fit_height

ROOT = Path(__file__).resolve().parents[2]
HERE = Path(__file__).resolve().parent
OUT = HERE / 'out' / 'smash'
REVIEW = HERE / 'review' / 'smash'
CFG = HERE / 'smash_prompts.json'
IMG = ROOT / 'smash' / 'img' / 'items'
ART_JS = ROOT / 'smash' / 'js' / 'art.js'
ITEMS = ['attack', 'shield', 'spin', 'missile']
SHEET_ORDER = ['attack', 'shield', 'spin', 'missile']   # 左上、右上、左下、右下
SEEDS = [11, 22, 33]


def load_cfg():
    return json.loads(CFG.read_text())


def save_cfg(cfg):
    CFG.write_text(json.dumps(cfg, ensure_ascii=False, indent=2) + '\n')


def upload_ref(cfg):
    # 參考圖是透明背景的 webp,先鋪成綠底再上傳(Qwen 會照參考圖的底色畫)
    ref = Image.open(ROOT / cfg['ref']).convert('RGBA')
    flat = Image.new('RGB', ref.size, (0, 255, 0))
    flat.paste(ref, mask=ref.split()[3])
    buf = io.BytesIO()
    flat.save(buf, 'PNG')
    return comfy.upload(buf.getvalue(), 'smash_ref.png')


def generate(name, prompt, seeds):
    cfg = load_cfg()
    ref = upload_ref(cfg)
    d = OUT / name
    d.mkdir(parents=True, exist_ok=True)
    for n, seed in enumerate(seeds, 1):
        imgs = comfy.run(comfy.graph_edit([ref], f'{cfg["style"]} {prompt}', seed, f'smash_{name}_s{n}'))
        (d / f's{n}.png').write_bytes(comfy.fetch(imgs[0]))
        print(f'{name} s{n} seed={seed}', flush=True)


def cmd_sheet(args):
    generate('sheet', load_cfg()['sheet'], SEEDS)


def cmd_gen(args):
    seeds = [int(v) for v in args.seeds.split(',')] if args.seeds else SEEDS
    generate(args.name, load_cfg()[args.name], seeds)


def split_sheet(src):
    im = Image.open(src).convert('RGB')
    w, h = im.size
    boxes = [(0, 0, w // 2, h // 2), (w // 2, 0, w, h // 2), (0, h // 2, w // 2, h), (w // 2, h // 2, w, h)]
    return {name: im.crop(box) for name, box in zip(SHEET_ORDER, boxes)}


def icon_cut(img):
    rgba = cut_green(np.asarray(img.convert('RGB'))).copy()
    # cut_green 只清掉跟外框連著的綠幕;補包把手、劍柄圍起來的小洞裡還有綠,也一併挖掉
    r, g, b = (rgba[..., i].astype(int) for i in range(3))
    rgba[(g > r + 60) & (g > b + 60), 3] = 0
    cut = Image.fromarray(rgba)
    return fit_height(cut.crop(cut.getbbox()), 256)


def candidates():
    """{item: [(label, PIL.Image), ...]} —— 拼圖切開的與單獨生成的都列進來。"""
    out = {i: [] for i in ITEMS}
    for src in sorted((OUT / 'sheet').glob('s*.png')):
        for name, im in split_sheet(src).items():
            out[name].append((f'sheet-{src.stem}', im))
    for i in ITEMS:
        for src in sorted((OUT / i).glob('s*.png')):
            out[i].append((src.stem, Image.open(src)))
    return out


def cmd_review(args):
    # 候選圖疊在實際盤面上看(使用者看的是合成在畫面裡的樣子,不是綠底原圖)
    bg = Path(args.bg) if args.bg else REVIEW / 'stadium.png'
    REVIEW.mkdir(parents=True, exist_ok=True)
    bg_rel = bg.relative_to(REVIEW.parent).as_posix() if bg.exists() else ''
    html = ['<!doctype html><meta charset=utf-8><body style="background:#EAF6FD;font:14px system-ui">']
    for item, cands in candidates().items():
        cells = []
        for label, im in cands:
            dst = REVIEW / item / f'{label}.png'
            dst.parent.mkdir(parents=True, exist_ok=True)
            icon_cut(im).save(dst)
            cells.append(
                f'<figure style="display:inline-grid;justify-items:center;margin:8px;padding:8px;'
                f'background:url({bg_rel}) center/cover"><img src="smash/{item}/{label}.png" style="height:72px">'
                f'<img src="smash/{item}/{label}.png" style="height:28px;margin-top:6px">'
                f'<figcaption style="background:#fff8">{label}</figcaption></figure>')
        html.append(f'<div><b>{item}</b><br>{"".join(cells)}</div>')
    (REVIEW.parent / 'smash.html').write_text('\n'.join(html))
    print('開 http://localhost:8765/tools/mascot-gen/review/smash.html(先在 repo 根目錄 python3 -m http.server 8765)')


def cmd_pick(args):
    cfg = load_cfg()
    if args.name == 'sheet':
        for i in ITEMS:
            cfg['picks'][i] = f'sheet-s{args.n}'
    else:
        cfg['picks'][args.name] = f's{args.n}'
    save_cfg(cfg)


def picked_image(item, label):
    if label.startswith('sheet-'):
        return split_sheet(OUT / 'sheet' / f'{label[len("sheet-"):]}.png')[item]
    return Image.open(OUT / item / f'{label}.png')


def cmd_build(args):
    cfg = load_cfg()
    missing = [i for i in ITEMS if i not in cfg['picks']]
    if missing:
        sys.exit(f'還沒 pick:{", ".join(missing)}')
    IMG.mkdir(parents=True, exist_ok=True)
    lines = []
    for i in ITEMS:
        path = IMG / f'{i}.webp'
        webp(icon_cut(picked_image(i, cfg['picks'][i])), path, q=80)
        lines.append(f"  {i}: new URL('../img/items/{i}.webp?v={content_hash(path)}', import.meta.url).href,")
    ART_JS.write_text(
        '// 大亂鬥道具圖示的網址(tools/mascot-gen/smash.py build 產生,不要手改)。\n'
        '// 帶 ?v= 內容雜湊:Pages 會快取 10 分鐘,換圖不換網址的話小孩會看到舊圖。\n'
        'export const ITEM_URLS = {\n' + '\n'.join(lines) + '\n};\n')
    write_preload_manifest()
    print('smash item icons done')


def main():
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest='cmd', required=True)
    sub.add_parser('sheet')
    g = sub.add_parser('gen'); g.add_argument('name', choices=ITEMS); g.add_argument('--seeds')
    r = sub.add_parser('review'); r.add_argument('--bg')
    p = sub.add_parser('pick'); p.add_argument('name', choices=ITEMS + ['sheet']); p.add_argument('n', type=int)
    sub.add_parser('build')
    args = ap.parse_args()
    {'sheet': cmd_sheet, 'gen': cmd_gen, 'review': cmd_review, 'pick': cmd_pick, 'build': cmd_build}[args.cmd](args)


if __name__ == '__main__':
    main()
