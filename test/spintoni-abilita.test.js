'use strict';
// Abilità: speciali nascoste e barre di carica. Si provano su personaggi finti: i valori dei veri possono cambiare.
const { test } = require('node:test');
const assert = require('node:assert');
const S = require('../public/spintoni/shared');

const idle = { mx: 0, up: false, down: false };
const mv = (name, charge) => ({ name, charge, startup: 0.1, active: 0.1, recovery: 0.1, dmg: 5, base: 300, growth: 5 });
const specials = {
  light: mv('Leggera', 2), heavy: mv('Pesante', 4), dodge: mv('Schivata', 3), special: mv('Speciale', 5),
  ultimate: { name: 'Suprema', startup: 0.3, active: 0.3, recovery: 0.3, dmg: 20, base: 600, growth: 20 },
};
const stats = { speed: 500, jump: 1000, weight: 1, power: 1 };
S.registerChar({ id: 'test_ab', name: 'Ab', desc: '', stats, specials, meter: { move: 1, hit: 0 } });
S.registerChar({ id: 'test_ab_hit', name: 'AbHit', desc: '', stats, specials, meter: { move: 0, hit: 1 } });

test('abilità: moveOf risolve le speciali', () => {
  assert.strictEqual(S.moveOf('test_ab', 'sp:heavy').name, 'Pesante');
  assert.ok(S.moveOf('test_ab', 'sp:heavy').boxes.side); // unita a MOVES.light
});

test('abilità: personaggi senza specials non hanno barre', () => {
  assert.strictEqual(S.newFighter(0, 0, 'gilda').mt, null);
  assert.strictEqual(S.physState(S.newFighter(0, 0, 'gilda')).mt, null);
});

test('abilità: correre carica le barre in base al carattere', () => {
  const f = S.newFighter(700, S.STAGE.main.y, 'test_ab'); f.g = true;
  for (let i = 0; i < 30; i++) S.stepFighter(f, { ...idle, mx: 1 });
  assert.ok(f.mt.light > 0);
  assert.ok(f.mt.light < 2 && f.mt.light === f.mt.heavy);
  const g = S.newFighter(700, S.STAGE.main.y, 'test_ab_hit'); g.g = true;
  for (let i = 0; i < 60; i++) S.stepFighter(g, { ...idle, mx: 1 });
  assert.deepStrictEqual(g.mt, { light: 0, heavy: 0, dodge: 0, special: 0 });
});

test('abilità: le barre non superano charge', () => {
  const f = S.newFighter(0, 0, 'test_ab');
  S.addMeter(f, 100);
  assert.deepStrictEqual(f.mt, { light: 2, heavy: 4, dodge: 3, special: 5 });
  assert.strictEqual(S.meterFull(f, 'dodge'), true);
  assert.notStrictEqual(S.physState(f).mt, f.mt);
});

test('abilità: in volo dopo un colpo non si carica', () => {
  const f = S.newFighter(700, S.STAGE.main.y - 200, 'test_ab');
  f.hs = 0.5; f.vx = 900;
  for (let i = 0; i < 5; i++) S.stepFighter(f, idle);
  assert.deepStrictEqual(f.mt, { light: 0, heavy: 0, dodge: 0, special: 0 });
});

// tocco e tenuto: lottatore a terra, fermo
const ground = (char = 'test_ab') => { const f = S.newFighter(700, S.STAGE.main.y, char); f.g = true; return f; };
const hold = (f, inp, n) => { for (let i = 0; i < n; i++) S.stepFighter(f, { ...idle, ...inp }); };
const isSp = (f) => !!f.att && f.att.ty.startsWith('sp:');

test('tenuto: il tocco parte subito anche con la barra piena', () => {
  const f = ground(); S.addMeter(f, 100);
  S.stepFighter(f, { ...idle, l: true, hb: 1 });
  assert.strictEqual(f.att.ty, 'light');
});

test('tenuto: oltre holdSpecial parte la speciale e svuota la barra', () => {
  const f = ground(); S.addMeter(f, 100);
  S.stepFighter(f, { ...idle, l: true, hb: 1 });
  hold(f, { hb: 1 }, 11);
  assert.strictEqual(f.att.ty, 'sp:light');
  assert.deepStrictEqual(f.mt, { light: 0, heavy: 4, dodge: 3, special: 5 });
});

