// 大亂鬥的接線:store ↔ 物理 ↔ 畫面。
//
// 這是整個站上**唯一結果不預先決定**的模式 —— 其他模式都是先算好再重播演出,
// 這裡是一格一格算出來的,所以不能有「先決定誰贏」的捷徑。
import { store, seedState, createSmashSetup } from './store.js';
import { createFighter, pickColor } from './fighters.js';
import { createWorld, step, think, shrink, aliveOf, winnerTeam, HIT_POWER, HIT_FULL } from './physics.js';
import { ITEM_TYPES, spawnItem, spawnBomb, applyPickups, explodeBombs } from './items.js';
import { createScene } from './scene3d.js';
import { getActive, replaceSetup, addSetup, removeSetup, entriesChanged } from '../../shared/js/roster.js';
import { createDialogShell } from '../../shared/js/dialog.js';
import { createAsk } from '../../shared/js/ask.js';
import { loadPrefs, savePrefs } from '../../shared/js/prefs.js';
import { sfx, setEnabled, unlock } from '../../shared/js/sound.js';
import { requestPersistence } from '../../shared/js/storage.js';
import { mountMascots } from '../../shared/js/mascot.js';

const $ = id => document.getElementById(id);

const ARENA = 100;
const ITEM_EVERY = 2.6;   // 幾秒掉一個道具
const MAX_TIME = 45;      // 保險:再怎麼僵持也會結束,不會讓小孩看著兩顆球互推到天荒地老

let state = store.load();
let prefs = loadPrefs();
const persist = store.createDebouncedSave();
requestPersistence();
setEnabled(prefs.soundOn);

const scene = createScene($('arena'));
const ask = createAsk({ dialog: $('askDialog'), text: $('askText'), yes: $('askYes'), no: $('askNo') });
const mascots = mountMascots();

let world = null;
let running = false;
let raf = 0;
let nextItem = ITEM_EVERY;

const nameMap = () => new Map(getActive(state).fighters.map(f => [f.id, f]));

function render() {
  const setup = getActive(state);
  $('setupName').textContent = setup.name || '大亂鬥';
  const teams = setup.fighters.filter(f => f.count > 0);
  const people = teams.reduce((a, f) => a + f.count, 0);
  $('remaining').textContent = `${teams.length} 隊 · ${people} 個人`;
  const ready = teams.length >= 2;
  $('emptyState').hidden = ready;
  // 吉祥物「該待在哪裡」只由這裡一個地方決定(空了才飛去 emptyAnchor,
  // 否則回角落)——一定要有 else,不然刪隊伍刪到空了之後又補回來,
  // 吉祥物會永遠卡在 empty。比賽中的 watch/cheer/aww 是暫時姿勢,
  // 由 start()/finish() 自己接手 —— 但 render() 不是只在設定異動時才會
  // 被呼叫:音效鈕在比賽中與結果顯示期間都可以點,點下去一樣會觸發
  // 這裡的 render()。
  if (!ready) mascots.flyTo($('emptyAnchor'), { pose: 'empty' });
  else mascots.home();
  $('arena').hidden = !ready;
  $('startBtn').disabled = !ready || running;
  $('soundIcon').textContent = prefs.soundOn ? '🔊' : '🔇';
  if (ready && !running) reset();
}

function reset() {
  cancelAnimationFrame(raf);
  const setup = getActive(state);
  world = createWorld({ fighters: setup.fighters.filter(f => f.count > 0), arenaRadius: ARENA });
  nextItem = ITEM_EVERY;
  scene.reset();
  scene.resize();
  scene.draw(world, nameMap());
}

// 撞擊音效。同一格可能有好幾下,只播最重的那一下 ——
// 全部播的話會疊成一團爆音,而且聽不出哪一下比較重要。
// 再加一個間隔:混戰時每秒可以有好幾次重擊,連著響會變成機關槍。
const HIT_GAP = 0.13;
let sinceHit = HIT_GAP;

function hitSound(impacts, dt) {
  sinceHit += dt;
  if (!impacts?.length || sinceHit < HIT_GAP) return;
  let best = impacts[0];
  for (const im of impacts) if (im.power > best.power) best = im;
  sfx.hit(Math.min(1, (best.power - HIT_POWER) / (HIT_FULL - HIT_POWER)));
  sinceHit = 0;
}

function start() {
  if (running) return;
  $('winner').hidden = true;
  mascots.home();
  reset();
  running = true;
  $('startBtn').disabled = true;
  mascots.setPose('watch');
  sfx.drop();

  let last = performance.now();
  const frame = now => {
    // dt 封頂:分頁切回來時 now - last 可能是好幾秒,不封的話大家會瞬間飛出場外。
    const dt = Math.min(0.033, (now - last) / 1000);
    last = now;

    const enabled = ITEM_TYPES.filter(t => getActive(state).items[t]);
    nextItem -= dt;
    if (nextItem <= 0 && enabled.length > 0) {
      const type = enabled[Math.floor(Math.random() * enabled.length)];
      world = type === 'bomb' ? spawnBomb(world) : spawnItem(world, type);
      nextItem = ITEM_EVERY;
    }

    const before = aliveOf(world).length;
    world = explodeBombs(world, dt);
    world = applyPickups(world);
    world = think(world, dt);
    world = shrink(world, dt);
    world = step(world, dt);
    if (aliveOf(world).length < before) sfx.clunk();
    hitSound(world.impacts, dt);

    scene.draw(world, nameMap());

    const won = winnerTeam(world);
    if (won || aliveOf(world).length === 0 || world.time > MAX_TIME) {
      finish(won);
      return;
    }
    raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);
}

