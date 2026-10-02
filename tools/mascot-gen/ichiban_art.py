"""一番賞票卡素材的純函式(2026-10-02,issue #2)。"""
import numpy as np
from PIL import Image


def stamp_from_gray(gray, size=256, margin=0.04):
    """黑色印章圖(白底)→ 白色 + 透明度:黑的地方不透明白、白的地方(含鏤空的眼睛)透明。
    裁到圖形範圍、置中補成正方形、縮到 size。"""
    a = (255 - gray.astype(np.int32)).clip(0, 255).astype(np.uint8)
    ys, xs = np.nonzero(a > 40)
    a = a[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
    h, w = a.shape
    side = int(round(max(h, w) * (1 + 2 * margin)))
    sq = np.zeros((side, side), np.uint8)
    y0, x0 = (side - h) // 2, (side - w) // 2
    sq[y0:y0 + h, x0:x0 + w] = a
    alpha = np.asarray(Image.fromarray(sq).resize((size, size), Image.LANCZOS))
    out = np.empty((size, size, 4), np.uint8)
    out[..., :3] = 255
    out[..., 3] = alpha
    return out
