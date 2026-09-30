"""生成片段的後處理:去背、接縫、重取樣、拼逐格圖。純函式,不碰檔案。"""
import numpy as np

# 綠色比其他兩色多出 LO 以下 → 完全不透明;多出 HI 以上 → 完全透明。
# 角色是橘、白、深棕,這三種顏色 g - max(r, b) 都 <= 0,不會被吃掉。
LO = 40.0
HI = 120.0


def key_green(rgb):
    f = rgb.astype(np.float32)
    r, g, b = f[..., 0], f[..., 1], f[..., 2]
    rb = np.maximum(r, b)
    dom = g - rb
    alpha = 1.0 - np.clip((dom - LO) / (HI - LO), 0.0, 1.0)
    g = np.minimum(g, rb)          # 綠色溢色:壓到不超過另外兩色
    out = np.stack([r, g, b, alpha * 255.0], axis=-1)
    return np.clip(np.rint(out), 0, 255).astype(np.uint8)


def _mix(a, b, t):
    return np.rint(a.astype(np.float32) * (1 - t) + b.astype(np.float32) * t).astype(np.uint8)


def blend_seam(frames, start_key, end_key):
    """頭尾各 2 格往關鍵圖混合:邊界格 100%、第 2 格 50%。"""
    out = [f.copy() for f in frames]
    out[0] = start_key.copy()
    out[1] = _mix(out[1], start_key, 0.5)
    out[-1] = end_key.copy()
    out[-2] = _mix(out[-2], end_key, 0.5)
    return out


def resample(frames, src_fps, dst_fps):
    if src_fps == dst_fps:
        return list(frames)
    duration = (len(frames) - 1) / src_fps
    n = int(round(duration * dst_fps)) + 1
    return [frames[int(round(i * (len(frames) - 1) / (n - 1)))] for i in range(n)]


def make_sheet(frames, cols):
    h, w, c = frames[0].shape
    rows = -(-len(frames) // cols)
    sheet = np.zeros((rows * h, cols * w, c), np.uint8)
    for i, f in enumerate(frames):
        r, col = divmod(i, cols)
        sheet[r * h:(r + 1) * h, col * w:(col + 1) * w] = f
    return sheet
