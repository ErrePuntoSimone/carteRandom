'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const S = require('../public/spintoni/shared');
const { Sim } = require('../games/spintoni/sim');

function seeded(seed) {
  let s = seed;
  return () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
}
const N = { mx: 0, up: false, down: false };
const steps = (f, inp, n) => { for (let i = 0; i < n; i++) S.stepFighter(f, i === 0 ? inp : { ...inp, j: false, l: false, h: false, d: false, dd: false }); };

test('si sta in piedi sull\'isola, si cammina, si salta due volte', () => {
  const f = S.newFighter(800, 600, 'gilda');
  steps(f, N, 30);
  assert.strictEqual(f.y, S.STAGE.main.y);
  assert.ok(f.g);
  steps(f, { mx: 1 }, 15);
  assert.ok(f.x > 850);
  S.stepFighter(f, { ...N, j: true });
  assert.ok(!f.g && f.vy < 0);
  steps(f, N, 8);
  const vyBefore = f.vy;
  S.stepFighter(f, { ...N, j: true });
  assert.ok(f.vy < vyBefore, 'doppio salto');
  S.stepFighter(f, { ...N, j: true });
  assert.ok(f.jumps === 0 || S.PHYS.airJumps > 2, 'due salti in aria usati');
  steps(f, N, 60);
  assert.ok(f.g, 'riatterra');
  assert.strictEqual(f.jumps, S.PHYS.airJumps);
});

test('piattaforme sospese: ci si sale dal basso e si scende tenendo giù', () => {
  const p = S.STAGE.plats[0];
  const f = S.newFighter(p.x + p.w / 2, S.STAGE.main.y, 'pepe');
  f.g = true;
  S.stepFighter(f, { ...N, j: true });
  steps(f, N, 50);
  assert.strictEqual(f.y, p.y, 'atterrato sulla piattaforma');
  assert.ok(f.onPlat);
  S.stepFighter(f, { ...N, down: true, dd: true });
  steps(f, { ...N, down: true }, 30);
  assert.strictEqual(f.y, S.STAGE.main.y, 'sceso sull\'isola');
});

test('cadere fuori dall\'isola fa perdere una vita', () => {
  const sim = new Sim({ players: [{ id: 'a', name: 'A', char: 'gilda' }, { id: 'b', name: 'B', char: 'gilda' }] });
  const a = sim.fighters.get('a');
  a.x = S.STAGE.main.x - 60; a.g = false;
  for (let i = 0; i < 60; i++) sim.step();
  assert.strictEqual(a.stocks, 2);
  for (let i = 0; i < 60; i++) sim.step();
  assert.ok(a.alive, 'rientra dall\'alto');
  assert.strictEqual(a.dmg, 0);
  assert.ok(a.g, 'è di nuovo a terra');
});

function punch(sim, a, ty, dir = 'side') {
  const extra = dir === 'up' ? { up: true } : dir === 'down' ? { down: true } : {};
  sim.pushInput(a.id, { s: a.seq + 1, mx: 0, ...{ l: ty === 'light', h: ty === 'heavy' }, ...extra });
  const total = S.moveTotal(S.MOVES[ty]);
  let hit = null;
  for (let i = 0; i < Math.ceil(total / S.TICK) + 2; i++) {
    sim.step();
    hit = hit || sim.events.find((e) => e.t === 'hit');
    sim.pushInput(a.id, { s: a.seq + 1, mx: 0, ...extra });
  }
  return hit;
}

test('pugni: il danno sale, il lancio cresce con il danno e un pesante al 120% butta fuori', () => {
  const mk = () => {
    const sim = new Sim({ players: [{ id: 'a', name: 'A', char: 'gilda' }, { id: 'b', name: 'B', char: 'gilda' }] });
    const a = sim.fighters.get('a'), b = sim.fighters.get('b');
    a.x = 760; b.x = 820; a.face = 1; a.inv = b.inv = 0;
    for (const f of [a, b]) { f.y = S.STAGE.main.y; f.g = true; }
    return { sim, a, b };
  };
  let { sim, a, b } = mk();
  let hit = punch(sim, a, 'light');
  assert.strictEqual(Math.round(b.dmg), 5);
  assert.ok(hit.vx > 0 && hit.vy < 0, 'spinto in avanti e in alto');
  const lowKb = hit.kb;

  ({ sim, a, b } = mk());
  b.dmg = 80;
  hit = punch(sim, a, 'heavy');
  assert.ok(hit.kb > lowKb * 2, 'più danno, più lancio');

  // a 0% un pesante non butta fuori
  ({ sim, a, b } = mk());
  punch(sim, a, 'heavy');
  for (let i = 0; i < 90; i++) sim.step();
  assert.strictEqual(b.stocks, 3);

  // al 120% sì (KO accreditato ad A)
  ({ sim, a, b } = mk());
  b.dmg = 120;
  punch(sim, a, 'heavy');
  for (let i = 0; i < 90; i++) sim.step();
  assert.strictEqual(b.stocks, 2);
  assert.strictEqual(a.kos, 1);
});

