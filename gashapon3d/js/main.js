// 立體扭蛋機的接線:store ↔ 場景 ↔ 演出。
//
// 演出腳本(revealSteps)跟 2D 那台完全共用 —— 差別只在怎麼把它演出來:
// 2D 是換蛋殼顏色表示升階,3D 的蛋殼是隨機色,所以升階改用**光暈**表示。
// 用殼色表示升階會跟「殼色隨機」直接打架,小孩看一眼就知道哪顆是大獎。
import { store, seedState } from './store.js';
import { draw3d, refillSetup3d, remaining3d, buildPool3d, CAPSULE_COLORS } from './model.js';
import { createScene } from './scene.js';
import { RARITIES, RARITY_META } from '../../gashapon/js/constants.js';
import { createPrize } from '../../gashapon/js/state.js';
import { getActive, replaceSetup, addSetup, removeSetup, entriesChanged, needsRebuild } from '../../shared/js/roster.js';
import { createDialogShell } from '../../shared/js/dialog.js';
import { createAsk } from '../../shared/js/ask.js';
import { loadPrefs, savePrefs } from '../../shared/js/prefs.js';
import { sfx, setEnabled, unlock } from '../../shared/js/sound.js';
import { requestPersistence } from '../../shared/js/storage.js';

const $ = id => document.getElementById(id);

// RARITY_META.UR.color 是字串 'rainbow' —— 那是 2D 那台給 CSS 畫漸層用的哨兵值,
// 不是顏色。直接丟給 THREE.Color.set() 會丟例外,而且例外發生在 rAF 的 callback 裡,
// 演出的 promise 就永遠不會 resolve,整段停住、console 還不一定看得到。
// 3D 這邊把 UR 換成會轉色相的實際顏色,彩虹感由動畫做。
function auraColor(rarity, k = 0) {
  const raw = RARITY_META[rarity]?.color ?? '#FFFFFF';
  if (raw !== 'rainbow') return raw;
  // 逗號不能省:three.js 的 Color.set() 只認舊式的 hsl(h,s%,l%),
  // 現代 CSS 的空格語法 hsl(h s% l%) 它會丟 "Unknown color"。
  return `hsl(${Math.round((k * 360 + performance.now() / 6) % 360)},90%,62%)`;
}

let state = store.load();
let prefs = loadPrefs();
const persist = store.createDebouncedSave();
requestPersistence();
setEnabled(prefs.soundOn);

const scene = createScene($('scene'));
const ask = createAsk({ dialog: $('askDialog'), text: $('askText'), yes: $('askYes'), no: $('askNo') });

/* ---------- 持續轉動的場景 ---------- */

let stir = 0;
let last = performance.now();
let knobSpin = 0;

function loop(now) {
  const dt = Math.min(0.033, (now - last) / 1000);
  last = now;
  scene.step(dt, stir);
  stir = Math.max(0, stir - dt * 2.4);
  if (knobSpin > 0) {
    scene.knob.rotation.y += dt * 9;
    knobSpin = Math.max(0, knobSpin - dt);
  }
  scene.render();
  requestAnimationFrame(loop);
}

/* ---------- 畫面 ---------- */

function render() {
  const setup = getActive(state);
  $('setupName').textContent = setup.name || '立體扭蛋機';
  const left = remaining3d(setup);
  $('remaining').textContent = setup.removeOnDraw
    ? `還剩 ${left} 顆 / 共 ${setup.pool.length} 顆`
    : `共 ${setup.pool.length} 顆(抽到的不會拿走)`;
  const empty = setup.removeOnDraw && left === 0;
  $('emptyState').hidden = !empty;
  $('turnBtn').disabled = empty || playing;
  $('soundIcon').textContent = prefs.soundOn ? '🔊' : '🔇';
  scene.fill(setup.pool);
}

/* ---------- 演出 ---------- */

let playing = false;

