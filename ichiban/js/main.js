// 啟動與接線。整個 app 只有這裡持有可變的 state,
// 其他模組都是純函式或只讀 DOM。
import { store, seedState } from './store.js';
import { getActive, replaceSetup, addSetup, removeSetup } from '../../shared/js/roster.js';
import { drawTicket, refillSetup, createIchibanSetup, createIchibanPrize } from './ichiban.js';
import { createDeskView, createRevealer, createSettingsDialog } from './ui.js';
import { tiltFor } from './desk-layout.js';
import { loadCardArt } from './card-art.js';
import { createAsk } from '../../shared/js/ask.js';
import { setEnabled, unlock, sfx } from '../../shared/js/sound.js';
import { loadPrefs, savePrefs } from '../../shared/js/prefs.js';
import { requestPersistence } from '../../shared/js/storage.js';
import { mountMascots } from '../../shared/js/mascot.js';

const $ = id => document.getElementById(id);

const mascots = mountMascots();

// A/B 賞跟最後一抽賞才值得衝過來。C 賞以下是常態,每次都衝會變干擾。
const BIG_TIERS = new Set(['A', 'B']);

let state = store.load();
const persist = store.createDebouncedSave();

// soundOn 是全站共用的偏好,住在 shared/js/prefs.js 的 prefs.v1,
// 不是這組一番賞自己的存檔 —— 五個模式上線後都要讀寫同一份。
let prefs = loadPrefs();

setEnabled(prefs.soundOn);
requestPersistence();

const desk = createDeskView({
  deskEl: $('desk'),
  pileEl: $('pile'),
  canvasEl: $('deskCanvas'),
  boxEl: $('dealBox'),
  emptyStateEl: $('emptyState'),
  onPick: ticketEl => doDraw(ticketEl),
});

const revealer = createRevealer({
  dim: $('dim'),
  tearCard: $('tearCard'),
  canvas: $('tearCanvas'),
  cardResult: $('cardResult'),
  cardBadge: $('cardBadge'),
  cardName: $('cardName'),
  aura: $('aura'),
  particles: $('particles'),
  ticketActions: $('ticketActions'),
  holdCancelBtn: $('holdCancelBtn'),
  tearBtn: $('tearBtn'),
  tearHint: $('tearHint'),
});

const ask = createAsk({
  dialog: $('askDialog'),
  text: $('askText'),
  yes: $('askYes'),
  no: $('askNo'),
});

function setSoundIcon() {
  $('soundIcon').setAttribute('href', `../shared/img/icons.svg#${prefs.soundOn ? 'sound-on' : 'sound-off'}`);
  $('soundBtn').classList.toggle('is-muted', !prefs.soundOn);
}

// deal = 播開場動畫(籤從盒子裡飛出來)。只有進頁面、鋪新一桌、籤重建、換一組一番賞才播;
// 抽一張、改音效之類的重畫都不播(2026-10-02 grill)。
function render({ deal = false } = {}) {
  const setup = getActive(state);
  // 標題列跟「還剩幾張」都拿掉了(2026-10-02 使用者:小字沒用);桌上看得到還剩哪些籤
  if (deal) desk.deal(setup); else desk.render(setup);
  setSoundIcon();

  // 吉祥物的待機姿勢只由這裡一個地方決定 —— 不要在 closeOverlay()
  // 之類的地方也做這個判斷,不然兩邊會打架。
  // 一定要有 else:少了它,抽完後重新鋪一桌,吉祥物會永遠卡在 empty。
  mascots.setPose(setup.tickets.length > 0 && left === 0 ? 'empty' : 'idle');
}

function commit({ deal = false } = {}) {
  persist(state);
  render({ deal });
}

// 在設定對話框裡鋪新一桌 / 換一組:動畫等對話框關掉才播,不然會在對話框後面播完
let pendingDeal = false;
function commitAndDealLater() {
  pendingDeal = true;
  commit();
}
$('settingsDialog').addEventListener('close', () => {
  if (!pendingDeal) return;
  pendingDeal = false;
  desk.deal(getActive(state));
});

/* ---------- 抽獎:拿起 → 猶豫(取消/撕開)→ 撕開 ---------- */
const overlay = $('overlay');
const skipHint = $('skipHint');

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


