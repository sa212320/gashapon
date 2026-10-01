"""gashapon_art 純函式。跑法:tools/mascot-gen/.venv/bin/python -m unittest discover tools/mascot-gen"""
import tempfile
import unittest
from pathlib import Path

import numpy as np

from gashapon_art import anchors_from_pick, cut_disk, content_hash, stamp


class Anchors(unittest.TestCase):
    def test_relative_to_cropped_bbox(self):
        a = anchors_from_pick(knob=(150, 250, 25), outlet=(150, 350), bbox=(50, 50, 250, 450))
        self.assertEqual(a, {'aspect': 0.5, 'knob': {'cx': 0.5, 'cy': 0.5, 'r': 0.125}, 'outlet': {'x': 0.5, 'y': 0.75}})

    def test_rounds_to_four_places(self):
        a = anchors_from_pick(knob=(1, 1, 1), outlet=(1, 1), bbox=(0, 0, 3, 3))
        self.assertEqual(a['knob']['cx'], 0.3333)


class CutDisk(unittest.TestCase):
    def test_square_with_transparent_corners(self):
        rgba = np.full((100, 100, 4), 200, np.uint8)
        d = cut_disk(rgba, 50, 50, 20)
        self.assertEqual(d.shape, (40, 40, 4))
        self.assertEqual(d[0, 0, 3], 0)          # 角落在圓外
        self.assertEqual(d[20, 20, 3], 200)      # 圓心保留原本的 alpha

    def test_keeps_existing_transparency_inside(self):
        rgba = np.zeros((60, 60, 4), np.uint8)
        self.assertEqual(cut_disk(rgba, 30, 30, 10)[10, 10, 3], 0)


class Stamp(unittest.TestCase):
    def test_adds_version(self):
        self.assertEqual(stamp('src="img/a.webp"', 'img/a.webp', 'deadbeef'), 'src="img/a.webp?v=deadbeef"')

    def test_replaces_old_version(self):
        self.assertEqual(stamp('url(img/a.webp?v=00000000)', 'img/a.webp', 'deadbeef'), 'url(img/a.webp?v=deadbeef)')

    def test_does_not_touch_other_files(self):
        self.assertEqual(stamp('img/ab.webp', 'img/a.webp', 'deadbeef'), 'img/ab.webp')

    def test_content_hash_is_8_hex(self):
        with tempfile.TemporaryDirectory() as d:
            p = Path(d) / 'x.bin'
            p.write_bytes(b'abc')
            self.assertEqual(content_hash(p), 'a9993e36')


from gashapon_art import clear_green_fringe


class GreenFringe(unittest.TestCase):
    def setUp(self):
        # 透明背景 | 一條偏綠的陰影 | 深色外框 | 框內一顆綠色扭蛋
        a = np.zeros((1, 6, 4), np.uint8)
        a[0, 1] = (120, 190, 120, 255)   # 地面陰影:偏綠,跟透明區相連
        a[0, 2] = (70, 50, 40, 255)      # 外框
        a[0, 3] = (90, 200, 90, 255)     # 框內的綠色扭蛋
        a[0, 4] = (70, 50, 40, 255)
        a[0, 5] = (0, 0, 0, 0)
        self.a = a

    def test_greenish_touching_transparency_is_cleared(self):
        self.assertEqual(clear_green_fringe(self.a)[0, 1, 3], 0)

    def test_green_enclosed_by_outline_is_kept(self):
        self.assertEqual(clear_green_fringe(self.a)[0, 3, 3], 255)

    def test_outline_is_kept(self):
        self.assertEqual(clear_green_fringe(self.a)[0, 2, 3], 255)


from gashapon_art import to_tint_gray, split_at, split_cells


class TintGray(unittest.TestCase):
    def test_channels_equal_and_alpha_kept(self):
        rgba = np.array([[[200, 100, 50, 128]]], np.uint8)
        g = to_tint_gray(rgba)
        self.assertEqual(g[0, 0, 0], g[0, 0, 1]); self.assertEqual(g[0, 0, 1], g[0, 0, 2])
        self.assertEqual(g[0, 0, 3], 128)

    def test_light_becomes_pure_white(self):
        # 模型畫的「白」常常是淡灰或偏暖;拉到 255 上色後才會是準確的稀有度色
        self.assertEqual(to_tint_gray(np.array([[[235, 230, 228, 255]]], np.uint8))[0, 0, 0], 255)

    def test_dark_outline_stays_dark(self):
        self.assertLess(to_tint_gray(np.array([[[87, 66, 57, 255]]], np.uint8))[0, 0, 0], 90)


class Split(unittest.TestCase):
    def test_split_at(self):
        top, bottom = split_at(np.zeros((10, 4, 4), np.uint8), 3)
        self.assertEqual(top.shape[0], 3); self.assertEqual(bottom.shape[0], 7)

    def test_split_cells(self):
        cells = split_cells(np.zeros((10, 50, 3), np.uint8), 5)
        self.assertEqual([c.shape[1] for c in cells], [10] * 5)


from gashapon_art import square_about_seam


