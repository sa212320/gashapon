"""大亂鬥道具圖示(2026-10-12,issue #4):劍、盾、補包、飛彈。

在 repo 根目錄執行(先 export COMFY_URL=http://<ComfyUI 那台的 IP>:8188):
  PY=tools/mascot-gen/.venv/bin/python
  $PY tools/mascot-gen/smash.py sheet                 # 先試一張 2x2 拼圖,3 個 seed → out/smash/sheet/s{1,2,3}.png
  $PY tools/mascot-gen/smash.py gen attack            # 拼圖不行就分開生成,3 個 seed → out/smash/attack/s{1,2,3}.png
  $PY tools/mascot-gen/smash.py review [--bg PATH]    # 去背、疊在盤面截圖上並排 → review/smash.html
  $PY tools/mascot-gen/smash.py pick attack 2         # 或 pick sheet 2(四格一起)
  $PY tools/mascot-gen/smash.py fx impact            # 特效逐格動畫(做法同 ClassBonusSystem):z_image 黑底起始圖 → Wan 2.2 17 格
                                                      #   → 壓黑、圓形漸暗、黑轉透明 → out/smash/fx-impact/s{1,2,3}.png(一列 256×256)
  $PY tools/mascot-gen/smash.py fx cloud --toon      # 卡通版(深棕描邊,同道具畫風):吉祥物參考 + 綠幕起始圖 → Wan → 每格去綠幕
  $PY tools/mascot-gen/smash.py fx-review             # 動起來疊在盤面色上 → review/smash-fx.html
  $PY tools/mascot-gen/smash.py fx-pick impact 2
  $PY tools/mascot-gen/smash.py build                 # 輸出 smash/img/items/*.webp、smash/img/fx/*.webp,蓋 ?v= 到 smash/js/art.js、重產 preload.json
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
FX = ['impact', 'blast', 'cloud', 'shock']   # 撞擊火花;飛彈爆炸 = 大圓火球 + 蘑菇雲 + 衝擊波(Wan 逐格動畫)
FX_N = 256                         # 每格邊長
FX_LEN = 17                        # Wan 的格數(4n+1)
FX_IMG = ROOT / 'smash' / 'img' / 'fx'
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


def cmd_fx(args):
    if args.toon:
        return cmd_fx_toon(args)
    cfg = load_cfg()
    fx = cfg['fx'][args.name]
    d = OUT / f'fx-{args.name}'
    d.mkdir(parents=True, exist_ok=True)
    for n, seed in enumerate(SEEDS, 1):
        imgs = comfy.run(comfy.graph_t2i(
            f'{fx["start"]}, on a pure black background, 2D cartoon game visual effect style, bright with a soft glow. '
            f'The shape is clearly recognisable. {cfg["fx_black"]}', '', 640, 640, seed, f'smash_fxs_{args.name}_s{n}'))
        first = comfy.fetch(imgs[0])
        (d / f's{n}-start.png').write_bytes(first)
        name = comfy.upload(first, f'smash_fxs_{args.name}_s{n}.png')
        outs = comfy.run(comfy.graph(
            f'2D cartoon game visual effect animation on a pure black background: {fx["motion"]}. '
            f'Static camera, the background stays pure black the whole time. {cfg["fx_black"]}',
            'camera movement, scenery, ground, characters, creatures, text, background colour, smoke filling the screen',
            name, FX_LEN, seed, f'smash_fxv_{args.name}_s{n}', w=640, h=640))
        frames = [Image.open(io.BytesIO(comfy.fetch(im))) for im in sorted(outs, key=lambda im: im['filename'])]
        fx_strip(frames).save(d / f's{n}.png')
        print(f'fx {args.name} s{n} seed={seed} {len(frames)} 格', flush=True)


def cmd_fx_toon(args):
    """卡通版(跟道具圖示同一個畫風,有深棕描邊):黑底轉透明會把描邊吃掉,所以改成
    吉祥物當參考圖、Qwen 畫綠幕起始圖 → Wan 長逐格(背景維持綠幕)→ 每格去綠幕。"""
    cfg = load_cfg()
    fx = cfg['fx_toon'][args.name]
    ref = upload_ref(cfg)
    d = OUT / f'fx-{args.name}'
    d.mkdir(parents=True, exist_ok=True)
    for n, seed in enumerate(SEEDS, 1):
        imgs = comfy.run(comfy.graph_edit([ref], f'{cfg["fx_toon_style"]} {fx["start"]}', seed, f'smash_fxt_{args.name}_s{n}'))
        start = Image.open(io.BytesIO(comfy.fetch(imgs[0]))).convert('RGB')
        side = max(start.size)
        sq = Image.new('RGB', (side, side), (0, 255, 0))   # 補成正方形(Wan 用 640×640)
        sq.paste(start, ((side - start.width) // 2, (side - start.height) // 2))
        sq = sq.resize((640, 640), Image.LANCZOS)
        sq.save(d / f's{n}-start.png')
        buf = io.BytesIO()
        sq.save(buf, 'PNG')
        name = comfy.upload(buf.getvalue(), f'smash_fxt_{args.name}_s{n}.png')
        outs = comfy.run(comfy.graph(
            f'2D flat cartoon animation with thick dark brown outlines on a solid bright pure green background: {fx["motion"]}. '
            'Static camera, the background stays solid pure green the whole time, flat colours, no glow, no text.',
            'camera movement, scenery, ground, characters, creatures, text, glow, realistic fire, gradient background, background colour change',
            name, FX_LEN, seed, f'smash_fxtv_{args.name}_s{n}', w=640, h=640))
        frames = [Image.open(io.BytesIO(comfy.fetch(im))) for im in sorted(outs, key=lambda im: im['filename'])]
        toon_strip(frames).save(d / f's{n}.png')
        print(f'fx toon {args.name} s{n} seed={seed} {len(frames)} 格', flush=True)


def toon_strip(frames):
    """每格去綠幕(不裁切,格子大小固定),描邊留著"""
    cells = []
    for im in frames:
        rgb = np.asarray(im.convert('RGB').resize((FX_N, FX_N), Image.LANCZOS)).astype(int)
        r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
        green = g - np.maximum(r, b)              # 多綠
        a = np.clip(255 - (green - 40) * 255 / 60, 0, 255)   # 綠 40 以下全留、100 以上全透明,中間漸變
        out = np.zeros((FX_N, FX_N, 4), np.uint8)
        out[..., 0] = r
        out[..., 1] = np.minimum(g, np.maximum(r, b))   # 去綠邊(despill)
        out[..., 2] = b
        out[..., 3] = a
        cells.append(out)
    return Image.fromarray(np.concatenate(cells, axis=1))


def fx_radial():
    """圓形漸暗:邊緣淡到 0,方形邊界才不會在畫面上切出一條線"""
    yy, xx = np.mgrid[0:FX_N, 0:FX_N]
    r = np.hypot(xx - FX_N / 2 + 0.5, yy - FX_N / 2 + 0.5) / (FX_N / 2)
    t = np.clip((r - 0.62) / (0.98 - 0.62), 0, 1)
    return 1 - t * t * (3 - 2 * t)


def black_to_alpha(rgb):
    """黑底 → 透明:最亮的通道當透明度,顏色除以透明度還原(疊在黑底上跟原圖一樣)。
    同 ClassBonusSystem 的 blackToAlpha;極暗的雜訊直接全透明。"""
    a = rgb.max(axis=2)
    out = np.zeros((*rgb.shape[:2], 4), np.uint8)
    keep = a >= 12
    out[..., :3][keep] = np.clip(rgb[keep] * 255.0 / a[keep, None], 0, 255).astype(np.uint8)
    out[..., 3] = np.where(keep, a, 0)
    return out


def fx_strip(frames):
    mask = fx_radial()
    cells = []
    for im in frames:
        v = np.asarray(im.convert('RGB').resize((FX_N, FX_N), Image.LANCZOS)).astype(float)
        v = np.where(v < 14, 0, (v - 14) * 255 / 241) * mask[..., None]   # 壓黑:Wan 的黑底帶一點灰
        cells.append(black_to_alpha(v.round().astype(np.uint8)))
    return Image.fromarray(np.concatenate(cells, axis=1))


def cmd_fx_review(args):
    REVIEW.mkdir(parents=True, exist_ok=True)
    html = ['<!doctype html><meta charset=utf-8><body style="background:#EAF6FD;font:14px system-ui">',
            '<style>.fx{width:192px;height:192px;display:inline-block;margin:6px;background-size:auto 100%;'
            'animation-iteration-count:infinite;border-radius:12px}</style>']
    for name in FX:
        html.append(f'<h3>{name}</h3>')
        for src in sorted((OUT / f'fx-{name}').glob('s?.png')):
            im = Image.open(src)
            n = im.width // im.height
            dst = REVIEW / f'fx-{name}-{src.name}'
            im.save(dst)
            dur = 0.45 if name == 'impact' else 1.1
            anim = f'{name}{src.stem}'
            html.append(f'<style>@keyframes {anim}{{from{{background-position:0 0}}to{{background-position:-{192 * n}px 0}}}}</style>')
            cells = ''.join(f'<div class="fx" style="background-color:{bg};background-image:url(smash/{dst.name});'
                            f'animation:{anim} {dur}s steps({n}) infinite"></div>' for bg in ['#D3EAF8', '#A9D3EE', '#3E5A73'])
            html.append(f'<div><b>{src.stem}</b>({n} 格,{dur}s)<br>{cells}'
                        f'<br><img src="smash/{dst.name}" style="height:64px;background:#A9D3EE"></div>')
    (REVIEW.parent / 'smash-fx.html').write_text('\n'.join(html))
    print('開 http://localhost:8765/tools/mascot-gen/review/smash-fx.html')


def cmd_fx_pick(args):
    cfg = load_cfg()
    cfg.setdefault('fx_picks', {})[args.name] = f's{args.n}'
    save_cfg(cfg)


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
    FX_IMG.mkdir(parents=True, exist_ok=True)
    lines = []
    for i in ITEMS:
        path = IMG / f'{i}.webp'
        webp(icon_cut(picked_image(i, cfg['picks'][i])), path, q=80)
        lines.append(f"  {i}: new URL('../img/items/{i}.webp?v={content_hash(path)}', import.meta.url).href,")
    fx_lines = []
    for name, pick in cfg.get('fx_picks', {}).items():
        strip = Image.open(OUT / f'fx-{name}' / f'{pick}.png')
        path = FX_IMG / f'{name}.webp'
        strip.save(path, 'WEBP', quality=80, method=6)
        fx_lines.append(f"  {name}: {{ url: new URL('../img/fx/{name}.webp?v={content_hash(path)}', import.meta.url).href, "
                        f"frames: {strip.width // strip.height} }},")
    ART_JS.write_text(
        '// 大亂鬥道具圖示與特效的網址(tools/mascot-gen/smash.py build 產生,不要手改)。\n'
        '// 帶 ?v= 內容雜湊:Pages 會快取 10 分鐘,換圖不換網址的話小孩會看到舊圖。\n'
        'export const ITEM_URLS = {\n' + '\n'.join(lines) + '\n};\n\n'
        '// 特效逐格動畫(撞擊火花、飛彈爆炸):一列 frames 格的橫條,照時間一格一格換\n'
        'export const FX_URLS = {\n' + '\n'.join(fx_lines) + '\n};\n')
    write_preload_manifest()
    print('smash item icons done')


def main():
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest='cmd', required=True)
    sub.add_parser('sheet')
    g = sub.add_parser('gen'); g.add_argument('name', choices=ITEMS); g.add_argument('--seeds')
    r = sub.add_parser('review'); r.add_argument('--bg')
    p = sub.add_parser('pick'); p.add_argument('name', choices=ITEMS + ['sheet']); p.add_argument('n', type=int)
    f = sub.add_parser('fx'); f.add_argument('name', choices=FX); f.add_argument('--toon', action='store_true')
    sub.add_parser('fx-review')
    fp = sub.add_parser('fx-pick'); fp.add_argument('name', choices=FX); fp.add_argument('n', type=int)
    sub.add_parser('build')
    args = ap.parse_args()
    {'sheet': cmd_sheet, 'gen': cmd_gen, 'review': cmd_review, 'pick': cmd_pick, 'build': cmd_build,
     'fx': cmd_fx, 'fx-review': cmd_fx_review, 'fx-pick': cmd_fx_pick}[args.cmd](args)


if __name__ == '__main__':
    main()
