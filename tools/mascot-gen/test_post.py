"""後處理純函式的測試。跑法:tools/mascot-gen/.venv/bin/python -m unittest discover tools/mascot-gen"""
import unittest

import numpy as np

from post import key_green, blend_seam, resample, make_sheet, select_frames, key_border, keep_largest


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


class SelectFrames(unittest.TestCase):
    def test_no_end_keeps_all(self):
        self.assertEqual(select_frames(list(range(33)), None), list(range(33)))

    def test_end_is_inclusive_and_becomes_last_frame(self):
        out = select_frames(list(range(33)), 16)
        self.assertEqual(out[-1], 16)
        self.assertEqual(len(out), 17)

    def test_end_out_of_range_is_an_error(self):
        with self.assertRaises(ValueError):
            select_frames(list(range(33)), 33)
        with self.assertRaises(ValueError):
            select_frames(list(range(33)), 1)


class KeyBorder(unittest.TestCase):
    """z_image 不一定聽話畫純綠背景(會畫成灰綠、還帶陰影),所以改成:從圖片
    邊緣往內填色,跟角落顏色相近、而且跟邊緣連通的像素才變透明。深色外框擋住
    填色,物件內部就算跟背景同色也不會被吃掉。"""

    def setUp(self):
        # 20x20 灰綠背景,中間 10x10 的物件:2px 深棕外框,內部故意跟背景同色
        self.bg = (120, 140, 110)
        a = np.full((20, 20, 3), self.bg, np.uint8)
        a[5:15, 5:15] = (80, 50, 40)
        a[7:13, 7:13] = self.bg
        self.img = a

    def test_background_becomes_transparent(self):
        out = key_border(self.img)
        self.assertEqual(out[0, 0, 3], 0)
        self.assertEqual(out[19, 10, 3], 0)

    def test_outline_and_enclosed_interior_stay_opaque(self):
        out = key_border(self.img)
        self.assertEqual(out[5, 5, 3], 255)
        self.assertEqual(out[10, 10, 3], 255, '外框裡面跟背景同色也要保留')

    def test_slightly_different_shadow_is_removed(self):
        a = self.img.copy()
        a[16:19, 4:16] = (105, 125, 95)          # 物件下方稍暗的陰影
        out = key_border(a)
        self.assertEqual(out[17, 10, 3], 0)


class KeepLargest(unittest.TestCase):
    def test_isolated_specks_removed_main_object_kept(self):
        a = np.zeros((20, 20, 4), np.uint8)
        a[5:15, 5:15] = (200, 150, 100, 255)    # 主體
        a[1, 1] = (90, 160, 90, 255)            # 散落的小點
        a[18:20, 17:20] = (90, 160, 90, 255)    # 另一小塊
        out = keep_largest(a)
        self.assertEqual(out[10, 10, 3], 255)
        self.assertEqual(out[1, 1, 3], 0)
        self.assertEqual(out[19, 18, 3], 0)


if __name__ == '__main__':
    unittest.main()
