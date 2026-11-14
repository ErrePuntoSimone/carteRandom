'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const E = require('../games/poker/engine');

function table(names, stacks, settings) {
  const t = E.createTable({ startingStack: 1000, smallBlind: 10, bigBlind: 20, ...settings });
  names.forEach((n, i) => {
    E.addPlayer(t, n, n);
    if (stacks && stacks[i] !== undefined) t.seats[i].stack = stacks[i];
  });
  return t;
}
const stack = (t, id) => t.seats.find((s) => s.id === id).stack;
const total = (t) => t.seats.reduce((s, x) => s + x.stack, 0) + (t.hand && t.phase !== 'over' ? t.hand.pot || 0 : 0);

test('bottone, bui e primo a parlare con 3 giocatori', () => {
  const t = table(['A', 'B', 'C']);
  const h = E.startHand(t);
  assert.strictEqual(h.dealerId, 'A');
  assert.strictEqual(h.sbId, 'B');
  assert.strictEqual(h.bbId, 'C');
  assert.strictEqual(h.toAct, 'A');
  assert.strictEqual(stack(t, 'B'), 990);
  assert.strictEqual(stack(t, 'C'), 980);
});

test('heads-up: il dealer mette il piccolo buio e parla per primo preflop', () => {
  const t = table(['A', 'B']);
  const h = E.startHand(t);
  assert.strictEqual(h.sbId, 'A');
  assert.strictEqual(h.bbId, 'B');
  assert.strictEqual(h.toAct, 'A');
  E.act(t, 'A', { type: 'call' });
  assert.strictEqual(h.toAct, 'B', 'il grande buio ha l\'opzione');
  E.act(t, 'B', { type: 'check' });
  assert.strictEqual(h.street, 1);
  assert.strictEqual(h.toAct, 'B', 'dopo il flop parla per primo chi non è dealer');
});

test('tutti passano: vince il grande buio e il bottone ruota', () => {
  const t = table(['A', 'B', 'C']);
  E.startHand(t);
  E.act(t, 'A', { type: 'fold' });
  E.act(t, 'B', { type: 'fold' });
  assert.strictEqual(t.phase, 'over');
  assert.strictEqual(stack(t, 'C'), 1010);
  assert.strictEqual(stack(t, 'B'), 990);
  const h2 = E.startHand(t);
  assert.strictEqual(h2.dealerId, 'B');
  assert.strictEqual(h2.sbId, 'C');
  assert.strictEqual(h2.bbId, 'A');
});

test('giri di puntate fino allo showdown e assegnazione del piatto', () => {
  const t = table(['A', 'B', 'C']);
  const h = E.startHand(t);
  E.act(t, 'A', { type: 'raise', amount: 60 });
  E.act(t, 'B', { type: 'call' });
  E.act(t, 'C', { type: 'call' });
  assert.strictEqual(h.street, 1);
  assert.strictEqual(h.toAct, 'B', 'postflop parla il primo dopo il dealer');
  for (let street = 1; street <= 3; street++) {
    E.act(t, 'B', { type: 'check' });
    E.act(t, 'C', { type: 'check' });
    E.act(t, 'A', { type: 'check' });
  }
  assert.strictEqual(t.phase, 'showdown');
  assert.strictEqual(h.pots.length, 1);
  assert.strictEqual(h.pots[0].amount, 180);
  E.award(t, 0, ['C']);
  assert.strictEqual(t.phase, 'over');
  assert.strictEqual(stack(t, 'C'), 1120);
  assert.strictEqual(stack(t, 'A'), 940);
});

test('rilancio minimo e importi non validi', () => {
  const t = table(['A', 'B', 'C']);
  E.startHand(t);
  assert.throws(() => E.act(t, 'B', { type: 'fold' }), /Non è il tuo turno/);
  assert.throws(() => E.act(t, 'A', { type: 'raise', amount: 30 }), /minimo è a 40/);
  assert.throws(() => E.act(t, 'A', { type: 'check' }), /chiamare 20/);
  E.act(t, 'A', { type: 'raise', amount: 100 }); // rilancio di 80
  assert.throws(() => E.act(t, 'B', { type: 'raise', amount: 150 }), /minimo è a 180/);
  E.act(t, 'B', { type: 'raise', amount: 180 });
  assert.strictEqual(t.hand.currentBet, 180);
  assert.strictEqual(t.hand.minRaise, 80);
});

test('piatti laterali con più all-in e restituzione della puntata non chiamata', () => {
  const t = table(['A', 'B', 'C'], [100, 300, 1000]);
  E.startHand(t); // dealer A, SB B, BB C
  E.act(t, 'A', { type: 'allin' });           // A 100
  E.act(t, 'B', { type: 'allin' });           // B 300
  E.act(t, 'C', { type: 'raise', amount: 800 }); // C 800: 500 non chiamati tornano a C
  assert.strictEqual(t.phase, 'showdown');
  assert.ok(t.hand.runout);
  const pots = t.hand.pots;
  assert.deepStrictEqual(pots.map((p) => p.amount), [300, 400]);
  assert.deepStrictEqual(pots[0].eligible.sort(), ['A', 'B', 'C']);
  assert.deepStrictEqual(pots[1].eligible.sort(), ['B', 'C']);
  assert.strictEqual(stack(t, 'C'), 700);
  E.award(t, 0, ['A']);
  assert.strictEqual(t.phase, 'showdown');
  assert.throws(() => E.award(t, 1, ['A']), /non valido/);
  E.award(t, 1, ['C']);
  assert.strictEqual(t.phase, 'over');
  assert.deepStrictEqual([stack(t, 'A'), stack(t, 'B'), stack(t, 'C')], [300, 0, 1100]);
});

