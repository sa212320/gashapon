// iOS Safari 連點兩下會放大(2026-10-02 使用者:「搖晃按鈕連點兩下還是會縮放」)。
// CSS 的 touch-action 在 iOS 上不一定擋得住,no-zoom.js 再攔一次:300ms 內的第二下 touchend
// 取消預設(=不放大),但**自己補發那一下 click** —— 小孩連點「搖動」每一下都要算數。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = readFileSync(join(root, 'shared/js/no-zoom.js'), 'utf8');

function setup() {
  const listeners = {};
  const document = { addEventListener(type, fn) { (listeners[type] ??= []).push(fn); } };
  let now = 0;
  vm.runInNewContext(src, { document, performance: { now: () => now }, MouseEvent: class { constructor(type, init) { Object.assign(this, { type }, init); } } });
  const fire = (type, ev) => (listeners[type] ?? []).forEach(fn => fn(ev));
  return { fire, at: t => { now = t; } };
}

function tap(x, y, target) {
  const ev = {
    changedTouches: [{ clientX: x, clientY: y }],
    target,
    prevented: false,
    preventDefault() { this.prevented = true; },
  };
  return ev;
}

function el() {
  return { clicks: [], dispatchEvent(e) { this.clicks.push(e); return true; } };
}

test('第一下不攔', () => {
  const { fire, at } = setup();
  const btn = el();
  at(1000);
  const a = tap(10, 10, btn);
  fire('touchend', a);
  assert.equal(a.prevented, false);
  assert.equal(btn.clicks.length, 0);
});

test('300ms 內同一個位置的第二下:取消預設(不放大),而且補發一次 click', () => {
  const { fire, at } = setup();
  const btn = el();
  at(1000); fire('touchend', tap(10, 10, btn));
  at(1200);
  const b = tap(12, 11, btn);
  fire('touchend', b);
  assert.equal(b.prevented, true);
  assert.equal(btn.clicks.length, 1);
  assert.equal(btn.clicks[0].type, 'click');
  assert.equal(btn.clicks[0].clientX, 12);
});

test('隔太久、或離很遠,就是兩次普通的點擊,不攔', () => {
  const { fire, at } = setup();
  const btn = el();
  at(1000); fire('touchend', tap(10, 10, btn));
  at(1500);
  const slow = tap(10, 10, btn);
  fire('touchend', slow);
  assert.equal(slow.prevented, false);
  at(1600);
  const far = tap(200, 300, btn);
  fire('touchend', far);
  assert.equal(far.prevented, false);
});

test('輸入框不攔(要能雙擊選字、叫出鍵盤)', () => {
  const { fire, at } = setup();
  const input = { ...el(), tagName: 'INPUT' };
  at(1000); fire('touchend', tap(10, 10, input));
  at(1100);
  const b = tap(10, 10, input);
  fire('touchend', b);
  assert.equal(b.prevented, false);
});