function finish(teamId) {
  running = false;
  $('startBtn').disabled = false;
  const f = nameMap().get(teamId);
  if (f) {
    sfx.burst(3);
    $('winnerName').textContent = f.name;
    $('winner').style.setProperty('--team-color', f.color);
  } else {
    // 同歸於盡,或是撐到時間上限還沒分出勝負 —— 不要硬挑一隊當贏家。
    $('winnerName').textContent = '平手!';
    $('winner').style.setProperty('--team-color', '#574239');
  }
  $('winner').hidden = false;
  // f 存在 = 有贏家;沒有 = 平手或同歸於盡
  mascots.flyTo($('revealAnchor'), { pose: f ? 'cheer' : 'aww' });
}

$('startBtn').addEventListener('click', start);
$('againBtn').addEventListener('click', start);
$('emptySettingsBtn').addEventListener('click', () => settings.open());
addEventListener('resize', () => { scene.resize(); if (world) scene.draw(world, nameMap()); });

// 切到別的 App 時瀏覽器會停掉 rAF,比賽會卡在半路。直接結束掉,不要留一個永遠打不完的場子。
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden' && running) {
    cancelAnimationFrame(raf);
    finish(winnerTeam(world));
  }
});

/* ---------- 設定 ---------- */

let draft = null;

function snapshot() {
  const s = getActive(state);
  draft = {
    name: s.name,
    fighters: s.fighters.map(f => ({ ...f })),
    items: { ...s.items },
    soundOn: prefs.soundOn,
  };
}

function isDirty() {
  const s = getActive(state);
  return draft.name !== s.name
    || draft.soundOn !== prefs.soundOn
    || ITEM_TYPES.some(t => draft.items[t] !== s.items[t])
    || entriesChanged(s.fighters, draft.fighters);
}

function renderTeams() {
  const people = draft.fighters.reduce((a, f) => a + f.count, 0);
  $('teamHint').textContent = `${draft.fighters.length} 隊 · ${people} 個人(人數就是隊伍大小)`;
  $('teamList').replaceChildren(...draft.fighters.map((f, i) => {
    const li = document.createElement('li');
    li.className = 'edit-row';
    const dot = document.createElement('span');
    dot.className = 'edit-row__dot';
    dot.style.background = f.color;
    const name = document.createElement('input');
    name.className = 'field__input edit-row__name';
    name.value = f.name;
    name.maxLength = 10;
    name.addEventListener('input', () => { draft.fighters[i].name = name.value; });
    const count = document.createElement('input');
    count.className = 'field__input edit-row__count';
    count.type = 'number';
    count.min = '0';
    count.max = '12';
    count.value = String(f.count);
    count.addEventListener('input', () => {
      const v = Number(count.value);
      draft.fighters[i].count = Number.isFinite(v) ? Math.max(0, Math.min(12, Math.floor(v))) : 0;
      renderTeams();
    });
    const del = document.createElement('button');
    del.className = 'chip chip--danger';
    del.type = 'button';
    del.textContent = '刪';
    del.addEventListener('click', () => { draft.fighters.splice(i, 1); renderTeams(); });
    li.append(dot, name, count, del);
    return li;
  }));
}

const ITEM_INPUT = { attack: 'itemAttack', speed: 'itemSpeed', giant: 'itemGiant', bomb: 'itemBomb' };

function renderItems() {
  for (const t of ITEM_TYPES) $(ITEM_INPUT[t]).checked = draft.items[t];
}

function renderOther() {
  $('nameInput').value = draft.name;
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
  tabs: [{ name: 'teams' }, { name: 'items' }, { name: 'other' }],
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
    renderPanels() { renderTeams(); renderItems(); renderOther(); },
    switchSetup(id) { state = { ...state, activeSetupId: id }; persist(state); render(); },
    addSetup() {
      state = addSetup(state, { ...seedState().setups[0], name: '新的一組' });
      persist(state);
      render();
    },
    deleteSetup(id) {
      state = removeSetup(state, id, () => seedState().setups[0]);
      persist(state);
      render();
    },
    applyDraft() {
      prefs = { ...prefs, soundOn: draft.soundOn };
      savePrefs(prefs);
      setEnabled(prefs.soundOn);
      state = replaceSetup(state, {
        ...getActive(state),
        name: draft.name.trim() || '我的大亂鬥',
        fighters: draft.fighters.map(f => ({ ...f })),
        items: { ...draft.items },
      });
      persist(state);
      render();
      return true;
    },
  },
});

$('nameInput').addEventListener('input', () => { draft.name = $('nameInput').value; });
$('soundInput').addEventListener('change', () => { draft.soundOn = $('soundInput').checked; });
for (const t of ITEM_TYPES) {
  $(ITEM_INPUT[t]).addEventListener('change', () => { draft.items[t] = $(ITEM_INPUT[t]).checked; });
}
$('addTeamBtn').addEventListener('click', () => {
  draft.fighters.push(createFighter({
    name: `第${draft.fighters.length + 1}隊`,
    color: pickColor(draft.fighters),
    count: 3,
  }));
  renderTeams();
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

render();

// 第一格畫出來了,才把「載入中」收掉。
const loadingEl = $('loading');
if (loadingEl) loadingEl.hidden = true;
