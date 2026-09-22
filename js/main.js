// 啟動與接線。整個 app 只有這裡持有可變的 state,
// 其他模組都是純函式或只讀 DOM。
import { load, createDebouncedSave, requestPersistence } from './storage.js';
import {
  getActiveMachine, replaceMachine, refillMachine,
  addMachine as addMachineTo, removeMachine as removeMachineFrom,
} from './state.js';
import { draw } from './gacha.js';
import { createRevealer } from './reveal.js';
import { createMachineView } from './ui-machine.js';
import { createSettingsDialog } from './ui-settings.js';
import { createAsk } from './ask.js';
import { setEnabled, unlock, sfx } from './sound.js';

const $ = id => document.getElementById(id);

let state = load();
const persist = createDebouncedSave();

setEnabled(state.soundOn);
requestPersistence();

const view = createMachineView({
  machineName: $('machineName'),
  remaining: $('remaining'),
  capsuleGroup: $('capsuleGroup'),
  emptyState: $('emptyState'),
  drawBtn: $('drawBtn'),
  soundBtn: $('soundBtn'),
  soundIcon: $('soundIcon'),
});

const revealer = createRevealer({
  machine: $('machine'),
  knob: $('knob'),
  eyes: [...document.querySelectorAll('.eye')],
  capsuleGroup: $('capsuleGroup'),
  dim: $('dim'),
  capsule: $('capsule'),
  top: $('capsuleTop'),
  bottom: $('capsuleBottom'),
  aura: $('aura'),
  particles: $('particles'),
  card: $('prizeCard'),
  cardName: $('prizeName'),
  cardBadge: $('prizeBadge'),
});

const ask = createAsk({
  dialog: $('askDialog'),
  text: $('askText'),
  yes: $('askYes'),
  no: $('askNo'),
});

function render() {
  view.render(getActiveMachine(state));
  view.setSoundIcon(state.soundOn);
}

function commit() {
  persist(state);
  render();
}

/* ---------- 抽獎 ---------- */
const overlay = $('overlay');

function closeOverlay() {
  overlay.hidden = true;
  revealer.clear();
  $('capsule').hidden = true;
  render();
}

// turn = 要不要先播「轉把手」那段扭蛋機本體的演出。
// 按「再抽一次」時不播,免得小孩連抽的時候每次都要重看一遍。
async function doDraw({ turn = true } = {}) {
  // 連按:先把正在播的這次快轉完,不要疊在一起
  if (revealer.isPlaying) {
    revealer.requestSkip();
    return;
  }

  const machine = getActiveMachine(state);
  const result = draw(machine, Math.random, { turn });
  if (!result) {
    sfx.empty();
    render();
    return;
  }

  state = replaceMachine(state, { ...machine, pool: result.pool });
  persist(state);

  overlay.hidden = false;
  $('skipHint').hidden = false;
  await revealer.play(result.revealSteps);
  $('skipHint').hidden = true;
  view.render(getActiveMachine(state));
}

$('drawBtn').addEventListener('click', () => doDraw());

// 小孩切去別的 App 時瀏覽器會暫停動畫,演出等於停在半路。
// 直接快轉到結果,切回來就看得到抽到什麼。
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') revealer.requestSkip();
});

$('againBtn').addEventListener('click', e => {
  e.stopPropagation();
  closeOverlay();
  doDraw({ turn: false });
});

overlay.addEventListener('click', () => {
  if (revealer.isPlaying) revealer.requestSkip();
  else closeOverlay();
});

$('refillBtn').addEventListener('click', () => {
  state = replaceMachine(state, refillMachine(getActiveMachine(state)));
  commit();
});

/* ---------- 音效 ---------- */
$('soundBtn').addEventListener('click', () => {
  state = { ...state, soundOn: !state.soundOn };
  setEnabled(state.soundOn);
  commit();
});

// iOS 只承認 click / touchend,pointerdown 跟 touchstart 都不算數,
// 所以兩個都綁上去,誰先來就用誰把音效叫醒。
const unlockOnce = () => { if (state.soundOn) unlock(); };
document.addEventListener('touchend', unlockOnce, { once: true, passive: true });
document.addEventListener('click', unlockOnce, { once: true });

/* ---------- 設定 ---------- */
const settings = createSettingsDialog({
  els: {
    dialog: $('settingsDialog'),
    machineSelect: $('machineSelect'),
    addMachineBtn: $('addMachineBtn'),
    deleteMachineBtn: $('deleteMachineBtn'),
    tabs: $('tabs'),
    listHint: $('listHint'),
    prizeList: $('prizeList'),
    listRefillBtn: $('listRefillBtn'),
    editList: $('editList'),
    addPrizeBtn: $('addPrizeBtn'),
    nameInput: $('nameInput'),
    removeOnDrawInput: $('removeOnDrawInput'),
    soundInput: $('soundInput'),
    confirmBtn: $('confirmBtn'),
    cancelBtn: $('cancelBtn'),
    closeBtn: $('closeBtn'),
  },
  ask,
  actions: {
    getState: () => state,
    getActiveMachine: () => getActiveMachine(state),

    switchMachine(id) {
      state = { ...state, activeMachineId: id };
      commit();
    },

    addMachine() {
      state = addMachineTo(state, '新的扭蛋機');
      commit();
    },

    deleteMachine(id) {
      state = removeMachineFrom(state, id);
      commit();
    },

    refill() {
      state = replaceMachine(state, refillMachine(getActiveMachine(state)));
      commit();
    },

    applyDraft({ name, removeOnDraw, prizes, rebuildPool, soundOn }) {
      const machine = getActiveMachine(state);
      const next = { ...machine, name, removeOnDraw, prizes };
      state = replaceMachine(state, rebuildPool ? refillMachine(next) : next);
      if (soundOn !== state.soundOn) {
        state = { ...state, soundOn };
        setEnabled(soundOn);
      }
      commit();
    },
  },
});

$('settingsBtn').addEventListener('click', () => settings.open());

render();