test('tenuto: con la barra non piena resta la mossa base', () => {
  const f = ground();
  S.stepFighter(f, { ...idle, l: true, hb: 1 });
  hold(f, { hb: 1 }, 11);
  assert.ok(!isSp(f));
});

test('tenuto: barra che si riempie a pressione già lunga non fa partire nulla', () => {
  const f = ground();
  hold(f, { hb: 1 }, 15);
  S.addMeter(f, 100);
  hold(f, { hb: 1 }, 5);
  assert.ok(!isSp(f));
  hold(f, { hb: 0 }, 1);
  hold(f, { hb: 1 }, 12);
  assert.strictEqual(f.att.ty, 'sp:light');
});

test('tenuto: Potenziato senza giù resta il pugno caricato', () => {
  const f = ground(); S.addMeter(f, 100);
  S.stepFighter(f, { ...idle, h: true, hb: 2, hd: true });
  hold(f, { hb: 2, hd: true }, 20);
  assert.strictEqual(f.att.ty, 'heavy');
  assert.ok(f.att.c > 0);
});

test('tenuto: Potenziato + giù fa la speciale', () => {
  const f = ground(); S.addMeter(f, 100);
  S.stepFighter(f, { ...idle, h: true, hb: 2, hd: true, down: true });
  hold(f, { hb: 2, hd: true, down: true }, 11); // la speciale finta dura 0,3 s: si guarda appena partita
  assert.strictEqual(f.att.ty, 'sp:heavy');
});

test('tenuto: Schiva tenuta interrompe la schivata', () => {
  const f = ground(); S.addMeter(f, 100);
  S.stepFighter(f, { ...idle, d: true, hb: 4 });
  assert.ok(f.dg > 0);
  hold(f, { d: true, hb: 4 }, 11);
  assert.strictEqual(f.att.ty, 'sp:dodge');
  assert.strictEqual(f.dg, 0);
});

test('suprema: serve avere 4 barre piene e le svuota tutte', () => {
  const f = ground(); S.addMeter(f, 100); f.mt.special = 0;
  S.stepFighter(f, { ...idle, ul: true });
  assert.strictEqual(f.att, null);
  S.addMeter(f, 100);
  S.stepFighter(f, { ...idle, ul: true });
  assert.strictEqual(f.att.ty, 'sp:ultimate');
  assert.deepStrictEqual(f.mt, { light: 0, heavy: 0, dodge: 0, special: 0 });
});

test('suprema: ignorata in volo dopo un colpo', () => {
  const f = ground(); S.addMeter(f, 100); f.hs = 0.3;
  S.stepFighter(f, { ...idle, ul: true });
  assert.strictEqual(f.att, null);
  assert.deepStrictEqual(f.mt, { light: 2, heavy: 4, dodge: 3, special: 5 });
});

test('tenuto: personaggi senza specials ignorano hb e ul', () => {
  const a = ground('gilda'), b = ground('gilda');
  S.stepFighter(a, { ...idle, l: true, hb: 15, ul: true });
  S.stepFighter(b, { ...idle, l: true });
  hold(a, { hb: 15, ul: true, hd: true }, 15);
  hold(b, { hd: true }, 15);
  assert.ok(!isSp(a));
  assert.deepStrictEqual(S.physState(a), S.physState(b));
});

test('tenuto: pushInput valida hb e ul', () => {
  const { Sim } = require('../games/spintoni/sim');
  const sim = new Sim({ players: [{ id: 'a', name: 'A', char: 'test_ab' }] });
  const f = sim.fighters.get('a');
  sim.pushInput('a', { s: 1, hb: 5, ul: 1 });
  sim.pushInput('a', { s: 2, hb: 16, ul: 0 });
  sim.pushInput('a', { s: 3, hb: 1.5 });
  sim.pushInput('a', { s: 4, hb: '3' });
  assert.deepStrictEqual(f.queue.map((q) => [q.hb, q.ul]), [[5, true], [0, false], [0, false], [3, false]]);
});
