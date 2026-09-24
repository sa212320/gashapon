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
import { createAsk } from '../../shared/js/ask.js';
import { setEnabled, unlock, sfx } from '../../shared/js/sound.js';
import { loadPrefs, savePrefs } from '../../shared/js/prefs.js';
import { mountMascots } from '../../shared/js/mascot.js';

const $ = id => document.getElementById(id);

let state = load();
const persist = createDebouncedSave();

// soundOn 是全站共用的偏好,住在 shared/js/prefs.js 的 prefs.v1,
// 不是這台機器自己的存檔 —— 四個模式上線後都要讀寫同一份。
let prefs = loadPrefs();

setEnabled(prefs.soundOn);
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
  view.setSoundIcon(prefs.soundOn);
  const machine = getActiveMachine(state);
  const empty = machine.removeOnDraw && machine.pool.every(c => c.drawn);
  // flyTo() 算的是「角落到錨點」的位移,跟吉祥物現在飛到哪裡無關(見
  // shared/js/mascot.js),不用先 home() 等歸零再飛,呼叫哪個都可以
  // 直接呼叫。
  if (empty) mascots.flyTo($('emptyAnchor'), { pose: 'empty' });
  else mascots.home();
}

function commit() {
  persist(state);
  render();
}

/* ---------- 抽獎 ---------- */
const overlay = $('overlay');
const mascots = mountMascots();

// 只有高階才值得讓牠們衝過來。每抽一次就衝一次的話,那個動作三次之後
// 就不特別了,而且會變成干擾 —— 普通結果在角落換個表情就好。
const BIG = new Set(['SSR', 'UR']);

function closeOverlay() {
  overlay.hidden = true;
  // 不在這裡呼叫 mascots.home() —— render() 底下已經有「空了飛去 emptyAnchor,
  // 否則回角落」的判斷。flyTo() 是用「現在畫面上的位置」算出要飛多遠,如果
  // 這裡先呼叫 home() 把座標歸零,CSS transition 還沒轉場、下一行 render()
  // 馬上又用同一個元素現在的畫面位置去算 flyTo(emptyAnchor) 的位移,
  // 量到的會是「歸零指令生效前」那個舊位置,兩隻會飛錯地方。
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
  mascots.setPose('watch');
  await revealer.play(result.revealSteps);
  $('skipHint').hidden = true;
  if (BIG.has(result.prize.rarity)) {
    mascots.flyTo($('revealAnchor'), { pose: 'cheer' });
  } else {
    mascots.home();
  }
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
  prefs = { ...prefs, soundOn: !prefs.soundOn };
  setEnabled(prefs.soundOn);
  savePrefs(prefs);
  render();
});

// iOS 只承認 click / touchend,pointerdown 跟 touchstart 都不算數,
// 所以兩個都綁上去,誰先來就用誰把音效叫醒。
const unlockOnce = () => { if (prefs.soundOn) unlock(); };
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
    // 這裡把 prefs.soundOn 併進 state 的形狀給 ui-settings.js 看,
    // 它不需要知道音效開關實際上住在哪個 store 裡。
    getState: () => ({ ...state, soundOn: prefs.soundOn }),
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
      if (soundOn !== prefs.soundOn) {
        prefs = { ...prefs, soundOn };
        setEnabled(soundOn);
        savePrefs(prefs);
      }
      commit();
    },
  },
});

$('settingsBtn').addEventListener('click', () => settings.open());

render();