test('pugno verso l\'alto lancia in alto, schivata evita il colpo', () => {
  const sim = new Sim({ players: [{ id: 'a', name: 'A', char: 'gilda' }, { id: 'b', name: 'B', char: 'gilda' }] });
  const a = sim.fighters.get('a'), b = sim.fighters.get('b');
  a.x = 800; b.x = 800; a.inv = b.inv = 0;
  const up = punch(sim, a, 'light', 'up');
  assert.ok(up.vy < -200 && Math.abs(up.vx) < Math.abs(up.vy) * 0.2, 'lanciato in alto');

  const sim2 = new Sim({ players: [{ id: 'a', name: 'A', char: 'gilda' }, { id: 'b', name: 'B', char: 'gilda' }] });
  const a2 = sim2.fighters.get('a'), b2 = sim2.fighters.get('b');
  a2.x = 760; b2.x = 820; a2.face = 1; a2.inv = b2.inv = 0;
  sim2.pushInput('b', { s: 1, d: true });
  sim2.step();
  punch(sim2, a2, 'light');
  assert.strictEqual(b2.dmg, 0, 'schivato');
});

test('la partita finisce quando resta un solo lottatore; i bot giocano e risalgono', () => {
  const sim = new Sim({
    rng: seeded(3), stocks: 2, duration: 200,
    players: [
      { id: 'b1', name: 'B1', char: 'pepe', bot: true },
      { id: 'b2', name: 'B2', char: 'tonno', bot: true },
      { id: 'b3', name: 'B3', char: 'gilda', bot: true },
    ],
  });
  let n = 0;
  while (!sim.over && n < 30 * 200) { sim.step(); n++; }
  assert.ok(sim.over);
  const res = sim.results();
  assert.ok(res[0].stocks > 0 || sim.time >= 200);
  const totalKo = res.reduce((s, r) => s + r.falls, 0);
  assert.ok(totalKo >= 2, `cadute: ${totalKo}`);
  assert.ok(res.reduce((s, r) => s + r.kos, 0) >= 1, 'almeno un KO a pugni');
});

// ---------- fluidità: passo in avanti, salto perdonato, salto anticipato, annullo del recupero ----------
const idleInp = { mx: 0, up: false, down: false, j: false, l: false, h: false, d: false, dd: false };
const run = (f, inp, n) => { for (let i = 0; i < n; i++) S.stepFighter(f, i === 0 ? inp : idleInp); };
const onIsland = (x, char = 'gilda') => { const f = S.newFighter(x, S.STAGE.main.y, char); f.g = true; return f; };

test('colpendo si fa un passo in avanti: di più con il forte, poco verso l\'alto, mai in aria come a terra', () => {
  const dist = (ty, dir, air = false) => {
    const f = onIsland(800);
    if (air) { f.y -= 120; f.g = false; }
    const x0 = f.x;
    run(f, { ...idleInp, [ty === 'light' ? 'l' : 'h']: true, up: dir === 'up', down: dir === 'down' }, 40);
    return f.x - x0;
  };
  const light = dist('light', 'side'), heavy = dist('heavy', 'side');
  assert.ok(light > 8 && light < 24, `pugno veloce: ${light.toFixed(1)}`);
  assert.ok(heavy > 20 && heavy < 45, `pugno forte: ${heavy.toFixed(1)}`);
  assert.ok(heavy > light * 1.5, 'il forte avanza di più');
  assert.ok(dist('heavy', 'up') < heavy * 0.5, 'verso l\'alto avanza poco');
  assert.ok(dist('heavy', 'side', true) < heavy, 'in aria avanza meno');
  // si avanza nella direzione in cui si guarda
  const f = onIsland(800); f.face = -1;
  run(f, { ...idleInp, mx: -1, l: true }, 20);
  assert.ok(f.x < 800);
});

