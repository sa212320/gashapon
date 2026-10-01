"""首頁插畫生成(5 張卡片插畫 + 標題木牌)。z_image 文字生圖。

在 repo 根目錄執行(先 export COMFY_URL=http://<ComfyUI 那台的 IP>:8188):
  PY=tools/mascot-gen/.venv/bin/python
  $PY tools/mascot-gen/home.py sheet            # 試做:一次生成一張 5 格拼圖(3 個 seed)
  $PY tools/mascot-gen/home.py cards [--only ichiban]   # 每張卡片分開生成,各 3 個 seed
  $PY tools/mascot-gen/home.py sign             # 標題木牌(綠底,3 個 seed)
  $PY tools/mascot-gen/home.py review           # 產生比較頁 tools/mascot-gen/review/home.html
  $PY tools/mascot-gen/home.py pick ichiban 2   # 記錄挑選;拼圖的話 pick sheet 2
  $PY tools/mascot-gen/home.py build-sign       # 輸出 img/home/sign.webp
  $PY tools/mascot-gen/home.py build-cards      # 輸出 img/home/<模式>.webp(卡片插畫延到各模式的 issue)
"""
import argparse
import json
import subprocess
import sys
from pathlib import Path

import numpy as np
from PIL import Image

import comfy
from post import key_border, keep_largest

ROOT = Path(__file__).resolve().parents[2]
HERE = Path(__file__).resolve().parent
OUT = HERE / 'out' / 'home'
CFG = HERE / 'home_prompts.json'
DEST = ROOT / 'img' / 'home'
MODES = ['gashapon', 'gashapon3d', 'ichiban', 'ghostleg', 'smash']
SEEDS = [11, 22, 33]
CARD_W, CARD_H = 1024, 768            # 生成尺寸;輸出縮成 640x480
SHEET_W, SHEET_H = 2560, 384          # 5 格,每格 512x384(4:3)
SIGN_W, SIGN_H = 1024, 512


def load_cfg():
    return json.loads(CFG.read_text())


def save_cfg(cfg):
    CFG.write_text(json.dumps(cfg, ensure_ascii=False, indent=2) + '\n')


def generate(prompt, negative, w, h, name):
    """生成 3 個 seed,存成 out/home/<name>/s<n>.png。"""
    d = OUT / name
    d.mkdir(parents=True, exist_ok=True)
    for n, seed in enumerate(SEEDS, 1):
        imgs = comfy.run(comfy.graph_t2i(prompt, negative, w, h, seed, f'home_{name}_s{n}'))
        (d / f's{n}.png').write_bytes(comfy.fetch(imgs[0]))
        print(f'{name} s{n} seed={seed}', flush=True)


def cmd_sheet(args):
    cfg = load_cfg()
    panels = ', '.join(f'panel {i}: {cfg["cards"][m]}' for i, m in enumerate(MODES, 1))
    prompt = f'{cfg["style"]}, five separate square-ish panels side by side in one row with thin white gaps between them, {panels}'
    generate(prompt, cfg['negative'], SHEET_W, SHEET_H, 'sheet')


def cmd_cards(args):
    cfg = load_cfg()
    for m in MODES:
        if args.only and m != args.only:
            continue
        generate(f'{cfg["style"]}, {cfg["cards"][m]}', cfg['negative'], CARD_W, CARD_H, m)


def cmd_sign(args):
    cfg = load_cfg()
    # 木牌不用卡片的畫風描述:裡面的「雪地、粉彩」會讓模型把綠底畫成灰綠
    generate(f'{cfg["sign_style"]}, {cfg["sign"]}', cfg['negative'], SIGN_W, SIGN_H, 'sign')


REVIEW = """<!doctype html>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>首頁插畫候選</title>
<style>
  body {{ font-family: system-ui, sans-serif; margin: 16px; background: #B9E0F8; color: #3b2f2a; }}
  section {{ margin-bottom: 28px; }}
  .row {{ display: flex; gap: 12px; flex-wrap: wrap; }}
  figure {{ margin: 0; background: #fffaf2; border: 4px solid #574239; border-radius: 16px; padding: 8px; }}
  img {{ display: block; max-width: 100%; border-radius: 10px; }}
  figcaption {{ margin-top: 6px; font-weight: 700; }}
</style>
<h1>首頁插畫:每段挑一個(回覆「ichiban 選 2」)</h1>
{body}
"""


