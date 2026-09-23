// 大亂鬥的接線:store ↔ 物理 ↔ 畫面。
//
// 這是整個站上**唯一結果不預先決定**的模式 —— 其他模式都是先算好再重播演出,
// 這裡是一格一格算出來的,所以不能有「先決定誰贏」的捷徑。
import { store, seedState, createSmashSetup } from './store.js';
import { createFighter, pickColor } from './fighters.js';
import { createWorld, step, seek, shrink, aliveOf, winnerTeam } from './physics.js';
import { ITEM_TYPES, spawnItem, spawnBomb, applyPickups, explodeBombs } from './items.js';
import { createRenderer } from './ui.js';
import { getActive, replaceSetup, addSetup, removeSetup, entriesChanged } from '../../shared/js/roster.js';
import { createDialogShell } from '../../shared/js/dialog.js';
import { createAsk } from '../../shared/js/ask.js';
import { loadPrefs, savePrefs } from '../../shared/js/prefs.js';
import { sfx, setEnabled, unlock } from '../../shared/js/sound.js';
import { requestPersistence } from '../../shared/js/storage.js';

const $ = id => document.getElementById(id);

const ARENA = 100;
const ITEM_EVERY = 2.6;   // 幾秒掉一個道具
const MAX_TIME = 45;      // 保險:再怎麼僵持也會結束,不會讓小孩看著兩顆球互推到天荒地老

let state = store.load();
let prefs = loadPrefs();
const persist = store.createDebouncedSave();
requestPersistence();
setEnabled(prefs.soundOn);

const renderer = createRenderer($('arena'));
const ask = createAsk({ dialog: $('askDialog'), text: $('askText'), yes: $('askYes'), no: $('askNo') });

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
  renderer.resize(ARENA);
  renderer.draw(world, nameMap());
}

function start() {
  if (running) return;
  $('winner').hidden = true;
  reset();
  running = true;
  $('startBtn').disabled = true;
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
    world = seek(world, dt);
    world = shrink(world, dt);
    world = step(world, dt);
    if (aliveOf(world).length < before) sfx.clunk();

    renderer.draw(world, nameMap());

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
}

$('startBtn').addEventListener('click', start);
$('againBtn').addEventListener('click', start);
$('emptySettingsBtn').addEventListener('click', () => settings.open());
addEventListener('resize', () => { renderer.resize(ARENA); if (world) renderer.draw(world, nameMap()); });

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
