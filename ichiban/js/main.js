// 啟動與接線。整個 app 只有這裡持有可變的 state,
// 其他模組都是純函式或只讀 DOM。
import { store, seedState } from './store.js';
import { getActive, replaceSetup, addSetup, removeSetup } from '../../shared/js/roster.js';
import { drawTicket, refillSetup, createIchibanSetup, createIchibanPrize } from './ichiban.js';
import { createDeskView, createRevealer, createSettingsDialog } from './ui.js';
import { createAsk } from '../../shared/js/ask.js';
import { setEnabled, unlock, sfx } from '../../shared/js/sound.js';
import { loadPrefs, savePrefs } from '../../shared/js/prefs.js';
import { requestPersistence } from '../../shared/js/storage.js';

const $ = id => document.getElementById(id);

let state = store.load();
const persist = store.createDebouncedSave();

// soundOn 是全站共用的偏好,住在 shared/js/prefs.js 的 prefs.v1,
// 不是這組一番賞自己的存檔 —— 五個模式上線後都要讀寫同一份。
let prefs = loadPrefs();

setEnabled(prefs.soundOn);
requestPersistence();

const desk = createDeskView({
  pileEl: $('pile'),
  emptyStateEl: $('emptyState'),
  onPick: ticketEl => doDraw(ticketEl),
});

const revealer = createRevealer({
  dim: $('dim'),
  tearCard: $('tearCard'),
  ticket: $('ticket'),
  sleeve: $('sleeve'),
  slot: $('slot'),
  cover: $('cover'),
  coverFill: $('coverFill'),
  cardResult: $('cardResult'),
  cardBadge: $('cardBadge'),
  cardName: $('cardName'),
  aura: $('aura'),
  particles: $('particles'),
});

const ask = createAsk({
  dialog: $('askDialog'),
  text: $('askText'),
  yes: $('askYes'),
  no: $('askNo'),
});

function setSoundIcon() {
  $('soundIcon').textContent = prefs.soundOn ? '🔊' : '🔇';
  $('soundBtn').classList.toggle('is-muted', !prefs.soundOn);
}

function render() {
  const setup = getActive(state);
  $('setupName').textContent = setup.name || '一番賞';
  const left = setup.tickets.filter(t => !t.drawn).length;
  $('remaining').textContent = setup.tickets.length === 0
    ? '還沒有獎項,去設定加一個吧!'
    : `還剩 ${left} 張 / 共 ${setup.tickets.length} 張`;
  desk.render(setup);
  setSoundIcon();
}

function commit() {
  persist(state);
  render();
}

/* ---------- 抽獎:拿起 → 猶豫(取消/撕開)→ 撕開 ---------- */
const overlay = $('overlay');
const skipHint = $('skipHint');
const ticketActions = $('ticketActions');
const holdCancelBtn = $('holdCancelBtn');
const tearBtn = $('tearBtn');

function closeOverlay() {
  overlay.hidden = true;
  // 提示要跟著收，不然下一次「拿起籤紙」還在選取消/撕開時就先冒出「點一下繼續」。
  skipHint.hidden = true;
  revealer.clear();
}

// 等使用者點一下遮罩表示「看完了」。還在播動畫的話,點擊只負責快轉,
// 不會就此關掉 —— 這樣小孩才不會因為手癢一點,直接跳過還沒看到的獎項。
function waitForDismiss() {
  return new Promise(resolve => {
    const handler = () => {
      if (revealer.isPlaying) { revealer.requestSkip(); return; }
      overlay.removeEventListener('click', handler);
      resolve();
    };
    overlay.addEventListener('click', handler);
  });
}

// 等使用者按「取消」或「撕開」。用 { once: true } 保證同一輪抽獎
// 只會有一次選擇,不會因為重複綁定而多算。
function waitForChoice() {
  return new Promise(resolve => {
    holdCancelBtn.addEventListener('click', () => resolve('cancel'), { once: true });
    tearBtn.addEventListener('click', () => resolve('tear'), { once: true });
  });
}

