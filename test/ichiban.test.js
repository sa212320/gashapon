import test from 'node:test';
import assert from 'node:assert/strict';

import {
  TIERS, TIER_META, createIchibanPrize, createIchibanSetup,
  buildTickets, drawTicket, refillSetup, normalizeTicketNos,
} from '../ichiban/js/ichiban.js';
import { remaining } from '../shared/js/roster.js';

function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

test('賞別固定是 A 到 G 七級', () => {
  assert.deepEqual(TIERS, ['A', 'B', 'C', 'D', 'E', 'F', 'G']);
});

test('一番賞的獎項沒有稀有度這個欄位', () => {
  const prize = createIchibanPrize({ name: '模型', tier: 'A', count: 1 });
  assert.equal('rarity' in prize, false, '一番賞不該有 rarity');
  assert.equal(prize.tier, 'A');
});

test('不認得的賞別退回 G(最低階)', () => {
  assert.equal(createIchibanPrize({ name: 'x', tier: 'Z', count: 1 }).tier, 'G');
});

test('buildTickets 依數量展開', () => {
  const prizes = [
    createIchibanPrize({ name: '模型', tier: 'A', count: 1 }),
    createIchibanPrize({ name: '吊飾', tier: 'C', count: 3 }),
  ];
  const tickets = buildTickets(prizes);
  assert.equal(tickets.length, 4);
  assert.ok(tickets.every(t => t.drawn === false));
});

test('抽一張會消耗一張,而且不動到獎項的 count', () => {
  const setup = createIchibanSetup({
    prizes: [createIchibanPrize({ name: '模型', tier: 'A', count: 3 })],
  });
  const result = drawTicket(setup, seeded(1));
  assert.equal(setup.prizes[0].count, 3, 'prizes 是設定,不該被消耗');
  assert.equal(result.tickets.filter(t => t.drawn).length, 1);
  assert.equal(remaining(setup.tickets), 3, 'drawTicket 不該就地改動 setup');
});

test('抽光了就回 null', () => {
  let setup = createIchibanSetup({
    prizes: [createIchibanPrize({ name: '模型', tier: 'A', count: 2 })],
  });
  const rng = seeded(2);
  for (let i = 0; i < 2; i++) {
    const r = drawTicket(setup, rng);
    assert.ok(r !== null);
    setup = { ...setup, tickets: r.tickets };
  }
  assert.equal(drawTicket(setup, rng), null);
});

test('抽走最後一張才觸發最後一抽賞', () => {
  let setup = createIchibanSetup({
    prizes: [createIchibanPrize({ name: '模型', tier: 'A', count: 3 })],
    lastOnePrize: '特別大獎',
  });
  const rng = seeded(3);
  const seen = [];
  for (let i = 0; i < 3; i++) {
    const r = drawTicket(setup, rng);
    seen.push(r.isLastOne);
    setup = { ...setup, tickets: r.tickets };
  }
  assert.deepEqual(seen, [false, false, true]);
});

test('最後一抽賞是空字串時,抽完也不觸發', () => {
  let setup = createIchibanSetup({
    prizes: [createIchibanPrize({ name: '模型', tier: 'A', count: 1 })],
    lastOnePrize: '   ',
  });
  const r = drawTicket(setup, seeded(4));
  assert.equal(r.isLastOne, false);
  assert.equal(r.lastOnePrize, null);
});

test('中獎機率只看數量,賞別不參與', () => {
  const build = (t1, t2) => createIchibanSetup({
    prizes: [
      createIchibanPrize({ name: 'A', tier: t1, count: 3 }),
      createIchibanPrize({ name: 'B', tier: t2, count: 1 }),
    ],
  });
  const seq = (setup, seed) => {
    const rng = seeded(seed);
    const out = [];
    let s = setup;
    for (let i = 0; i < 4; i++) {
      const r = drawTicket(s, rng);
      out.push(r.prize.name);
      s = { ...s, tickets: r.tickets };
    }
    return out;
  };
  assert.deepEqual(seq(build('A', 'G'), 9), seq(build('G', 'A'), 9));
});

test('refillSetup 把籤全部放回去,不動 prizes', () => {
  const setup = createIchibanSetup({
    prizes: [createIchibanPrize({ name: '模型', tier: 'A', count: 2 })],
  });
  const used = { ...setup, tickets: setup.tickets.map(t => ({ ...t, drawn: true })) };
  const refilled = refillSetup(used);
  assert.equal(remaining(refilled.tickets), 2);
  assert.deepEqual(refilled.prizes, setup.prizes);
});

test('count 是 Infinity 時當成 0,不會把瀏覽器打死', () => {
  const prize = createIchibanPrize({ name: 'x', count: Infinity });
  assert.equal(prize.count, 0);
  assert.equal(buildTickets([prize]).length, 0);
});

test('count 是 NaN 時當成 0', () => {
  assert.equal(createIchibanPrize({ name: 'x', count: NaN }).count, 0);
});

test('TIERS 是凍結的,外部改不動', () => {
  assert.equal(Object.isFrozen(TIERS), true);
  assert.throws(() => { TIERS.push('H'); }, TypeError);
});

test('TIER_META 的內層也凍住了,不能偷改某個賞別的顏色', () => {
  assert.equal(Object.isFrozen(TIER_META), true);
  assert.equal(Object.isFrozen(TIER_META.A), true);
  assert.throws(() => { TIER_META.A.color = 'x'; }, TypeError);
});

