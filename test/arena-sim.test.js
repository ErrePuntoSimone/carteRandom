'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const A = require('../public/arena/shared');
const { Sim } = require('../games/arena/sim');

function seeded(seed) {
  let s = seed;
  return () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
}
const run = (sim, n) => { for (let i = 0; i < n; i++) sim.step(); };
const place = (p, x, y) => { p.x = x; p.y = y; };

test('il movimento rispetta muri e bordi', () => {
  const p = { x: 760, y: 600 };
  for (let i = 0; i < 40; i++) A.stepMove(p, 1, 0, 300, 22); // verso il blocco centrale (x 800)
  assert.ok(p.x <= 800 - 22 + 0.01, `x=${p.x}`);
  const q = { x: 30, y: 30 };
  for (let i = 0; i < 40; i++) A.stepMove(q, -1, -1, 300, 22);
  assert.deepStrictEqual([q.x, q.y], [22, 22]);
});

test('movimento con gli input numerati: uno per passo', () => {
  const sim = new Sim({ players: [{ id: 'a', name: 'A', char: 'falco' }, { id: 'b', name: 'B', char: 'falco' }] });
  const a = sim.players.get('a');
  place(a, 900, 400);
  const start = a.x;
  sim.pushInput('a', { s: 1, mx: 1, my: 0 });
  sim.pushInput('a', { s: 2, mx: 1, my: 0 });
  sim.pushInput('a', { s: 1, mx: -1, my: 0 }); // vecchio: ignorato
  run(sim, 2);
  assert.ok(Math.abs(a.x - (start + 2 * 300 * A.TICK)) < 0.01);
  // in ritardo: con tanti input in coda ne consuma due per passo, ma sempre uno per input
  for (let s = 3; s <= 5; s++) sim.pushInput('a', { s, mx: 1, my: 0 });
  run(sim, 10);
  assert.strictEqual(a.seq, 5);
  assert.ok(Math.abs(a.x - (start + 5 * 300 * A.TICK)) < 0.01, 'senza input non si muove');
});

test('colpire, ricaricare, eliminare e rientrare', () => {
  const sim = new Sim({ players: [{ id: 'a', name: 'A', char: 'falco' }, { id: 'b', name: 'B', char: 'macigno' }] });
  const a = sim.players.get('a'), b = sim.players.get('b');
  place(a, 900, 420); place(b, 1300, 420);
  a.shield = 0; b.shield = 0;
  sim.pushInput('a', { s: 1, ax: 1, ay: 0, f: 1 });
  run(sim, 12);
  assert.strictEqual(b.hp, b.maxHp - 1100);
  assert.ok(a.ammo < 3);
  assert.ok(a.superV > 0, 'i colpi caricano la super');
  // tanti colpi fino al KO
  for (let i = 0; i < 6; i++) {
    a.ammo = 3; a.cooldown = 0;
    sim.pushInput('a', { s: 2 + i, ax: 1, ay: 0, f: 2 + i });
    run(sim, 12);
  }
  assert.strictEqual(b.alive, false);
  assert.strictEqual(a.kills, 1);
  assert.strictEqual(b.deaths, 1);
  run(sim, 70);
  assert.strictEqual(b.alive, true, 'rientra dopo 3 secondi');
  assert.strictEqual(b.hp, b.maxHp);
});

test('i muri fermano i colpi', () => {
  const sim = new Sim({ players: [{ id: 'a', name: 'A', char: 'falco' }, { id: 'b', name: 'B', char: 'falco' }] });
  const a = sim.players.get('a'), b = sim.players.get('b');
  place(a, 700, 600); place(b, 1100, 600); // blocco centrale in mezzo
  b.shield = 0;
  sim.pushInput('a', { s: 1, ax: 1, ay: 0, f: 1 });
  run(sim, 20);
  assert.strictEqual(b.hp, b.maxHp);
});

