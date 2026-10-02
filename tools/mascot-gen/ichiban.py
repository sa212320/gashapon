"""一番賞票卡素材:白色印章角色頭(2026-10-02,issue #2)。z_image 文字生圖。

在 repo 根目錄執行(先 export COMFY_URL=http://<ComfyUI 那台的 IP>:8188):
  PY=tools/mascot-gen/.venv/bin/python
  $PY tools/mascot-gen/ichiban.py gen fox|ermine   # 各 3 個 seed → out/ichiban/<name>/s{1,2,3}.png
  $PY tools/mascot-gen/ichiban.py review                  # 烘出候選 → review/ichiban/,開 review/ichiban.html 看
  $PY tools/mascot-gen/ichiban.py pick fox 2
  $PY tools/mascot-gen/ichiban.py build                   # 輸出 ichiban/img/*.webp、蓋 ?v=、重產 preload.json
"""
import argparse
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image

import comfy
from gashapon import webp, write_preload_manifest
from gashapon_art import content_hash, stamp
from ichiban_art import stamp_from_gray

ROOT = Path(__file__).resolve().parents[2]
HERE = Path(__file__).resolve().parent
OUT = HERE / 'out' / 'ichiban'
REVIEW = HERE / 'review' / 'ichiban'
CFG = HERE / 'ichiban_prompts.json'
IMG = ROOT / 'ichiban' / 'img'
CARD_ART = ROOT / 'ichiban' / 'js' / 'card-art.js'
SEEDS = [11, 22, 33]
NAMES = ['fox', 'ermine']   # 紙紋試過拿掉了(縮到小卡看不出來、加強又髒)


def load_cfg():
    return json.loads(CFG.read_text())


def save_cfg(cfg):
    CFG.write_text(json.dumps(cfg, ensure_ascii=False, indent=2) + '\n')


def prompt_for(cfg, name):
    return f'{cfg["stamp_style"]}, {cfg[name]}', cfg['stamp_negative'], 768, 768


def cmd_gen(args):
    cfg = load_cfg()
    prompt, neg, w, h = prompt_for(cfg, args.name)
    seeds = [int(v) for v in args.seeds.split(',')] if args.seeds else SEEDS
    d = OUT / args.name
    d.mkdir(parents=True, exist_ok=True)
    for n, seed in enumerate(seeds, 1):
        imgs = comfy.run(comfy.graph_t2i(prompt, neg, w, h, seed, f'ichiban_{args.name}_s{n}'))
        (d / f's{n}.png').write_bytes(comfy.fetch(imgs[0]))
        print(f'{args.name} s{n} seed={seed}', flush=True)


def bake(name, src):
    gray = np.asarray(Image.open(src).convert('L'))
    return Image.fromarray(stamp_from_gray(gray))


def cmd_review(args):
    # 每個候選烘成跟正式版一樣的格式,review/ichiban.html 把它們畫在冷色票卡上比較
    for name in NAMES:
        for src in sorted((OUT / name).glob('s*.png')):
            dst = REVIEW / name / f'{src.stem}.png'
            dst.parent.mkdir(parents=True, exist_ok=True)
            bake(name, src).save(dst)
    print('開 http://localhost:8765/tools/mascot-gen/review/ichiban.html(先在 repo 根目錄 python3 -m http.server 8765)')


def cmd_pick(args):
    cfg = load_cfg()
    cfg.setdefault('picks', {})[args.name] = {'n': args.n}
    save_cfg(cfg)


def cmd_build(args):
    picks = load_cfg().get('picks', {})
    missing = [n for n in NAMES if n not in picks]
    if missing:
        sys.exit(f'還沒 pick:{", ".join(missing)}')
    IMG.mkdir(parents=True, exist_ok=True)
    text = CARD_ART.read_text()
    for name in NAMES:
        path = IMG / f'{name}.webp'
        webp(bake(name, OUT / name / f's{picks[name]["n"]}.png'), path, q=78)
        text = stamp(text, f'../img/{name}.webp', content_hash(path))
    CARD_ART.write_text(text)
    write_preload_manifest()
    print('ichiban art done')


COMMANDS = {'gen': cmd_gen, 'review': cmd_review, 'pick': cmd_pick, 'build': cmd_build}


def main():
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest='cmd', required=True)
    g = sub.add_parser('gen'); g.add_argument('name', choices=NAMES); g.add_argument('--seeds', help='逗號分隔,例如 44,55,66')
    sub.add_parser('review')
    p = sub.add_parser('pick'); p.add_argument('name', choices=NAMES); p.add_argument('n', type=int)
    sub.add_parser('build')
    args = ap.parse_args()
    COMMANDS[args.cmd](args)


if __name__ == '__main__':
    main()
