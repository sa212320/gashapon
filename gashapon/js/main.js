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
  // 吉祥物固定在右下角,只換姿勢(2026-10-01 起不再飛到畫面中間)
  mascots.setPose(empty ? 'empty' : 'idle');
}

function commit() {
  persist(state);
  render();
}

/* ---------- 抽獎 ---------- */
const overlay = $('overlay');
const mascots = mountMascots();

// 只有高階才值得歡呼。每抽一次就歡呼一次的話,那個動作三次之後
// 就不特別了 —— 普通結果回到待機就好。
const BIG = new Set(['SSR', 'UR']);

function closeOverlay() {
  overlay.hidden = true;
  // 吉祥物的姿勢交給下面的 render() 決定(空了是 empty,否則 idle),
  // 不在這裡另外設,免得兩個地方打架。
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
  // revealer.play() 中途丟例外的話(例如某個 rarity 對到不合法的演出資料),
  // 後面收尾的三件事都不會執行:overlay 關不掉、skipHint 一直顯示、畫面也不會
  // 重新整理 —— 小孩會卡在打不開的遮罩前。用 try/catch/finally 包住:catch
  // 只負責留下線索,真正的收尾統一放 finally,不管成功或丟例外都會跑到。
  try {
    await revealer.play(result.revealSteps);
    if (BIG.has(result.prize.rarity)) {
      mascots.setPose('cheer');
    } else {
      mascots.setPose('idle');
    }
  } catch (err) {
    // 不吞掉錯誤:留下稀有度等上下文,不然以後出事完全查不到是哪一步炸的。
    console.error('[gashapon] 演出中斷', err, { rarity: result.prize?.rarity });
    // 正常演出完成後,overlay 本來就該留著讓小孩看獎項、按「再抽一次」才會關,
    // 不能在這裡順手把它關掉,不然就改變了正常路徑的行為。但演出真的斷在
    // 半路的話,遮罩後面通常什麼都沒畫好,留著只會卡死畫面,這裡才主動關掉。
    closeOverlay();
  } finally {
    $('skipHint').hidden = true;
    view.render(getActiveMachine(state));
  }
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
