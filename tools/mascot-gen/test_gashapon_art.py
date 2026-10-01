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