const wait = ms => new Promise(r => setTimeout(r, ms));

async function play(result) {
  playing = true;
  $('turnBtn').disabled = true;
  try {
  $('prizeCard').hidden = true;
  scene.setAura('#ffffff', 0);
  scene.setCapsuleColor(result.capsule.color);
  scene.prizeBall.visible = false;

  for (const step of result.revealSteps) {
    if (step.type === 'turn') {
      sfx.crank();
      knobSpin = 0.55;
      stir = 1;
      await wait(620);
    } else if (step.type === 'drop') {
      sfx.drop();
      // 蛋從出口滾到托盤:走一段固定的路徑,不交給物理 —— 物理會偶爾卡住,
      // 而這一步一定要成功,不然使用者會看到一顆永遠沒掉出來的蛋。
      scene.prizeBall.visible = true;
      await tween(560, k => {
        scene.prizeBall.position.set(0, -0.34 + k * (-1.28), k * 0.62);
        scene.prizeBall.scale.setScalar(1 + k * 1.1);
        // 鏡頭同時推近托盤 —— 蛋只有指甲大,不推近的話後面的裂開跟光暈都看不到。
        scene.look(4.6 - k * 1.5, 0.1 - k * 1.0, -0.15 - k * 1.15);
      });
    } else if (step.type === 'shake') {
      sfx.shake?.(step.tension ?? 0);
      await tween(300, k => {
        scene.prizeBall.position.x = Math.sin(k * Math.PI * 6) * 0.08 * (1 - k);
      });
    } else if (step.type === 'upgrade') {
      sfx.upgrade(Math.max(0, RARITIES.indexOf(step.to) - 1));
      await tween(260, k => scene.setAura(auraColor(step.to, k), 0.25 + 0.45 * Math.sin(k * Math.PI)));
      scene.setAura(auraColor(step.to), 0.3);
    } else if (step.type === 'crack') {
      sfx.crack();
      await tween(280, k => scene.prizeBall.scale.setScalar(2.1 + Math.sin(k * Math.PI) * 0.7));
    } else if (step.type === 'burst') {
      sfx.burst(Math.max(0, RARITIES.indexOf(step.rarity) - 1));
      await tween(420, k => {
        scene.setAura(auraColor(step.rarity, k), 0.8 * (1 - k));
        scene.prizeBall.scale.setScalar(2.1 + k * 1.6);
        scene.prizeBall.children[0].material.opacity = 1 - k;
        scene.prizeBall.children[0].material.transparent = true;
      });
      scene.prizeBall.visible = false;
      scene.prizeBall.children[0].material.opacity = 1;
    } else if (step.type === 'show') {
      const meta = RARITY_META[step.rarity] ?? RARITY_META.N;
      // 同一個哨兵值在 CSS 這邊也不能直接用。彩虹交給 class 畫。
      $('prizeCard').classList.toggle('prize-card--ur', meta.color === 'rainbow');
      $('prizeCard').style.setProperty('--tier-color', meta.color === 'rainbow' ? meta.edge : meta.color);
      $('prizeBadge').textContent = meta.label;
      $('prizeName').textContent = step.prize?.name ?? '';
      $('prizeCard').hidden = false;
      await tween(420, k => scene.look(3.1 + k * 1.5, -0.9 + k * 1.0, -1.3 + k * 1.15));
    }
  }

  } catch (err) {
    console.error('[gashapon3d] 演出中斷', err);
  } finally {
    // 演出中途丟例外的話,playing 會永遠卡在 true、按鈕永遠是灰的,
    // 而且因為例外通常發生在 rAF 裡,console 不一定看得到 —— 這裡是最後一道防線。
    playing = false;
    scene.prizeBall.visible = false;
    scene.look(4.6, 0.1, -0.15);
    render();
  }
}

