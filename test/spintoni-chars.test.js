'use strict';
// Struttura dei personaggi e meccaniche generiche delle mosse (speciale con ricarica, spinte, corazza, parata).
// Le meccaniche si provano su personaggi finti registrati qui: i valori dei personaggi veri possono cambiare liberamente.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const S = require('../public/spintoni/shared');
const { Sim } = require('../games/spintoni/sim');

const idle = { mx: 0, up: false, down: false };

test('ogni personaggio in chars/index.json è registrato e ha una speciale completa', () => {
  const ids = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'public', 'spintoni', 'chars', 'index.json'), 'utf8'));
  assert.deepStrictEqual(Object.keys(S.CHARS).filter((id) => !id.startsWith('test_')), ids);
  for (const id of ids) {
    const c = S.CHARS[id];
    for (const k of ['name', 'desc', 'speed', 'jump', 'weight', 'power']) assert.ok(c[k] !== undefined, `${id}: manca ${k}`);
    for (const ty of S.ATTACKS) {
      const m = c.moves[ty];
      assert.ok(m, `${id}: manca la mossa ${ty}`);
      for (const k of ['startup', 'active', 'recovery']) assert.ok(m[k] >= 0, `${id}.${ty}.${k}`);
    }
    assert.ok(c.moves.special.cooldown > 0 && c.moves.special.name, `${id}: la speciale ha nome e ricarica`);
  }
});

S.registerChar({
  id: 'test_dash', name: 'Prova', desc: '', stats: { speed: 500, jump: 1000, weight: 1, power: 1 },
  moves: {
    special: {
      name: 'Scatto', cooldown: 2, startup: 0.05, active: 0.2, recovery: 0.2, dmg: 10, base: 400, growth: 10,
      boxes: { side: { x: 10, y: -80, w: 60, h: 70, ang: 30 } },
      motion: [{ from: 0.05, to: 0.25, vx: 900 }], armor: { from: 0, to: 0.25 },
    },
  },
});
S.registerChar({
  id: 'test_parry', name: 'Parata', desc: '', stats: { speed: 500, jump: 1000, weight: 1, power: 1 },
  moves: { special: { name: 'Parata', cooldown: 3, startup: 0.02, active: 0, recovery: 0.4, dmg: 0, base: 0, growth: 0, boxes: {}, counter: { from: 0.02, to: 0.35, dmg: 12, base: 600, growth: 12, ang: 40 } } },
});

test('speciale: parte con il suo tasto, spinge come indicato e poi va in ricarica', () => {
  const f = S.newFighter(700, S.STAGE.main.y, 'test_dash'); f.g = true;
  S.stepFighter(f, { ...idle, sp: true });
  assert.strictEqual(f.att.ty, 'special');
  assert.strictEqual(f.spCd, 2);
  for (let i = 0; i < 8; i++) S.stepFighter(f, idle);
  assert.ok(f.x > 800, `scatto: x=${f.x.toFixed(0)}`);
  for (let i = 0; i < 30 && f.att; i++) S.stepFighter(f, idle);
  assert.ok(!f.att);
  S.stepFighter(f, { ...idle, sp: true });
  assert.ok(!f.att, 'in ricarica non riparte');
  for (let i = 0; i < 60; i++) S.stepFighter(f, idle);
  assert.strictEqual(f.spCd, 0);
  S.stepFighter(f, { ...idle, sp: true });
  assert.strictEqual(f.att && f.att.ty, 'special', 'ricaricata, riparte');
});

function duel(a, b) {
  const sim = new Sim({ players: [{ id: 'a', name: 'A', char: a }, { id: 'b', name: 'B', char: b }], rng: () => 0.5 });
  const A = sim.fighters.get('a'), B = sim.fighters.get('b');
  A.x = 700; B.x = 760; A.face = 1; B.face = -1;
  for (const f of [A, B]) { f.y = S.STAGE.main.y; f.g = true; f.bot = false; f.inv = 0; }
  let s = 1;
  const send = (id, extra) => sim.pushInput(id, { s: s++, mx: 0, ...extra });
  return { sim, A, B, send };
}

test('corazza: il colpo fa danno ma non lancia e non interrompe la mossa', () => {
  const { sim, A, B, send } = duel('gilda', 'test_dash');
  B.x = 735; B.face = 1; // scatta via da A, che lo colpisce alle spalle
  send('b', { sp: 1 }); sim.step();
  send('a', { l: 1 });
  for (let i = 0; i < 3; i++) { sim.step(); }
  assert.ok(B.dmg > 0, 'danno preso');
  assert.strictEqual(B.hs, 0, 'nessun lancio');
  assert.ok(B.att && B.att.ty === 'special', 'la mossa continua');
});

test('parata: chi para non prende danno e risponde lanciando l\'attaccante', () => {
  const { sim, A, B, send } = duel('gilda', 'test_parry');
  send('b', { sp: 1 }); sim.step();
  send('a', { l: 1 });
  let counter = false;
  for (let i = 0; i < 4; i++) { sim.step(); if (sim.events.some((e) => e.t === 'counter')) counter = true; }
  assert.ok(counter, 'evento di parata');
  assert.strictEqual(B.dmg, 0);
  assert.ok(A.dmg > 0 && A.hs > 0, 'l\'attaccante viene lanciato');
});

test('effetti visivi: ogni personaggio ha colore, bagliore e forma delle particelle validi', () => {
  const S = require('../public/spintoni/shared');
  const SHAPES = ['dot', 'spark', 'star', 'drop', 'slash'];
  const SPECIALS = [undefined, 'vortex', 'guard', 'thrust', 'charge'];
  for (const [id, c] of Object.entries(S.CHARS)) {
    if (id.startsWith('test_')) continue; // personaggi finti dei test qui sopra
    assert.match(c.fx.color, /^#[0-9a-f]{6}$/i, id);
    assert.match(c.fx.glow, /^#[0-9a-f]{6}$/i, id);
    assert.ok(SHAPES.includes(c.fx.shape), `${id}: forma ${c.fx.shape}`);
    assert.ok(SPECIALS.includes(c.fx.special), `${id}: speciale ${c.fx.special}`);
  }
});