async function doDraw(ticketEl) {
  // 連按:先把正在播的這次快轉完,不要疊在一起
  if (revealer.isPlaying) {
    revealer.requestSkip();
    return;
  }

  const setup = getActive(state);
  // 動畫要從「使用者點的那張籤紙」飛出去,所以先量好它的位置,
  // 等一下桌面重繪之後這個 DOM 節點就不見了,rect 量不到。
  const originRect = ticketEl.getBoundingClientRect();

  // 結果先決定,但先不寫進 state —— 使用者按「取消」的話這個結果就直接丟掉,
  // 那張籤要維持沒被抽掉的樣子,localStorage 也完全不動。
  const result = drawTicket(setup, Math.random);
  if (!result) {
    sfx.empty();
    return;
  }

  overlay.hidden = false;
  await revealer.hold({ tier: result.prize.tier }, originRect);
  ticketActions.hidden = false;

  const choice = await waitForChoice();
  ticketActions.hidden = true;

  if (choice === 'cancel') {
    await revealer.cancelReturn(originRect);
    closeOverlay();
    return;
  }

  // 撕開了才是真的抽獎:這時候才把結果寫進 state、存進 localStorage。
  state = replaceSetup(state, { ...setup, tickets: result.tickets });
  persist(state);
  desk.render(getActive(state));

  skipHint.hidden = false;
  await revealer.tear({ name: result.prize.name, tier: result.prize.tier });
  await waitForDismiss();
  closeOverlay();

  // 最後一抽賞是額外加碼的驚喜:那張籤自己的獎項已經正常顯示過了,
  // 抽走最後一張且設定了名字才會多跳這一張金色的卡。
  if (result.isLastOne && result.lastOnePrize) {
    overlay.hidden = false;
    skipHint.hidden = false;
    await revealer.playBonus(result.lastOnePrize);
    await waitForDismiss();
    closeOverlay();
  }

  skipHint.hidden = true;
  render();
}

overlay.addEventListener('click', () => {
  if (revealer.isPlaying) revealer.requestSkip();
});

// 小孩切去別的 App 時瀏覽器會暫停動畫,演出等於停在半路。
// 直接快轉到結果,切回來就看得到抽到什麼。
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') revealer.requestSkip();
});

$('refillBtn').addEventListener('click', () => {
  state = replaceSetup(state, refillSetup(getActive(state)));
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
    setupSelect: $('setupSelect'),
    addSetupBtn: $('addSetupBtn'),
    deleteSetupBtn: $('deleteSetupBtn'),
    tabsNav: $('tabs'),
    listHint: $('listHint'),
    prizeList: $('prizeList'),
    listRefillBtn: $('listRefillBtn'),
    editList: $('editList'),
    addPrizeBtn: $('addPrizeBtn'),
    nameInput: $('nameInput'),
    lastOneInput: $('lastOneInput'),
    soundInput: $('soundInput'),
    confirmBtn: $('confirmBtn'),
    cancelBtn: $('cancelBtn'),
    closeBtn: $('closeBtn'),
  },
  ask,
  actions: {
    // 這裡把 prefs.soundOn 併進 state 的形狀給 ui.js 看,
    // 它不需要知道音效開關實際上住在哪個 store 裡。
    getState: () => ({ ...state, soundOn: prefs.soundOn }),
    getActiveSetup: () => getActive(state),

    switchSetup(id) {
      state = { ...state, activeSetupId: id };
      commit();
    },

    addSetup() {
      state = addSetup(state, createIchibanSetup({ name: '新的一番賞', prizes: [createIchibanPrize({})] }));
      commit();
    },

    deleteSetup(id) {
      state = removeSetup(state, id, () => seedState().setups[0]);
      commit();
    },

    refill() {
      state = replaceSetup(state, refillSetup(getActive(state)));
      commit();
    },

    applyDraft({ name, lastOnePrize, prizes, rebuildTickets, soundOn }) {
      const setup = getActive(state);
      const next = { ...setup, name, lastOnePrize, prizes };
      state = replaceSetup(state, rebuildTickets ? refillSetup(next) : next);
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
