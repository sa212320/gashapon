// 阿彌陀籤素材的純函式。染色本身要 canvas,在瀏覽器驗;這裡只測不靠 DOM 的部分。
import test from 'node:test';
import assert from 'node:assert/strict';
import { textColorFor } from '../ghostleg/js/tint.js';
import { ANIMAL_LABEL, TIER_LABEL } from '../ghostleg/js/art.js';
import { ANIMALS, TIERS, PALETTE } from '../ghostleg/js/ladder.js';

test('textColorFor:深色底白字、淺色底深棕字', () => {
  assert.equal(textColorFor('#3D7EA6'), '#FFFFFF');
  assert.equal(textColorFor('#8E6BBF'), '#FFFFFF');
  assert.equal(textColorFor('#E8B830'), '#574239');
  assert.equal(textColorFor('#FFFFFF'), '#574239');
});

test('PALETTE 每一色的名牌字都有至少 3:1 的對比', () => {
  const lum = hex => {
    const c = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255)
      .map(v => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  };
  for (const bg of PALETTE) {
    const fg = textColorFor(bg);
    const [a, b] = [lum(bg), lum(fg)].sort((x, y) => y - x);
    assert.ok((a + 0.05) / (b + 0.05) >= 3, `${bg} 配 ${fg}`);
  }
});

test('每種動物、每個等級都有中文標籤', () => {
  for (const a of ANIMALS) assert.ok(ANIMAL_LABEL[a], a);
  for (const t of TIERS) assert.ok(TIER_LABEL[t], t);
  assert.deepEqual(TIER_LABEL, { plain: '一般', chest: '大獎', deluxe: '頭獎' });
});

import { readFileSync } from 'node:fs';
const mainJs = readFileSync(new URL('../ghostleg/js/main.js', import.meta.url), 'utf8');

test('設定:新增玩家時用 pickAnimal 配動物', () => {
  assert.match(mainJs, /draft\.players\.push\(createPlayer\(\{.*animal: pickAnimal\(draft\.players\) \}\)\)/);
});

