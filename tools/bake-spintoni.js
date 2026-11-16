'use strict';
// Genera gli sprite sheet PNG dei lottatori di "Spintoni" disegnandoli con tools/sprites/hd-render.js.
//
//   node tools/bake-spintoni.js
//
// Richiede Playwright (solo per generare le immagini, il gioco non ne ha bisogno) e, se presente,
// Python con Pillow per ridurre il peso dei PNG. Scrive in public/spintoni/sprites/:
//   <personaggio>.png  - tutti i fotogrammi in una griglia
//   <personaggio>.json - descrizione: dimensioni, punto d'appoggio dei piedi e animazioni
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const OUT = path.join(__dirname, '..', 'public', 'spintoni', 'sprites');
const SCRIPT = fs.readFileSync(path.join(__dirname, 'sprites', 'hd-render.js'), 'utf8');

// ordine delle animazioni nella griglia
const ORDER = [
  'idle', 'run', 'air', 'dodge', 'hurt',
  'light_side', 'light_up', 'light_down', 'light_downair',
  'heavy_side', 'heavy_up', 'heavy_down', 'heavy_downair',
];
const CHARS = ['pepe', 'gilda', 'tonno'];
const SCALE = 1.25;                 // pixel per unità di gioco
const CELL_U = { w: 200, h: 170 };  // dimensione della cella in unità di gioco
const ANCHOR_U = { x: 85, y: 155 }; // dove cadono i piedi nella cella
const COLS = 10;

async function main() {
  const { chromium } = require('playwright');
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.setContent('<canvas id="c"></canvas>');
  await page.addScriptTag({ content: SCRIPT });

  for (const ch of CHARS) {
    const result = await page.evaluate(({ ch, ORDER, SCALE, CELL_U, ANCHOR_U, COLS }) => {
      const cw = Math.round(CELL_U.w * SCALE), chh = Math.round(CELL_U.h * SCALE);
      const ax = Math.round(ANCHOR_U.x * SCALE), ay = Math.round(ANCHOR_U.y * SCALE);
      const total = ORDER.reduce((s, n) => s + HD.ANIMS[n].frames, 0);
      const rows = Math.ceil(total / COLS);
      const c = document.getElementById('c');
      c.width = cw * COLS; c.height = chh * rows;
      const ctx = c.getContext('2d');
      ctx.clearRect(0, 0, c.width, c.height);
      const anims = {};
      let idx = 0;
      for (const name of ORDER) {
        const a = HD.ANIMS[name];
        anims[name] = { start: idx, frames: a.frames, loop: !!a.loop };
        if (a.fps) anims[name].fps = a.fps;
        if (a.phases) anims[name].phases = a.phases;
        for (let i = 0; i < a.frames; i++, idx++) {
          const col = idx % COLS, row = Math.floor(idx / COLS);
          ctx.save();
          ctx.beginPath(); ctx.rect(col * cw, row * chh, cw, chh); ctx.clip();
          ctx.translate(col * cw + ax, row * chh + ay);
          ctx.scale(SCALE, SCALE);
          HD.draw(ctx, ch, a.fn(i, a.frames), i / a.frames);
          ctx.restore();
        }
      }
      return {
        png: c.toDataURL('image/png').split(',')[1],
        meta: { char: ch, scale: SCALE, cell: { w: cw, h: chh }, anchor: { x: ax, y: ay }, cols: COLS, frames: total, anims },
      };
    }, { ch, ORDER, SCALE, CELL_U, ANCHOR_U, COLS });

    const png = path.join(OUT, `${ch}.png`);
    fs.writeFileSync(png, Buffer.from(result.png, 'base64'));
    fs.writeFileSync(path.join(OUT, `${ch}.json`), JSON.stringify(result.meta));
    console.log(`${ch}: ${result.meta.frames} fotogrammi, ${(fs.statSync(png).size / 1024).toFixed(0)} KB`);
  }
  await browser.close();

  // ottimizzazione opzionale con Pillow (palette a 256 colori con trasparenza)
  try {
    const py = `
import sys
from PIL import Image
for p in sys.argv[1:]:
    im = Image.open(p).convert('RGBA')
    q = im.quantize(colors=256, method=Image.Quantize.FASTOCTREE, dither=Image.Dither.NONE)
    q.save(p, optimize=True)
`;
    execFileSync('python3', ['-c', py, ...CHARS.map((c) => path.join(OUT, `${c}.png`))], { stdio: 'inherit' });
    for (const ch of CHARS) console.log(`${ch}: ottimizzato, ${(fs.statSync(path.join(OUT, `${ch}.png`)).size / 1024).toFixed(0)} KB`);
  } catch (err) {
    console.log('Pillow non disponibile: PNG lasciati non ottimizzati.');
  }
}

main().catch((err) => { console.error(err); process.exit(1); });
