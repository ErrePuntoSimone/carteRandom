'use strict';
// Controlla che gli sprite sheet rispettino lo schema che il gioco si aspetta,
// così si possono sostituire le immagini senza rompere le animazioni.
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const S = require('../public/spintoni/shared');
const { server } = require('../server');

const DIR = path.join(__dirname, '..', 'public', 'spintoni', 'sprites');
const NEED = ['idle', 'run', 'air', 'dodge', 'hurt',
  'light_side', 'light_up', 'light_down', 'light_downair', 'heavy_side', 'heavy_up', 'heavy_down', 'heavy_downair'];

function pngSize(file) {
  const b = fs.readFileSync(file);
  assert.strictEqual(b.subarray(1, 4).toString(), 'PNG', `${file} non è un PNG`);
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
}

for (const id of Object.keys(S.CHARS)) {
  test(`sprite di ${id}: descrizione e immagine coerenti`, () => {
    const meta = JSON.parse(fs.readFileSync(path.join(DIR, `${id}.json`), 'utf8'));
    const { w, h } = pngSize(path.join(DIR, `${id}.png`));
    assert.strictEqual(w, meta.cell.w * meta.cols, 'larghezza = celle × colonne');
    assert.strictEqual(h, meta.cell.h * Math.ceil(meta.frames / meta.cols), 'altezza = celle × righe');
    assert.ok(meta.anchor.x < meta.cell.w && meta.anchor.y < meta.cell.h);
    // maschera dei dettagli colorabili: stessa griglia dello sprite
    assert.strictEqual(meta.mask, `${id}-mask.png`);
    assert.deepStrictEqual(pngSize(path.join(DIR, meta.mask)), { w, h }, 'la maschera ha le stesse dimensioni');

    let next = 0;
    for (const name of NEED) {
      const a = meta.anims[name];
      assert.ok(a, `manca l'animazione ${name}`);
      assert.strictEqual(a.start, next, `${name}: i fotogrammi devono essere in sequenza`);
      next += a.frames;
    }
    assert.strictEqual(next, meta.frames);

    // gli attacchi hanno tre fasi (carica, colpo, recupero) che sommano ai fotogrammi
    for (const ty of ['light', 'heavy']) {
      for (const dir of ['side', 'up', 'down', 'downair']) {
        const a = meta.anims[`${ty}_${dir}`];
        assert.strictEqual(a.phases.length, 3);
        assert.strictEqual(a.phases.reduce((s, n) => s + n, 0), a.frames);
        assert.ok(a.phases.every((n) => n >= 1));
      }
    }
    // l'animazione scelta da ogni mossa del personaggio esiste nello sprite
    for (const [ty, m] of Object.entries(S.CHARS[id].moves)) {
      if (m.anim) assert.ok(meta.anims[m.anim], `${ty}: animazione ${m.anim} mancante`);
    }
  });
}

test('le immagini sono servite con il tipo corretto', async () => {
  await new Promise((r) => server.listen(0, r));
  try {
    const base = `http://127.0.0.1:${server.address().port}`;
    const res = await fetch(`${base}/spintoni/sprites/gilda.png`);
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.headers.get('content-type'), 'image/png');
    assert.ok((await res.arrayBuffer()).byteLength > 10000);
    assert.strictEqual((await fetch(`${base}/spintoni/sprites.js`)).status, 200);
  } finally {
    await new Promise((r) => server.close(r));
  }
});

test('mappa a PNG: map.json punta a immagini esistenti e PNG validi', () => {
  const fs = require('fs');
  const path = require('path');
  const dir = path.join(__dirname, '..', 'public', 'spintoni', 'maps', 'default');
  const meta = JSON.parse(fs.readFileSync(path.join(dir, 'map.json'), 'utf8'));
  const files = [meta.sky, meta.scenery.img, meta.island.img, meta.platform.img];
  for (const f of files) {
    const buf = fs.readFileSync(path.join(dir, f));
    assert.strictEqual(buf.subarray(1, 4).toString(), 'PNG', `${f} non è un PNG`);
  }
  for (const k of ['scenery', 'island']) for (const n of ['x', 'y', 'w', 'h']) assert.ok(Number.isFinite(meta[k][n]), `${k}.${n}`);
});
