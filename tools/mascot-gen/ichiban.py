"""一番賞票卡素材:白色印章角色頭(2026-10-02,issue #2)。z_image 文字生圖。

在 repo 根目錄執行(先 export COMFY_URL=http://<ComfyUI 那台的 IP>:8188):
  PY=tools/mascot-gen/.venv/bin/python
  $PY tools/mascot-gen/ichiban.py gen fox|ermine   # 各 3 個 seed → out/ichiban/<name>/s{1,2,3}.png
  $PY tools/mascot-gen/ichiban.py review                  # 烘出候選 → review/ichiban/,開 review/ichiban.html 看
  $PY tools/mascot-gen/ichiban.py pick fox 2
  $PY tools/mascot-gen/ichiban.py build                   # 輸出 ichiban/img/*.webp、蓋 ?v=、重產 preload.json
  $PY tools/mascot-gen/ichiban.py gen empty --seeds 11,22,33,44,55,66   # 「抽完了」插圖(綠幕)
  $PY tools/mascot-gen/ichiban.py pick empty 3 && $PY tools/mascot-gen/ichiban.py build-empty
  $PY tools/mascot-gen/ichiban.py gen raffle --seeds ... && pick raffle 3 && build-box   # 開場動畫的抽獎箱
"""
import argparse
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image

import comfy
from gashapon import webp, write_preload_manifest
from gashapon_art import content_hash, stamp, clear_green_fringe
from post import key_border
from ichiban_art import stamp_from_gray

ROOT = Path(__file__).resolve().parents[2]
HERE = Path(__file__).resolve().parent
OUT = HERE / 'out' / 'ichiban'
REVIEW = HERE / 'review' / 'ichiban'
CFG = HERE / 'ichiban_prompts.json'
IMG = ROOT / 'ichiban' / 'img'
CARD_ART = ROOT / 'ichiban' / 'js' / 'card-art.js'
SEEDS = [11, 22, 33]
NAMES = ['fox', 'ermine']
EMPTY_W = 480   # 「抽完了」插圖輸出寬度(畫面上約 240px,2x)
INDEX = ROOT / 'ichiban' / 'index.html'   # 紙紋試過拿掉了(縮到小卡看不出來、加強又髒)


def load_cfg():
    return json.loads(CFG.read_text())


def save_cfg(cfg):
    CFG.write_text(json.dumps(cfg, ensure_ascii=False, indent=2) + '\n')


def prompt_for(cfg, name):
    if name in ('empty', 'raffle'):   # 同一個抽獎箱:開場動畫(raffle)/ 抽完了(empty,前面散著撕開的籤)
        return f'{cfg["empty_style"]}, {cfg[name]}', cfg['empty_negative'], 768, 640
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


def cut_empty(src, width=EMPTY_W):
    """綠幕去背、裁掉透明邊。不用 keep_largest:籤盒跟散落的籤是分開的幾塊。"""
    rgb = np.asarray(Image.open(src).convert('RGB'))
    rgba = clear_green_fringe(key_border(rgb))
    img = Image.fromarray(rgba)
    img = img.crop(img.getbbox())
    h = round(img.height * width / img.width)
    return img.resize((width, h), Image.LANCZOS)


def cmd_build_empty(args):
    pick = load_cfg().get('picks', {}).get('empty')
    if not pick:
        sys.exit('還沒 pick empty')
    path = IMG / 'empty.webp'
    webp(cut_empty(OUT / 'empty' / f's{pick["n"]}.png'), path, q=82)
    INDEX.write_text(stamp(INDEX.read_text(), 'img/empty.webp', content_hash(path)))
    write_preload_manifest()
    print('empty done')


BOX_W = 360   # 開場動畫的抽獎箱在畫面中央,約 180px 寬(2x)


def cmd_build_box(args):
    # 開場動畫的抽獎箱(2026-10-02 使用者選 raffle s3:上面一個圓洞,籤從洞口飛出來)
    pick = load_cfg().get('picks', {}).get('raffle')
    if not pick:
        sys.exit('還沒 pick raffle')
    path = IMG / 'box.webp'
    webp(cut_empty(OUT / 'raffle' / f's{pick["n"]}.png', width=BOX_W), path, q=82)
    INDEX.write_text(stamp(INDEX.read_text(), 'img/box.webp', content_hash(path)))
    write_preload_manifest()
    print('box done')


def cmd_review(args):
    # 每個候選烘成跟正式版一樣的格式,review/ichiban.html 把它們畫在冷色票卡上比較
    for scene in ('empty', 'raffle'):
        for src in sorted((OUT / scene).glob('s*.png')):
            dst = REVIEW / scene / f'{src.stem}.png'
            dst.parent.mkdir(parents=True, exist_ok=True)
            cut_empty(src).save(dst)
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


COMMANDS = {'gen': cmd_gen, 'review': cmd_review, 'pick': cmd_pick, 'build': cmd_build, 'build-empty': cmd_build_empty, 'build-box': cmd_build_box}


def main():
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest='cmd', required=True)
    g = sub.add_parser('gen'); g.add_argument('name', choices=NAMES + ['empty', 'raffle']); g.add_argument('--seeds', help='逗號分隔,例如 44,55,66')
    sub.add_parser('review')
    p = sub.add_parser('pick'); p.add_argument('name', choices=NAMES + ['empty', 'raffle']); p.add_argument('n', type=int)
    sub.add_parser('build')
    sub.add_parser('build-empty')
    sub.add_parser('build-box')
    args = ap.parse_args()
    COMMANDS[args.cmd](args)


if __name__ == '__main__':
    main()
