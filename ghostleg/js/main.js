// 阿彌陀籤的接線:store ↔ 畫面 ↔ 演出。
import { store, seedState } from './store.js';
import {
  createPlayer, createGhostPrize, pickColor, lineup, bottomSlots,
  buildLadder, assign, MAX_PLAYERS,
} from './ladder.js';
import { createTrack, laneWidth, ROW_D } from './track.js';
import { createCameraScript, TOTAL } from './camera-script.js';
import { getActive, replaceSetup, addSetup, removeSetup, entriesChanged } from '../../shared/js/roster.js';
import { createDialogShell } from '../../shared/js/dialog.js';
import { createAsk } from '../../shared/js/ask.js';
import { loadPrefs, savePrefs } from '../../shared/js/prefs.js';
import { sfx, setEnabled, unlock } from '../../shared/js/sound.js';
import { requestPersistence } from '../../shared/js/storage.js';
import { mountMascots } from '../../shared/js/mascot.js';

const $ = id => document.getElementById(id);

let state = store.load();
let prefs = loadPrefs();
const persist = store.createDebouncedSave();
requestPersistence();
setEnabled(prefs.soundOn);

const mascots = mountMascots();

const track = createTrack($('track'));
const ask = createAsk({ dialog: $('askDialog'), text: $('askText'), yes: $('askYes'), no: $('askNo') });

/* ---------- 頂部與空狀態 ---------- */

function render() {
  const setup = getActive(state);
  $('setupName').textContent = setup.name || '阿彌陀籤';
  const n = setup.players.length;
  $('remaining').textContent = `${n} 個人 · ${setup.prizes.reduce((a, p) => a + p.count, 0)} 個獎`;
  const ready = n >= 2;
  $('emptyState').hidden = ready;
  // 吉祥物「該待在哪裡」只由這裡一個地方決定(空了才飛去 emptyAnchor,
  // 否則回角落)——一定要有 else,不然結果揭曉後重新鋪一組設定,
  // 吉祥物會永遠卡在 empty。演出中途的 watch/cheer/aww 是暫時姿勢,
  // 由 start()/finish() 自己接手,不受這裡打擾(這裡不在演出流程裡被呼叫)。
  if (!ready) mascots.flyTo($('emptyAnchor'), { pose: 'empty' });
  else mascots.home();
  $('track').hidden = !ready;
  $('startBtn').disabled = !ready;
  $('soundIcon').textContent = prefs.soundOn ? '🔊' : '🔇';
  if (ready && !running) showIdle();
}

/* ---------- 演出 ---------- */

let running = false;
let raf = 0;
let current = null;

function newRound() {
  const setup = getActive(state);
  const order = lineup(setup.players);
  const slots = bottomSlots(setup.prizes, order.length);
  const ladder = buildLadder({ lanes: order.length });
  return { players: order, slots, ladder, results: assign(ladder, order, slots) };
}

// 待機畫面:擺一局出來給人看,但不跑。梯子是空的 —— 按開始之前不會洩漏答案。
function showIdle() {
  cancelAnimationFrame(raf);
  current = newRound();
  track.build(current);
  track.resize();
  track.setProgress(0);
  const script = createCameraScript({
    camera: track.camera, ladder: current.ladder,
    laneWidth: laneWidth(current.ladder.lanes), rowDepth: ROW_D,
  });
  script(0, []);
  track.setPrizeFly(0);
  track.render();
}

function start() {
  if (running) return;
  running = true;
  $('results').hidden = true;
  $('startBtn').disabled = true;
  mascots.setPose('watch');

  // 待機時擺出來的那一局就是要跑的這一局 —— 重新產一局的話,
  // 使用者剛剛看到的梯子跟等一下跑的會是兩張不同的圖。
  const round = current;
  const script = createCameraScript({
    camera: track.camera, ladder: round.ladder,
    laneWidth: laneWidth(round.ladder.lanes), rowDepth: ROW_D,
  });

  const t0 = performance.now();
  sfx.drop();
  let cheered = false;

  const frame = now => {
    const elapsed = now - t0;
    // 先用上一格的位置擺鏡頭拿到進度,更新位置後再擺一次 —— 不然鏡頭永遠落後一格。
    const { run: t, fly } = script(elapsed, round.runners.map(s => s.position));
    track.setPrizeFly(fly);
    const here = track.setProgress(t);
    script(elapsed, here);
    track.render();

    if (!cheered && t >= 1) {
      cheered = true;
      sfx.burst(2);
    }
    if (elapsed < TOTAL) {
      raf = requestAnimationFrame(frame);
    } else {
      finish(round);
    }
  };
  raf = requestAnimationFrame(frame);
}

function finish(round) {
  running = false;
  $('startBtn').disabled = false;
  const byId = new Map(round.players.map(p => [p.id, p]));
  // 有中獎的排前面。車道順序是洗過的,照它排等於隨機,老師要找某個小孩得一列一列掃。
  const ordered = [...round.results].sort((a, b) =>
    (a.slot.prizeId === null) - (b.slot.prizeId === null));
  $('resultList').replaceChildren(...ordered.map(r => {
    const p = byId.get(r.playerId);
    const li = document.createElement('li');
    li.className = 'results__item' + (r.slot.prizeId === null ? ' results__item--empty' : '');
    const dot = document.createElement('span');
    dot.className = 'results__dot';
    dot.style.background = p.color;
    const who = document.createElement('span');
    who.className = 'results__who';
    who.textContent = p.name;
    const prize = document.createElement('span');
    prize.className = 'results__prize';
    prize.textContent = r.slot.name;
    li.append(dot, who, prize);
    return li;
  }));
  $('results').hidden = false;
  // 全部都是銘謝惠顧才是真的槓龜。有人中獎就值得歡呼。
  const anyWin = round.results.some(r => r.slot.prizeId !== null);
  mascots.flyTo($('revealAnchor'), { pose: anyWin ? 'cheer' : 'aww' });
}