def cmd_review(args):
    body = []
    for name in ['sheet', *MODES, 'sign']:
        d = OUT / name
        files = sorted(d.glob('s*.png')) if d.exists() else []
        if not files:
            continue
        width = 960 if name == 'sheet' else 320
        figs = ''.join(f'<figure><img src="../out/home/{name}/{f.name}" style="width:{width}px"><figcaption>{f.stem}</figcaption></figure>' for f in files)
        body.append(f'<section><h2>{name}</h2><div class="row">{figs}</div></section>')
    page = HERE / 'review' / 'home.html'
    page.parent.mkdir(exist_ok=True)
    page.write_text(REVIEW.format(body='\n'.join(body)))
    print(page)


def cmd_pick(args):
    src = OUT / args.name / f's{args.n}.png'
    if not src.exists():
        sys.exit(f'沒有 {src}')
    cfg = load_cfg()
    cfg.setdefault('picks', {})[args.name] = args.n
    save_cfg(cfg)
    print(f'{args.name} ← s{args.n}')


def webp(img, path, q=82):
    tmp = path.with_suffix('.png')
    img.save(tmp)
    subprocess.run(['cwebp', '-quiet', '-q', str(q), '-alpha_q', '90', str(tmp), '-o', str(path)], check=True)
    tmp.unlink()


def card_images(cfg):
    """回傳 {mode: PIL.Image}。拼圖有被挑中就切 5 格,否則用各自挑中的那張。"""
    picks = cfg.get('picks', {})
    if 'sheet' in picks:
        sheet = Image.open(OUT / 'sheet' / f's{picks["sheet"]}.png').convert('RGB')
        pw = sheet.width // len(MODES)
        return {m: sheet.crop((i * pw, 0, (i + 1) * pw, sheet.height)) for i, m in enumerate(MODES)}
    missing = [m for m in MODES if m not in picks]
    if missing:
        sys.exit(f'還沒 pick:{", ".join(missing)}')
    return {m: Image.open(OUT / m / f's{picks[m]}.png').convert('RGB') for m in MODES}


def cmd_build_cards(args):
    DEST.mkdir(parents=True, exist_ok=True)
    for m, im in card_images(load_cfg()).items():
        webp(im.resize((640, 480), Image.LANCZOS), DEST / f'{m}.webp')
    report()


def cmd_build_sign(args):
    cfg = load_cfg()
    if 'sign' not in cfg.get('picks', {}):
        sys.exit('還沒 pick:sign')
    DEST.mkdir(parents=True, exist_ok=True)
    sign = Image.open(OUT / 'sign' / f's{cfg["picks"]["sign"]}.png').convert('RGB')
    # z_image 不保證畫出純綠底,所以從邊緣往內填色去背,再清掉散落的小點
    rgba = Image.fromarray(keep_largest(key_border(np.asarray(sign))))
    rgba = rgba.crop(rgba.getbbox())          # 裁掉去背後四周的透明邊
    rgba.thumbnail((800, 400), Image.LANCZOS)
    webp(rgba, DEST / 'sign.webp')
    report()


def report():
    total = sum(p.stat().st_size for p in DEST.glob('*.webp'))
    print(f'img/home 共 {total / 1024:.0f} KB')


def main():
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest='cmd', required=True)
    sub.add_parser('sheet')
    c = sub.add_parser('cards'); c.add_argument('--only', choices=MODES)
    sub.add_parser('sign')
    sub.add_parser('review')
    p = sub.add_parser('pick'); p.add_argument('name', choices=['sheet', *MODES, 'sign']); p.add_argument('n', type=int)
    sub.add_parser('build-cards')
    sub.add_parser('build-sign')
    args = ap.parse_args()
    {'sheet': cmd_sheet, 'cards': cmd_cards, 'sign': cmd_sign, 'review': cmd_review, 'pick': cmd_pick, 'build-cards': cmd_build_cards, 'build-sign': cmd_build_sign}[args.cmd](args)


if __name__ == '__main__':
    main()
