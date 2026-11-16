'use strict';
// Sprite sheet dei lottatori di "Spintoni": carica public/spintoni/sprites/<personaggio>.png e .json
// e sceglie il fotogramma giusto in base allo stato del lottatore.
// Per cambiare grafica basta sostituire i PNG mantenendo lo stesso schema (vedi il file .json).
window.SpintoniSprites = (() => {
  const { CHARS, moveOf } = window.SpintoniShared;
  const store = {};
  const waiters = [];
  const RUN_STRIDE = 36; // unità percorse per ogni fotogramma di corsa (i piedi non "pattinano")

  function load(id) {
    const meta = fetch(`/spintoni/sprites/${id}.json`).then((r) => (r.ok ? r.json() : Promise.reject(new Error('json'))));
    const img = new Image();
    const loaded = new Promise((resolve) => { img.onload = () => resolve(true); img.onerror = () => resolve(false); });
    img.src = `/spintoni/sprites/${id}.png`;
    Promise.all([meta, loaded]).then(([m, ok]) => {
      if (!ok) return;
      store[id] = { meta: m, img, mask: null };
      for (const f of waiters) f(id);
      // maschera dei dettagli colorabili (facoltativa)
      if (m.mask) {
        const mk = new Image();
        mk.onload = () => { store[id].mask = mk; for (const f of waiters) f(id); };
        mk.src = `/spintoni/sprites/${m.mask}`;
      }
    }).catch(() => { /* senza sprite si usa il disegno a codice */ });
  }
  for (const id of Object.keys(CHARS)) load(id);

  // Quale animazione e quale fotogramma mostrare.
  function pick(st, now, spr) {
    const A = spr.meta.anims;
    const face = st.fc || 1;
    if (st.hs > 0.05) return { name: 'hurt', frame: 0, tumble: true };
    if (st.dg > 0) {
      const a = A.dodge;
      const prog = 1 - st.dg / 0.28;
      return { name: 'dodge', frame: Math.max(0, Math.min(a.frames - 1, Math.floor(prog * a.frames))) };
    }
    if (st.a) {
      const m = moveOf(spr.meta.char, st.a.ty);
      // le mosse possono indicare un'animazione dello sprite (es. la speciale usa quella del forte in alto)
      const name = m.anim || `${st.a.ty}_${st.a.dir === 'down' && st.a.air ? 'downair' : st.a.dir}`;
      const a = A[name];
      if (a && a.phases) {
        const [s, ac, r] = a.phases;
        const t = st.a.t;
        let f;
        if (t < m.startup) f = Math.min(s - 1, Math.floor((t / m.startup) * s));
        else if (t < m.startup + m.active) f = s + Math.min(ac - 1, Math.floor(((t - m.startup) / m.active) * ac));
        else f = s + ac + Math.min(r - 1, Math.floor(((t - m.startup - m.active) / m.recovery) * r));
        return { name, frame: f };
      }
      if (a) { // animazione senza fasi: scorre in proporzione alla durata della mossa
        const tot = m.startup + m.active + m.recovery;
        return { name, frame: Math.max(0, Math.min(a.frames - 1, Math.floor((st.a.t / tot) * a.frames))) };
      }
    }
    if (!st.g) return { name: 'air', frame: st.vy < -250 ? 0 : st.vy > 250 ? 2 : 1 };
    if (Math.abs(st.vx) > 40) {
      const n = A.run.frames;
      const f = Math.floor((st.x * face) / RUN_STRIDE);
      return { name: 'run', frame: ((f % n) + n) % n };
    }
    const a = A.idle;
    return { name: 'idle', frame: Math.floor((now / 1000) * (a.fps || 8)) % a.frames };
  }

  // Disegna un fotogramma con i piedi in (x, y), girato verso `face`.
  function drawFrame(ctx, spr, name, frame, x, y, face) {
    const m = spr.meta;
    const a = m.anims[name];
    const idx = a.start + frame;
    const col = idx % m.cols, row = Math.floor(idx / m.cols);
    const k = 1 / m.scale;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(face, 1);
    ctx.drawImage(spr.img, col * m.cell.w, row * m.cell.h, m.cell.w, m.cell.h, -m.anchor.x * k, -m.anchor.y * k, m.cell.w * k, m.cell.h * k);
    ctx.restore();
  }

  // Colora i dettagli: maschera in scala di grigi × colore, applicata sopra il fotogramma.
  const tmp = document.createElement('canvas');
  const tctx = tmp.getContext('2d');
  function drawTint(ctx, spr, name, frame, x, y, face, color) {
    if (!spr.mask || !color) return;
    const m = spr.meta;
    const a = m.anims[name];
    const idx = a.start + frame;
    const sx = (idx % m.cols) * m.cell.w, sy = Math.floor(idx / m.cols) * m.cell.h;
    if (tmp.width !== m.cell.w || tmp.height !== m.cell.h) { tmp.width = m.cell.w; tmp.height = m.cell.h; }
    tctx.globalCompositeOperation = 'source-over';
    tctx.clearRect(0, 0, tmp.width, tmp.height);
    tctx.drawImage(spr.mask, sx, sy, m.cell.w, m.cell.h, 0, 0, m.cell.w, m.cell.h);
    tctx.globalCompositeOperation = 'multiply';
    tctx.fillStyle = color;
    tctx.fillRect(0, 0, tmp.width, tmp.height);
    tctx.globalCompositeOperation = 'destination-in';
    tctx.drawImage(spr.mask, sx, sy, m.cell.w, m.cell.h, 0, 0, m.cell.w, m.cell.h);
    tctx.globalCompositeOperation = 'source-over';
    const k = 1 / m.scale;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(face, 1);
    ctx.drawImage(tmp, -m.anchor.x * k, -m.anchor.y * k, m.cell.w * k, m.cell.h * k);
    ctx.restore();
  }

  return { get: (id) => store[id] || null, onLoad: (f) => waiters.push(f), pick, drawFrame, drawTint };
})();
