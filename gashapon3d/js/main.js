// 立體扭蛋機的接線:store ↔ 場景 ↔ 演出。
//
// 演出腳本(revealSteps)跟 2D 那台完全共用 —— 差別只在怎麼把它演出來:
// 2D 是換蛋殼顏色表示升階,3D 的蛋殼是隨機色,所以升階改用**光暈**表示。
// 用殼色表示升階會跟「殼色隨機」直接打架,小孩看一眼就知道哪顆是大獎。
import { store, seedState } from './store.js';
import { openCapsule, tableBatch, refillSetup3d, remaining3d, buildPool3d, remainLabel, nextForTable } from './model.js';
import { createScene, FOCUS_Y } from './scene.js';
import { loadSkins, applySkin, tickSkins } from './skin.js';
import { createRevealFx, particleCount } from '../../shared/js/reveal-fx.js';
import { RARITIES, RARITY_META } from '../../gashapon/js/constants.js';
import { createPrize } from '../../gashapon/js/state.js';
import { cssUrl, waitForImage } from '../../gashapon/js/image-ready.js';
import { fitText } from '../../gashapon/js/fit-text.js';
import { getActive, replaceSetup, addSetup, removeSetup, entriesChanged, needsRebuild } from '../../shared/js/roster.js';
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

const scene = createScene($('scene'));
const ask = createAsk({ dialog: $('askDialog'), text: $('askText'), yes: $('askYes'), no: $('askNo') });
const mascots = mountMascots();
const fx = createRevealFx({ aura: $('aura'), particles: $('particles') });
// 花紋在進頁面時就載好(順便暖快取)。載不到也不擋抽獎:殼停在原本的純色,演出照走
loadSkins().then(ok => { if (!ok) console.warn('[gashapon3d] 花紋沒載到,升級只會閃光不換殼'); });

// 特效層釘在蛋投影到螢幕上的那一點。每次觸發都重取 —— 演出中可能被改過視窗大小。
function aimFx(egg) {
  const p = scene.screenPos(egg);
  $('fx').style.setProperty('--fx-x', `${p.x}px`);
  $('fx').style.setProperty('--fx-y', `${p.y}px`);
}

// 只有高階才值得讓牠們衝過來。每抽一次就衝一次的話,那個動作三次之後
// 就不特別了,而且會變成干擾 —— 普通結果在角落換個表情就好。
const BIG = new Set(['SSR', 'UR']);

/* ---------- 桌上的蛋 ---------- */

let last = performance.now();

function loop(now) {
  const dt = Math.min(0.033, (now - last) / 1000);
  last = now;
  // 演出中物理照跑:被點開的那顆釘住,其他蛋從它下面讓開(scene.pin)
  scene.step(dt);
  // 影子每一格都要更新,連演出期間也是 —— 不然被抽中那顆飛起來,影子會留在原地。
  scene.layout();
  tickSkins(now);
  scene.render();
  requestAnimationFrame(loop);
}

/* ---------- 畫面 ---------- */

function render() {
  const setup = getActive(state);
  const left = remaining3d(setup);
  const tag = remainLabel(setup);
  $('remainTag').textContent = tag.text;
  $('remainTag').hidden = tag.hidden;
  const empty = setup.removeOnDraw && left === 0 && setup.pool.length > 0;
  $('emptyState').hidden = !empty;
  if (empty) {
    // 卡片還開著就不搶著切 empty —— 這個 render() 在每次演出結束後也會
    // 被呼叫(見 play() 的 finally),如果剛好最後一顆就是 SSR/UR,
    // 這裡會在歡呼姿勢都還沒被看到之前立刻蓋成 empty。真正的空機切換
    // 交給 dismissPrize() 關卡片的那一刻自己判斷。
    if ($('prizeCard').hidden) mascots.setPose('empty');
  } else if (mascots.getState().pose === 'empty' || mascots.getState().pose === 'watch') {
    // empty:上一輪卡在 empty 姿勢、現在裝滿重來了,要收尾。
    // watch:play() 若在跑到 'show' 步驟之前就丟例外(drop/shake/upgrade/
    // crack/burst 任何一個 tween 出錯),這裡的 finally 還是會呼叫
    // render(),但 prizeCard 從沒顯示過、dismissPrize() 也不會被觸發,
    // 吉祥物會卡在 watch 回不了角落,要等下一次抽獎才被蓋掉 —— 這裡一起收。
    // cheer 不在這個名單裡:那是歡呼中,收尾交給 dismissPrize(),
    // 不該在這裡被打斷。
    mascots.setPose('idle');
  }
  $('pickHint').hidden = empty || playing;
  $('turnBtn').disabled = empty || playing || setup.pool.length === 0;
  $('soundIcon').setAttribute('href', `../shared/img/icons.svg#${prefs.soundOn ? 'sound-on' : 'sound-off'}`);
}

