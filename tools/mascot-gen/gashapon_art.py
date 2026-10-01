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


def square_about_seam(rgba, seam):
    """把殼補成正方形,而且分界線剛好在正中間。CSS 把上下兩半各自鋪成「寬 × 一半高」,
    殼不是正圓(UR 有翅膀)或分界線不在中間的話,不補的話會被拉歪。回傳 (圖, 新的分界線 y)。"""
    h, w = rgba.shape[:2]
    half = max(seam, h - seam)
    side = max(w, 2 * half)
    out = np.zeros((side, side, 4), rgba.dtype)
    top = side // 2 - seam
    left = (side - w) // 2
    out[top:top + h, left:left + w] = rgba
    return out, side // 2


def crop_margin(img, frac):
    """裁掉四邊各 frac。花紋貼圖常被模型加上一圈方框,貼到球上會露出來。"""
    h, w = img.shape[:2]
    my, mx = round(h * frac), round(w * frac)
    return img[my:h - my, mx:w - mx]


def panel_bbox(rgba, tol=40.0):
    """外框中間那塊奶油色面板的範圍 (x0, y0, x1, y1):從正中央往外填色,跟中心顏色相差 tol 以內的
    連通區域取外接矩形。裝飾凸進面板一點(UR 下緣的寶石)不影響,因為面板其他地方還是連得到邊。"""
    f = rgba[..., :3].astype(np.float32)
    h, w = f.shape[:2]
    near = np.sqrt(((f - f[h // 2, w // 2]) ** 2).sum(-1)) <= tol
    region = np.zeros((h, w), bool)
    region[h // 2, w // 2] = True
    while True:
        grown = region.copy()
        grown[1:] |= region[:-1]; grown[:-1] |= region[1:]; grown[:, 1:] |= region[:, :-1]; grown[:, :-1] |= region[:, 1:]
        grown &= near
        if (grown == region).all():
            break
        region = grown
    ys, xs = np.nonzero(region)
    return int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1


def fit_panel(rgba, box, canvas, target):
    """把外框縮放、平移到面板剛好落在 target 的位置,放在 canvas (w, h) 大小的透明畫布上。
    5 個等級的框外圍裝飾大小不同(UR 有冰晶冠),以面板對齊,框身與文字區才會一模一樣。"""
    from PIL import Image
    bx0, by0, bx1, by1 = box
    tx0, ty0, tx1, ty1 = target
    sx = (tx1 - tx0) / (bx1 - bx0)
    sy = (ty1 - ty0) / (by1 - by0)
    h, w = rgba.shape[:2]
    scaled = Image.fromarray(rgba).resize((max(1, round(w * sx)), max(1, round(h * sy))), Image.LANCZOS)
    out = Image.new('RGBA', canvas, (0, 0, 0, 0))
    out.paste(scaled, (round(tx0 - bx0 * sx), round(ty0 - by0 * sy)))
    return np.asarray(out)


def compose_card(bg, machine, height_frac=0.82):
    """首頁卡片:背景是 z_image 生的雪地,機台直接用扭蛋機頁那張 —— 兩邊保證是同一台。"""
    from PIL import Image
    out = bg.convert('RGB').copy()
    h = round(out.height * height_frac)
    w = round(machine.width * h / machine.height)
    m = machine.convert('RGBA').resize((w, h), Image.LANCZOS)
    x = (out.width - w) // 2
    y = out.height - h - round(out.height * 0.04)
    out.paste(m, (x, y), m)
    return out
