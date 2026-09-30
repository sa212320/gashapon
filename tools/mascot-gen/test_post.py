"""後處理純函式的測試。跑法:tools/mascot-gen/.venv/bin/python -m unittest discover tools/mascot-gen"""
import unittest

import numpy as np

from post import key_green, blend_seam, resample, make_sheet


def px(rgb):
    return np.array([[rgb]], dtype=np.uint8)


class KeyGreen(unittest.TestCase):
    def test_pure_green_is_transparent(self):
        self.assertEqual(key_green(px((0, 255, 0)))[0, 0, 3], 0)

    def test_white_ermine_stays_opaque_and_unchanged(self):
        self.assertEqual(key_green(px((255, 255, 255)))[0, 0].tolist(), [255, 255, 255, 255])

    def test_orange_fox_stays_opaque_and_unchanged(self):
        self.assertEqual(key_green(px((240, 140, 60)))[0, 0].tolist(), [240, 140, 60, 255])

    def test_dark_outline_stays_opaque(self):
        self.assertEqual(key_green(px((80, 50, 40)))[0, 0, 3], 255)

    def test_edge_mix_is_partial_and_despilled(self):
        r, g, b, a = key_green(px((128, 191, 0)))[0, 0].tolist()
        self.assertTrue(0 < a < 255, a)
        self.assertLessEqual(g, max(r, b), '綠色溢色要壓到不超過 max(r, b)')


class BlendSeam(unittest.TestCase):
    def setUp(self):
        self.frames = [np.full((2, 2, 4), 100, np.uint8) for _ in range(5)]
        self.start = np.full((2, 2, 4), 0, np.uint8)
        self.end = np.full((2, 2, 4), 200, np.uint8)

    def test_boundary_frames_equal_keys_exactly(self):
        out = blend_seam(self.frames, self.start, self.end)
        self.assertTrue((out[0] == self.start).all())
        self.assertTrue((out[-1] == self.end).all())

    def test_second_frames_are_half_blended(self):
        out = blend_seam(self.frames, self.start, self.end)
        self.assertEqual(int(out[1][0, 0, 0]), 50)
        self.assertEqual(int(out[-2][0, 0, 0]), 150)

    def test_middle_untouched_and_input_not_mutated(self):
        out = blend_seam(self.frames, self.start, self.end)
        self.assertEqual(int(out[2][0, 0, 0]), 100)
        self.assertEqual(int(self.frames[0][0, 0, 0]), 100)


class Resample(unittest.TestCase):
    def test_same_fps_is_identity(self):
        self.assertEqual(resample(list(range(49)), 16, 16), list(range(49)))

    def test_16_to_12_keeps_first_and_last(self):
        out = resample(list(range(49)), 16, 12)
        self.assertEqual(out[0], 0)
        self.assertEqual(out[-1], 48)
        self.assertEqual(len(out), 37)


class MakeSheet(unittest.TestCase):
    def test_layout_and_padding(self):
        frames = [np.full((3, 4, 4), i, np.uint8) for i in range(7)]
        sheet = make_sheet(frames, cols=5)
        self.assertEqual(sheet.shape, (6, 20, 4))
        self.assertEqual(int(sheet[0, 4 * 4, 0]), 4)       # 第 4 格在第一列最後
        self.assertEqual(int(sheet[3, 4 * 1, 0]), 6)       # 第 6 格在第二列第 2 個
        self.assertEqual(int(sheet[3, 4 * 3, 3]), 0)       # 空格是透明的


if __name__ == '__main__':
    unittest.main()