test('le super: onda d\'urto, scatto e dardo perforante', () => {
  const mk = (char) => {
    const sim = new Sim({ players: [{ id: 'a', name: 'A', char }, { id: 'b', name: 'B', char: 'macigno' }, { id: 'c', name: 'C', char: 'macigno' }] });
    for (const p of sim.players.values()) p.shield = 0;
    return sim;
  };
  let sim = mk('macigno');
  let [a, b, c] = [...sim.players.values()];
  place(a, 900, 400); place(b, 1050, 400); place(c, 1500, 400);
  a.superV = 1;
  sim.pushInput('a', { s: 1, u: 1 });
  run(sim, 1);
  assert.strictEqual(b.hp, b.maxHp - 1500);
  assert.ok(b.x > 1050, 'spinto via');
  assert.strictEqual(c.hp, c.maxHp, 'fuori portata');
  assert.strictEqual(a.superV, 0);

  sim = mk('folgore');
  [a, b, c] = [...sim.players.values()];
  place(a, 900, 420); place(b, 1100, 420); place(c, 1600, 1000);
  a.superV = 1;
  sim.pushInput('a', { s: 1, ax: 1, ay: 0, u: 1 });
  run(sim, 8);
  assert.strictEqual(b.hp, b.maxHp - 1000);
  assert.ok(a.x > 1100, 'lo scatto attraversa');

  sim = mk('falco');
  [a, b, c] = [...sim.players.values()];
  place(a, 700, 420); place(b, 900, 420); place(c, 1100, 420);
  a.superV = 1;
  sim.pushInput('a', { s: 1, ax: 1, ay: 0, u: 1 });
  run(sim, 12);
  assert.strictEqual(b.hp, b.maxHp - 1700);
  assert.strictEqual(c.hp, c.maxHp - 1700, 'il dardo passa attraverso');
});

test('nei cespugli si è invisibili da lontano', () => {
  const sim = new Sim({ players: [{ id: 'a', name: 'A', char: 'falco' }, { id: 'b', name: 'B', char: 'falco' }] });
  const a = sim.players.get('a'), b = sim.players.get('b');
  const bush = A.MAP.bushes[0];
  place(b, bush.x + bush.w / 2, bush.y + bush.h / 2);
  place(a, 900, 1090);
  run(sim, 1);
  assert.ok(!sim.snapshot('a').p.some((p) => p.id === 'b'));
  assert.ok(sim.snapshot('b').p.some((p) => p.id === 'a'));
  place(a, b.x + 100, b.y);
  assert.ok(sim.snapshot('a').p.some((p) => p.id === 'b'), 'da vicino si vede');
});

test('la partita finisce a tempo o a 10 KO; i bot giocano da soli', () => {
  const sim = new Sim({
    duration: 60, rng: seeded(7),
    players: [
      { id: 'b1', name: 'Bot 1', char: 'folgore', bot: true },
      { id: 'b2', name: 'Bot 2', char: 'macigno', bot: true },
      { id: 'b3', name: 'Bot 3', char: 'falco', bot: true },
      { id: 'b4', name: 'Bot 4', char: 'folgore', bot: true },
    ],
  });
  let steps = 0;
  while (!sim.over && steps < 2000) { sim.step(); steps++; }
  assert.ok(sim.over);
  const res = sim.results();
  const total = res.reduce((s, r) => s + r.kills, 0);
  assert.ok(total > 0, 'i bot si sono colpiti');
  for (const p of sim.players.values()) {
    assert.ok(p.x >= 0 && p.x <= A.MAP.w && p.y >= 0 && p.y <= A.MAP.h);
    for (const w of A.MAP.walls) assert.ok(!(p.alive && A.inRect(p.x, p.y, w)), 'nessuno dentro i muri');
  }
  assert.ok(res[0].kills >= res[res.length - 1].kills);
});

test('conto alla rovescia: tutti fermi e senza spari accumulati, poi si parte', () => {
  const sim = new Sim({ players: [{ id: 'a', name: 'A', char: 'falco' }, { id: 'b', name: 'B', char: 'falco' }], countdown: 5, rng: seeded(3) });
  const a = sim.players.get('a');
  const x0 = a.x;
  sim.pushInput('a', { s: 1, mx: 1, my: 0, ax: 1, ay: 0, f: 1, u: 0 });
  run(sim, Math.round(4.9 / A.TICK));
  assert.ok(sim.snapshot('a').cd > 0);
  assert.strictEqual(a.x, x0);
  assert.strictEqual(sim.time, 0);
  assert.strictEqual(sim.bullets.length, 0, 'nessuno sparo durante il conto');
  run(sim, Math.round(0.4 / A.TICK));
  assert.strictEqual(sim.snapshot('a').cd, 0);
  run(sim, 5);
  assert.strictEqual(sim.bullets.length, 0, 'lo sparo ignorato non parte dopo');
});