test('設定:動物 / 等級選擇器是有 aria-label 的 button', () => {
  assert.match(mainJs, /className = 'edit-row__pick'/);
  assert.match(mainJs, /b\.setAttribute\('aria-label', label\)/);
  assert.match(mainJs, /pickButton\(`\$\{p\.name \|\| '玩家'\}的動物:\$\{ANIMAL_LABEL\[p\.animal\]\}`/);
  assert.match(mainJs, /pickButton\(`\$\{p\.name \|\| '獎項'\}的等級:\$\{TIER_LABEL\[p\.tier\]\}`/);
});

test('頁面等素材載完才畫第一格', () => {
  assert.match(mainJs, /await loadArt\(\);\s*\n\s*render\(\);\s*$/);
});

import { existsSync } from 'node:fs';
const artJs = readFileSync(new URL('../ghostleg/js/art.js', import.meta.url), 'utf8');

test('art.js 引用的圖都存在、網址都帶 8 碼雜湊,而且三種獎品和雪球都有', () => {
  const refs = [...artJs.matchAll(/new URL\('(\.\.\/img\/[^'…]+\.webp[^']*)'/g)].map(m => m[1]);
  for (const r of refs) {
    assert.match(r, /\?v=[0-9a-f]{8}$/, r);
    assert.ok(existsSync(new URL(`../ghostleg/js/${r.split('?')[0]}`, import.meta.url)), r);
  }
  for (const k of ['plain', 'chest', 'deluxe', 'snow']) assert.match(artJs, new RegExp(`${k}: new URL\\('\\.\\./img/prizes/${k}\\.webp`));
  assert.match(artJs, /BOARD_URL = new URL\('\.\.\/img\/board\.webp\?v=/);
});

test('動物不染色(2026-10-02 檢查點 3):只有 animalCanvas,沒有 multiply 染色', async () => {
  const tint = await import('../ghostleg/js/tint.js');
  assert.equal(typeof tint.animalCanvas, 'function');
  assert.equal(tint.tintedAnimal, undefined);
  const src = readFileSync(new URL('../ghostleg/js/tint.js', import.meta.url), 'utf8');
  assert.ok(!/multiply/.test(src));
  for (const f of ['main.js', 'scene-parts.js']) {
    assert.ok(!/tintedAnimal/.test(readFileSync(new URL(`../ghostleg/js/${f}`, import.meta.url), 'utf8')), f);
  }
});

test('設定的動物小圖放在玩家色的底上(玩家色不在動物身上了,要在旁邊看得到)', () => {
  assert.match(mainJs, /b\.style\.background = color/);
});

test('結果卡用 sortResults 排序,每列有動物、名字、獎品圖、獎項名稱', () => {
  assert.match(mainJs, /sortResults\(round\.results, getActive\(state\)\.prizes\)/);
  for (const cls of ['results__animal', 'results__who', 'results__icon', 'results__prize']) assert.match(mainJs, new RegExp(cls));
  assert.match(mainJs, /results__item--deluxe/);
});

test('空狀態不再用 🪜,改成一塊小冰板 + 一隻立牌 + 一個空位', () => {
  const html = readFileSync(new URL('../ghostleg/index.html', import.meta.url), 'utf8');
  const i = html.indexOf('id="emptyState"');
  const empty = html.slice(i, html.indexOf('</div>', html.indexOf('empty-state__text', i)) + 6);
  assert.ok(!/🪜/u.test(empty));
  assert.match(empty, /id="emptyScene"/);
  assert.match(mainJs, /empty-scene__seat--vacant/);
});

// review(升級成 Important):結果卡把名字截成「…」—— 使用者說過「用…也不知道是誰」,老師要照著抄
test('結果卡的名字和獎項不截斷(不用 ellipsis,長的就換行)', () => {
  const css = readFileSync(new URL('../ghostleg/css/ghostleg.css', import.meta.url), 'utf8');
  for (const sel of ['.results__who', '.results__prize']) {
    const rule = css.slice(css.indexOf(`${sel} {`), css.indexOf('}', css.indexOf(`${sel} {`)));
    assert.ok(!/ellipsis|nowrap/.test(rule), `${sel}: ${rule}`);
  }
});

// 2026-10-02 使用者:「下方小狐狸露出來了」—— 畫布只蓋到開始鈕上方,特寫時冰板蓋滿畫布,
// 吉祥物(在畫布後面)只剩下半身從底下那條露出來。跟立體扭蛋機一樣讓畫布撐滿視窗。
test('3D 畫布和大字名牌層撐滿整個視窗(position: fixed; inset: 0)', () => {
  const css = readFileSync(new URL('../ghostleg/css/ghostleg.css', import.meta.url), 'utf8');
  const rule = sel => css.slice(css.indexOf(`${sel} {`), css.indexOf('}', css.indexOf(`${sel} {`)));
  assert.match(rule('.track'), /position: fixed; inset: 0/);
  assert.match(rule('.name-layer'), /position: fixed; inset: 0/);
});

// 2026-10-02 使用者:「是按下開始的時候才左右掃描,不是一進來的時候」
test('進頁面是全景、不掃描;按開始才 2 人特寫掃描,掃完(或點一下跳過)才開跑', () => {
  const body = name => {
    const i = mainJs.indexOf(`function ${name}(`);
    return mainJs.slice(i, mainJs.indexOf('\n}\n', i));
  };
  assert.ok(!/scanPass|beginScan|skipHint/.test(body('showIdle')), 'showIdle 不能開始掃描');
  assert.match(body('start'), /beginScan\(/);
  assert.match(body('beginScan'), /scanPass\(/);
  assert.match(body('beginScan'), /beginRace\(/);
  assert.ok(!/pullT0|PULL/.test(mainJs), '不再有「掃完拉回全景」那一段');
});

test('大字名牌收起時直接消失(只有淡入才有 transition),不會跟底座前的小名牌疊在一起', () => {
  const css = readFileSync(new URL('../ghostleg/css/ghostleg.css', import.meta.url), 'utf8');
  const rule = sel => css.slice(css.indexOf(`${sel} {`), css.indexOf('}', css.indexOf(`${sel} {`)));
  assert.ok(!/transition/.test(rule('.name-layer')));
  assert.match(rule('.name-layer.is-on'), /transition: opacity/);
});

// refute:名牌剛從隱藏變顯示的那一格,offsetWidth 量到 0(還是 display:none),那一格沒夾回畫面、會閃出去
test('大字名牌先取消隱藏再量寬度', () => {
  const i = mainJs.indexOf('function placeNames(');
  const body = mainJs.slice(i, mainJs.indexOf('\n}\n', i));
  assert.ok(body.indexOf('el.hidden = false') > -1 && body.indexOf('el.hidden = false') < body.indexOf('el.offsetWidth'), body);
});

// refute:人多時結果清單每列被擠成 48px,換行的名字印到下一列上
test('結果清單的每一列照內容長高,不會被擠扁', () => {
  const css = readFileSync(new URL('../ghostleg/css/ghostleg.css', import.meta.url), 'utf8');
  const rule = css.slice(css.indexOf('.results__list {'), css.indexOf('}', css.indexOf('.results__list {')));
  assert.match(rule, /grid-auto-rows: max-content/);
});
