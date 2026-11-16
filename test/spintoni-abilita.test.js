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

// ---- buff, debuff, colpi senza lancio, barre dai colpi ----
const { Sim } = require('../games/spintoni/sim');
const bmove = { ...mv('Buff', 2), buff: { at: 0, dur: 1, speed: 1.4 }, debuff: { dur: 3, speed: 0.6 }, noLaunch: true };
S.registerChar({ id: 'test_bf', name: 'Bf', desc: '', stats, specials: { ...specials, light: bmove }, meter: { move: 0, hit: 1 } });
const duel = (ca = 'test_bf', cb = 'test_ab') => {
  const sim = new Sim({ players: [{ id: 'a', name: 'A', char: ca }, { id: 'b', name: 'B', char: cb }] });
  return [sim, sim.fighters.get('a'), sim.fighters.get('b')];
};
const hitOpts = { dmg: 10, base: 300, growth: 5, ang: 0, face: 1, ty: 'light' };

test('buff: aumenta la velocità per dur secondi poi finisce', () => {
  const f = ground('test_bf');
  assert.strictEqual(S.statOf(f, 'speed'), 500);
  f.att = { ty: 'sp:light', dir: 'side', t: 0, air: false, id: 1, c: 0, rel: true };
  S.stepFighter(f, idle);
  assert.ok(Math.abs(S.statOf(f, 'speed') - 700) < 1e-9);
  hold(f, {}, 20); // la mossa non rimette il buff
  assert.strictEqual(f.sts.length, 1);
  hold(f, {}, 20);
  assert.strictEqual(S.statOf(f, 'speed'), 500);
  assert.strictEqual(f.sts.length, 0);
});

test('buff: physState copia gli stati come oggetti nuovi', () => {
  const f = ground('test_bf'); f.sts.push({ k: 'b', t: 1, speed: 2 });
  const p = S.physState(f);
  assert.deepStrictEqual(p.sts, f.sts);
  assert.notStrictEqual(p.sts[0], f.sts[0]);
});

test('debuff: chi viene colpito rallenta', () => {
  const [sim, a, v] = duel();
  sim.launch(a, v, { ...hitOpts, debuff: { dur: 3, speed: 0.6 } });
  assert.ok(Math.abs(S.statOf(v, 'speed') - 300) < 1e-9);
  assert.strictEqual(sim.snapshot('a').f.find((x) => x.id === 'b').bf, 'd');
  assert.strictEqual(sim.snapshot('a').f.find((x) => x.id === 'a').bf, undefined);
});

test('noLaunch: danno senza lancio', () => {
  const [sim, a, v] = duel();
  sim.launch(a, v, { ...hitOpts, noLaunch: true, debuff: { dur: 1, speed: 0.5 } });
  assert.ok(v.dmg > 0);
  assert.strictEqual(v.hs, 0);
  assert.strictEqual(v.vx, 0);
  assert.strictEqual(v.sts.length, 1);
});

test('barre: colpire carica chi colpisce, ricevere carica a metà', () => {
  const [sim, a, v] = duel('test_ab_hit', 'test_ab_hit');
  sim.launch(a, v, hitOpts);
  assert.ok(a.mt.light > 0);
  assert.ok(Math.abs(a.mt.light - 2 * v.mt.light) < 1e-9);
});

test('barre: la parata carica anche chi para', () => {
  const [sim, a, v] = duel('test_ab_hit', 'test_ab_hit');
  sim.counterHit(v, a, { dmg: 10, base: 300, growth: 5, ang: 0 });
  assert.ok(v.mt.light > 0 && a.mt.light > 0);
});

test('snapshot: bf = bd con buff e debuff', () => {
  const [sim, a] = duel();
  a.sts.push({ k: 'b', t: 1 }, { k: 'd', t: 1 });
  assert.strictEqual(sim.snapshot('a').f.find((x) => x.id === 'a').bf, 'bd');
});

test('rientro: le barre restano dopo un KO', () => {
  const [sim, , f] = duel();
  S.addMeter(f, 100); f.sts.push({ k: 'd', t: 9, speed: 0.5 });
  const mt = { ...f.mt };
  sim.ko(f);
  for (let i = 0; i < 80 && !f.alive; i++) sim.step();
  assert.ok(f.alive);
  assert.deepStrictEqual(f.mt, mt);
  assert.deepStrictEqual(f.sts, []);
});

// ---- proiettili ----
const shot = { at: 0.1, speed: 900, ang: 0, grav: 0, life: 1.5, box: { w: 30, h: 30 }, dmg: 6, base: 300, growth: 6, kbAng: 30, dy: -50 };
const shotMove = (projectile) => ({ ...mv('Colpo', 2), projectile });
const shotChar = (id, projectile) => S.registerChar({ id, name: id, desc: '', stats, specials: { ...specials, light: shotMove(projectile) }, meter: { move: 0, hit: 0 } });
shotChar('test_sh', shot);
shotChar('test_sh5', Array.from({ length: 5 }, (_, i) => ({ ...shot, dy: -50 - i * 5 })));
S.registerChar({ id: 'test_cn', name: 'Cn', desc: '', stats, meter: { move: 0, hit: 0 },
  specials: { ...specials, light: { ...mv('Parata', 2), counter: { from: 0, to: 5, dmg: 5, base: 300, growth: 5, ang: 0 } } } });
const cast = (sim, a) => { a.att = { ty: 'sp:light', dir: 'side', t: 0, air: false, id: 1, c: 0, rel: true }; };
// tiratore a sinistra, bersaglio a 400 unità davanti, entrambi sull'isola
const shotDuel = (cb = 'test_ab', ca = 'test_sh') => {
  const [sim, a, b] = duel(ca, cb);
  a.x = 700; a.y = b.y = S.STAGE.main.y; b.x = 1100; a.face = 1;
  cast(sim, a);
  return [sim, a, b];
};
const run = (sim, n) => { for (let i = 0; i < n; i++) sim.step(); };

