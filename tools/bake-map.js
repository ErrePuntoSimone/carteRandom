'use strict';
// Genera i PNG della mappa di "Spintoni" a partire dal disegno a codice (public/spintoni/draw.js).
//
//   node tools/bake-map.js
//
// Richiede Playwright (solo per generare le immagini). Scrive in public/spintoni/maps/default/:
//   sky.png, scenery.png, island.png, platform.png e map.json (dove va disegnata ogni immagine).
// Per personalizzare la mappa basta sostituire i PNG (anche con dimensioni diverse) e, se serve, ritoccare map.json.
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'public', 'spintoni', 'maps', 'default');

async function main() {
  const { chromium } = require('playwright');
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.setContent('<body></body>');
  await page.addScriptTag({ content: fs.readFileSync(path.join(ROOT, 'public', 'spintoni', 'shared.js'), 'utf8') });
  await page.addScriptTag({ content: fs.readFileSync(path.join(ROOT, 'public', 'spintoni', 'draw.js'), 'utf8') });

  const res = await page.evaluate(() => {
    const D = window.SpintoniDraw, { STAGE } = window.SpintoniShared;
    const make = (w, h, fn, tx = 0, ty = 0) => {
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      const g = c.getContext('2d');
      g.translate(-tx, -ty);
      fn(g);
      return c.toDataURL('image/png');
    };
    const m = STAGE.main, p = STAGE.plats[0];
    const S = D.SCENE;
    const rects = {
      scenery: { x: S.ox, y: S.oy, w: S.w, h: S.h },
      island: { x: m.x - 20, y: m.y - 20, w: m.w + 40, h: 310 },
      platform: { x: p.x - 10, y: p.y - 12, w: p.w + 20, h: 50 },
    };
    return {
      rects,
      sky: make(64, 512, (g) => {
        const gr = g.createLinearGradient(0, 0, 0, 512);
        gr.addColorStop(0, '#22315c'); gr.addColorStop(0.55, '#6a4c8c'); gr.addColorStop(1, '#f39c6b');
        g.fillStyle = gr; g.fillRect(0, 0, 64, 512);
      }),
      scenery: make(rects.scenery.w, rects.scenery.h, D.paint.scenery, rects.scenery.x, rects.scenery.y),
      island: make(rects.island.w, rects.island.h, D.paint.island, rects.island.x, rects.island.y),
      platform: make(rects.platform.w, rects.platform.h, (g) => D.paint.platform(g, p), rects.platform.x, rects.platform.y),
    };
  });
  await browser.close();

  for (const n of ['sky', 'scenery', 'island', 'platform']) {
    fs.writeFileSync(path.join(OUT, `${n}.png`), Buffer.from(res[n].split(',')[1], 'base64'));
    console.log(`${n}.png`, Math.round(fs.statSync(path.join(OUT, `${n}.png`)).size / 1024), 'KB');
  }
  const r = res.rects;
  const meta = {
    name: 'Tramonto',
    sky: 'sky.png',
    scenery: { img: 'scenery.png', ...r.scenery },
    island: { img: 'island.png', ...r.island },
    platform: { img: 'platform.png', dx: r.platform.x - STAGE_P.x, dy: r.platform.y - STAGE_P.y, dw: r.platform.w - STAGE_P.w, h: r.platform.h },
  };
  fs.writeFileSync(path.join(OUT, 'map.json'), JSON.stringify(meta, null, 2) + '\n');
  console.log('map.json scritto');
}
const STAGE_P = require('../public/spintoni/shared').STAGE.plats[0];
main().catch((e) => { console.error(e); process.exit(1); });
