"""阿彌陀籤素材的純函式(2026-10-02,issue #3)。"""
from PIL import Image

from post import key_border, keep_largest
from gashapon_art import clear_green_fringe


def cut_white(rgb):
    """白底去背(z_image 生的獎品圖)。從邊緣往內填,深棕外框擋住,框內的白不會被吃。"""
    return key_border(rgb, tol=28.0)


def cut_green(rgb):
    """綠幕去背(Qwen 生的動物)。去掉綠邊、只留最大一塊。"""
    return keep_largest(clear_green_fringe(key_border(rgb)))


def fit_height(img, h):
    img = img.crop(img.getbbox())
    return img.resize((max(1, round(img.width * h / img.height)), h), Image.LANCZOS)
