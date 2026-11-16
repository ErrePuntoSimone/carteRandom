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
