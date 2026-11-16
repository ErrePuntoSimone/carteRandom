'use strict';
// Disegno di "Spintoni" su canvas: sfondo, isola, piattaforme e lottatori con i guantoni.
window.SpintoniDraw = (() => {
  const { STAGE, CHARS, MOVES, PHYS } = window.SpintoniShared;
  const TAU = Math.PI * 2;
  const SLOT_COLORS = ['#ff5252', '#448aff', '#69f0ae', '#ffd740'];

  function shade(hex, f) {
    const n = parseInt(hex.slice(1), 16);
    let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    const t = f < 0 ? 0 : 255, p = Math.abs(f);
    r = Math.round((t - r) * p + r); g = Math.round((t - g) * p + g); b = Math.round((t - b) * p + b);
    return `rgb(${r},${g},${b})`;
  }
  function rr(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }

  // ---------- scena nel mondo (disegnata una volta su un canvas grande) ----------
  // La mappa si può personalizzare con i PNG di public/spintoni/maps/<mappa>/ (vedi map.json):
  // se mancano o non si caricano, si usa il disegno a codice qui sotto.
  const PAD = 400;
  const SCENE = { w: STAGE.w + PAD * 2, h: STAGE.h + PAD, ox: -PAD, oy: -PAD * 0.5 };

  // sole, nuvole e colline (coordinate del mondo, già traslate di -ox/-oy)
  function paintScenery(g) {
    const pad = PAD;
    // sole
    const sun = g.createRadialGradient(1220, 250, 10, 1220, 250, 190);
    sun.addColorStop(0, 'rgba(255, 236, 179, .95)'); sun.addColorStop(0.35, 'rgba(255, 183, 77, .6)'); sun.addColorStop(1, 'rgba(255, 183, 77, 0)');
    g.fillStyle = sun; g.beginPath(); g.arc(1220, 250, 190, 0, TAU); g.fill();
    // nuvole
    g.fillStyle = 'rgba(255,255,255,.16)';
    for (const [x, y, s] of [[180, 160, 1], [520, 90, 0.7], [1000, 140, 0.9], [1450, 80, 0.6], [-150, 300, 0.8], [1700, 260, 1]]) {
      for (const [dx, dy, r] of [[0, 0, 40], [40, -14, 34], [80, 0, 38], [40, 10, 36]]) { g.beginPath(); g.arc(x + dx * s, y + dy * s, r * s, 0, TAU); g.fill(); }
    }
    // colline lontane
    const hills = (y, amp, col, seed) => {
      g.fillStyle = col; g.beginPath(); g.moveTo(-pad, STAGE.h + pad);
      for (let x = -pad; x <= STAGE.w + pad; x += 40) g.lineTo(x, y - Math.abs(Math.sin(x / 260 + seed)) * amp - Math.sin(x / 90 + seed) * amp * 0.15);
      g.lineTo(STAGE.w + pad, STAGE.h + pad); g.closePath(); g.fill();
    };
    hills(720, 130, 'rgba(70, 48, 105, .55)', 1);
    hills(800, 90, 'rgba(48, 36, 82, .7)', 3);
  }

  function paintIsland(g) {
    const m = STAGE.main;
    g.fillStyle = '#5d4037';
    g.beginPath();
    g.moveTo(m.x, m.y + 10);
    g.lineTo(m.x + m.w, m.y + 10);
    g.lineTo(m.x + m.w - 40, m.y + m.h + 40);
    g.lineTo(m.x + m.w * 0.72, m.y + m.h + 120);
    g.lineTo(m.x + m.w * 0.52, m.y + m.h + 190);
    g.lineTo(m.x + m.w * 0.3, m.y + m.h + 110);
    g.lineTo(m.x + 40, m.y + m.h + 40);
    g.closePath(); g.fill();
    const rock = g.createLinearGradient(0, m.y, 0, m.y + m.h + 190);
    rock.addColorStop(0, 'rgba(255,255,255,.12)'); rock.addColorStop(1, 'rgba(0,0,0,.35)');
    g.fillStyle = rock; g.fill();
    g.fillStyle = 'rgba(0,0,0,.18)';
    for (const [x, y, r] of [[m.x + 150, m.y + 60, 16], [m.x + 420, m.y + 100, 22], [m.x + 690, m.y + 70, 14], [m.x + 520, m.y + 180, 18], [m.x + 860, m.y + 50, 12]]) { g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill(); }
    // erba
    g.fillStyle = '#43a047'; rr(g, m.x - 8, m.y - 4, m.w + 16, 26, 12); g.fill();
    g.fillStyle = '#66bb6a'; rr(g, m.x - 8, m.y - 6, m.w + 16, 12, 6); g.fill();
    g.fillStyle = '#2e7d32';
    for (let x = m.x; x < m.x + m.w; x += 22) { g.beginPath(); g.moveTo(x, m.y + 20); g.lineTo(x + 8, m.y + 34); g.lineTo(x + 16, m.y + 20); g.fill(); }
  }

  function paintPlatform(g, p) {
    g.fillStyle = 'rgba(0,0,0,.25)'; rr(g, p.x + 6, p.y + 10, p.w, 22, 10); g.fill();
    g.fillStyle = '#8d6e63'; rr(g, p.x, p.y + 2, p.w, 20, 9); g.fill();
    g.fillStyle = '#a1887f'; rr(g, p.x, p.y, p.w, 10, 6); g.fill();
    g.strokeStyle = 'rgba(62, 39, 35, .6)'; g.lineWidth = 2;
    for (let x = p.x + 40; x < p.x + p.w - 10; x += 42) { g.beginPath(); g.moveTo(x, p.y + 3); g.lineTo(x, p.y + 20); g.stroke(); }
    g.fillStyle = '#7cb342'; rr(g, p.x - 4, p.y - 4, p.w + 8, 8, 4); g.fill();
  }

  // mappa a PNG: map.json + immagini (facoltativi)
  const MAP_DIR = '/spintoni/maps/default/';
  const map = { meta: null, img: {}, ready: false };
  function loadMap() {
    fetch(MAP_DIR + 'map.json').then((r) => (r.ok ? r.json() : Promise.reject(new Error('map')))).then((meta) => {
      const names = new Set([meta.sky, meta.scenery && meta.scenery.img, meta.island && meta.island.img, meta.platform && meta.platform.img].filter(Boolean));
      return Promise.all([...names].map((n) => new Promise((resolve) => {
        const im = new Image();
        im.onload = () => { map.img[n] = im; resolve(); };
        im.onerror = () => resolve();
        im.src = MAP_DIR + n;
      }))).then(() => { map.meta = meta; map.ready = true; });
    }).catch(() => { /* senza PNG si usa il disegno a codice */ });
  }
  loadMap();
  const mapImg = (n) => (map.ready && n && map.img[n]) || null;

  function sky(ctx, W, H) {
    const im = map.meta && mapImg(map.meta.sky);
    if (im) { ctx.drawImage(im, 0, 0, W, H); return; }
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#22315c'); g.addColorStop(0.55, '#6a4c8c'); g.addColorStop(1, '#f39c6b');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }

  function makeScene() {
    const c = document.createElement('canvas');
    c.width = SCENE.w; c.height = SCENE.h;
    const g = c.getContext('2d');
    g.translate(PAD, PAD * 0.5);
    const M = map.ready && map.meta;
    const place = (spec, fallback) => {
      const im = spec && mapImg(spec.img);
      if (im) g.drawImage(im, spec.x, spec.y, spec.w, spec.h); else fallback();
      return !!im;
    };
    let usedPng = false;
    usedPng = place(M && M.scenery, () => paintScenery(g)) || usedPng;
    usedPng = place(M && M.island, () => paintIsland(g)) || usedPng;
    const pl = M && M.platform && mapImg(M.platform.img);
    for (const p of STAGE.plats) {
      if (pl) g.drawImage(pl, p.x + (M.platform.dx || 0), p.y + (M.platform.dy || 0), p.w + (M.platform.dw || 0), M.platform.h || pl.height);
      else paintPlatform(g, p);
    }
    return { canvas: c, ox: SCENE.ox, oy: SCENE.oy, png: usedPng || !!pl, mapReady: map.ready };
  }

  // ---------- lottatore ----------
  function glove(ctx, x, y, r, col, back) {
    ctx.fillStyle = back ? shade(col, -0.35) : col;
    ctx.strokeStyle = shade(col, -0.6); ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill(); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,.35)';
    ctx.beginPath(); ctx.arc(x - r * 0.3, y - r * 0.35, r * 0.35, 0, TAU); ctx.fill();
  }

  /**
   * Disegna un lottatore con i piedi in (x, y).
   * st: { c, fc, g, vx, vy, a: {ty, dir, t, air}, hs, dg, inv }, slot: colore del giocatore
   */
  function fighter(ctx, x, y, st, slot, now, opts = {}) {
    chargeAura(ctx, x, y, st, now);
    const spr = window.SpintoniSprites && window.SpintoniSprites.get(st.c);
    if (spr) { spriteFighter(ctx, x, y, st, now, spr, opts.color); nameTag(ctx, x, y, slot, opts); }
    else vectorFighter(ctx, x, y, st, slot, now, opts);
    chargeBar(ctx, x, y, st, now);
  }

  // Carica del pugno forte: 0..1, oppure 0 se non sta caricando.
  function chargeOf(st) {
    const a = st.a;
    if (!a || a.ty !== 'heavy' || a.rel || !(a.c > 0.02)) return 0;
    return Math.min(1, a.c / PHYS.chargeMax);
  }

  // Alone che cresce e pulsa attorno a chi sta caricando, con scintille che convergono sul busto.
  function chargeAura(ctx, x, y, st, now) {
    const p = chargeOf(st);
    if (!p) return;
    const cy = y - 44, full = p >= 0.999;
    const r = 34 + 34 * p + Math.sin(now / 70) * 3 * p;
    const g = ctx.createRadialGradient(x, cy, 6, x, cy, r);
    g.addColorStop(0, `rgba(255, 245, 157, ${0.2 + 0.4 * p})`);
    g.addColorStop(0.6, `rgba(255, 179, 0, ${0.12 + 0.28 * p})`);
    g.addColorStop(1, 'rgba(255, 112, 67, 0)');
    ctx.save();
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(x, cy, r, 0, TAU); ctx.fill();
    ctx.strokeStyle = `rgba(255, 255, 255, ${full ? 0.5 + 0.4 * Math.sin(now / 45) : 0.25 + 0.3 * p})`;
    ctx.lineWidth = 2 + 3 * p;
    ctx.beginPath(); ctx.arc(x, cy, r * 0.82, 0, TAU); ctx.stroke();
    // scintille verso il centro
    for (let i = 0; i < 6; i++) {
      const t = ((now / (full ? 260 : 420)) + i / 6) % 1;
      const a = i * 1.047 + now / 900;
      const rr = (r + 10) * (1 - t);
      ctx.fillStyle = `rgba(255, 241, 118, ${0.9 * (1 - t)})`;
      ctx.beginPath(); ctx.arc(x + Math.cos(a) * rr, cy + Math.sin(a) * rr, 2.5 + 2 * p, 0, TAU); ctx.fill();
    }
    ctx.restore();
  }

  // Barra della carica sopra il nome.
  function chargeBar(ctx, x, y, st, now) {
    const p = chargeOf(st);
    if (!p) return;
    const w = 64, h = 8, bx = x - w / 2, by = y - 146;
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,.65)'; rr(ctx, bx - 2, by - 2, w + 4, h + 4, 5); ctx.fill();
    const g = ctx.createLinearGradient(bx, 0, bx + w, 0);
    g.addColorStop(0, '#ffee58'); g.addColorStop(0.6, '#ffa726'); g.addColorStop(1, '#ef5350');
    ctx.fillStyle = g; rr(ctx, bx, by, Math.max(4, w * p), h, 4); ctx.fill();
    if (p >= 0.999) {
      ctx.strokeStyle = `rgba(255,255,255,${0.6 + 0.4 * Math.sin(now / 45)})`; ctx.lineWidth = 2;
      rr(ctx, bx - 2, by - 2, w + 4, h + 4, 5); ctx.stroke();
    }
    ctx.restore();
  }

  // Disegno con le immagini PNG (sprite sheet).
  function spriteFighter(ctx, x, y, st, now, spr, color) {
    const f = st.fc || 1;
    const { name, frame, tumble } = window.SpintoniSprites.pick(st, now, spr);
    ctx.save();
    if (st.inv && !tumble) ctx.globalAlpha = 0.55 + 0.35 * Math.sin(now / 60);
    if (st.dg > 0) ctx.globalAlpha = 0.5;
    if (st.g && !tumble) { ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.beginPath(); ctx.ellipse(x, y + 2, 30, 7, 0, 0, TAU); ctx.fill(); }
    if (tumble) {
      // in volo il personaggio ruota attorno al busto
      ctx.translate(x, y - 44);
      ctx.rotate((now / 1000) * 14 * f);
      window.SpintoniSprites.drawFrame(ctx, spr, name, frame, 0, 44, f);
      window.SpintoniSprites.drawTint(ctx, spr, name, frame, 0, 44, f, color);
    } else {
      window.SpintoniSprites.drawFrame(ctx, spr, name, frame, x, y, f);
      window.SpintoniSprites.drawTint(ctx, spr, name, frame, x, y, f, color);
    }
    ctx.restore();
  }

  // Segnalino e nome sopra la testa.
  function nameTag(ctx, x, y, slot, opts) {
    if (opts.noTag) return;
    const c = SLOT_COLORS[slot % 4];
    ctx.save();
    ctx.fillStyle = c; ctx.strokeStyle = 'rgba(0,0,0,.6)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(x - 8, y - 118); ctx.lineTo(x + 8, y - 118); ctx.lineTo(x, y - 106); ctx.closePath(); ctx.fill(); ctx.stroke();
    if (opts.name) {
      ctx.font = '800 15px system-ui, sans-serif'; ctx.textAlign = 'center';
      ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(0,0,0,.75)'; ctx.strokeText(opts.name, x, y - 124);
      ctx.fillStyle = c; ctx.fillText(opts.name, x, y - 124);
    }
    ctx.restore();
  }

  // Disegno a codice: serve da riserva se le immagini non sono disponibili.
  function vectorFighter(ctx, x, y, st, slot, now, opts = {}) {
    const ch = CHARS[st.c] || CHARS.gilda;
    const col = ch.color;
    const f = st.fc || 1;
    const big = st.c === 'tonno';
    const glovesCol = '#e53935';
    const tumble = st.hs > 0.05;
    ctx.save();
    ctx.translate(x, y);
    if (st.inv && !tumble) ctx.globalAlpha = 0.55 + 0.35 * Math.sin(now / 60);
    if (st.dg > 0) ctx.globalAlpha = 0.45;

    // ombra a terra
    if (st.g) { ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.beginPath(); ctx.ellipse(0, 2, 30, 7, 0, 0, TAU); ctx.fill(); }

    if (tumble) {
      ctx.translate(0, -44);
      ctx.rotate((now / 1000) * 14 * f);
      ctx.translate(0, 44);
    }
    ctx.scale(f, 1);

    // posa
    const run = st.g && Math.abs(st.vx) > 40 && !st.a;
    const phase = now / 90;
    const bob = st.g && !st.a ? Math.sin(now / 260) * 1.5 : 0;
    let legA = 0, legB = 0;
    if (run) { legA = Math.sin(phase) * 0.7; legB = -legA; }
    else if (!st.g) { legA = -0.5; legB = 0.4; }
    const hipY = -30, shY = -62 + bob, headY = -80 + bob;
    const torsoW = big ? 44 : 34;

    // gambe
    ctx.strokeStyle = shade(col, -0.55); ctx.lineWidth = big ? 11 : 9; ctx.lineCap = 'round';
    for (const [ang, dx] of [[legB, -6], [legA, 6]]) {
      ctx.beginPath(); ctx.moveTo(dx, hipY);
      ctx.lineTo(dx + Math.sin(ang) * 26, hipY + Math.cos(ang) * 28);
      ctx.stroke();
      ctx.fillStyle = '#263238';
      ctx.beginPath(); ctx.ellipse(dx + Math.sin(ang) * 26 + 4, hipY + Math.cos(ang) * 28, 8, 5, 0, 0, TAU); ctx.fill();
    }

    // braccia e guantoni: dipendono dall'attacco
    let front = { x: 18, y: shY + 6 }, back = { x: -6, y: shY + 2 };
    let lines = 0;
    if (st.a) {
      const m = MOVES[st.a.ty];
      const t = st.a.t;
      const heavy = st.a.ty === 'heavy';
      let k; // 0 = caricato, 1 = disteso
      if (t < m.startup) k = -(t / m.startup);
      else if (t < m.startup + m.active) { k = 1; lines = heavy ? 2 : 1; }
      else k = 1 - (t - m.startup - m.active) / m.recovery;
      const reach = heavy ? 64 : 52;
      const pull = heavy ? 22 : 8;
      const ext = k >= 0 ? k * reach : k * pull;
      if (st.a.dir === 'up') { front = { x: 6 + (k < 0 ? 0 : 4), y: shY - 8 - Math.max(0, ext) * 1.0 + (k < 0 ? -k * 10 : 0) }; }
      else if (st.a.dir === 'down') {
        front = st.a.air ? { x: 4, y: -10 + Math.max(0, ext) * 0.5 } : { x: 14 + Math.max(0, ext), y: -16 };
      } else front = { x: 16 + ext, y: shY + 6 };
      if (heavy && k < 0) back = { x: -18, y: shY + 6 };
    } else if (!st.g) {
      front = { x: 20, y: shY - 4 }; back = { x: -14, y: shY - 6 };
    } else if (run) {
      front = { x: 16 + Math.sin(phase) * 6, y: shY + 8 }; back = { x: -4 - Math.sin(phase) * 6, y: shY + 8 };
    }
    if (tumble) { front = { x: 26, y: shY - 14 }; back = { x: -24, y: shY - 10 }; }

    // braccio dietro
    ctx.strokeStyle = shade(col, -0.2); ctx.lineWidth = 8;
    ctx.beginPath(); ctx.moveTo(-4, shY + 4); ctx.lineTo(back.x, back.y); ctx.stroke();
    glove(ctx, back.x, back.y, big ? 12 : 11, glovesCol, true);

    // busto
    const tg = ctx.createLinearGradient(-torsoW / 2, 0, torsoW / 2, 0);
    tg.addColorStop(0, shade(col, -0.25)); tg.addColorStop(0.5, shade(col, 0.15)); tg.addColorStop(1, shade(col, -0.1));
    ctx.fillStyle = tg; ctx.strokeStyle = shade(col, -0.6); ctx.lineWidth = 2;
    rr(ctx, -torsoW / 2, shY - 4, torsoW, hipY - shY + 10, big ? 16 : 12); ctx.fill(); ctx.stroke();
    // cintura
    ctx.fillStyle = '#212121'; ctx.fillRect(-torsoW / 2 + 1, hipY - 2, torsoW - 2, 6);
    if (st.c === 'gilda') { ctx.fillStyle = '#ffd740'; ctx.beginPath(); star(ctx, 2, shY + 14, 7); ctx.fill(); }
    if (st.c === 'tonno') { ctx.fillStyle = 'rgba(255,255,255,.25)'; ctx.beginPath(); ctx.ellipse(4, shY + 18, 13, 10, 0, 0, TAU); ctx.fill(); }

    // testa
    const hr = big ? 16 : 15;
    ctx.fillStyle = '#f2c9a0'; ctx.strokeStyle = '#8d5a3b'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(2, headY, hr, 0, TAU); ctx.fill(); ctx.stroke();
    if (st.c === 'pepe') {
      // bandana con i lacci al vento
      ctx.fillStyle = '#d32f2f';
      ctx.fillRect(-hr + 2, headY - 9, hr * 2, 7);
      ctx.beginPath(); ctx.moveTo(-hr + 3, headY - 8); ctx.lineTo(-hr - 14, headY - 14 + Math.sin(now / 80) * 3); ctx.lineTo(-hr - 10, headY - 2); ctx.closePath(); ctx.fill();
    } else if (st.c === 'gilda') {
      // capelli e coda
      ctx.fillStyle = '#4a148c';
      ctx.beginPath(); ctx.arc(2, headY - 3, hr, Math.PI * 1.05, Math.PI * 1.95); ctx.fill();
      ctx.beginPath(); ctx.ellipse(-hr - 4, headY - 2 + Math.sin(now / 120) * 2, 7, 12, 0.6, 0, TAU); ctx.fill();
    } else {
      // pelato con baffoni
      ctx.fillStyle = '#5d4037';
      ctx.beginPath(); ctx.ellipse(10, headY + 7, 9, 3.5, 0.15, 0, TAU); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,.35)'; ctx.beginPath(); ctx.arc(-3, headY - 8, 4, 0, TAU); ctx.fill();
    }
    // occhio (guarda avanti) e bocca
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(9, headY - 2, 4.5, 0, TAU); ctx.fill();
    ctx.fillStyle = '#111'; ctx.beginPath(); ctx.arc(10.5, headY - 2, 2.2, 0, TAU); ctx.fill();
    ctx.strokeStyle = '#7a3b22'; ctx.lineWidth = 2;
    ctx.beginPath();
    if (tumble) ctx.arc(9, headY + 8, 3.5, 0, TAU); else ctx.arc(8, headY + 4, 4, 0.2, Math.PI - 0.6);
    ctx.stroke();

    // braccio davanti
    ctx.strokeStyle = shade(col, 0.05); ctx.lineWidth = 9;
    ctx.beginPath(); ctx.moveTo(6, shY + 4); ctx.lineTo(front.x, front.y); ctx.stroke();
    glove(ctx, front.x, front.y, big ? 14 : 12.5, glovesCol, false);
    if (lines) {
      ctx.strokeStyle = 'rgba(255,255,255,.8)'; ctx.lineWidth = 3;
      for (let i = 0; i < 2 + lines; i++) {
        const oy = (i - 1) * 8;
        ctx.beginPath(); ctx.moveTo(front.x - 18 - i * 6, front.y + oy); ctx.lineTo(front.x - 40 - i * 10, front.y + oy); ctx.stroke();
      }
    }
    ctx.restore();

    nameTag(ctx, x, y, slot, opts);
  }

  function star(ctx, x, y, r) {
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / 5, rr2 = i % 2 ? r * 0.45 : r;
      const px = x + Math.cos(a) * rr2, py = y + Math.sin(a) * rr2;
      if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py);
    }
    ctx.closePath();
  }

  const waiting = [];
  function portrait(canvas, char, color = null) {
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth || 70, h = canvas.clientHeight || 84;
    canvas.width = w * dpr; canvas.height = h * dpr;
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, w, h);
    const s = h / 110;
    ctx.translate(w / 2 - 4 * s, h - 6 * s);
    ctx.scale(s, s);
    const spr = window.SpintoniSprites && window.SpintoniSprites.get(char);
    // si ridisegna quando arrivano le immagini (e la maschera, se serve un colore)
    if ((!spr || (color && !spr.mask)) && window.SpintoniSprites && !waiting.some((q) => q.canvas === canvas)) waiting.push({ canvas, char, color });
    fighter(ctx, 0, 0, { c: char, fc: 1, g: false, vx: 0, vy: 0, x: 0, a: null, hs: 0, dg: 0 }, 0, 0, { noTag: true, color });
  }
  // appena le immagini sono caricate si ridisegnano i ritratti già mostrati
  if (window.SpintoniSprites) {
    window.SpintoniSprites.onLoad((id) => {
      for (let i = waiting.length - 1; i >= 0; i--) {
        if (waiting[i].char === id) { const q = waiting.splice(i, 1)[0]; portrait(q.canvas, id, q.color); }
      }
    });
  }

  // colore della percentuale: bianco → giallo → rosso → rosso scuro
  function dmgColor(d) {
    if (d < 40) return '#ffffff';
    if (d < 80) return '#ffd54f';
    if (d < 120) return '#ff8a65';
    return '#e53935';
  }

  return { sky, makeScene, mapReady: () => map.ready, paint: { scenery: paintScenery, island: paintIsland, platform: paintPlatform }, SCENE, fighter, portrait, dmgColor, SLOT_COLORS };
})();