test('proiettile: nasce a at, vola e colpisce', () => {
  const [sim, a, b] = shotDuel();
  run(sim, 2);
  assert.strictEqual(sim.shots.length, 0);
  run(sim, 3);
  assert.strictEqual(sim.shots.length, 1);
  run(sim, 30);
  assert.ok(b.dmg > 0);
  assert.strictEqual(sim.shots.length, 0);
  assert.strictEqual(a.dmg, 0);
});

test('proiettile: nasce una sola volta per attacco', () => {
  const [sim] = shotDuel('test_ab');
  sim.fighters.get('b').x = 1500; // lontano: non lo colpisce subito
  run(sim, 12);
  assert.strictEqual(sim.shots.length, 1);
});

test('proiettile: scade dopo life', () => {
  const [sim] = shotDuel();
  sim.fighters.get('b').x = 300; sim.fighters.get('b').y = 100; // fuori traiettoria
  run(sim, 4);
  assert.strictEqual(sim.shots.length, 1);
  run(sim, Math.ceil((shot.life + 0.1) / S.TICK));
  assert.strictEqual(sim.shots.length, 0);
});

test('proiettile: la schivata lo fa passare', () => {
  const [sim, , b] = shotDuel();
  b.inv = 1;
  run(sim, 4);
  run(sim, 15); // 0,5 s: ha superato b
  assert.strictEqual(b.dmg, 0);
  assert.strictEqual(sim.shots.length, 1);
  assert.ok(sim.shots[0].x > b.x);
});

test('proiettile: la parata lo distrugge senza risposta', () => {
  const [sim, a, b] = shotDuel('test_cn');
  b.att = { ty: 'sp:light', dir: 'side', t: 0, air: false, id: 1, c: 0, rel: true };
  const evs = [];
  for (let i = 0; i < 30; i++) { sim.step(); evs.push(...sim.events); b.att.t = 0; }
  assert.strictEqual(sim.shots.length, 0);
  assert.strictEqual(a.dmg, 0); assert.strictEqual(b.dmg, 0);
  assert.ok(evs.some((e) => e.t === 'counter'));
});

test('proiettile: elenco di proiettili', () => {
  const [sim] = shotDuel('test_ab', 'test_sh5');
  sim.fighters.get('b').x = 1500;
  run(sim, 4);
  assert.strictEqual(sim.shots.length, 5);
});

test('proiettile: resta in volo se chi l\'ha lanciato va KO e il KO vale per lui', () => {
  const [sim, a, b] = shotDuel();
  b.dmg = 999;
  run(sim, 4);
  assert.strictEqual(sim.shots.length, 1);
  sim.ko(a);
  run(sim, 60);
  assert.strictEqual(a.kos, 1);
});

test('proiettile: nello snapshot', () => {
  const [sim] = shotDuel();
  assert.strictEqual(sim.snapshot('a').p, undefined);
  run(sim, 4);
  const p = sim.snapshot('b').p;
  assert.strictEqual(p[0].length, 5);
  assert.strictEqual(p[0][1], 'test_sh:light');
  assert.ok(sim.events.concat([]).length >= 0);
});

test('proiettile: sparisce contro l\'isola', () => {
  const [sim, a] = shotDuel();
  a.att.ty = 'sp:light'; run(sim, 4);
  sim.shots[0].y = S.STAGE.main.y + 10; sim.shots[0].x = S.STAGE.main.x + 50;
  sim.fighters.get('b').x = 100; sim.fighters.get('b').y = 0;
  run(sim, 1);
  assert.strictEqual(sim.shots.length, 0);
});

// ---- Pepe ----
test('pepe: kit completo', () => {
  const sp = S.CHARS.pepe.specials;
  assert.deepStrictEqual(Object.keys(sp), ['light', 'heavy', 'dodge', 'special', 'ultimate']);
  const nomi = { light: 'Pugno di vento', heavy: 'Palla di fuoco', dodge: 'Turbo', special: 'Polverone', ultimate: 'Tempesta di fuoco' };
  for (const k of Object.keys(nomi)) assert.strictEqual(sp[k].name, nomi[k]);
  assert.ok(sp.heavy.charge > sp.light.charge);
  assert.deepStrictEqual(S.CHARS.pepe.meter, { move: 0.7, hit: 0.3 });
  // ogni speciale, lanciata con la barra piena, fa quello che promette
  const prova = (slot, dist = 600) => {
    const [sim, a, b] = duel('pepe', 'test_ab');
    a.x = 700; a.y = b.y = S.STAGE.main.y; b.x = 700 + dist; a.face = 1;
    a.att = { ty: 'sp:' + slot, dir: 'side', t: 0, air: false, id: 1, c: 0, rel: true };
    let shots = 0;
    for (let i = 0; i < 60; i++) { sim.step(); shots = Math.max(shots, sim.shots.length); }
    return { shots, a, b };
  };
  assert.strictEqual(prova('light').shots, 1);
  assert.strictEqual(prova('heavy').shots, 1);
  assert.ok(prova('dodge').a.sts.some((s) => s.k === 'b'));
  const p = prova('special', 100);
  assert.ok(p.b.sts.some((s) => s.k === 'd'));
  assert.ok(p.b.dmg > 0 || p.b.sts.length);
  assert.strictEqual(p.b.vx, 0);
  const u = prova('ultimate');
  assert.strictEqual(u.shots, 5);
  assert.ok(u.a.sts.some((s) => s.k === 'b'));
});