test('il passo in avanti non fa cadere dall\'isola né dalle piattaforme', () => {
  const m = S.STAGE.main;
  const f = onIsland(m.x + m.w - 12);
  run(f, { ...idleInp, h: true }, 60);
  assert.ok(f.g && f.x <= m.x + m.w - 8, `x=${f.x.toFixed(1)}`);
  const p = S.STAGE.plats[0];
  const g = S.newFighter(p.x + p.w - 12, p.y, 'pepe'); g.g = true; g.onPlat = true;
  run(g, { ...idleInp, h: true }, 60);
  assert.ok(g.g && g.y === p.y, 'resta sulla piattaforma');
});

test('salto perdonato: subito dopo aver lasciato il bordo si salta ancora da terra, senza perdere il doppio salto', () => {
  const m = S.STAGE.main;
  const walkOff = () => {
    const f = onIsland(m.x + m.w - 5);
    for (let i = 0; i < 40 && f.g; i++) S.stepFighter(f, { ...idleInp, mx: 1 });
    assert.ok(!f.g, 'è nel vuoto');
    return f;
  };
  const f = walkOff();
  assert.ok(f.coyote > 0, 'ancora in tolleranza');
  S.stepFighter(f, { ...idleInp, j: true });
  assert.ok(f.vy < -900, `salto da terra: vy=${f.vy.toFixed(0)}`);
  assert.strictEqual(f.jumps, S.PHYS.airJumps, 'i salti in aria sono ancora disponibili');
  // dopo la tolleranza è un normale doppio salto
  const late = walkOff();
  for (let i = 0; i < 5; i++) S.stepFighter(late, idleInp);
  assert.strictEqual(late.coyote, 0);
  S.stepFighter(late, { ...idleInp, j: true });
  assert.strictEqual(late.jumps, S.PHYS.airJumps - 1, 'ormai usa un salto in aria');
});

test('salto anticipato: se il doppio salto è già usato, il salto premuto poco prima di atterrare parte da solo', () => {
  const f = S.newFighter(800, S.STAGE.main.y - 30, 'gilda');
  f.vy = 300; f.jumps = 0; // sta cadendo e non ha più salti in aria
  S.stepFighter(f, { ...idleInp, j: true });
  assert.ok(f.vy > 0 && f.jbuf > 0, 'niente salto in aria: resta in memoria');
  for (let i = 0; i < 10 && f.vy >= 0; i++) S.stepFighter(f, idleInp);
  assert.ok(f.vy < 0, 'atterrato e saltato da solo');
  // premuto troppo presto non vale
  const g = S.newFighter(800, S.STAGE.main.y - 400, 'gilda');
  g.vy = 300; g.jumps = 0;
  S.stepFighter(g, { ...idleInp, j: true });
  for (let i = 0; i < 30; i++) S.stepFighter(g, idleInp);
  assert.ok(g.vy >= 0 || g.g, 'dopo troppo tempo il salto in memoria è scaduto');
});

test('saltando durante il recupero di un colpo lo si annulla', () => {
  const f = onIsland(800);
  S.stepFighter(f, { ...idleInp, h: true });
  assert.ok(f.att);
  for (let i = 0; i < 4; i++) S.stepFighter(f, idleInp);      // ancora in carica: il salto non parte
  S.stepFighter(f, { ...idleInp, j: true });
  assert.ok(f.att && f.g, 'in carica non si salta');
  const rec = S.MOVES.heavy.startup + S.MOVES.heavy.active;
  while (f.att && f.att.t < rec) S.stepFighter(f, idleInp);
  assert.ok(f.att, 'siamo nel recupero');
  S.stepFighter(f, { ...idleInp, j: true });
  assert.ok(!f.att && !f.g && f.vy < 0, 'recupero annullato dal salto');
});

// ---------- pugno forte caricabile ----------
const hold = (f, inp, n) => { for (let i = 0; i < n; i++) S.stepFighter(f, i === 0 ? inp : { ...idleInp, hd: inp.hd, mx: inp.mx || 0 }); };

test('il forte si carica tenendo premuto: resta in posa, la carica sale e si ferma a 2 secondi', () => {
  const f = onIsland(800);
  S.stepFighter(f, { ...idleInp, h: true, hd: true });
  for (let i = 0; i < 10; i++) S.stepFighter(f, { ...idleInp, hd: true });
  assert.ok(f.att && !f.att.rel, 'in preparazione');
  assert.ok(f.att.t < S.MOVES.heavy.startup, 'il colpo non è ancora partito');
  const c1 = f.att.c;
  assert.ok(c1 > 0, `sta caricando: ${c1.toFixed(2)}`);
  const x = f.x;
  for (let i = 0; i < 20; i++) S.stepFighter(f, { ...idleInp, hd: true, mx: 1 });
  assert.ok(f.att.c > c1 && f.att.c < S.PHYS.chargeMax);
  assert.ok(Math.abs(f.x - x) < 1, 'mentre carica a terra è fermo');
  // continua a tenere premuto: a 2 secondi parte da solo
  let released = false;
  for (let i = 0; i < 90 && !released; i++) {
    S.stepFighter(f, { ...idleInp, hd: true });
    if (f.att && f.att.rel) released = true;
    assert.ok(!f.att || f.att.c <= S.PHYS.chargeMax + 1e-9, 'la carica non supera il massimo');
  }
  assert.ok(released, 'a 2 secondi il colpo parte da solo');
  assert.ok(Math.abs(f.att.c - S.PHYS.chargeMax) < 1e-6, `carica massima: ${f.att.c}`);
});