// 這支有兩個保險,兩個都是必要的:
//
// 1. rAF 的 callback 丟例外時,例外不會傳到 promise —— promise 永遠不會 settle,
//    演出停在半路、按鈕永遠是灰的,console 還不一定看得到。要自己接起來轉成 rejection。
// 2. **分頁切到背景時瀏覽器會停掉 rAF**,tick 根本不會再被呼叫。小孩切去別的 App
//    再切回來,就會看到一台按鈕永遠是灰的機器。逾時保險負責把它結束掉。
function tween(ms, fn) {
  return new Promise((resolve, reject) => {
    const t0 = performance.now();
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      try { fn(1); } catch { /* 收尾失敗不該讓整段卡住 */ }
      resolve();
    };
    const tick = now => {
      if (done) return;
      const k = Math.min(1, (now - t0) / ms);
      try {
        fn(k);
      } catch (err) {
        done = true;
        clearTimeout(timer);
        reject(err);
        return;
      }
      if (k < 1) requestAnimationFrame(tick);
      else finish();
    };
    const timer = setTimeout(finish, ms + 1200);
    requestAnimationFrame(tick);
  });
}

async function turn() {
  if (playing) return;
  const setup = getActive(state);
  const result = draw3d(setup);
  if (!result) { sfx.empty(); return; }
  state = replaceSetup(state, { ...setup, pool: result.pool });
  persist(state);
  await play(result);
}

$('turnBtn').addEventListener('click', turn);
$('prizeCard').addEventListener('click', () => { $('prizeCard').hidden = true; });
$('refillBtn').addEventListener('click', () => {
  state = replaceSetup(state, refillSetup3d(getActive(state)));
  persist(state);
  render();
});

/* ---------- 設定 ---------- */

let draft = null;

function snapshot() {
  const s = getActive(state);
  draft = {
    name: s.name,
    removeOnDraw: s.removeOnDraw,
    prizes: s.prizes.map(p => ({ ...p })),
    soundOn: prefs.soundOn,
  };
}

function isDirty() {
  const s = getActive(state);
  return draft.name !== s.name
    || draft.removeOnDraw !== s.removeOnDraw
    || draft.soundOn !== prefs.soundOn
    || entriesChanged(s.prizes, draft.prizes);
}

function renderList() {
  const s = getActive(state);
  $('listHint').textContent = `還剩 ${remaining3d(s)} 顆 / 共 ${s.pool.length} 顆`;
  $('prizeList').replaceChildren(...s.prizes.map(p => {
    const left = s.pool.filter(c => c.prizeId === p.id && !c.drawn).length;
    const li = document.createElement('li');
    const name = document.createElement('span');
    name.textContent = `${RARITY_META[p.rarity]?.label ?? p.rarity} ${p.name}`;
    const n = document.createElement('span');
    n.textContent = `${left} / ${p.count}`;
    li.append(name, n);
    return li;
  }));
}

function renderEdit() {
  $('editList').replaceChildren(...draft.prizes.map((p, i) => {
    const li = document.createElement('li');
    li.className = 'edit-row';
    const name = document.createElement('input');
    name.className = 'field__input edit-row__name';
    name.value = p.name;
    name.maxLength = 12;
    name.addEventListener('input', () => { draft.prizes[i].name = name.value; });
    const rarity = document.createElement('select');
    rarity.className = 'field__input edit-row__rarity';
    rarity.replaceChildren(...RARITIES.map(r => {
      const o = document.createElement('option');
      o.value = r;
      o.textContent = RARITY_META[r].label;
      if (r === p.rarity) o.selected = true;
      return o;
    }));
    rarity.addEventListener('change', () => { draft.prizes[i].rarity = rarity.value; });
    const count = document.createElement('input');
    count.className = 'field__input edit-row__count';
    count.type = 'number';
    count.min = '0';
    count.max = '99';
    count.value = String(p.count);
    count.addEventListener('input', () => {
      const v = Number(count.value);
      draft.prizes[i].count = Number.isFinite(v) ? Math.max(0, Math.min(99, Math.floor(v))) : 0;
    });
    const del = document.createElement('button');
    del.className = 'chip chip--danger';
    del.type = 'button';
    del.textContent = '刪';
    del.addEventListener('click', () => { draft.prizes.splice(i, 1); renderEdit(); });
    li.append(name, rarity, count, del);
    return li;
  }));
}

