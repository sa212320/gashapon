"""ghostleg_art 純函式。跑法:tools/mascot-gen/.venv/bin/python -m unittest discover tools/mascot-gen"""
import unittest

import numpy as np
from PIL import Image

from ghostleg_art import cut_white, cut_green, fit_height


def boxed(bg):
    a = np.zeros((100, 100, 3), np.uint8)
    a[:] = bg
    a[20:80, 30:70] = (87, 66, 57)      # 深棕外框
    a[25:75, 35:65] = (255, 255, 255)   # 白身體
    return a


class Cut(unittest.TestCase):
    def test_white_bg_becomes_transparent_but_white_body_inside_outline_stays(self):
        rgba = cut_white(boxed((255, 255, 255)))
        self.assertEqual(int(rgba[2, 2, 3]), 0)
        self.assertEqual(int(rgba[50, 50, 3]), 255, '外框裡的白身體不能被吃掉')

    def test_green_bg_becomes_transparent(self):
        rgba = cut_green(boxed((0, 255, 0)))
        self.assertEqual(int(rgba[2, 2, 3]), 0)
        self.assertEqual(int(rgba[50, 50, 3]), 255)

    def test_fit_height_crops_to_content(self):
        img = fit_height(Image.fromarray(cut_white(boxed((255, 255, 255)))), 120)
        self.assertEqual(img.height, 120)
        self.assertAlmostEqual(img.width / img.height, 40 / 60, delta=0.05)


if __name__ == '__main__':
    unittest.main()