test('buildTickets 依序給號碼 1..N', () => {
  const prizes = [
    createIchibanPrize({ name: '模型', tier: 'A', count: 1 }),
    createIchibanPrize({ name: '吊飾', tier: 'C', count: 3 }),
  ];
  assert.deepEqual(buildTickets(prizes).map(t => t.no), [1, 2, 3, 4]);
});

test('refillSetup 重建時重新編號', () => {
  const setup = createIchibanSetup({ prizes: [createIchibanPrize({ name: 'x', tier: 'A', count: 3 })] });
  const r = drawTicket(setup, seeded(9), 2);
  const refilled = refillSetup({ ...setup, tickets: r.tickets });
  assert.deepEqual(refilled.tickets.map(t => t.no), [1, 2, 3]);
  assert.ok(refilled.tickets.every(t => !t.drawn));
});

test('drawTicket 帶 pickedNo:被點的那張一定被抽走', () => {
  const setup = createIchibanSetup({
    prizes: [
      createIchibanPrize({ name: '大獎', tier: 'A', count: 1 }),
      createIchibanPrize({ name: '小獎', tier: 'G', count: 5 }),
    ],
  });
  for (let seed = 1; seed <= 30; seed++) {
    const r = drawTicket(setup, seeded(seed), 4);
    assert.equal(r.ticket.no, 4);
    assert.equal(r.tickets.find(t => t.no === 4).drawn, true);
    assert.equal(r.tickets.filter(t => t.drawn).length, 1);
    assert.equal(r.prize.id, r.ticket.prizeId);
  }
});

test('drawTicket 互換不會改變各獎項的張數,也不動號碼', () => {
  const setup = createIchibanSetup({
    prizes: [
      createIchibanPrize({ name: '大獎', tier: 'A', count: 2 }),
      createIchibanPrize({ name: '小獎', tier: 'G', count: 5 }),
    ],
  });
  const tally = ts => ts.reduce((m, t) => ({ ...m, [t.prizeId]: (m[t.prizeId] ?? 0) + 1 }), {});
  const r = drawTicket(setup, seeded(5), 7);
  assert.deepEqual(tally(r.tickets), tally(setup.tickets));
  assert.deepEqual(r.tickets.map(t => t.no), setup.tickets.map(t => t.no));
});

test('drawTicket 帶 pickedNo:機率仍然只看 count', () => {
  const setup = createIchibanSetup({
    prizes: [
      createIchibanPrize({ name: '大獎', tier: 'A', count: 1 }),
      createIchibanPrize({ name: '小獎', tier: 'G', count: 3 }),
    ],
  });
  const rng = seeded(42);
  let a = 0;
  const N = 4000;
  for (let i = 0; i < N; i++) if (drawTicket(setup, rng, 1).prize.tier === 'A') a++;
  // 1 號在陣列裡本來就是大獎;如果點哪張就給哪張的獎,這裡會是 100%
  assert.ok(Math.abs(a / N - 0.25) < 0.03, `A 賞比例 ${a / N}`);
});

test('drawTicket:pickedNo 不在剩下的籤裡就退回隨機那張', () => {
  let setup = createIchibanSetup({ prizes: [createIchibanPrize({ name: 'x', tier: 'A', count: 3 })] });
  setup = { ...setup, tickets: drawTicket(setup, seeded(1), 2).tickets };
  const r = drawTicket(setup, seeded(2), 2);
  assert.notEqual(r.ticket.no, 2);
  assert.equal(r.tickets.filter(t => t.drawn).length, 2);
});

test('normalizeTicketNos:缺號碼、重複、非整數都整組依順序重編', () => {
  const t = no => ({ no, prizeId: 'p', drawn: false });
  assert.deepEqual(normalizeTicketNos([t(undefined), t(undefined)]).map(x => x.no), [1, 2]);
  assert.deepEqual(normalizeTicketNos([t(3), t(3)]).map(x => x.no), [1, 2]);
  assert.deepEqual(normalizeTicketNos([t(1.5), t(2)]).map(x => x.no), [1, 2]);
  assert.deepEqual(normalizeTicketNos([t(5), t(2)]).map(x => x.no), [5, 2], '合法就不動(抽走後號碼本來就不連續)');
});

test('舊存檔沒有 no:讀進來依陣列順序補號碼,不回種子資料', async () => {
  const data = {
    'ichiban.v1': JSON.stringify({ schema: 1, state: {
      activeSetupId: 's1',
      setups: [{ id: 's1', name: '舊的', lastOnePrize: '', prizes: [{ id: 'p1', name: 'x', tier: 'A', count: 2 }],
        tickets: [{ prizeId: 'p1', drawn: true }, { prizeId: 'p1', drawn: false }] }],
    } }),
  };
  const storage = { getItem: k => data[k] ?? null, setItem: (k, v) => { data[k] = String(v); }, removeItem: k => { delete data[k]; } };
  const { store } = await import('../ichiban/js/store.js');
  const s = store.load(storage).setups[0];
  assert.equal(s.name, '舊的');
  assert.deepEqual(s.tickets.map(t => [t.no, t.drawn]), [[1, true], [2, false]]);
});