test('un tocco veloce sul forte non ha ritardo: parte come prima', () => {
  const frames = (heldInput) => {
    const f = onIsland(800);
    let n = 0;
    S.stepFighter(f, { ...idleInp, h: true, hd: heldInput });
    while (f.att && !S.isActive(f.att) && n < 60) { S.stepFighter(f, idleInp); n++; }
    return n;
  };
  const tap = frames(false);
  assert.ok(tap <= Math.ceil(S.MOVES.heavy.startup / S.TICK) + 1, `passi prima del colpo: ${tap}`);
});

test('rilasciando, danno e lancio crescono con la carica; a carica piena sono quasi doppi', () => {
  const mk = (chargeSteps) => {
    const sim = new Sim({ players: [{ id: 'a', name: 'A', char: 'gilda' }, { id: 'b', name: 'B', char: 'gilda' }] });
    const a = sim.fighters.get('a'), b = sim.fighters.get('b');
    a.x = 760; b.x = 830; a.face = 1; a.inv = b.inv = 0;
    for (const f of [a, b]) { f.y = S.STAGE.main.y; f.g = true; }
    let s = 1, hit = null;
    sim.pushInput('a', { s: s++, h: true, hd: true });
    for (let i = 0; i < chargeSteps; i++) { sim.pushInput('a', { s: s++, hd: true }); sim.step(); hit = hit || sim.events.find((e) => e.t === 'hit'); }
    for (let i = 0; i < 40 && !hit; i++) { sim.pushInput('a', { s: s++ }); sim.step(); hit = hit || sim.events.find((e) => e.t === 'hit'); }
    return { dmg: b.dmg, kb: hit.kb, ch: hit.ch };
  };
  const tap = mk(0), half = mk(30), full = mk(90);
  assert.ok(Math.abs(tap.dmg - 12) < 0.5, `forte senza carica: ${tap.dmg}`);
  assert.ok(half.dmg > tap.dmg * 1.3 && half.dmg < full.dmg, `a metà: ${half.dmg}`);
  assert.ok(full.dmg > tap.dmg * 1.9 && full.dmg < tap.dmg * 2.1, `carica piena: ${full.dmg}`);
  assert.ok(full.kb > tap.kb * 1.5, `lancio ${tap.kb} -> ${full.kb}`);
  assert.ok(full.ch > 0.95 && tap.ch === 0);
});

test('un colpo ricevuto o la schivata interrompono la carica', () => {
  const sim = new Sim({ players: [{ id: 'a', name: 'A', char: 'gilda' }, { id: 'b', name: 'B', char: 'gilda' }] });
  const a = sim.fighters.get('a'), b = sim.fighters.get('b');
  a.x = 760; b.x = 830; a.inv = b.inv = 0;
  for (const f of [a, b]) { f.y = S.STAGE.main.y; f.g = true; }
  let sa = 1, sb = 1;
  sim.pushInput('a', { s: sa++, h: true, hd: true });
  for (let i = 0; i < 12; i++) { sim.pushInput('a', { s: sa++, hd: true }); sim.step(); }
  assert.ok(a.att && a.att.c > 0, 'a sta caricando');
  sim.pushInput('b', { s: sb++, l: true });
  for (let i = 0; i < 6; i++) { sim.pushInput('a', { s: sa++, hd: true }); sim.pushInput('b', { s: sb++ }); sim.step(); }
  assert.ok(a.dmg > 0 && !a.att, 'colpito: la carica è annullata');

  const f = onIsland(800);
  S.stepFighter(f, { ...idleInp, h: true, hd: true });
  for (let i = 0; i < 12; i++) S.stepFighter(f, { ...idleInp, hd: true });
  assert.ok(f.att && f.att.c > 0);
  S.stepFighter(f, { ...idleInp, hd: true, d: true });
  assert.ok(!f.att && f.dg > 0, 'la schivata interrompe la carica');
});