$('startBtn').addEventListener('click', start);
$('againBtn').addEventListener('click', () => {
  $('results').hidden = true;
  mascots.home();
  showIdle();
  start();
});
$('emptySettingsBtn').addEventListener('click', () => settings.open());

// 切到別的 App 時瀏覽器會暫停 rAF,演出等於停在半路;切回來直接補完。
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden' && running) {
    cancelAnimationFrame(raf);
    running = false;
    track.setProgress(1);
    track.render();
    finish(current);
  }
});

addEventListener('resize', () => { track.resize(); track.render(); });

/* ---------- 設定 ---------- */

let draft = null;

function snapshot() {
  const s = getActive(state);
  draft = {
    name: s.name,
    players: s.players.map(p => ({ ...p })),
    prizes: s.prizes.map(p => ({ ...p })),
    soundOn: prefs.soundOn,
  };
}

function isDirty() {
  const s = getActive(state);
  return draft.name !== s.name
    || draft.soundOn !== prefs.soundOn
    || entriesChanged(s.players, draft.players)
    || entriesChanged(s.prizes, draft.prizes);
}

function renderPlayers() {
  $('playerHint').textContent = draft.players.length >= MAX_PLAYERS
    ? `已經到上限 ${MAX_PLAYERS} 個人了`
    : `${draft.players.length} 個人(最多 ${MAX_PLAYERS} 個)`;
  $('addPlayerBtn').disabled = draft.players.length >= MAX_PLAYERS;
  $('playerList').replaceChildren(...draft.players.map((p, i) => {
    const li = document.createElement('li');
    li.className = 'edit-row';
    const dot = document.createElement('span');
    dot.className = 'edit-row__dot';
    dot.style.background = p.color;
    const name = document.createElement('input');
    name.className = 'field__input edit-row__name';
    name.value = p.name;
    name.maxLength = 10;
    name.addEventListener('input', () => { draft.players[i].name = name.value; });
    const del = document.createElement('button');
    del.className = 'chip chip--danger';
    del.type = 'button';
    del.textContent = '刪';
    del.addEventListener('click', () => { draft.players.splice(i, 1); renderPlayers(); });
    li.append(dot, name, del);
    return li;
  }));
}

function renderPrizes() {
  const total = draft.prizes.reduce((a, p) => a + p.count, 0);
  const n = draft.players.length;
  $('prizeHint').textContent = total >= n
    ? `${total} 個獎,${n} 個人 —— 每局隨機挑 ${n} 個上場`
    : `${total} 個獎,${n} 個人 —— 不夠的 ${n - total} 個會補「銘謝惠顧」`;
  $('prizeList').replaceChildren(...draft.prizes.map((p, i) => {
    const li = document.createElement('li');
    li.className = 'edit-row';
    const name = document.createElement('input');
    name.className = 'field__input edit-row__name';
    name.value = p.name;
    name.maxLength = 12;
    name.addEventListener('input', () => { draft.prizes[i].name = name.value; });
    const count = document.createElement('input');
    count.className = 'field__input edit-row__count';
    count.type = 'number';
    count.min = '0';
    count.max = '99';
    count.value = String(p.count);
    count.addEventListener('input', () => {
      const v = Number(count.value);
      draft.prizes[i].count = Number.isFinite(v) ? Math.max(0, Math.min(99, Math.floor(v))) : 0;
      renderPrizes();
    });
    const del = document.createElement('button');
    del.className = 'chip chip--danger';
    del.type = 'button';
    del.textContent = '刪';
    del.addEventListener('click', () => { draft.prizes.splice(i, 1); renderPrizes(); });
    li.append(name, count, del);
    return li;
  }));
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
  tabs: [{ name: 'players' }, { name: 'prizes' }, { name: 'other' }],
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
    renderPanels() { renderPlayers(); renderPrizes(); renderOther(); },
    switchSetup(id) { state = { ...state, activeSetupId: id }; persist(state); render(); },
    addSetup() {
      const seeded = seedState();
      state = addSetup(state, { ...seeded.setups[0], name: '新的一組' });
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
      const s = getActive(state);
      state = replaceSetup(state, {
        ...s,
        name: draft.name.trim() || '我的阿彌陀籤',
        players: draft.players.map(p => ({ ...p })),
        prizes: draft.prizes.map(p => ({ ...p })),
      });
      persist(state);
      render();
      return true;
    },
  },
});

$('nameInput').addEventListener('input', () => { draft.name = $('nameInput').value; });
$('soundInput').addEventListener('change', () => { draft.soundOn = $('soundInput').checked; });
$('addPlayerBtn').addEventListener('click', () => {
  if (draft.players.length >= MAX_PLAYERS) return;
  draft.players.push(createPlayer({ name: `玩家${draft.players.length + 1}`, color: pickColor(draft.players) }));
  renderPlayers();
  renderPrizes();
});
$('addPrizeBtn').addEventListener('click', () => {
  draft.prizes.push(createGhostPrize({ name: '新獎項', count: 1 }));
  renderPrizes();
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

// 場景的第一格畫出來了,才把「載入中」收掉。
const loadingEl = $('loading');
if (loadingEl) loadingEl.hidden = true;

render();
