"""吉祥物片段生成 CLI。規格:docs/superpowers/specs/2026-09-30-mascot-video-segments-design.md §3

在 repo 根目錄執行(ComfyUI 不在本機的話先 export COMFY_URL=http://<IP>:8188):
  PY=tools/mascot-gen/.venv/bin/python
  $PY tools/mascot-gen/gen.py run 0            # 生成第 0 輪(每段 3 個 seed)
  $PY tools/mascot-gen/gen.py sheet 0          # 每個候選一張逐格縮圖,給 Claude 過濾
  $PY tools/mascot-gen/gen.py review 0         # 產生比較頁
  $PY tools/mascot-gen/gen.py pick idle-loop 2 # 記錄使用者的挑選
  $PY tools/mascot-gen/gen.py pick idle-cheer 1 --end 16  # 只用到第 16 格(高峰)
  $PY tools/mascot-gen/gen.py build            # 輸出正式素材
"""
import argparse
import hashlib
import io
import json
import subprocess
import sys
from pathlib import Path

import numpy as np
from PIL import Image

import comfy
from post import key_green, blend_seam, resample, make_sheet, select_frames

ROOT = Path(__file__).resolve().parents[2]
HERE = Path(__file__).resolve().parent
OUT = HERE / 'out'
KEYS = OUT / 'keys'
PROMPTS = HERE / 'prompts.json'
# 原始 idle.webp 畫成兩條尾巴,fix_tail.py 擦掉右邊那截之後的版本(使用者確認過)
SRC_IDLE = HERE / 'source-idle.png'
ASSETS = ROOT / 'shared/img/mascot'
DEFAULT_SEEDS = [11, 22, 33]


def load_cfg():
    return json.loads(PROMPTS.read_text())


def save_cfg(cfg):
    PROMPTS.write_text(json.dumps(cfg, ensure_ascii=False, indent=2) + '\n')


def seg_cfg(cfg, sid):
    for s in cfg['segments']:
        if s['id'] == sid:
            return s
    sys.exit(f'沒有這一段:{sid}')