// 整桌重新擺(只在換機台、裝滿重來、獎項改了的時候)。抽完一顆不重排 ——
// 2026-10-02 使用者回報「抽完盤面會刷新」;按音效鍵也曾因為 render() 而整桌重排。
// 超過 40 顆時排在後面的蛋靠 settleAfterDraw() 每次補一顆上桌,不會永遠挑不到。
function dealTable() {
  scene.setEggs(tableBatch(getActive(state)));
  scene.homeView();
}

/* ---------- 演出 ---------- */

let playing = false;

const wait = ms => new Promise(r => setTimeout(r, ms));

async function play(result, egg) {
  playing = true;
  $('turnBtn').disabled = true;
  $('prizeCard').hidden = true;
  try {
    scene.pin(egg);
    const from = egg.group.position.clone();
    const q0 = egg.group.quaternion.clone();
    let qUp = q0;

    for (const step of result.revealSteps) {
      if (step.type === 'drop') {
        sfx.drop();
        // 飛到桌子中央、鏡頭推近,同時轉正(上半朝上、正面朝鏡頭),後面換上的花紋才是正的
        await tween(600, k => {
          egg.group.position.set(from.x * (1 - k), k * FOCUS_Y, from.z * (1 - k));
          egg.group.scale.setScalar(1 + k * 0.25);
          scene.focusView(k);
          scene.upright(egg, k, q0);
        });
        qUp = egg.group.quaternion.clone();
      } else if (step.type === 'shake') {
        sfx.shake?.(step.tension ?? 0);
        // 在畫面平面裡左右晃,幅度跟 2D 一樣一階比一階大(7 + tension × 5 度)
        const swing = ((7 + (step.tension ?? 0) * 5) * Math.PI) / 180;
        await tween(360, k => scene.wobble(egg, Math.sin(k * Math.PI * 4) * swing * (1 - k * 0.3), qUp));
        egg.group.quaternion.copy(qUp);
      } else if (step.type === 'upgrade') {
        // 升一階 = 殼換成該稀有度的外觀(第一次是從隨機純色直接換 R)+ 雪花 + 光暈 + 彈一下,同 2D
        const level = Math.max(0, RARITIES.indexOf(step.to) - 1);
        sfx.upgrade(level);
        applySkin(egg, step.to);
        aimFx(egg);
        fx.spawnParticles(step.to, particleCount('upgrade', level + 1), { near: true });
        const glow = fx.flashAura(step.to, 2.6 + level * 0.5);
        await tween(480, k => egg.group.scale.setScalar(1.25 + Math.sin(k * Math.PI) * 0.28));
        await glow;
      } else if (step.type === 'crack') {
        sfx.crack();
        // 打開就是把上下兩個半球分開 —— 這顆蛋本來就是兩個半球拼的。
        // 上半最多傾斜 38 度(同 2D 的 rotate(-38deg)):翻過頭會看到半球的圓形底面,
        // 看起來像一整顆球(2026-10-02 使用者看截圖問「上面怎麼變成圓的」)
        await tween(420, k => {
          egg.top.position.y = k * 0.85;
          egg.top.rotation.z = k * 0.33;
          egg.bottom.position.y = -k * 0.25;
        });
      } else if (step.type === 'burst') {
        const level = Math.max(0, RARITIES.indexOf(step.rarity));
        sfx.burst(Math.max(0, level - 1));
        aimFx(egg);
        fx.spawnParticles(step.rarity, particleCount('burst', level));
        const glow = fx.flashAura(step.rarity, 3.4 + level * 0.8);
        // 不再讓整顆繞 y 轉:背面是鏡像的花紋,轉過來會看到反的
        // 兩半繼續飛開、一邊縮小消失(同 2D 的 opacity → 0)
        await tween(380, k => {
          egg.top.position.y = 0.85 + k * 1.4;
          egg.top.rotation.z = 0.33 + k * 0.33;
          egg.bottom.position.y = -0.25 - k * 0.6;
          egg.bottom.rotation.z = -k * 0.35;
          const fade = 1 - k;
          egg.top.scale.setScalar(fade);
          egg.bottom.scale.setScalar(fade);
        });
        await glow;
      } else if (step.type === 'show') {
        const card = $('prizeCard');
        card.dataset.rarity = step.rarity;
        $('prizeBadge').dataset.rarity = step.rarity;
        // 標籤顯示稀有度代號(N / R / SR / SSR / UR),跟扭蛋機頁一致
        $('prizeBadge').textContent = step.rarity;
        $('prizeName').textContent = step.prize?.name ?? '';
        // 等外框圖解碼完才出現(最多 2 秒);等不到先用奶油色保底卡,圖到了再換上
        const frameUrl = cssUrl(getComputedStyle(card).backgroundImage);
        const ready = await waitForImage(frameUrl);
        card.classList.toggle('is-frame-loading', !ready);
        if (!ready) {
          waitForImage(frameUrl, { timeout: 60000 }).then(ok => {
            if (ok && card.dataset.rarity === step.rarity) card.classList.remove('is-frame-loading');
          });
        }
        $('dim').classList.add('is-on');
        card.hidden = false;
        // 卡片是固定大小的外框圖,名字太長就縮字(要在卡片顯示之後量)
        fitText($('prizeName'), $('prizeName').parentElement, { max: 44, min: 18 });
        if (BIG.has(step.rarity)) {
          mascots.setPose('cheer');
        }
        await tween(320, () => {});
      }
    }
  } catch (err) {
    console.error('[gashapon3d] 演出中斷', err);
  } finally {
    // 演出中途丟例外的話,playing 會永遠卡在 true、按鈕永遠是灰的,
    // 而且因為例外通常發生在 rAF 裡,console 不一定看得到 —— 這裡是最後一道防線。
    playing = false;
    settleAfterDraw(egg);
    render();
  }
}

