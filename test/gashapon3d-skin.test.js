// 3D 殼的外觀:這裡釘死「升級從隨機純色開始、第一次直接換 R、N 從頭到尾不換」(模型的錯誤版本 2)。
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRevealSteps } from '../gashapon/js/gacha.js';
import {
  skinSequence, hueRotateMatrix, saturateMatrix, mulMatrix, applyColorMatrix,
  parseGradient, gradientLine, planarUV,
} from '../gashapon3d/js/skin-math.js';

const steps = r => buildRevealSteps(r, null, { turn: false });

test('skinSequence:N 從頭到尾都是隨機純色', () => {
  assert.ok(skinSequence(steps('N')).every(s => s === 'plain'));
});

test('skinSequence:SR = 純色 → R → SR,第一次升級直接換 R', () => {
  const seq = skinSequence(steps('SR'));
  const changes = seq.filter((s, i) => i === 0 || s !== seq[i - 1]);
  assert.deepEqual(changes, ['plain', 'R', 'SR']);
});

test('skinSequence:UR 最後停在 UR', () => {
  assert.equal(skinSequence(steps('UR')).at(-1), 'UR');
});

const near = (a, b) => a.every((v, i) => Math.abs(v - b[i]) < 1e-3);

test('hueRotateMatrix(0) 與 saturateMatrix(1) 是單位矩陣', () => {
  const I = [1, 0, 0, 0, 1, 0, 0, 0, 1];
  assert.ok(near(hueRotateMatrix(0), I));
  assert.ok(near(saturateMatrix(1), I));
  assert.ok(near(mulMatrix(I, hueRotateMatrix(90)), hueRotateMatrix(90)));
});

test('applyColorMatrix:白色轉色相還是白色、alpha 不動', () => {
  const px = new Uint8ClampedArray([255, 255, 255, 77]);
  applyColorMatrix(px, hueRotateMatrix(137));
  assert.deepEqual([...px], [255, 255, 255, 77]);
});

test('applyColorMatrix:紅色轉 180 度偏青', () => {
  const px = new Uint8ClampedArray([255, 0, 0, 255]);
  applyColorMatrix(px, hueRotateMatrix(180));
  assert.ok(px[0] < px[1] && px[0] < px[2], [...px].join(','));
});

test('parseGradient:讀得懂 tokens.css 的 --gold', () => {
  const g = parseGradient('linear-gradient(135deg, #FFE68C 0%, #F7BE1E 38%, #FFF0B3 52%, #E3A008 70%, #F7C948 100%)');
  assert.equal(g.angle, 135);
  assert.equal(g.stops.length, 5);
  assert.deepEqual(g.stops[1], { color: '#F7BE1E', pos: 0.38 });
});

test('parseGradient:多行、沒寫位置的色標平均分配', () => {
  const g = parseGradient(`linear-gradient(115deg,
    #FFA3B1, #FFF1A6, #A6DDFF)`);
  assert.deepEqual(g.stops.map(s => s.pos), [0, 0.5, 1]);
});

test('gradientLine:90deg 是由左到右、穿過中心', () => {
  assert.ok(near(gradientLine(90, 100), [0, 50, 100, 50]));
});

test('planarUV:頂端 v=1、左緣 u=0', () => {
  const uv = planarUV([0, 0.5, 0, -0.5, 0, 0], 0.5);
  assert.ok(near([...uv], [0.5, 1, 0, 0.5]));
});

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

test('3D 的花紋網址跟扭蛋機頁一字不差(含 ?v=),兩台共用快取', () => {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..');
  const skin = readFileSync(join(root, 'gashapon3d/js/skin.js'), 'utf8');
  const css = readFileSync(join(root, 'gashapon/css/style.css'), 'utf8');
  for (const r of ['R', 'SR', 'SSR', 'UR']) {
    const v = css.match(new RegExp(`pattern-${r}\\.webp\\?v=([0-9a-f]{8})`))[1];
    assert.ok(skin.includes(`pattern-${r}.webp?v=${v}`), `pattern-${r} 的雜湊對不上`);
  }
});

test('gradientLine:長方形(UR 的彩虹上下兩半各畫一次,同 2D)', () => {
  // 0deg 由下往上、穿過中心:200×100 的長方形,漸層線長度 = 高度
  assert.ok(near(gradientLine(0, 200, 100), [100, 100, 100, 0]));
});
