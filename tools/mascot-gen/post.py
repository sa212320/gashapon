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


def select_frames(frames, end):
    """挑選時可以指定「在第幾格結束」(含那一格),裁掉高峰之後又退回起點的部分。
    至少要留 3 格,接縫混合頭尾各要 2 格。"""
    if end is None:
        return list(frames)
    if not 2 <= end < len(frames):
        raise ValueError(f'結束格 {end} 超出範圍 2..{len(frames) - 1}')
    return list(frames[:end + 1])


def key_border(rgb, tol=40.0):
    """從圖片邊緣往內填色去背:跟四個角落平均色相差 tol 以內、而且跟邊緣連通的
    像素變透明。給不保證畫出純綠背景的模型用(z_image 會把綠底畫成灰綠、帶陰影)。
    物件要有深色外框把背景隔開,外框內跟背景同色的地方才不會被吃掉。"""
    f = rgb.astype(np.float32)
    h, w, _ = f.shape
    corners = np.array([f[0, 0], f[0, -1], f[-1, 0], f[-1, -1]]).mean(axis=0)
    near = np.sqrt(((f - corners) ** 2).sum(axis=-1)) <= tol
    bg = np.zeros((h, w), bool)
    bg[0, :] = near[0, :]; bg[-1, :] = near[-1, :]; bg[:, 0] = near[:, 0]; bg[:, -1] = near[:, -1]
    while True:
        grown = bg.copy()
        grown[1:] |= bg[:-1]; grown[:-1] |= bg[1:]; grown[:, 1:] |= bg[:, :-1]; grown[:, :-1] |= bg[:, 1:]
        grown &= near
        if (grown == bg).all():
            break
        bg = grown
    alpha = np.where(bg, 0, 255).astype(np.uint8)
    return np.dstack([rgb, alpha])


def keep_largest(rgba):
    """只留下面積最大的不透明連通塊(主體),去背後四周散落的小點、小葉子都清掉。"""
    opaque = rgba[..., 3] > 0
    h, w = opaque.shape
    label = np.zeros((h, w), np.int32)
    sizes = [0]
    for y, x in zip(*np.nonzero(opaque)):
        if label[y, x]:
            continue
        n = len(sizes)
        stack = [(y, x)]
        label[y, x] = n
        count = 0
        while stack:
            cy, cx = stack.pop()
            count += 1
            for ny, nx in ((cy + 1, cx), (cy - 1, cx), (cy, cx + 1), (cy, cx - 1)):
                if 0 <= ny < h and 0 <= nx < w and opaque[ny, nx] and not label[ny, nx]:
                    label[ny, nx] = n
                    stack.append((ny, nx))
        sizes.append(count)
    out = rgba.copy()
    if len(sizes) > 1:
        out[label != int(np.argmax(sizes))] = 0
    return out