// 抽完:那顆拿下桌、鏡頭退回整桌。補一顆的動作等卡片關掉才做(小孩才看得到它掉進來);
// 演出中途出錯、卡片根本沒出現的話,就立刻補。
let pendingDrop = false;
function settleAfterDraw(egg) {
  scene.removeEgg(egg);
  scene.homeView();
  pendingDrop = true;
  if ($('prizeCard').hidden) dropNext();
}
function dropNext() {
  if (!pendingDrop) return;
  pendingDrop = false;
  const next = nextForTable(getActive(state), new Set(scene.eggs.map(e => e.capsule)));
  if (next) scene.dropEgg(next);
}

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

async function openEgg(egg) {
  if (playing || !egg) return;
  // drawForMe() 跟直接點蛋都會走到這裡,是唯一的抽獎入口 —— 演出一開始
  // 就讓吉祥物抬頭看,不用在兩個呼叫端各自重複一次。
  mascots.setPose('watch');
  const setup = getActive(state);
  const result = openCapsule(setup, egg.capsule);
  state = replaceSetup(state, { ...setup, pool: result.pool });
  persist(state);
  await play(result, egg);
}

// 抽獎鍵:幫你從桌上隨機挑一顆。跟自己點是同一條路,只是代你決定。
function drawForMe() {
  if (dismissPrize()) return;
  const eggs = scene.eggs;
  if (eggs.length === 0) return;
  openEgg(eggs[Math.floor(Math.random() * eggs.length)]);
}