function renderOther() {
  $('nameInput').value = draft.name;
  $('removeInput').checked = draft.removeOnDraw;
  $('soundInput').checked = draft.soundOn;
}

const settings = createDialogShell({
  els: {
    dialog: $('settingsDialog'),
    setupSelect: $('setupSelect'),
    addSetupBtn: $('addSetupBtn'),
    deleteSetupBtn: $('deleteSetupBtn'),
    tabsNav: $('tabs'),
    confirmBtn: $('confirmBtn'),
    cancelBtn: $('cancelBtn'),
    closeBtn: $('closeBtn'),
  },
  ask,
  tabs: [{ name: 'list' }, { name: 'edit' }, { name: 'other' }],
  onSetupAdded: () => {
    settings.showTab('other');
    $('nameInput').focus();
    $('nameInput').select();
  },
  actions: {
    getState: () => state,
    getActiveSetup: () => getActive(state),
    snapshot,
    isDirty,
    renderPanels() { renderList(); renderEdit(); renderOther(); },
    switchSetup(id) { state = { ...state, activeSetupId: id }; persist(state); render(); },
    addSetup() {
      state = addSetup(state, { ...seedState().setups[0], name: '新的機台' });
      persist(state);
      render();
    },
    deleteSetup(id) {
      state = removeSetup(state, id, () => seedState().setups[0]);
      persist(state);
      render();
    },
    async applyDraft() {
      const s = getActive(state);
      // 只有獎項真的變動才重建池子 —— 只改名字或開關不該把進度洗掉。
      const rebuild = needsRebuild(s.prizes, draft.prizes);
      if (rebuild && !await ask('獎項變了,扭蛋機會重新裝滿喔!')) return false;

      prefs = { ...prefs, soundOn: draft.soundOn };
      savePrefs(prefs);
      setEnabled(prefs.soundOn);

      const prizes = draft.prizes.map(p => ({ ...p }));
      state = replaceSetup(state, {
        ...s,
        name: draft.name.trim() || '我的立體扭蛋機',
        removeOnDraw: draft.removeOnDraw,
        prizes,
        pool: rebuild ? buildPool3d(prizes) : s.pool,
      });
      persist(state);
      render();
      return true;
    },
  },
});

$('nameInput').addEventListener('input', () => { draft.name = $('nameInput').value; });
$('removeInput').addEventListener('change', () => { draft.removeOnDraw = $('removeInput').checked; });
$('soundInput').addEventListener('change', () => { draft.soundOn = $('soundInput').checked; });
$('addPrizeBtn').addEventListener('click', () => {
  draft.prizes.push(createPrize({ name: '新獎項', count: 1, rarity: 'N' }));
  renderEdit();
});
$('listRefillBtn').addEventListener('click', async () => {
  if (!await ask('要把扭蛋機裝滿重來嗎?')) return;
  state = replaceSetup(state, refillSetup3d(getActive(state)));
  persist(state);
  render();
  renderList();
});
$('settingsBtn').addEventListener('click', () => settings.open());
$('soundBtn').addEventListener('click', () => {
  prefs = { ...prefs, soundOn: !prefs.soundOn };
  savePrefs(prefs);
  setEnabled(prefs.soundOn);
  render();
});

// iOS 的 WebKit 只承認 click / touchend 這類手勢,pointerdown 不算。
document.addEventListener('click', () => unlock(), { once: true });
addEventListener('resize', () => scene.resize());

scene.resize();
render();
requestAnimationFrame(loop);