test('conto alla rovescia: tutti fermi, input ignorati ma confermati, il tempo parte dopo', () => {
  const sim = new Sim({ players: [{ id: 'a', name: 'A', char: 'gilda' }, { id: 'b', name: 'B', char: 'tonno' }], countdown: 5, rng: seeded(3) });
  const a = sim.fighters.get('a');
  const x0 = a.x;
  sim.pushInput('a', { s: 1, mx: 1, up: 0, dn: 0, j: 1, l: 0, h: 0, d: 0, dd: 0 });
  for (let i = 0; i < Math.round(4.9 / S.TICK); i++) sim.step();
  assert.ok(sim.snapshot('a').cd > 0, 'conto ancora in corso');
  assert.strictEqual(a.x, x0, 'fermo durante il conto');
  assert.strictEqual(sim.time, 0, 'il tempo non scorre');
  assert.strictEqual(sim.snapshot('a').ack, 1, 'input confermato');
  for (let i = 0; i < Math.round(0.4 / S.TICK); i++) sim.step();
  assert.strictEqual(sim.snapshot('a').cd, 0);
  sim.pushInput('a', { s: 2, mx: 1, up: 0, dn: 0, j: 0, l: 0, h: 0, d: 0, dd: 0 });
  for (let i = 0; i < 10; i++) sim.step();
  assert.ok(a.x > x0, 'dopo il conto si muove');
  assert.ok(sim.time > 0);
});

test('schivata in movimento: scatto lungo nella direzione scelta, da fermo resta sul posto', () => {
  const f = S.newFighter(800, 640, 'gilda'); f.g = true;
  const x0 = f.x;
  S.stepFighter(f, { mx: 1, up: false, down: false, d: true });
  for (let i = 0; i < Math.round(S.PHYS.dodgeTime / S.TICK) + 2; i++) S.stepFighter(f, { mx: 1, up: false, down: false });
  assert.ok(f.x - x0 > 200, `scatto di ${Math.round(f.x - x0)}`);
  const g = S.newFighter(800, 640, 'gilda'); g.g = true;
  S.stepFighter(g, { mx: 0, up: false, down: false, d: true });
  for (let i = 0; i < 12; i++) S.stepFighter(g, { mx: 0, up: false, down: false });
  assert.ok(Math.abs(g.x - 800) < 1, 'da fermo non si sposta');
});

test('tre salti in tutto: uno da terra e due in aria', () => {
  const f = S.newFighter(800, 400, 'gilda');
  steps(f, N, 40); // atterra
  S.stepFighter(f, { ...N, j: true });
  let n = 1;
  for (let k = 0; k < 4; k++) {
    steps(f, N, 6);
    const vy = f.vy;
    S.stepFighter(f, { ...N, j: true });
    if (f.vy < vy - 300) n++;
  }
  assert.strictEqual(n, 3);
});

test('dopo il forte caricato si resta fermi di più, in proporzione alla carica', () => {
  const run1 = (hold) => {
    const f = onIsland(800);
    let t = 0, c = 0;
    S.stepFighter(f, { ...idleInp, h: true, hd: hold > 0 });
    for (let i = 0; i < 400 && f.att; i++) {
      S.stepFighter(f, { ...idleInp, hd: i * S.TICK < hold });
      if (f.att) c = f.att.c;
      t += S.TICK;
    }
    return { t, c };
  };
  const a = run1(0), b = run1(1), d = run1(2);
  // pausa = durata - tempo passato a caricare - durata senza carica
  const pause = (r) => r.t - r.c - a.t;
  assert.ok(pause(b) > 0.2, `carica ${b.c.toFixed(2)} s: pausa ${pause(b).toFixed(2)}`);
  assert.ok(pause(d) > pause(b) + 0.15, 'la pausa cresce con la carica');
  assert.ok(Math.abs(pause(d) - S.PHYS.chargeRecovery) < 0.1, `a carica piena la pausa vale chargeRecovery (${pause(d).toFixed(2)})`);
  // durante la pausa non si può annullare con un salto
  const f = onIsland(800);
  S.stepFighter(f, { ...idleInp, h: true, hd: true });
  for (let i = 0; i < 70; i++) S.stepFighter(f, { ...idleInp, hd: true });
  for (let i = 0; i < 20 && f.att && f.att.rel === false; i++) S.stepFighter(f, idleInp);
  S.stepFighter(f, { ...idleInp, j: true });
  assert.ok(f.g && f.att, 'il salto non annulla la pausa del forte caricato');
});
