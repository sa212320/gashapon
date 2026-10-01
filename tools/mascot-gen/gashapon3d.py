"""立體扭蛋機的托盤素材後製(盤底冰面;碗外壁改成程式畫,見 gashapon3d/js/ice-art.js)。圖已在 2026-10-01 生好並選定,這裡只後製。
  PY=tools/mascot-gen/.venv/bin/python
  $PY tools/mascot-gen/gashapon3d.py build-tray
"""
import subprocess
import sys
from pathlib import Path

import numpy as np
from PIL import Image

from gashapon_art import crop_square_center, content_hash, stamp

ROOT = Path(__file__).resolve().parents[2]
OUT = Path(__file__).resolve().parent / 'out' / 'gashapon3d'
IMG = ROOT / 'gashapon3d' / 'img'
ART = ROOT / 'gashapon3d' / 'js' / 'tray-art.js'
PICKS = {'floor': 2}   # 使用者 2026-10-01 選定;冰牆帶(band)後來改成程式畫(gashapon3d/js/ice-art.js)


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

    text = ART.read_text()
    for name in ('floor',):
        text = stamp(text, f'../img/{name}.webp', content_hash(IMG / f'{name}.webp'))
    ART.write_text(text)
    for name in ('floor',):
        print(name, (IMG / f'{name}.webp').stat().st_size // 1024, 'KB')
    # 雜湊變了,首頁的預載清單要跟著重產(預先載入 ①)
    from gashapon import write_preload_manifest
    write_preload_manifest()


if __name__ == '__main__':
    if sys.argv[1:] != ['build-tray']:
        sys.exit(__doc__)
    build_tray()