def idle_on_green():
    """把原始 idle.webp 置中貼到 640x576 綠底上(round 0 的起點)。"""
    im = Image.open(SRC_IDLE).convert('RGBA')
    bg = Image.new('RGBA', (comfy.W, comfy.H), (0, 255, 0, 255))
    bg.alpha_composite(im, ((comfy.W - im.width) // 2, (comfy.H - im.height) // 2))
    return bg.convert('RGB')


def png_bytes(im):
    buf = io.BytesIO()
    im.save(buf, 'PNG')
    return buf.getvalue()


def key_path(pose):
    return KEYS / f'{pose}.png'


def need_key(pose):
    p = key_path(pose)
    if not p.exists():
        sys.exit(f'缺關鍵圖 {pose}:前一輪還沒 pick')
    return Image.open(p).convert('RGB')


def frames_of(sid, n):
    d = OUT / sid / f's{n}'
    files = sorted(d.glob('*.png'))
    if not files:
        sys.exit(f'{d} 沒有影格')
    return files


def cmd_run(args):
    cfg = load_cfg()
    todo = [s for s in cfg['segments'] if s['round'] == args.round and (not args.only or s['id'] == args.only)]
    for s in todo:
        s.setdefault('seeds', DEFAULT_SEEDS)
        if args.round == 0:
            # --keep-key:頭尾用已經挑好的 K_idle,重跑 idle-loop 時不改變關鍵圖,
            # 其他 17 段(都夾在 K_idle 上)就不用跟著重做
            start_img = end_img = need_key('idle') if args.keep_key else idle_on_green()
        elif args.round == 1:
            start_img, end_img = need_key('idle'), None
        else:
            start_img, end_img = need_key(s['from']), need_key(s['to'])
        start = comfy.upload(png_bytes(start_img), f'mascot_{s["id"]}_start.png')
        end = comfy.upload(png_bytes(end_img), f'mascot_{s["id"]}_end.png') if end_img else None
        prompt = f'{cfg["style"]}, {s["prompt"]}'
        for n, seed in enumerate(s['seeds'], 1):
            d = OUT / s['id'] / f's{n}'
            d.mkdir(parents=True, exist_ok=True)
            for old in d.glob('*.png'):
                old.unlink()
            imgs = comfy.run(comfy.graph(prompt, cfg['negative'], start, s['length'], seed, f'mascot_{s["id"]}_s{n}', end))
            for i, img in enumerate(imgs):
                (d / f'{i:03d}.png').write_bytes(comfy.fetch(img))
            print(f'{s["id"]} s{n} seed={seed}: {len(imgs)} 格', flush=True)
    save_cfg(cfg)


def cmd_sheet(args):
    cfg = load_cfg()
    for s in cfg['segments']:
        if s['round'] != args.round:
            continue
        for n in range(1, len(s.get('seeds', DEFAULT_SEEDS)) + 1):
            files = frames_of(s['id'], n)
            idx = np.linspace(0, len(files) - 1, 10).round().astype(int)
            thumbs = [Image.open(files[i]).convert('RGB').resize((256, 230)) for i in idx]
            sheet = Image.new('RGB', (256 * 5, 230 * 2), 'white')
            for k, t in enumerate(thumbs):
                sheet.paste(t, ((k % 5) * 256, (k // 5) * 230))
            sheet.save(OUT / s['id'] / f's{n}.jpg', quality=85)
            print(OUT / s['id'] / f's{n}.jpg')


REVIEW_HTML = """<!doctype html>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>吉祥物候選 · 第 {round} 輪</title>
<style>
  body {{ font-family: system-ui, sans-serif; margin: 16px; background: #f4f1ea; color: #3b2f2a; }}
  section {{ margin-bottom: 32px; }}
  .row {{ display: flex; gap: 12px; flex-wrap: wrap; }}
  figure {{ margin: 0; background: url(../../../shared/img/snow-scene.webp) center/cover; border-radius: 12px; padding: 8px; }}
  canvas {{ width: 320px; height: 288px; display: block; }}
  figcaption {{ font-variant-numeric: tabular-nums; background: #fffaf2; border-radius: 8px; padding: 4px 8px; margin-top: 6px; }}
  .rejected {{ opacity: .45; }}
  .note {{ color: #b3261e; font-size: 14px; }}
</style>
<h1>第 {round} 輪:每段挑一個(回覆「<code>idle-cheer 選 1 到第 16 格</code>」;不裁就只說「選 N」)</h1>
<div id="app"></div>
<script>
const DATA = {data};
const FPS = 16;
function key(img) {{
  const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
  const x = c.getContext('2d'); x.drawImage(img, 0, 0);
  const d = x.getImageData(0, 0, c.width, c.height), p = d.data;
  for (let i = 0; i < p.length; i += 4) {{
    const dom = p[i+1] - Math.max(p[i], p[i+2]);
    p[i+3] = 255 * (1 - Math.min(1, Math.max(0, (dom - 40) / 80)));
    p[i+1] = Math.min(p[i+1], Math.max(p[i], p[i+2]));
  }}
  x.putImageData(d, 0, 0); return c;
}}
for (const seg of DATA) {{
  const sec = document.createElement('section');
  sec.innerHTML = `<h2>${{seg.id}}</h2><div class="row"></div>`;
  app.append(sec);
  for (const cand of seg.candidates) {{
    const fig = document.createElement('figure');
    if (cand.note) fig.className = 'rejected';
    const cv = document.createElement('canvas'); cv.width = 640; cv.height = 576;
    fig.append(cv);
    const cap = document.createElement('figcaption');
    cap.innerHTML = `<b>${{cand.n}}</b> seed ${{cand.seed}} · 第 <span class="fi">0</span> / ${{cand.frames.length - 1}} 格`
      + `<br><input type="range" min="0" max="${{cand.frames.length - 1}}" value="0" style="width:100%">`
      + `<label><input type="checkbox" checked> 播放</label>`
      + (cand.note ? `<div class="note">${{cand.note}}</div>` : '');
    fig.append(cap);
    sec.querySelector('.row').append(fig);
    Promise.all(cand.frames.map(src => new Promise(r => {{ const i = new Image(); i.onload = () => r(key(i)); i.src = src; }})))
      .then(frames => {{
        const x = cv.getContext('2d'); let k = 0;
        const fi = cap.querySelector('.fi'), slider = cap.querySelector('input[type=range]'), play = cap.querySelector('input[type=checkbox]');
        const show = () => {{ x.clearRect(0, 0, 640, 576); x.drawImage(frames[k], 0, 0); fi.textContent = k; slider.value = k; }};
        slider.oninput = () => {{ play.checked = false; k = +slider.value; show(); }};
        setInterval(() => {{ if (!play.checked) return; show(); k = (k + 1) % frames.length; }}, 1000 / FPS);
      }});
  }}
}}
</script>
"""


def cmd_review(args):
    cfg = load_cfg()
    data = []
    for s in cfg['segments']:
        if s['round'] != args.round:
            continue
        notes_file = OUT / s['id'] / 'notes.json'
        notes = json.loads(notes_file.read_text()) if notes_file.exists() else {}
        cands = []
        for n, seed in enumerate(s.get('seeds', DEFAULT_SEEDS), 1):
            files = frames_of(s['id'], n)
            cands.append({'n': n, 'seed': seed, 'note': notes.get(f's{n}'),
                          'frames': [f'../out/{s["id"]}/s{n}/{f.name}' for f in files]})
        data.append({'id': s['id'], 'candidates': cands})
    page = HERE / 'review' / 'index.html'
    page.parent.mkdir(exist_ok=True)
    page.write_text(REVIEW_HTML.format(round=args.round, data=json.dumps(data, ensure_ascii=False)))
    print(page)


def cmd_pick(args):
    cfg = load_cfg()
    s = seg_cfg(cfg, args.id)
    # 先確認有影格、結束格合法,失敗時不留下半套 pick
    files = select_frames(frames_of(args.id, args.n), args.end)
    s['pick'] = args.n
    if args.end is None:
        s.pop('pick_end', None)
    else:
        s['pick_end'] = args.end
    save_cfg(cfg)
    KEYS.mkdir(parents=True, exist_ok=True)
    if s['round'] == 0 and args.keep_key:
        print('保留現有的 K_idle')
    elif s['round'] == 0:
        Image.open(files[0]).convert('RGB').save(key_path('idle'))
        print(f'K_idle ← {files[0]}')
    elif s['round'] == 1:
        Image.open(files[-1]).convert('RGB').save(key_path(s['to']))
        print(f'K_{s["to"]} ← {files[-1]}')


def to_rgba(path, w, h):
    rgba = key_green(np.asarray(Image.open(path).convert('RGB')))
    return np.asarray(Image.fromarray(rgba, 'RGBA').resize((w, h), Image.LANCZOS))


def cwebp(png_path, webp_path):
    subprocess.run(['cwebp', '-quiet', '-q', '65', '-alpha_q', '90', str(png_path), '-o', str(webp_path)], check=True)


def versioned(rel):
    """網址加上內容雜湊:素材換了網址就跟著換,瀏覽器跟 GitHub Pages 的快取
    不會繼續給舊圖(曾經發生:換了 idle-loop,使用者看到的還是舊的)。"""
    h = hashlib.sha1((ASSETS / rel).read_bytes()).hexdigest()[:8]
    return f'{rel}?v={h}'


def cmd_build(args):
    cfg = load_cfg()
    missing = [s['id'] for s in cfg['segments'] if not s.get('pick')]
    if missing:
        sys.exit(f'還沒 pick:{", ".join(missing)}')
    (ASSETS / 'key').mkdir(exist_ok=True)
    (ASSETS / 'seg').mkdir(exist_ok=True)
    tmp = OUT / 'build'
    tmp.mkdir(exist_ok=True)

    keys = {}
    for pose in ['idle', 'watch', 'cheer', 'aww', 'empty']:
        keys[pose] = to_rgba(need_key_path(pose), args.w, args.h)
        png = tmp / f'key-{pose}.png'
        Image.fromarray(keys[pose], 'RGBA').save(png)
        cwebp(png, ASSETS / 'key' / f'{pose}.webp')

    cols = 8
    manifest = {'frame': {'w': args.w, 'h': args.h},
                'keyframes': {p: versioned(f'key/{p}.webp') for p in keys},
                'segments': []}
    for s in cfg['segments']:
        files = select_frames(frames_of(s['id'], s['pick']), s.get('pick_end'))
        frames = [to_rgba(f, args.w, args.h) for f in files]
        frames = resample(frames, cfg['src_fps'], args.fps)
        frames = blend_seam(frames, keys[s['from']], keys[s['to']])
        png = tmp / f'{s["id"]}.png'
        Image.fromarray(make_sheet(frames, cols), 'RGBA').save(png)
        cwebp(png, ASSETS / 'seg' / f'{s["id"]}.webp')
        manifest['segments'].append({'id': s['id'], 'kind': s['kind'], 'from': s['from'], 'to': s['to'],
                                     'frames': len(frames), 'fps': args.fps,
                                     'sheet': versioned(f'seg/{s["id"]}.webp'), 'cols': cols})
    (ASSETS / 'segments.json').write_text(json.dumps(manifest, indent=2) + '\n')

    total = sum(p.stat().st_size for p in [*(ASSETS / 'seg').glob('*.webp'), *(ASSETS / 'key').glob('*.webp')])
    first = sum((ASSETS / 'seg' / f'{i}.webp').stat().st_size for i in ['idle-loop', 'idle-watch', 'watch-loop', 'watch-cheer', 'watch-aww'])
    print(f'總大小 {total / 1024:.0f} KB;揭曉前會用到的前 5 段 {first / 1024:.0f} KB')


def need_key_path(pose):
    p = key_path(pose)
    if not p.exists():
        sys.exit(f'缺關鍵圖 {pose}')
    return p


def main():
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest='cmd', required=True)
    r = sub.add_parser('run'); r.add_argument('round', type=int); r.add_argument('--only'); r.add_argument('--keep-key', action='store_true')
    sh = sub.add_parser('sheet'); sh.add_argument('round', type=int)
    rv = sub.add_parser('review'); rv.add_argument('round', type=int)
    pk = sub.add_parser('pick'); pk.add_argument('id'); pk.add_argument('n', type=int); pk.add_argument('--end', type=int); pk.add_argument('--keep-key', action='store_true')
    # 預設值是 2026-10-01 實測大小後定的:總量約 6.4 MB、揭曉前的前 5 段約 1.6 MB
    b = sub.add_parser('build'); b.add_argument('--w', type=int, default=400); b.add_argument('--h', type=int, default=360); b.add_argument('--fps', type=int, default=12)
    args = ap.parse_args()
    {'run': cmd_run, 'sheet': cmd_sheet, 'review': cmd_review, 'pick': cmd_pick, 'build': cmd_build}[args.cmd](args)


if __name__ == '__main__':
    main()
