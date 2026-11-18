'use strict';
// Disegno di "Spintoni" su canvas: sfondo, isola, piattaforme e lottatori con i guantoni.
window.SpintoniDraw = (() => {
  const { STAGE, CHARS, PHYS, moveOf } = window.SpintoniShared;
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
    moveAura(ctx, x, y, st, now);
    specialFx(ctx, x, y, st, now, 'back');
    const spr = window.SpintoniSprites && window.SpintoniSprites.get(st.c);
    if (spr) { spriteFighter(ctx, x, y, st, now, spr, opts.color, opts.flash); nameTag(ctx, x, y, slot, opts); }
    else vectorFighter(ctx, x, y, st, slot, now, opts);
    swingTrail(ctx, x, y, st);
    specialFx(ctx, x, y, st, now, 'front');
    chargeBar(ctx, x, y, st, now);
  }

  // ---------- effetti dei colpi (solo grafica, calcolati dallo stato: nessun dato in più dalla rete) ----------
  const fxOf = (c) => (CHARS[c] || CHARS.gilda).fx;
  function rgba(hex, a) {
    const n = parseInt(hex.slice(1), 16);
    return `rgba(${n >> 16}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
  }
  // angolo nel mondo da un angolo "locale" (0 = avanti, negativo = in alto) e dalla direzione in cui si guarda
  const worldAng = (a, face) => (face > 0 ? a : Math.PI - a);
  const deg = Math.PI / 180;
  // arco descritto dal colpo per ogni direzione: [inizio, fine] in gradi locali
  const SWEEP = { side: [-70, 25], up: [10, -190], down: [-15, 55], downair: [20, 160] };
  const TRAIL_LINGER = 0.07; // la scia resta ancora un attimo dopo il colpo

  // Scia a mezzaluna nel colore del personaggio mentre il colpo è attivo.
  function swingTrail(ctx, x, y, st) {
    const a = st.a;
    if (!a) return;
    const m = moveOf(st.c, a.ty);
    const fx = fxOf(st.c);
    if (a.ty === 'special' && fx.special) return; // le speciali hanno un effetto proprio
    const b = m.boxes && (m.boxes[a.dir] || m.boxes.side);
    if (!b || !(m.active > 0)) return;
    const p = (a.t - m.startup) / (m.active + TRAIL_LINGER);
    if (p < 0 || p > 1) return;
    const key = a.dir === 'down' && a.air ? 'downair' : a.dir;
    const [s0, s1] = SWEEP[key] || SWEEP.side;
    const reach = Math.max(50, Math.hypot(b.x + b.w, b.y + b.h / 2 + 50) * 0.85);
    const heavy = a.ty !== 'light';
    const face = st.fc || 1;
    const cx = x, cy = y - 50;
    const end = s0 + (s1 - s0) * Math.min(1, p * 1.8);
    const fade = 1 - p;
    const arc = (r, w, style) => {
      ctx.strokeStyle = style; ctx.lineWidth = w;
      ctx.beginPath();
      ctx.arc(cx, cy, r, worldAng(s0 * deg, face), worldAng(end * deg, face), (face > 0) === (s1 < s0));
      ctx.stroke();
    };
    ctx.save();
    ctx.lineCap = 'round';
    arc(reach * 0.88, (heavy ? 26 : 16) * (0.6 + 0.4 * fade), rgba(fx.color, 0.35 * fade));
    arc(reach, (heavy ? 7 : 4), rgba(fx.glow, 0.9 * fade));
    ctx.restore();
  }

  // Effetto proprio della speciale di ogni personaggio (fx.special nel file del personaggio).
  // layer 'back' = dietro al lottatore, 'front' = davanti.
  function specialFx(ctx, x, y, st, now, layer) {
    const a = st.a;
    if (!a || a.ty !== 'special') return;
    const m = moveOf(st.c, 'special');
    const fx = fxOf(st.c);
    const face = st.fc || 1;
    const t = a.t, on = t >= m.startup && t < m.startup + m.active + TRAIL_LINGER;
    const cy = y - 50;
    ctx.save();
    ctx.lineCap = 'round';
    if (fx.special === 'vortex' && layer === 'front' && on) {
      // anelli che girano attorno al corpo
      for (let i = 0; i < 3; i++) {
        const rot = now / 70 + i * 2.1;
        ctx.strokeStyle = rgba(i % 2 ? fx.glow : fx.color, 0.75);
        ctx.lineWidth = 5 - i;
        ctx.beginPath();
        ctx.ellipse(x, cy - 10 + i * 18, 62 - i * 8, 20, 0, rot, rot + 3.6);
        ctx.stroke();
      }
    } else if (fx.special === 'thrust' && layer === 'front' && on) {
      // lama tesa: una lunga striscia luminosa e linee di velocità dietro
      const b = m.boxes.side;
      const x0 = x + face * b.x, x1 = x + face * (b.x + b.w);
      const yy = y + b.y + b.h / 2;
      const g = ctx.createLinearGradient(x0, 0, x1, 0);
      g.addColorStop(0, rgba(fx.glow, 0)); g.addColorStop(1, rgba(fx.color, 0.95));
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.moveTo(x0, yy - 10); ctx.lineTo(x1, yy - 2); ctx.lineTo(x1 + face * 18, yy); ctx.lineTo(x1, yy + 2); ctx.lineTo(x0, yy + 10); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = rgba(fx.glow, 0.6); ctx.lineWidth = 3;
      for (let i = 0; i < 4; i++) {
        const ly = cy - 30 + i * 20, lx = x - face * (40 + ((now / 4 + i * 37) % 60));
        ctx.beginPath(); ctx.moveTo(lx, ly); ctx.lineTo(lx - face * 50, ly); ctx.stroke();
      }
    } else if (fx.special === 'charge' && layer === 'back' && t >= m.startup && t < m.startup + m.active) {
      // carica: cuneo d'aria davanti e scie dietro
      ctx.fillStyle = rgba(fx.color, 0.28);
      ctx.beginPath(); ctx.moveTo(x + face * 20, cy - 45); ctx.lineTo(x + face * 95, cy + 5); ctx.lineTo(x + face * 20, cy + 50); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = rgba(fx.glow, 0.7); ctx.lineWidth = 4;
      for (let i = 0; i < 5; i++) {
        const ly = cy - 36 + i * 18, lx = x - face * (30 + ((now / 3 + i * 41) % 70));
        ctx.beginPath(); ctx.moveTo(lx, ly); ctx.lineTo(lx - face * 60, ly); ctx.stroke();
      }
    } else if (fx.special === 'guard' && layer === 'front') {
      // guardia: stelline che girano sullo scudo della parata (lo scudo azzurro lo disegna moveAura)
      const w = m.counter;
      if (w && t >= w.from && t < w.to) {
        ctx.fillStyle = rgba(fx.glow, 0.9);
        for (let i = 0; i < 5; i++) {
          const ang = now / 160 + (i * TAU) / 5;
          ctx.beginPath(); star(ctx, x + Math.cos(ang) * 60, cy + 6 + Math.sin(ang) * 60, 6); ctx.fill();
        }
      }
    }
    ctx.restore();
  }

  // Forma di una particella (shape del personaggio): punto, scintilla, stellina, goccia o fendente.
  function particle(ctx, p, k) {
    const r = p.size * (1 - k * 0.5);
    ctx.fillStyle = p.color; ctx.strokeStyle = p.color;
    if (p.shape === 'spark' || p.shape === 'slash') {
      const len = p.shape === 'slash' ? 5 : 3, sp = Math.hypot(p.vx, p.vy) || 1;
      ctx.lineWidth = p.shape === 'slash' ? r * 0.7 : r * 0.9; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - (p.vx / sp) * r * len, p.y - (p.vy / sp) * r * len); ctx.stroke();
    } else if (p.shape === 'star') {
      ctx.beginPath(); star(ctx, p.x, p.y, r * 1.3); ctx.fill();
    } else if (p.shape === 'drop') {
      ctx.beginPath(); ctx.ellipse(p.x, p.y, r * 0.8, r * 1.2, Math.atan2(p.vy, p.vx) + Math.PI / 2, 0, TAU); ctx.fill();
    } else {
      ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, TAU); ctx.fill();
    }
  }

  // Lampo d'impatto: stella a punte che si apre e svanisce.
  // Proiettile (kind = '<personaggio>:<abilità>'): palla luminosa nei colori fx del personaggio con la scia dietro.
  // Il basico è una folata piccola e schiacciata, il resto una palla grande.
  function projectile(ctx, kind, x, y, face, now) {
    const [c, slot] = String(kind).split(':');
    const fx = fxOf(c);
    const small = slot === 'light';
    const r = (small ? 13 : 28) * (1 + 0.08 * Math.sin(now / 50));
    ctx.save();
    for (let i = 3; i >= 1; i--) {
      ctx.globalAlpha = 0.16 * (4 - i);
      ctx.fillStyle = fx.color;
      ctx.beginPath(); ctx.ellipse(x - face * r * 0.75 * i, y, r * (1 - i * 0.2) * (small ? 1.5 : 1), r * (1 - i * 0.2), 0, 0, TAU); ctx.fill();
    }
    ctx.globalAlpha = 1;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r * 1.35);
    g.addColorStop(0, '#ffffff'); g.addColorStop(0.35, fx.glow); g.addColorStop(0.7, fx.color); g.addColorStop(1, rgba(fx.color, 0));
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.ellipse(x, y, r * 1.35 * (small ? 1.5 : 1), r * 1.35, 0, 0, TAU); ctx.fill();
    ctx.restore();
  }

  // Stato attivo sotto il lottatore: 'b' buff = alone del colore del personaggio, 'd' debuff = nuvola grigia.
  function statusAura(ctx, x, y, bf, now, char) {
    if (!bf) return;
    ctx.save();
    if (bf.includes('b')) {
      const fx = fxOf(char);
      const k = 0.5 + 0.5 * Math.sin(now / 120);
      const g = ctx.createRadialGradient(x, y - 44, 10, x, y - 44, 64 + 8 * k);
      g.addColorStop(0, rgba(fx.glow, 0)); g.addColorStop(0.6, rgba(fx.glow, 0.25 + 0.2 * k)); g.addColorStop(1, rgba(fx.color, 0));
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.ellipse(x, y - 44, 56 + 8 * k, 70 + 8 * k, 0, 0, TAU); ctx.fill();
    }
    if (bf.includes('d')) {
      ctx.fillStyle = 'rgba(150, 150, 150, .4)';
      for (let i = 0; i < 7; i++) {
        const a = now / 700 + (i * TAU) / 7;
        ctx.beginPath(); ctx.arc(x + Math.cos(a) * 30, y - 20 - (i % 3) * 22 + Math.sin(a * 2) * 5, 14 + 4 * Math.sin(now / 200 + i), 0, TAU); ctx.fill();
      }
    }
    ctx.restore();
  }
  function impact(ctx, x, y, r, k, color) {
    const n = 8, rr0 = r * (0.6 + 0.6 * k);
    ctx.save();
    ctx.globalAlpha = 1 - k;
    ctx.fillStyle = color;
    ctx.beginPath();
    for (let i = 0; i < n * 2; i++) {
      const a = (i * Math.PI) / n + 0.3, rad = i % 2 ? rr0 * 0.35 : rr0;
      ctx.lineTo(x + Math.cos(a) * rad, y + Math.sin(a) * rad);
    }
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(x, y, rr0 * 0.25, 0, TAU); ctx.fill();
    ctx.restore();
  }

  // Finestre speciali della mossa in corso: parata (scudo azzurro) e corazza (alone arancio).
  function moveAura(ctx, x, y, st, now) {
    if (!st.a) return;
    const m = moveOf(st.c, st.a.ty);
    const inW = (w) => w && st.a.t >= w.from && st.a.t < w.to;
    if (inW(m.counter)) {
      const pulse = 0.5 + 0.5 * Math.sin(now / 60);
      ctx.save();
      ctx.strokeStyle = `rgba(128, 222, 234, ${0.55 + 0.35 * pulse})`;
      ctx.lineWidth = 5;
      ctx.beginPath(); ctx.arc(x, y - PHYS.h / 2, 58 + 4 * pulse, 0, TAU); ctx.stroke();
      ctx.fillStyle = 'rgba(128, 222, 234, .12)'; ctx.fill();
      ctx.restore();
    }
    if (inW(m.armor)) {
      ctx.save();
      const gr = ctx.createRadialGradient(x, y - PHYS.h / 2, 10, x, y - PHYS.h / 2, 80);
      gr.addColorStop(0, 'rgba(255, 152, 0, .35)'); gr.addColorStop(1, 'rgba(255, 152, 0, 0)');
      ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(x, y - PHYS.h / 2, 80, 0, TAU); ctx.fill();
      ctx.restore();
    }
  }

  // Carica del pugno forte: 0..1, oppure 0 se non sta caricando.
  function chargeOf(st) {
    const a = st.a;
    if (!a || a.rel || !(a.c > 0.02)) return 0;
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
  function spriteFighter(ctx, x, y, st, now, spr, color, flash) {
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
    // appena colpito: il lottatore lampeggia chiaro (si ridisegna sommando la luce)
    if (flash > 0) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.7 * flash;
      if (tumble) window.SpintoniSprites.drawFrame(ctx, spr, name, frame, 0, 44, f);
      else window.SpintoniSprites.drawFrame(ctx, spr, name, frame, x, y, f);
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
      const m = moveOf(st.c, st.a.ty);
      const t = st.a.t;
      const heavy = st.a.ty !== 'light';
      let k; // 0 = caricato, 1 = disteso
      if (t < m.startup) k = -(t / m.startup);
      else if (t < m.startup + m.active) { k = 1; lines = heavy ? 2 : 1; }
      else k = Math.max(0, 1 - (t - m.startup - m.active) / m.recovery);
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
  // zoom > 1 inquadra solo la parte alta (busto e testa), come le icone della griglia di scelta
  function portrait(canvas, char, color = null, zoom = 1) {
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth || 70, h = canvas.clientHeight || 84;
    canvas.width = w * dpr; canvas.height = h * dpr;
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, w, h);
    const s = (h / 110) * zoom;
    ctx.translate(w / 2 - 4 * s, h - 6 * s + (zoom - 1) * h * 0.62);
    ctx.scale(s, s);
    const spr = window.SpintoniSprites && window.SpintoniSprites.get(char);
    // si ridisegna quando arrivano le immagini (e la maschera, se serve un colore)
    if ((!spr || (color && !spr.mask)) && window.SpintoniSprites && !waiting.some((q) => q.canvas === canvas)) waiting.push({ canvas, char, color, zoom });
    fighter(ctx, 0, 0, { c: char, fc: 1, g: false, vx: 0, vy: 0, x: 0, a: null, hs: 0, dg: 0 }, 0, 0, { noTag: true, color });
  }
  // Lottatore grande e animato (fermo che respira) per la vetrina della scelta del personaggio.
  function hero(canvas, char, color, now) {
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return;
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) { canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr); }
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const s = h / 120;
    ctx.translate(w / 2 - 4 * s, h - 4 * s);
    ctx.scale(s, s);
    fighter(ctx, 0, 0, { c: char, fc: 1, g: true, vx: 0, vy: 0, x: 0, a: null, hs: 0, dg: 0 }, 0, now, { noTag: true, color });
  }

  // appena le immagini sono caricate si ridisegnano i ritratti già mostrati
  if (window.SpintoniSprites) {
    window.SpintoniSprites.onLoad((id) => {
      for (let i = waiting.length - 1; i >= 0; i--) {
        if (waiting[i].char === id) { const q = waiting.splice(i, 1)[0]; portrait(q.canvas, id, q.color, q.zoom); }
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

  return { sky, makeScene, mapReady: () => map.ready, paint: { scenery: paintScenery, island: paintIsland, platform: paintPlatform }, SCENE, fighter, portrait, hero, dmgColor, SLOT_COLORS, fxOf, particle, impact, projectile, statusAura };
})();