test('piatto diviso: le fiches dispari vanno al primo dopo il dealer', () => {
  const t = table(['A', 'B', 'C'], [1000, 1000, 1000], { smallBlind: 5, bigBlind: 10 });
  E.startHand(t);
  E.act(t, 'A', { type: 'fold' });
  E.act(t, 'B', { type: 'call' });
  E.act(t, 'C', { type: 'raise', amount: 25 });
  E.act(t, 'B', { type: 'call' });
  // piatto 50 + nessun altro: proviamo con un importo dispari
  for (let s = 1; s <= 3; s++) { E.act(t, 'B', { type: 'check' }); E.act(t, 'C', { type: 'check' }); }
  t.hand.pots[0].amount += 1; // simula una fiche dispari
  E.award(t, 0, ['C', 'B']);
  assert.strictEqual(t.hand.pots[0].payouts.B, 26);
  assert.strictEqual(t.hand.pots[0].payouts.C, 25);
});

test('all-in per meno di un rilancio non riapre le puntate', () => {
  const t = table(['A', 'B', 'C'], [1000, 1000, 130]);
  E.startHand(t); // dealer A, SB B, BB C (C posta 20, resta 110)
  E.act(t, 'A', { type: 'raise', amount: 100 });
  E.act(t, 'B', { type: 'call' });
  E.act(t, 'C', { type: 'allin' }); // a 130: rilancio di 30 < 80
  const av = E.available(t);
  assert.strictEqual(av.playerId, 'A');
  assert.strictEqual(av.canRaise, false, 'A ha già agito: può solo chiamare o passare');
  assert.throws(() => E.act(t, 'A', { type: 'raise', amount: 300 }), /Non puoi rilanciare/);
  E.act(t, 'A', { type: 'call' });
  E.act(t, 'B', { type: 'call' });
  assert.strictEqual(t.hand.street, 1);
});

test('il grande buio short all-in e un giocatore che esce durante la mano', () => {
  const t = table(['A', 'B', 'C'], [1000, 1000, 15]);
  const h = E.startHand(t);
  assert.ok(h.players.C.allIn);
  E.removePlayer(t, 'A'); // A è di turno: fold automatico
  assert.strictEqual(h.toAct, 'B');
  E.act(t, 'B', { type: 'call' });
  // B ha messo 20, C solo 15: 5 tornano a B; nessun'altra puntata possibile
  assert.strictEqual(t.phase, 'showdown');
  assert.strictEqual(h.pots[0].amount, 30);
  E.award(t, 0, ['C']);
  assert.strictEqual(stack(t, 'C'), 30);
  E.startHand(t);
  assert.ok(!t.seats.find((s) => s.id === 'A'), 'A viene tolto a fine mano');
});

test('le fiches totali non cambiano mai', () => {
  const t = table(['A', 'B', 'C', 'D'], [500, 800, 1200, 300]);
  const start = t.seats.reduce((s, x) => s + x.stack, 0);
  let rnd = 7;
  const rand = () => { rnd = (rnd * 16807) % 2147483647; return rnd / 2147483647; };
  for (let hand = 0; hand < 200; hand++) {
    if (t.seats.filter((s) => s.stack > 0).length < 2) break;
    E.startHand(t);
    let guard = 0;
    while (t.phase === 'betting' && guard++ < 100) {
      const av = E.available(t);
      const r = rand();
      let a;
      if (r < 0.15) a = { type: 'fold' };
      else if (r < 0.55) a = av.canCheck ? { type: 'check' } : { type: 'call' };
      else if (r < 0.85 && av.canRaise) a = { type: 'raise', amount: av.minTo };
      else if (av.canRaise) a = { type: 'allin' };
      else a = av.canCheck ? { type: 'check' } : { type: 'call' };
      E.act(t, av.playerId, a);
    }
    if (t.phase === 'showdown') {
      t.hand.pots.forEach((p, i) => { if (!p.winners) E.award(t, i, [p.eligible[Math.floor(rand() * p.eligible.length)]]); });
    }
    assert.strictEqual(t.phase, 'over');
    assert.strictEqual(t.seats.reduce((s, x) => s + x.stack, 0), start, `mano ${hand + 1}`);
  }
});

test('spostarsi prima o dopo nell\'ordine di gioco', () => {
  const t = table(['A', 'B', 'C', 'D']);
  const ids = () => t.seats.map((s) => s.id).join('');
  E.moveSeat(t, 'C', -1);
  assert.strictEqual(ids(), 'ACBD');
  E.moveSeat(t, 'A', -1); // il tavolo è circolare: il primo scambia con l'ultimo
  assert.strictEqual(ids(), 'DCBA');
  E.moveSeat(t, 'A', 1);
  assert.strictEqual(ids(), 'ACBD');
  assert.match(t.log[t.log.length - 1].text, /A ora gioca dopo D e prima di C/);
  const h = E.startHand(t);
  assert.deepStrictEqual([h.dealerId, h.sbId, h.bbId], ['A', 'C', 'B']);
  assert.throws(() => E.moveSeat(t, 'A', 1), /tra una mano e l'altra/);
  const two = table(['X', 'Y']);
  assert.throws(() => E.moveSeat(two, 'X', 1), /due giocatori/);
});