async function doDraw(ticketEl) {
  // 連按:先把正在播的這次快轉完,不要疊在一起
  if (revealer.isPlaying) {
    revealer.requestSkip();
    return;
  }

  const setup = getActive(state);
  const no = Number(ticketEl.dataset.no);
  // 動畫要從「使用者點的那張籤紙」飛出去(直放 + 歪斜),所以先量好它的位置,
  // 等一下桌面重繪之後這個 DOM 節點就不見了,rect 量不到。
  const origin = { rect: ticketEl.getBoundingClientRect(), tilt: tiltFor(no) };

  // 結果先決定,但先不寫進 state —— 使用者按「取消」的話這個結果就直接丟掉,
  // 那張籤要維持沒被抽掉的樣子,localStorage 也完全不動。
  // 傳 no:點哪張就抽走哪張(獎項在 drawTicket 裡隨機互換進來)。
  const result = drawTicket(setup, Math.random, no);
  if (!result) {
    sfx.empty();
    return;
  }

  overlay.hidden = false;
  // 拿起籤紙、還沒決定撕不撕:吉祥物看著就好,不用衝過來。
  mascots.setPose('watch');

  // 演出(hold / tear / holdBonus)任何一步丟例外,都不能讓遮罩卡死在畫面上 ——
  // 尤其一番賞後面還在 await waitForDismiss(),那是在等一次點擊才會 resolve
  // 的 promise,例外發生後不會再有人去點,永遠不會 resolve。用 try/catch/
  // finally 把整段包起來:catch 只負責留下線索(console.error),真正的
  // 收尾(關遮罩、收 skipHint、讓吉祥物回到正確位置)統一交給 finally,
  // 不管演出是正常播完、中途取消、還是丟例外,都會跑到同一個地方。
  try {
    await revealer.hold({
      tier: result.prize.tier,
      name: result.prize.name,
      // 號碼決定蓋著那面的顏色與角色(跟桌上那張一樣),而且不洩漏賞別。
      no,
    }, origin);
    // 手指往右撕或按「撕開」(2026-10-02 grill)。拉過 3%(還看不到獎項)或按了撕開就算抽走,
    // 這時才把結果寫進 state、存進 localStorage;之後就算拉回 0% 也一樣 —— 不能偷看再取消。
    const choice = await revealer.waitForTear({
      onCommit: () => {
        state = replaceSetup(state, { ...setup, tickets: result.tickets });
        persist(state);
        desk.render(getActive(state));
      },
    });

    if (choice === 'cancel') {
      await revealer.cancelReturn(origin);
      // 取消不會改變 state。關遮罩、讓吉祥物從 watch 回到正確位置這兩件事
      // 交給下面的 finally 統一處理,不在這裡重複做一次。
      return;
    }

    skipHint.hidden = false;
    await revealer.tear(choice.from);
    // A/B 賞或最後一抽賞才值得吉祥物歡呼。這裡只負責「要不要歡呼」,
    // 歡呼完之後回到哪個姿勢由 render() 決定(在 finally 裡呼叫),
    // 不在這裡搶著設,免得兩個地方互相打架。
    if (BIG_TIERS.has(result.prize.tier) || result.isLastOne) {
      mascots.setPose('cheer');
    }
    await waitForDismiss();
    closeOverlay();

    // 最後一抽賞是額外加碼的驚喜:那張籤自己的獎項已經正常顯示過了,
    // 抽走最後一張且設定了名字才會多跳這一張金色的卡。
    if (result.isLastOne && result.lastOnePrize) {
      overlay.hidden = false;
      // 金卡也用手撕(沒有取消:它本來就一定是你的)
      await revealer.holdBonus(result.lastOnePrize);
      const bonus = await revealer.waitForTear({ cancellable: false });
      skipHint.hidden = false;
      await revealer.tear(bonus.from);
      await waitForDismiss();
      closeOverlay();
    }
  } catch (err) {
    // 不吞掉錯誤:留下賞別等上下文,不然以後出事完全查不到是哪一步炸的。
    console.error('[ichiban] 演出中斷', err, { tier: result.prize?.tier, isLastOne: result.isLastOne });
  } finally {
    // 演出中途丟例外的話,overlay 會永遠卡在畫面上關不掉、skipHint 永遠
    // 顯示著、waitForDismiss() 也永遠不會有人點它 —— 這裡是最後一道防線。
    // 正常路徑其實已經呼叫過 closeOverlay(),這裡再呼叫一次是安全的
    // no-op(都是設 hidden = true / 重置動畫),不會改變正常結果。
    closeOverlay();
    skipHint.hidden = true;
    render();
  }
}

overlay.addEventListener('click', e => {
  // 籤卡上的點擊不算「跳過」:滑鼠拖過 90% 放開時瀏覽器會補送一次 click,
  // 冒泡上來的話整段撕開演出會被快轉到最後(2026-10-02 review)
  if (e.target.closest?.('#tearCard')) return;
  if (revealer.isPlaying) revealer.requestSkip();
});

// 小孩切去別的 App 時瀏覽器會暫停動畫,演出等於停在半路。
// 直接快轉到結果,切回來就看得到抽到什麼。
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') revealer.requestSkip();
});

$('refillBtn').addEventListener('click', () => {
  state = replaceSetup(state, refillSetup(getActive(state)));
  commit({ deal: true });
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
      commitAndDealLater();
    },

    addSetup() {
      state = addSetup(state, createIchibanSetup({ name: '新的一番賞', prizes: [createIchibanPrize({})] }));
      commitAndDealLater();
    },

    deleteSetup(id) {
      state = removeSetup(state, id, () => seedState().setups[0]);
      commitAndDealLater();
    },

    refill() {
      state = replaceSetup(state, refillSetup(getActive(state)));
      commitAndDealLater();
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
      if (rebuildTickets) commitAndDealLater(); else commit();
    },
  },
});

$('settingsBtn').addEventListener('click', () => settings.open());

// 角色頭先下載(首頁也預載過的話會直接中快取);桌面在它好了之後自己重畫。
loadCardArt();
render({ deal: true });