$('turnBtn').addEventListener('click', drawForMe);
$('shakeBtn').addEventListener('click', () => { if (!playing) { scene.shake(); sfx.shake?.(2); } });
$('scene').addEventListener('click', e => {
  // 獎項卡還開著的話,這一下只負責把它收掉,不要順手開下一顆
  if (playing || dismissPrize()) return;
  const egg = scene.pick(e.clientX, e.clientY);
  if (egg) openEgg(egg);
});
// 獎項卡蓋在畫面上時,點**畫面任何地方**都要把它收掉。
// 只在卡片本身監聽的話,點到旁邊沒反應(看起來像卡住),
// 而且點到 canvas 還會直接開下一顆蛋 —— 使用者根本沒看完就被抽掉一顆。
function dismissPrize() {
  if ($('prizeCard').hidden) return false;
  $('prizeCard').hidden = true;
  $('dim').classList.remove('is-on');
  dropNext();
  // 關卡片的當下才是「是不是空了」該由誰接手的正確時機點。
  const setup = getActive(state);
  if (setup.removeOnDraw && remaining3d(setup) === 0) {
    mascots.setPose('empty');
  } else {
    mascots.setPose('idle');
  }
  return true;
}
// 獎項卡開著時,點畫面任何地方都只做「關卡片」這一件事 —— 呼叫
// stopPropagation() 是關鍵:沒有它的話,這個 capture 監聽器把卡片關掉後,
// 同一次點擊還是會繼續往下傳到 #scene 自己的 bubble 監聽器,那裡再呼叫
// 一次 dismissPrize() 時卡片已經是關的(回傳 false),於是往下執行到
// scene.pick() 開下一顆蛋 —— 使用者只是想關卡片,卻被多抽了一顆,而且
// 抽獎結果已經寫進 localStorage,不可逆。根本原因是同一次點擊被兩個
// 各自呼叫 dismissPrize() 的監聽器處理了兩次;stopPropagation() 讓「這次
// 點擊已經被關卡片這個動作吃掉」的事實真的擋住後面的監聽器,而不是
// 事後用旗標補洞。
document.addEventListener('click', e => {
  // 工具列與對話框的按鈕不算「點外面」,不然按設定會被吃掉一次點擊
  if (e.target.closest('.toolbar, .corner-tools, .home-link, dialog')) return;
  // 抽掉最後一顆時 prizeCard 跟 emptyState 會同時顯示。這裡照樣把卡片
  // 關掉(不對空狀態的按鈕特殊放行的話,連卡片都關不掉),但不
  // stopPropagation() —— 讓點擊繼續往下傳到「一鍵裝滿」,不然小孩第一下
  // 點擊只會關卡片,要點第二下才真的裝滿。
  if (dismissPrize() && !e.target.closest('.empty-state')) e.stopPropagation();
}, true);
$('refillBtn').addEventListener('click', () => {
  state = replaceSetup(state, refillSetup3d(getActive(state)));
  persist(state);
  dealTable();
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
    switchSetup(id) { state = { ...state, activeSetupId: id }; persist(state); dealTable(); render(); },
    addSetup() {
      state = addSetup(state, { ...seedState().setups[0], name: '新的機台' });
      persist(state);
      dealTable();
      render();
    },
    deleteSetup(id) {
      state = removeSetup(state, id, () => seedState().setups[0]);
      persist(state);
      dealTable();
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
      // 只改名字或開關的話,桌上的蛋不動(池子還是同一批物件)
      if (rebuild) dealTable();
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
  dealTable();
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

// 揭曉卡片的外框先下載好,第一次揭曉時才不會畫出半張框(同扭蛋機頁的 mountPreloadRack)。
// 不自己組網址:放一排看不到的 .prize-frame[data-rarity],瀏覽器照 CSS 的網址(含 ?v=)下載,
// 跟正式卡片同一份快取。
function warmFrames() {
  const rack = document.createElement('div');
  rack.className = 'preload-rack';
  rack.setAttribute('aria-hidden', 'true');
  for (const r of RARITIES) {
    const f = document.createElement('div');
    f.className = 'prize-card prize-frame';
    f.dataset.rarity = r;
    rack.appendChild(f);
  }
  document.body.appendChild(rack);
}
warmFrames();

scene.resize();
// 場景的第一格畫出來了,才把「載入中」收掉。
const loadingEl = $('loading');
if (loadingEl) loadingEl.hidden = true;

dealTable();
render();
requestAnimationFrame(loop);
