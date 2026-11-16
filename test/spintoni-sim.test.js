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
  steps(f, N, 60);
  assert.ok(f.g, 'riatterra');
  assert.strictEqual(f.jumps, 1);
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
  assert.strictEqual(f.jumps, 1, 'il doppio salto è ancora disponibile');
  // dopo la tolleranza è un normale doppio salto
  const late = walkOff();
  for (let i = 0; i < 5; i++) S.stepFighter(late, idleInp);
  assert.strictEqual(late.coyote, 0);
  S.stepFighter(late, { ...idleInp, j: true });
  assert.strictEqual(late.jumps, 0, 'ormai usa il doppio salto');
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
