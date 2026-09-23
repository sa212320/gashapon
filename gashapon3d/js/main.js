// 立體扭蛋機的接線:store ↔ 場景 ↔ 演出。
//
// 演出腳本(revealSteps)跟 2D 那台完全共用 —— 差別只在怎麼把它演出來:
// 2D 是換蛋殼顏色表示升階,3D 的蛋殼是隨機色,所以升階改用**光暈**表示。
// 用殼色表示升階會跟「殼色隨機」直接打架,小孩看一眼就知道哪顆是大獎。
import { store, seedState } from './store.js';
import { openCapsule, tableBatch, refillSetup3d, remaining3d, buildPool3d } from './model.js';
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

/* ---------- 桌上的蛋 ---------- */

let last = performance.now();

function loop(now) {
  const dt = Math.min(0.033, (now - last) / 1000);
  last = now;
  if (!playing) scene.step(dt);
  // 影子每一格都要更新,連演出期間也是 —— 不然被抽中那顆飛起來,影子會留在原地。
  scene.layout();
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
  $('pickHint').hidden = empty || playing;
  $('turnBtn').disabled = empty || playing;
  $('soundIcon').textContent = prefs.soundOn ? '🔊' : '🔇';
  if (!playing) dealTable();
}

// 每次抽完重新抽樣一批擺上桌 —— 固定擺前面幾顆的話,排在後面的蛋永遠不會被挑到。
function dealTable() {
  scene.setEggs(tableBatch(getActive(state)));
  scene.look(5.6, 6.2);
}

/* ---------- 演出 ---------- */

let playing = false;

const wait = ms => new Promise(r => setTimeout(r, ms));

async function play(result, egg) {
  playing = true;
  $('turnBtn').disabled = true;
  $('prizeCard').hidden = true;
  scene.setAura?.('#ffffff', 0);
  try {
    const from = egg.group.position.clone();

    for (const step of result.revealSteps) {
      if (step.type === 'drop') {
        sfx.drop();
        // 被點到的那顆飛到桌子中央、鏡頭同時推近。其他蛋讓開一點。
        await tween(480, k => {
          egg.group.position.set(from.x * (1 - k), k * 0.9, from.z * (1 - k));
          egg.group.scale.setScalar(1 + k * 0.32);
          // 推近要留餘裕:推到底時蛋只該佔畫面的三分之一左右,
          // 太近的話旁邊沒被選到的蛋會脹大到擠滿邊緣,看起來像壞掉。
          scene.look(5.6 - k * 1.1, 6.2 - k * 2.6, k * 0.85);
        });
      } else if (step.type === 'shake') {
        sfx.shake?.(step.tension ?? 0);
        await tween(300, k => {
          egg.group.rotation.z = Math.sin(k * Math.PI * 6) * 0.22 * (1 - k);
        });
      } else if (step.type === 'upgrade') {
        sfx.upgrade(Math.max(0, RARITIES.indexOf(step.to) - 1));
        // 蛋殼是隨機色,升階不能靠改殼色表示 —— 用「彈一下 + 變亮」代替。
        await tween(260, k => {
          const pop = 1.32 + Math.sin(k * Math.PI) * 0.18;
          egg.group.scale.setScalar(pop);
        });
      } else if (step.type === 'crack') {
        sfx.crack();
        // 打開就是把上下兩個半球分開 —— 這顆蛋本來就是兩個半球拼的。
        await tween(420, k => {
          egg.top.position.y = k * 0.85;
          egg.top.rotation.x = -k * 0.5;
          egg.bottom.position.y = -k * 0.25;
        });
      } else if (step.type === 'burst') {
        sfx.burst(Math.max(0, RARITIES.indexOf(step.rarity) - 1));
        await tween(380, k => {
          egg.top.position.y = 0.85 + k * 1.4;
          egg.top.rotation.x = -0.5 - k * 1.6;
          egg.bottom.position.y = -0.25 - k * 0.5;
          egg.group.rotation.y += 0.04;
        });
      } else if (step.type === 'show') {
        const meta = RARITY_META[step.rarity] ?? RARITY_META.N;
        // UR 的 color 是哨兵值 'rainbow',不是顏色 —— CSS 這邊交給 class 畫。
        $('prizeCard').classList.toggle('prize-card--ur', meta.color === 'rainbow');
        $('prizeCard').style.setProperty('--tier-color', meta.color === 'rainbow' ? meta.edge : meta.color);
        $('prizeBadge').textContent = meta.label;
        $('prizeName').textContent = step.prize?.name ?? '';
        $('prizeCard').hidden = false;
        await tween(400, () => {});
      }
    }
  } catch (err) {
    console.error('[gashapon3d] 演出中斷', err);
  } finally {
    // 演出中途丟例外的話,playing 會永遠卡在 true、按鈕永遠是灰的,
    // 而且因為例外通常發生在 rAF 裡,console 不一定看得到 —— 這裡是最後一道防線。
    playing = false;
    render();
  }
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
$('shakeBtn').addEventListener('click', () => { if (!playing) { scene.shake(1); sfx.shake?.(2); } });
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
  return true;
}
document.addEventListener('click', e => {
  // 工具列與對話框的按鈕不算「點外面」,不然按設定會被吃掉一次點擊
  if (e.target.closest('.toolbar, dialog')) return;
  dismissPrize();
}, true);
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
