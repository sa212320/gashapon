"""ichiban_art 純函式。跑法:tools/mascot-gen/.venv/bin/python -m unittest discover tools/mascot-gen"""
import unittest

import numpy as np

from ichiban_art import stamp_from_gray


class Stamp(unittest.TestCase):
    def test_black_glyph_becomes_opaque_white_white_bg_transparent(self):
        g = np.full((100, 100), 255, np.uint8)
        g[30:70, 30:70] = 0          # 黑色頭
        g[45:50, 40:45] = 255        # 白色眼睛(鏤空)
        s = stamp_from_gray(g, size=64)
        self.assertEqual(s.shape, (64, 64, 4))
        self.assertTrue((s[..., :3] == 255).all(), '印章一律白色')
        self.assertEqual(int(s[0, 0, 3]), 0, '白底透明')
        self.assertEqual(int(s[32, 50, 3]), 255, '頭不透明')

    def test_cropped_to_glyph_and_square(self):
        g = np.full((100, 200), 255, np.uint8)
        g[10:30, 150:190] = 0
        s = stamp_from_gray(g, size=32)
        # 裁到頭的範圍再置中補成正方形:上下會有透明邊,左右幾乎貼齊
        self.assertGreater(int(s[16, 3, 3]), 0)
        self.assertEqual(int(s[2, 16, 3]), 0)


if __name__ == '__main__':
    unittest.main()
