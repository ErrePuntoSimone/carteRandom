'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const B = require('../games/briscola/engine');

// generatore casuale ripetibile
function seeded(seed) {
  let s = seed;
  return (n) => { s = (s * 16807) % 2147483647; return s % n; };
}
function game(mode, seed = 1) {
  const g = B.createGame(mode);
  for (let i = 0; i < mode; i++) B.addPlayer(g, 'p' + i, 'P' + i);
  B.start(g, seeded(seed));
  return g;
}
// gioca tutta la partita scegliendo sempre la prima carta
function playOut(g) {
  let guard = 0;
  while (g.phase !== 'over' && guard++ < 200) {
    if (g.phase === 'trick') { B.collect(g); continue; }
    const p = g.players[g.turnIdx];
    B.play(g, p.id, g.hands[p.id][0].id);
  }
}

test('il mazzo ha 40 carte e 120 punti', () => {
  const d = B.fullDeck();
  assert.strictEqual(d.length, 40);
  assert.strictEqual(new Set(d.map((c) => c.id)).size, 40);
  assert.strictEqual(d.reduce((s, c) => s + c.points, 0), 120);
});

test('distribuzione in 2: 3 carte a testa, briscola in fondo al mazzo', () => {
  const g = game(2);
  assert.strictEqual(g.hands.p0.length, 3);
  assert.strictEqual(g.hands.p1.length, 3);
  assert.strictEqual(g.deck.length, 34);
  assert.strictEqual(g.deck[g.deck.length - 1], g.briscola);
  assert.strictEqual(g.players[g.turnIdx].id, 'p1', 'parte chi è dopo il mazziere');
});

test('distribuzione in 4 e coppie', () => {
  const g = game(4);
  for (let i = 0; i < 4; i++) assert.strictEqual(g.hands['p' + i].length, 3);
  assert.strictEqual(g.deck.length, 28);
  const v = B.viewFor(g, 'p0');
  assert.deepStrictEqual(v.players.map((p) => p.team), [0, 1, 0, 1]);
  assert.strictEqual(v.teams[0], 'P0 e P2');
});

test('chi vince la presa: briscola, seme di uscita, forza delle carte', () => {
  const c = B.makeCard;
  assert.ok(B.beats(c('coppe', 1), c('coppe', 3), 'spade'), 'Asso batte Tre');
  assert.ok(B.beats(c('coppe', 3), c('coppe', 10), 'spade'), 'Tre batte Re');
  assert.ok(!B.beats(c('denari', 1), c('coppe', 2), 'spade'), 'seme diverso non prende');
  assert.ok(B.beats(c('spade', 2), c('coppe', 1), 'spade'), 'la briscola prende');
  assert.ok(!B.beats(c('spade', 2), c('spade', 4), 'spade'), 'briscola più alta');
});

test('turni, presa, pesca e mano a chi prende', () => {
  const g = B.createGame(2);
  B.addPlayer(g, 'a', 'A'); B.addPlayer(g, 'b', 'B');
  B.start(g, seeded(3));
  // impostiamo carte note
  const c = B.makeCard;
  g.briscola = c('spade', 5);
  g.hands.a = [c('coppe', 1), c('denari', 2), c('bastoni', 4)];
  g.hands.b = [c('coppe', 3), c('spade', 2), c('denari', 7)];
  g.turnIdx = 1; // parte b
  assert.throws(() => B.play(g, 'a', 'coppe-1'), /Non è il tuo turno/);
  assert.throws(() => B.play(g, 'b', 'coppe-1'), /Non hai questa carta/);
  B.play(g, 'b', 'coppe-3');
  B.play(g, 'a', 'coppe-1');
  assert.strictEqual(g.phase, 'trick');
  assert.strictEqual(g.trickWinner, 'a');
  assert.throws(() => B.play(g, 'a', 'denari-2'), /raccolta/);
  const deck = g.deck.length;
  B.collect(g);
  assert.strictEqual(g.captured.a.length, 2);
  assert.strictEqual(g.deck.length, deck - 2);
  assert.strictEqual(g.hands.a.length, 3);
  assert.strictEqual(g.players[g.turnIdx].id, 'a', 'chi prende gioca per primo');
  assert.strictEqual(g.lastTrick.points, 21);
  // b risponde con una briscola: prende b
  const trump = g.hands.b.find((x) => x.suit === 'spade');
  B.play(g, 'a', g.hands.a.find((x) => x.suit !== 'spade').id);
  B.play(g, 'b', trump.id);
  assert.strictEqual(g.trickWinner, 'b');
});

