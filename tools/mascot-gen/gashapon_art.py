"""扭蛋機素材的後處理純函式。不碰網路、不碰 ComfyUI,方便測試。"""
import hashlib
import re
from pathlib import Path

import numpy as np


def anchors_from_pick(knob, outlet, bbox):
    """把比較頁上點出來的像素座標(原圖座標),換成相對於「去背裁切後」圖片的 0–1 比例。
    r 相對於寬,這樣 CSS 用 width 百分比就能直接畫出把手的大小。"""
    x0, y0, x1, y1 = bbox
    w, h = x1 - x0, y1 - y0
    cx, cy, r = knob
    ox, oy = outlet
    q = lambda v: round(v, 4)
    return {
        'aspect': q(w / h),
        'knob': {'cx': q((cx - x0) / w), 'cy': q((cy - y0) / h), 'r': q(r / w)},
        'outlet': {'x': q((ox - x0) / w), 'y': q((oy - y0) / h)},
    }


def cut_disk(rgba, cx, cy, r):
    """切出以 (cx, cy) 為圓心、半徑 r 的圓盤。把手是實心圓盤,原地旋轉時佔的範圍不變,
    所以機身那張不用挖洞也不用補底 —— 它永遠被這張蓋住。"""
    sq = rgba[cy - r:cy + r, cx - r:cx + r].copy()
    yy, xx = np.mgrid[0:2 * r, 0:2 * r]
    outside = (xx - r + 0.5) ** 2 + (yy - r + 0.5) ** 2 > r * r
    sq[outside, 3] = 0
    return sq


def content_hash(path):
    return hashlib.sha1(Path(path).read_bytes()).hexdigest()[:8]


def stamp(text, rel, digest):
    """網址加上內容雜湊:素材換了網址就跟著換,瀏覽器跟 GitHub Pages 的快取不會繼續給舊圖。"""
    return re.sub(re.escape(rel) + r'(\?v=[0-9a-f]{8})?(?![\w.])', f'{rel}?v={digest}', text)


def clear_green_fringe(rgba, margin=25):
    """綠幕去背後的第二道:偏綠(綠比紅、藍都多 margin 以上)而且跟透明區連在一起的像素
    也清掉。z_image 會在機台腳下畫一塊比背景深的綠色陰影,key_border 的容差吃不到它,
    它又連著底座,keep_largest 也清不掉。被深色外框包住的綠色(圓頂裡的綠色扭蛋)
    碰不到透明區,不會被誤吃。"""
    out = rgba.copy()
    f = out[..., :3].astype(np.int32)
    greenish = (f[..., 1] - np.maximum(f[..., 0], f[..., 2]) >= margin) & (out[..., 3] > 0)
    clear = out[..., 3] == 0
    while True:
        grown = clear.copy()
        grown[1:] |= clear[:-1]; grown[:-1] |= clear[1:]; grown[:, 1:] |= clear[:, :-1]; grown[:, :-1] |= clear[:, 1:]
        grown &= greenish | clear
        if (grown == clear).all():
            break
        clear = grown
    out[clear, 3] = 0
    return out


def to_tint_gray(rgba, white=225):
    """轉成給程式上色用的灰階:亮度 >= white 的當成純白(上色後就是準確的稀有度色),
    其餘線性拉伸。模型偶爾偷帶一點顏色也沒關係,這裡全部洗掉。"""
    rgb = rgba[..., :3].astype(np.float32)
    lum = rgb @ np.array([0.299, 0.587, 0.114], np.float32)
    g = np.clip(lum / white * 255, 0, 255).astype(np.uint8)
    return np.dstack([g, g, g, rgba[..., 3]])


def split_at(rgba, y):
    return rgba[:y], rgba[y:]


def split_cells(rgb, n):
    w = rgb.shape[1] // n
    return [rgb[:, i * w:(i + 1) * w] for i in range(n)]