class SquareAboutSeam(unittest.TestCase):
    def test_seam_lands_in_the_middle_of_a_square(self):
        a = np.full((30, 20, 4), 255, np.uint8)   # 高 30、寬 20,分界線在 y=10(上面 10、下面 20)
        out, seam = square_about_seam(a, 10)
        self.assertEqual(out.shape[0], out.shape[1])
        self.assertEqual(seam, out.shape[0] // 2)
        self.assertEqual(out.shape[0], 40)          # 下半 20 → 整張 40

    def test_wide_shell_keeps_full_width(self):
        a = np.full((20, 50, 4), 255, np.uint8)   # 翅膀讓殼變寬
        out, seam = square_about_seam(a, 10)
        self.assertEqual(out.shape[:2], (50, 50))
        self.assertEqual(seam, 25)

    def test_padding_is_transparent_and_content_kept(self):
        a = np.full((30, 20, 4), 200, np.uint8)
        out, seam = square_about_seam(a, 10)
        self.assertEqual(out[0, 0, 3], 0)
        self.assertEqual(int(out[seam, out.shape[1] // 2, 3]), 200)


from gashapon_art import crop_margin


class CropMargin(unittest.TestCase):
    def test_crops_each_side(self):
        self.assertEqual(crop_margin(np.zeros((100, 50, 3), np.uint8), 0.1).shape[:2], (80, 40))


from gashapon_art import panel_bbox, fit_panel


class Panel(unittest.TestCase):
    def frame(self, w, h, box):
        a = np.zeros((h, w, 4), np.uint8)
        a[...] = (150, 200, 240, 255)                      # 冰藍框
        x0, y0, x1, y1 = box
        a[y0:y1, x0:x1] = (255, 250, 235, 255)             # 奶油色面板
        return a

    def test_panel_bbox_finds_cream_panel(self):
        self.assertEqual(panel_bbox(self.frame(100, 80, (20, 30, 80, 70))), (20, 30, 80, 70))

    def test_panel_bbox_ignores_ornament_poking_in(self):
        a = self.frame(100, 80, (20, 30, 80, 70))
        a[68:70, 45:55] = (150, 200, 240, 255)             # 下緣寶石凸進面板一點
        self.assertEqual(panel_bbox(a), (20, 30, 80, 70))

    def test_fit_panel_puts_every_panel_in_the_same_place(self):
        target = (100, 150, 700, 500)
        for box in [(20, 30, 80, 70), (10, 40, 90, 60)]:
            out = fit_panel(self.frame(100, 80, box), box, (800, 600), target)
            self.assertEqual(out.shape[:2], (600, 800))
            # 縮放用 Lanczos,邊緣附近會有幾個色階的振鈴,所以比較時留 8 的容差
            close = lambda px, rgb: all(abs(int(a) - b) <= 8 for a, b in zip(px[:3], rgb))
            self.assertTrue(close(out[325, 400], (255, 250, 235)), out[325, 400])   # 面板中心
            self.assertTrue(close(out[325, 80], (150, 200, 240)), out[325, 80])     # 面板左邊外面是框


from gashapon_art import compose_card


class ComposeCard(unittest.TestCase):
    def test_machine_centered_at_bottom_and_scaled(self):
        from PIL import Image
        bg = Image.new('RGB', (400, 300), (0, 0, 255))
        m = Image.new('RGBA', (30, 40), (255, 0, 0, 255))
        out = compose_card(bg, m, 0.5)
        self.assertEqual(out.size, (400, 300))
        self.assertEqual(out.getpixel((200, 250)), (255, 0, 0))   # 機台在底部中間
        self.assertEqual(out.getpixel((10, 10)), (0, 0, 255))     # 其他地方是背景


from gashapon_art import to_white_pattern


class WhitePattern(unittest.TestCase):
    def test_alpha_is_inverted_gray(self):
        gray = np.array([[255, 0], [128, 255]], np.uint8)
        out = to_white_pattern(gray)
        self.assertEqual(out.shape, (2, 2, 4))
        self.assertEqual(out[0, 0, 3], 0)        # 原本白底 → 透明
        self.assertEqual(out[0, 1, 3], 255)      # 原本黑線 → 不透明
        self.assertEqual(tuple(out[0, 1, :3]), (255, 255, 255))

    def test_fill_with_edge(self):
        gray = np.full((9, 9), 255, np.uint8)
        gray[4, 4] = 0
        out = to_white_pattern(gray, fill=(0x7F, 0xD3, 0xFF), edge=(255, 255, 255), edge_px=1)
        self.assertEqual(tuple(out[4, 4, :3]), (0x7F, 0xD3, 0xFF))   # 花紋本體是水晶藍
        self.assertEqual(tuple(out[4, 5, :3]), (255, 255, 255))      # 外圍一圈白邊
        self.assertEqual(out[4, 5, 3], 255)
        self.assertEqual(out[0, 0, 3], 0)                             # 遠處仍透明



from gashapon_art import crop_square_center, ink_rows, make_seamless


class TrayArt(unittest.TestCase):
    def test_crop_square_center(self):
        a = np.zeros((100, 120, 3), np.uint8)
        out = crop_square_center(a, 0.1)
        self.assertEqual(out.shape[:2], (80, 80))

    def test_ink_rows(self):
        a = np.full((10, 10, 3), 255, np.uint8)
        a[2, :] = 40
        a[7, :] = 40
        self.assertEqual(ink_rows(a), (2, 7))

    def test_make_seamless_wraps(self):
        a = np.arange(10, dtype=np.float32)[None, :, None].repeat(2, axis=0).repeat(3, axis=2)
        out = make_seamless(a.astype(np.uint8), 4)
        self.assertEqual(out.shape[1], 6)
        # 接起來的地方:最右一欄是原本第 5 欄,最左一欄要等於原本第 6 欄(緊接在後)
        self.assertEqual(out[0, -1, 0], 5)
        self.assertEqual(out[0, 0, 0], 6)


if __name__ == '__main__':
    unittest.main()
