"""立體扭蛋機的托盤素材後製(盤底冰面、冰牆側面帶)。圖已在 2026-10-01 生好並選定,這裡只後製。
  PY=tools/mascot-gen/.venv/bin/python
  $PY tools/mascot-gen/gashapon3d.py build-tray
"""
import subprocess
import sys
from pathlib import Path

import numpy as np
from PIL import Image

from gashapon_art import crop_square_center, ink_rows, make_seamless, content_hash, stamp

ROOT = Path(__file__).resolve().parents[2]
OUT = Path(__file__).resolve().parent / 'out' / 'gashapon3d'
IMG = ROOT / 'gashapon3d' / 'img'
ART = ROOT / 'gashapon3d' / 'js' / 'tray-art.js'
PICKS = {'floor': 2, 'band': 2}   # 使用者 2026-10-01 選定


def webp(img, path, q=82):
    tmp = path.with_suffix('.png')
    img.save(tmp)
    subprocess.run(['cwebp', '-quiet', '-q', str(q), str(tmp), '-o', str(path)], check=True)
    tmp.unlink()


def build_tray():
    IMG.mkdir(parents=True, exist_ok=True)
    floor = np.asarray(Image.open(OUT / 'floor' / f's{PICKS["floor"]}.png').convert('RGB'))
    floor = Image.fromarray(crop_square_center(floor, 0.12)).resize((1024, 1024), Image.LANCZOS)
    webp(floor, IMG / 'floor.webp')

    band = np.asarray(Image.open(OUT / 'band' / f's{PICKS["band"]}.png').convert('RGB'))
    top, bottom = ink_rows(band)
    w = band.shape[1]
    band = band[top:bottom + 1, round(w * 0.06): round(w * 0.94)]   # 裁掉兩端的圓角外框
    band = make_seamless(band, overlap=round(band.shape[1] * 0.08))
    im = Image.fromarray(band)
    im = im.resize((1024, round(1024 * im.height / im.width)), Image.LANCZOS)
    webp(im, IMG / 'wall.webp')

    text = ART.read_text()
    for name in ('floor', 'wall'):
        text = stamp(text, f'../img/{name}.webp', content_hash(IMG / f'{name}.webp'))
    ART.write_text(text)
    for name in ('floor', 'wall'):
        print(name, (IMG / f'{name}.webp').stat().st_size // 1024, 'KB')
    # 雜湊變了,首頁的預載清單要跟著重產(預先載入 ①)
    from gashapon import write_preload_manifest
    write_preload_manifest()


if __name__ == '__main__':
    if sys.argv[1:] != ['build-tray']:
        sys.exit(__doc__)
    build_tray()
