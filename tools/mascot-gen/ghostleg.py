"""阿彌陀籤素材(2026-10-02,issue #3)。

在 repo 根目錄執行(先 export COMFY_URL=http://<ComfyUI 那台的 IP>:8188):
  PY=tools/mascot-gen/.venv/bin/python
  $PY tools/mascot-gen/ghostleg.py gen rabbit            # Qwen-Image 照吉祥物畫風,3 個 seed → out/ghostleg/rabbit/s{1,2,3}.png
  $PY tools/mascot-gen/ghostleg.py review                # 去背 + 用 6 種玩家色染色並排 → 開 review/ghostleg.html
  $PY tools/mascot-gen/ghostleg.py pick rabbit 2
  $PY tools/mascot-gen/ghostleg.py build                 # 輸出 ghostleg/img/**.webp、蓋 ?v= 到 ghostleg/js/art.js、重產 preload.json
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
from ghostleg_art import cut_white, cut_green, fit_height

ROOT = Path(__file__).resolve().parents[2]
HERE = Path(__file__).resolve().parent
OUT = HERE / 'out' / 'ghostleg'
REVIEW = HERE / 'review' / 'ghostleg'
CFG = HERE / 'ghostleg_prompts.json'
IMG = ROOT / 'ghostleg' / 'img'
ART_JS = ROOT / 'ghostleg' / 'js' / 'art.js'
ANIMALS = ['snowman', 'rabbit', 'penguin', 'reindeer', 'cat', 'dog']
SEEDS = [11, 22, 33]
REVIEW_COLORS = ['#E4572E', '#4C9F70', '#3D7EA6', '#E8B830', '#8E6BBF', '#D96BA0']


def load_cfg():
    return json.loads(CFG.read_text())


def save_cfg(cfg):
    CFG.write_text(json.dumps(cfg, ensure_ascii=False, indent=2) + '\n')


def cmd_gen(args):
    cfg = load_cfg()
    # 參考圖是透明背景的 webp,先鋪成綠底再上傳(Qwen 會照參考圖的底色畫)
    ref_png = Image.open(ROOT / cfg['animal_ref']).convert('RGBA')
    flat = Image.new('RGB', ref_png.size, (0, 255, 0))
    flat.paste(ref_png, mask=ref_png.split()[3])
    buf = io.BytesIO()
    flat.save(buf, 'PNG')
    ref = comfy.upload(buf.getvalue(), 'ghostleg_ref.png')
    seeds = [int(v) for v in args.seeds.split(',')] if args.seeds else SEEDS
    d = OUT / args.name
    d.mkdir(parents=True, exist_ok=True)
    for n, seed in enumerate(seeds, 1):
        imgs = comfy.run(comfy.graph_edit([ref], f'{cfg["animal_style"]} {cfg[args.name]}', seed, f'ghostleg_{args.name}_s{n}'))
        (d / f's{n}.png').write_bytes(comfy.fetch(imgs[0]))
        print(f'{args.name} s{n} seed={seed}', flush=True)


def tint(rgba, hex_color):
    """跟 ghostleg/js/tint.js 同一套:multiply 上玩家色,alpha 不變。"""
    c = np.array([int(hex_color[i:i + 2], 16) for i in (1, 3, 5)], np.float32) / 255
    out = rgba.copy()
    out[..., :3] = (rgba[..., :3].astype(np.float32) * c).round().astype(np.uint8)
    return out


def animal_cut(src):
    return fit_height(Image.fromarray(cut_green(np.asarray(Image.open(src).convert('RGB')))), 256)


def cmd_review(args):
    rows = []
    for name in ANIMALS:
        for src in sorted((OUT / name).glob('s*.png')):
            cut = np.asarray(animal_cut(src))
            for k, col in enumerate(REVIEW_COLORS):
                dst = REVIEW / name / f'{src.stem}_{k}.png'
                dst.parent.mkdir(parents=True, exist_ok=True)
                Image.fromarray(tint(cut, col)).save(dst)
            rows.append((name, src.stem))
    html = ['<!doctype html><meta charset=utf-8><body style="background:#BFE1F7;font:14px system-ui">']
    for name, stem in rows:
        imgs = ''.join(f'<img src="ghostleg/{name}/{stem}_{k}.png" style="height:120px">' for k in range(len(REVIEW_COLORS)))
        html.append(f'<div><b>{name} {stem}</b><br>{imgs}</div>')
    (REVIEW.parent / 'ghostleg.html').write_text('\n'.join(html))
    print('開 http://localhost:8765/tools/mascot-gen/review/ghostleg.html(先在 repo 根目錄 python3 -m http.server 8765)')


def cmd_pick(args):
    cfg = load_cfg()
    cfg.setdefault('picks', {}).setdefault('animals', {})[args.name] = args.n
    save_cfg(cfg)


def url_line(key, rel, digest):
    return f"  {key}: new URL('{rel}?v={digest}', import.meta.url).href,"


def cmd_build(args):
    cfg = load_cfg()
    picks = cfg['picks']
    animals = picks.get('animals', {})
    missing = [a for a in ANIMALS if a not in animals]
    if missing and not args.allow_missing:
        sys.exit(f'還沒 pick:{", ".join(missing)}(只想先輸出獎品 / 冰板就加 --allow-missing)')
    (IMG / 'animals').mkdir(parents=True, exist_ok=True)
    (IMG / 'prizes').mkdir(parents=True, exist_ok=True)
    animal_lines, prize_lines = [], []
    for a in ANIMALS:
        if a not in animals:
            continue
        path = IMG / 'animals' / f'{a}.webp'
        webp(animal_cut(OUT / a / f's{animals[a]}.png'), path, q=80)
        animal_lines.append(url_line(a, f'../img/animals/{a}.webp', content_hash(path)))
    for tier, rel in picks['prizes'].items():
        path = IMG / 'prizes' / f'{tier}.webp'
        webp(fit_height(Image.fromarray(cut_white(np.asarray(Image.open(OUT / rel).convert('RGB')))), 256), path, q=80)
        prize_lines.append(url_line(tier, f'../img/prizes/{tier}.webp', content_hash(path)))
    board = IMG / 'board.webp'
    webp(Image.open(OUT / picks['board']).convert('RGB').resize((512, 896), Image.LANCZOS), board, q=78)
    text = ART_JS.read_text()
    text = re.sub(r'export const ANIMAL_URLS = \{[^}]*\};', 'export const ANIMAL_URLS = {\n' + '\n'.join(animal_lines) + '\n};', text)
    text = re.sub(r'export const PRIZE_URLS = \{[^}]*\};', 'export const PRIZE_URLS = {\n' + '\n'.join(prize_lines) + '\n};', text)
    text = re.sub(r"export const BOARD_URL = [^;]*;", f"export const BOARD_URL = new URL('../img/board.webp?v={content_hash(board)}', import.meta.url).href;", text)
    ART_JS.write_text(text)
    write_preload_manifest()
    print('ghostleg art done')


def main():
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest='cmd', required=True)
    g = sub.add_parser('gen'); g.add_argument('name', choices=ANIMALS); g.add_argument('--seeds')
    sub.add_parser('review')
    p = sub.add_parser('pick'); p.add_argument('name', choices=ANIMALS); p.add_argument('n', type=int)
    b = sub.add_parser('build'); b.add_argument('--allow-missing', action='store_true')
    args = ap.parse_args()
    {'gen': cmd_gen, 'review': cmd_review, 'pick': cmd_pick, 'build': cmd_build}[args.cmd](args)


if __name__ == '__main__':
    main()
