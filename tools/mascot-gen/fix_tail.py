"""一次性修圖:原始 idle.webp 把狐狸畫成兩條尾巴(左邊大的 + 身體右後方露出一截)。
把右邊那一截(內部 + 它自己的外框)擦成透明,身體輪廓保留。

做法:外框是深色的粗線,把圖切成互不相連的色塊。從尾巴內部一點填色找出
尾巴色塊,再把它外擴 R 像素 —— 範圍內的深色像素是尾巴自己的外框,但
離身體內部 R 像素以內的深色是身體輪廓,要留下。"""
import sys
import numpy as np
from PIL import Image

R = 13


def grow(mask, allowed, seed):
    m = np.zeros_like(mask)
    m[seed[1], seed[0]] = True
    while True:
        n = m.copy()
        n[1:] |= m[:-1]; n[:-1] |= m[1:]; n[:, 1:] |= m[:, :-1]; n[:, :-1] |= m[:, 1:]
        n &= allowed
        if (n == m).all():
            return m
        m = n


def dilate(m, r):
    out = m.copy()
    for _ in range(r):
        n = out.copy()
        n[1:] |= out[:-1]; n[:-1] |= out[1:]; n[:, 1:] |= out[:, :-1]; n[:, :-1] |= out[:, 1:]
        out = n
    return out


def main(src, dst, tail_seed=(560, 350), body_seed=(480, 400)):
    a = np.asarray(Image.open(src).convert('RGBA')).copy()
    rgb = a[..., :3].astype(int)
    opaque = a[..., 3] > 128
    dark = opaque & (rgb.max(axis=-1) < 110)
    fill = opaque & ~dark
    tail = grow(fill, fill, tail_seed)
    body = grow(fill, fill, body_seed)
    assert not (tail & body).any(), '尾巴跟身體連在一起,填色漏了'
    region = dilate(tail, R)
    keep_outline = dilate(body, 10)
    erase = tail | (region & (dark | (a[..., 3] > 0)) & ~keep_outline & ~body)
    a[erase, 3] = 0
    Image.fromarray(a).save(dst)
    print(f'擦掉 {erase.sum()} 像素(尾巴內部 {tail.sum()})')


if __name__ == '__main__':
    main(*sys.argv[1:3])