test('partite complete in 2 e in 4: tutte le carte giocate, 120 punti', () => {
  for (const mode of [2, 4]) {
    for (let seed = 1; seed <= 30; seed++) {
      const g = game(mode, seed);
      playOut(g);
      assert.strictEqual(g.phase, 'over');
      assert.strictEqual(g.result.points[0] + g.result.points[1], 120);
      assert.strictEqual(g.result.cards[0] + g.result.cards[1], 40);
      const w = g.result.winner;
      if (w === null) assert.deepStrictEqual(g.result.points, [60, 60]);
      else assert.ok(g.result.points[w] > 60);
    }
  }
});

test('l\'ultima carta pescata è la briscola', () => {
  const g = game(2, 5);
  const trump = g.briscola;
  let guard = 0;
  while (g.deck.length && guard++ < 100) {
    if (g.phase === 'trick') { B.collect(g); continue; }
    const p = g.players[g.turnIdx];
    B.play(g, p.id, g.hands[p.id][0].id);
  }
  const holder = g.players.find((p) => g.hands[p.id].some((c) => c.id === trump.id));
  assert.ok(holder, 'qualcuno ha in mano la briscola scoperta');
});

test('la vista nasconde le carte degli altri', () => {
  const g = game(4);
  const v = B.viewFor(g, 'p1');
  assert.strictEqual(v.hand.length, 3);
  assert.ok(v.hand.every((c) => g.hands.p1.some((x) => x.id === c.id)));
  assert.deepStrictEqual(v.players.map((p) => p.cards), [3, 3, 3, 3]);
  const json = JSON.stringify(v);
  for (const other of ['p0', 'p2', 'p3']) {
    for (const c of g.hands[other]) assert.ok(!json.includes(`"${c.id}"`), `carta di ${other} visibile`);
  }
  assert.strictEqual(v.deckCount, 28);
});

test('tavolo pieno, numero fisso e uscite', () => {
  const g = B.createGame(2);
  B.addPlayer(g, 'a', 'A');
  assert.throws(() => B.start(g), /esattamente 2/);
  B.addPlayer(g, 'b', 'B');
  assert.throws(() => B.addPlayer(g, 'c', 'C'), /pieno/);
  assert.throws(() => B.setMode(g, 3), /2 o in 4/);
  B.setMode(g, 4);
  assert.throws(() => B.start(g), /esattamente 4/);
  B.addPlayer(g, 'c', 'C'); B.addPlayer(g, 'd', 'D');
  assert.throws(() => B.setMode(g, 2), /già 4/);
  B.moveSeat(g, 'b', 1); // A C B D: coppie A+B contro C+D
  assert.deepStrictEqual(g.players.map((p) => p.id), ['a', 'c', 'b', 'd']);
  B.start(g, seeded(9));
  assert.throws(() => B.moveSeat(g, 'a', 1), /tra una partita/);
  B.removePlayer(g, 'd');
  assert.strictEqual(g.phase, 'lobby');
  assert.strictEqual(g.players.length, 3);
});

test('il mazziere ruota e si contano le partite vinte', () => {
  const g = game(2, 11);
  assert.strictEqual(g.dealerIdx, 0);
  playOut(g);
  const wins = g.wins.slice();
  B.start(g, seeded(12));
  assert.strictEqual(g.dealerIdx, 1);
  assert.strictEqual(g.players[g.turnIdx].id, 'p0');
  playOut(g);
  assert.strictEqual(g.wins[0] + g.wins[1] >= wins[0] + wins[1], true);
});
