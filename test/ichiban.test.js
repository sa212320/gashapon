import test from 'node:test';
import assert from 'node:assert/strict';

import {
  TIERS, createIchibanPrize, createIchibanSetup,
  buildTickets, drawTicket, refillSetup,
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
