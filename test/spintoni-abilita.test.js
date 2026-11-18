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
S.registerChar({ id: 'test_plain', name: 'Plain', desc: '', stats }); // senza speciali nascoste

test('abilità: moveOf risolve le speciali', () => {
  assert.strictEqual(S.moveOf('test_ab', 'sp:heavy').name, 'Pesante');
  assert.deepStrictEqual(S.moveOf('test_ab', 'sp:heavy').boxes, {}); // senza zone proprie non colpisce in mischia
  assert.strictEqual(S.moveOf('test_ab', 'sp:heavy').startup, 0.1);
});

test('abilità: personaggi senza specials non hanno barre', () => {
  assert.strictEqual(S.newFighter(0, 0, 'test_plain').mt, null);
  assert.strictEqual(S.physState(S.newFighter(0, 0, 'test_plain')).mt, null);
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
  const a = ground('test_plain'), b = ground('test_plain');
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

test('barre: chi riceve carica con il proprio meter.hit, non con quello di chi colpisce', () => {
  const [sim, a, v] = duel('test_ab_hit', 'test_sh'); // test_sh ha meter.hit = 0
  sim.launch(a, v, hitOpts);
  assert.ok(a.mt.light > 0);
  assert.deepStrictEqual(v.mt, { light: 0, heavy: 0, dodge: 0, special: 0 });
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
  const evs = [];
  for (let i = 0; i < 4; i++) { sim.step(); evs.push(...sim.events); }
  assert.deepStrictEqual(evs.filter((e) => e.t === 'shot').map((e) => [e.id, e.kind]), [['a', 'test_sh:light']]);
  const p = sim.snapshot('b').p;
  assert.strictEqual(p[0].length, 5);
  assert.strictEqual(p[0][1], 'test_sh:light');
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
  const d = p.b.sts.find((s) => s.k === 'd');
  assert.ok(d && d.speed === 0.6 && d.jump === 0.75);
  assert.ok(Math.abs(S.statOf(p.b, 'speed') - 500 * 0.6) < 1e-9);
  assert.strictEqual(p.b.vx, 0);
  const u = prova('ultimate');
  assert.strictEqual(u.shots, 5);
  assert.ok(u.a.sts.some((s) => s.k === 'b'));
});

// ---- kit di Gilda, Micio e Tonno ----
// lancia la speciale `slot` di `char` con un bersaglio a `dist` davanti e guarda cosa succede in 2 secondi
function provaKit(char, slot, dist = 300) {
  const [sim, a, b] = duel(char, 'test_ab');
  a.x = 700; a.y = b.y = S.STAGE.main.y; a.g = b.g = true; b.x = 700 + dist; a.face = 1;
  a.att = { ty: 'sp:' + slot, dir: 'side', t: 0, air: false, id: 1, c: 0, rel: true };
  let shots = 0, hitArmored = false;
  for (let i = 0; i < 60; i++) {
    sim.step(); shots = Math.max(shots, sim.shots.length);
    if (a.att && S.inWindow(a, 'armor')) hitArmored = true;
  }
  return { sim, a, b, shots, hitArmored };
}

test('kit: Gilda, Micio e Tonno hanno 4 speciali e la suprema con i nomi approvati', () => {
  const nomi = {
    gilda: ['Stella cadente', 'Pugno stellare', 'Scudo di stelle', 'Incantesimo', 'Pioggia di stelle'],
    micio: ["Fendente d'aria", 'Scudo boomerang', 'Postura del cavaliere', 'Carica di cavalleria', 'Mille fendenti'],
    tonno: ["Sputo d'acqua", 'Tuffo bomba', 'Furia', 'Onda', 'Maremoto'],
  };
  for (const [c, n] of Object.entries(nomi)) {
    const sp = S.CHARS[c].specials;
    assert.deepStrictEqual(['light', 'heavy', 'dodge', 'special', 'ultimate'].map((k) => sp[k].name), n, c);
    assert.ok(sp.heavy.charge > sp.light.charge, c);
    const m = S.CHARS[c].meter;
    assert.ok(Math.abs(m.move + m.hit - 1) < 1e-9, c);
  }
  // carattere: Gilda a metà, Micio colpendo, Tonno quasi solo colpendo
  assert.ok(S.CHARS.gilda.meter.hit < S.CHARS.micio.meter.hit && S.CHARS.micio.meter.hit < S.CHARS.tonno.meter.hit);
});

test('kit Gilda: stella ad arco, pugno corazzato, scudo, incantesimo, pioggia di stelle', () => {
  const st = provaKit('gilda', 'light', 430); // ricade a media distanza
  assert.strictEqual(st.shots, 1); assert.ok(st.b.dmg > 0);
  const pu = provaKit('gilda', 'heavy', 150);
  assert.ok(pu.b.dmg > 0 && pu.hitArmored);
  const sc = provaKit('gilda', 'dodge');
  assert.ok(Math.abs(S.statOf(sc.a, 'weight') - 1.3) < 1e-9);
  const inc = provaKit('gilda', 'special', 80);
  assert.ok(Math.abs(S.statOf(inc.b, 'power') - 0.7) < 1e-9);
  const pi = provaKit('gilda', 'ultimate');
  assert.strictEqual(pi.shots, 5);
  assert.ok(S.statOf(pi.a, 'power') > 1);
});

test('kit Micio: lama che attraversa, scudo boomerang, postura, carica, mille fendenti', () => {
  const fe = provaKit('micio', 'light');
  assert.strictEqual(fe.shots, 1); assert.ok(fe.b.dmg > 0);
  const po = provaKit('micio', 'dodge');
  assert.ok(Math.abs(S.statOf(po.a, 'power') - 1.1 * 1.25) < 1e-9);
  const ca = provaKit('micio', 'special', 250);
  assert.ok(ca.b.dmg > 0 && ca.hitArmored);
  const mf = provaKit('micio', 'ultimate');
  assert.strictEqual(mf.shots, 5); assert.ok(mf.hitArmored);
});

test('boomerang: lo scudo torna indietro e colpisce di nuovo al ritorno', () => {
  // bersaglio fermo e invulnerabile ai lanci: colpito all'andata e al ritorno
  const [sim, a, b] = duel('micio', 'test_ab');
  a.x = 700; a.y = b.y = S.STAGE.main.y; a.g = b.g = true; b.x = 900; a.face = 1;
  a.att = { ty: 'sp:heavy', dir: 'side', t: 0, air: false, id: 1, c: 0, rel: true };
  let hits = 0, maxX = 0, backX = null;
  for (let i = 0; i < 60; i++) {
    b.x = 900; b.vx = b.vy = 0; b.hs = 0; // resta lì
    sim.step();
    hits += sim.events.filter((e) => e.t === 'hit' && e.id === 'b').length;
    const s = sim.shots[0];
    if (s) { maxX = Math.max(maxX, s.x); if (s.vx < 0) backX = s.x; }
  }
  assert.ok(backX !== null && backX < maxX, 'torna indietro');
  assert.strictEqual(hits, 2);
});

test('kit Tonno: sputo che rallenta, tuffo bomba, furia, onda, maremoto da due lati', () => {
  const sp = provaKit('tonno', 'light', 200);
  assert.ok(sp.b.dmg > 0 && sp.b.sts.some((s) => s.k === 'd'));
  const tu = provaKit('tonno', 'heavy', 100);
  assert.ok(tu.b.dmg > 0); assert.ok(tu.a.g, 'atterrato');
  const fu = provaKit('tonno', 'dodge');
  assert.ok(S.statOf(fu.a, 'speed') > 390 && S.statOf(fu.a, 'power') > 1.28);
  const on = provaKit('tonno', 'special', 400);
  assert.strictEqual(on.shots, 1); assert.ok(on.b.dmg > 0);
  // Maremoto: l'onda all'indietro spinge all'indietro chi sta dietro
  const [sim, a, b] = duel('tonno', 'test_ab');
  a.x = 1000; a.y = b.y = S.STAGE.main.y; a.g = b.g = true; b.x = 750; a.face = 1;
  a.att = { ty: 'sp:ultimate', dir: 'side', t: 0, air: false, id: 1, c: 0, rel: true };
  let shots = 0;
  for (let i = 0; i < 40; i++) { sim.step(); shots = Math.max(shots, sim.shots.length); }
  assert.strictEqual(shots, 2);
  assert.ok(b.dmg > 0 && b.x < 750, `dietro e spinto indietro: x=${b.x}`);
});

test('tuffo bomba: non porta Tonno oltre il bordo in alto', () => {
  const f = ground('tonno'); castSp(f, 'heavy');
  let minY = f.y;
  for (let i = 0; i < 40; i++) { S.stepFighter(f, idle); minY = Math.min(minY, f.y); }
  assert.ok(minY > S.STAGE.blast.t);
  assert.ok(f.g && Math.abs(f.y - S.STAGE.main.y) < 1);
});

// ---- bot ----
function seededBot(seed) { let s = seed; return () => { s = (s * 16807) % 2147483647; return s / 2147483647; }; }
function botDuel(dist, full) {
  const sim = new Sim({ players: [{ id: 'a', name: 'A', char: 'pepe', bot: true }, { id: 'b', name: 'B', char: 'gilda' }], rng: seededBot(7) });
  const A = sim.fighters.get('a'), B = sim.fighters.get('b');
  A.x = 700; B.x = 700 + dist; A.face = 1; B.face = -1;
  for (const f of [A, B]) { f.y = S.STAGE.main.y; f.g = true; f.inv = 99; }
  for (const k of S.SLOTS) A.mt[k] = full.includes(k) ? S.CHARS.pepe.specials[k].charge : 0;
  const seen = new Set();
  return { sim, A, seen, run(sec) {
    for (let i = 0; i < sec * 30; i++) { sim.step(); if (A.att && A.att.ty.startsWith('sp:')) seen.add(A.att.ty); }
    return seen;
  } };
}

test('bot: usa la suprema e le speciali quando sono pronte', () => {
  assert.ok(botDuel(300, S.SLOTS).run(3).has('sp:ultimate'));
  assert.ok(botDuel(100, ['special']).run(5).has('sp:special'));
  assert.ok(botDuel(300, ['light']).run(5).has('sp:light'));
  assert.ok(botDuel(400, ['heavy']).run(5).has('sp:heavy'));
});

// ---- correzioni finali ----
const castSp = (f, slot) => { f.att = { ty: 'sp:' + slot, dir: 'side', t: 0, air: !f.g, id: 99, c: 0, rel: true }; };

test('turbo: con il Turbo il triplo salto di Pepe non esce dal bordo in alto, neanche dalla piattaforma alta', () => {
  const top = S.STAGE.plats[2];
  for (const [x, y, onPlat] of [[800, S.STAGE.main.y, false], [top.x + top.w / 2, top.y, true]]) {
    const f = S.newFighter(x, y, 'pepe'); f.g = true; f.onPlat = onPlat;
    castSp(f, 'dodge'); hold(f, {}, 1);
    assert.ok(f.sts.some((s) => s.k === 'b'));
    f.att = null;
    let jumps = 3, minY = f.y;
    S.stepFighter(f, { ...idle, j: true }); jumps--;
    for (let i = 0; i < 120; i++) {
      const j = jumps > 0 && !f.g && f.vy >= 0; // ogni salto in aria all'apice
      if (j) jumps--;
      S.stepFighter(f, { ...idle, j });
      minY = Math.min(minY, f.y);
    }
    assert.strictEqual(jumps, 0);
    assert.ok(minY > S.STAGE.blast.t, `da y=${y} apice ${minY}`);
  }
});

test('turbo: due Turbo non si sommano, il secondo rinnova il primo', () => {
  const f = ground('pepe');
  castSp(f, 'dodge'); hold(f, {}, 20);
  castSp(f, 'ultimate'); hold(f, {}, 1);
  assert.strictEqual(f.sts.filter((s) => s.k === 'b').length, 1);
  assert.ok(Math.abs(S.statOf(f, 'speed') - 720 * 1.4) < 1e-9);
  assert.ok(f.sts[0].t > 3.9); // rinnovato
});

test('polverone: due debuff non rallentano più di uno', () => {
  const [sim, a, v] = duel('pepe', 'test_ab');
  const debuff = S.CHARS.pepe.specials.special.debuff;
  sim.launch(a, v, { ...hitOpts, noLaunch: true, debuff });
  sim.launch(a, v, { ...hitOpts, noLaunch: true, debuff });
  assert.strictEqual(v.sts.length, 1);
  assert.ok(Math.abs(S.statOf(v, 'speed') - 500 * 0.6) < 1e-9);
});

test('pepe: le speciali senza zona di colpo non colpiscono in mischia', () => {
  for (const slot of ['dodge', 'light', 'heavy']) {
    const f = ground('pepe'); castSp(f, slot);
    f.att.t = S.moveOf('pepe', f.att.ty).startup; // colpo attivo
    assert.ok(S.isActive(f), slot);
    assert.strictEqual(S.hitbox(f), null, slot);
  }
  // Pepe appena sopra l'avversario: il punto (0,0) della zona vuota cadrebbe dentro di lui
  const [sim, a, b] = duel('pepe', 'test_ab');
  a.x = b.x = 700; b.y = S.STAGE.main.y; a.y = b.y - 40; a.g = false; a.face = 1;
  castSp(a, 'dodge');
  const evs = [];
  for (let i = 0; i < 5; i++) { sim.step(); evs.push(...sim.events); }
  assert.deepStrictEqual(evs.filter((e) => e.t === 'hit'), []);
  assert.strictEqual(b.dmg, 0);
});

test('snapshot: ph senza barre né stati vuoti, barre al millesimo e stati senza at/dur', () => {
  const [sim, a] = duel('pepe', 'test_plain');
  for (let i = 0; i < 7; i++) { sim.pushInput('a', { s: i + 1, mx: 1 }); sim.step(); }
  const pg = sim.snapshot('b').f.find((x) => x.id === 'b').ph;
  for (const k of ['mt', 'ht', 'spArm', 'sts']) assert.ok(!(k in pg), k);
  // il telefono rimette i campi omessi (app.js): stesso stato del server
  assert.deepStrictEqual({ mt: null, ht: null, spArm: null, sts: [], ...pg }, S.physState(sim.fighters.get('b')));
  castSp(a, 'dodge'); sim.step();
  const pa = sim.snapshot('a').f.find((x) => x.id === 'a').ph;
  assert.ok(Object.values(pa.mt).some((v) => v > 0));
  for (const v of Object.values(pa.mt)) assert.ok(String(v).split('.')[1] === undefined || String(v).split('.')[1].length <= 3, String(v));
  assert.deepStrictEqual(Object.keys(pa.sts[0]).sort(), ['k', 'speed', 't']);
});

test('rientro: tenere Speciale durante il Turbine in aria non fa partire il Polverone', () => {
  const f = S.newFighter(200, 500, 'pepe'); // fuori dall'isola, in aria
  S.addMeter(f, 100);
  S.stepFighter(f, { ...idle, sp: true, hb: 8 });
  assert.strictEqual(f.att.ty, 'special');
  hold(f, { hb: 8 }, 12);
  assert.ok(!isSp(f));
  assert.strictEqual(f.mt.special, S.CHARS.pepe.specials.special.charge);
  // a terra, tenuto senza Turbine, la speciale parte come prima
  const g = ground('pepe'); S.addMeter(g, 100);
  hold(g, { hb: 8 }, 12);
  assert.strictEqual(g.att.ty, 'sp:special');
});

// ---- revisione kit: niente KO da soli con un input normale ----
const M = S.STAGE.main;
const inAria = (char, x) => { const f = S.newFighter(x, M.y - 150, char); f.g = false; f.vy = 0; f.face = 1; return f; };

test('scatti in aria: Carica di cavalleria e Pugno stellare non portano fuori dal bordo', () => {
  for (const [char, slot] of [['micio', 'special'], ['gilda', 'heavy']]) {
    for (const x of [M.x + M.w - 200, M.x + M.w - 100]) {
      const f = inAria(char, x); castSp(f, slot);
      for (let i = 0; i < 90; i++) S.stepFighter(f, idle);
      assert.ok(f.g && f.x <= M.x + M.w, `${char} da x=${x}: x=${f.x} a terra=${f.g}`);
    }
  }
  // da fuori dall'isola lo scatto verso l'isola funziona ancora (per rientrare)
  const f = inAria('micio', M.x + M.w + 150); f.face = -1; castSp(f, 'special');
  for (let i = 0; i < 10; i++) S.stepFighter(f, idle);
  assert.ok(f.x < M.x + M.w + 150 - 200);
});

test('tuffo bomba: vicino al bordo, anche tenendo avanti, ricade sull\'isola', () => {
  const f = ground('tonno'); f.x = M.x + M.w - 60; f.face = 1; castSp(f, 'heavy');
  while (f.att) S.stepFighter(f, { ...idle, mx: 1 }); // avanti per tutta la mossa
  assert.ok(f.g && Math.abs(f.y - M.y) < 1 && Math.abs(f.x - (M.x + M.w - 60)) < 10, `x=${f.x} y=${f.y}`);
});

test('tuffo bomba: tenuto in aria non parte', () => {
  const f = inAria('tonno', M.x - 150); f.mt.heavy = S.CHARS.tonno.specials.heavy.charge;
  hold(f, { hb: 2, down: true }, 15);
  assert.ok(!isSp(f));
  assert.strictEqual(f.mt.heavy, S.CHARS.tonno.specials.heavy.charge);
});
