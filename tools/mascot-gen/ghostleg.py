"""阿彌陀籤素材(2026-10-02,issue #3)。

在 repo 根目錄執行(先 export COMFY_URL=http://<ComfyUI 那台的 IP>:8188):
  PY=tools/mascot-gen/.venv/bin/python
  $PY tools/mascot-gen/ghostleg.py gen rabbit            # Qwen-Image 照吉祥物畫風,3 個 seed → out/ghostleg/rabbit/s{1,2,3}.png
  $PY tools/mascot-gen/ghostleg.py review                # 去背並排(墊玩家色圓座)→ 開 review/ghostleg.html
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
ANIMALS = ['snowman', 'rabbit', 'penguin', 'reindeer', 'cat', 'dog', 'bear', 'seal', 'owl', 'hamster']
SEEDS = [11, 22, 33]


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


def animal_cut(src):
    return fit_height(Image.fromarray(cut_green(np.asarray(Image.open(src).convert('RGB')))), 256)


def cmd_review(args):
    # 動物不染色(2026-10-02 檢查點 3),去背後直接並排;底下墊一塊玩家色的圓座,看站在棋子上的樣子
    html = ['<!doctype html><meta charset=utf-8><body style="background:#BFE1F7;font:14px system-ui">']
    for name in ANIMALS:
        cells = []
        for src in sorted((OUT / name).glob('s*.png')):
            dst = REVIEW / name / f'{src.stem}.png'
            dst.parent.mkdir(parents=True, exist_ok=True)
            animal_cut(src).save(dst)
            cells.append(f'<figure style="display:inline-grid;justify-items:center;margin:8px"><img src="ghostleg/{name}/{src.stem}.png" style="height:160px">'
                         f'<div style="width:110px;height:22px;border-radius:50%;background:#3D7EA6;border:4px solid #574239;margin-top:-10px"></div>'
                         f'<figcaption>{src.stem}</figcaption></figure>')
        html.append(f'<div><b>{name}</b><br>{"".join(cells)}</div>')
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
    # 冰板原圖四周是白底:去背後才貼得上雪地,不會多出一圈白色梯形
    cut = Image.fromarray(cut_white(np.asarray(Image.open(OUT / picks['board']).convert('RGB'))))
    webp(cut.crop(cut.getbbox()).resize((512, 896), Image.LANCZOS), board, q=78)
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
