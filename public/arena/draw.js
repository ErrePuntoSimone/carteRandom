'use strict';
// Disegno dell'arena e dei lottatori su canvas (grafica originale, solo forme vettoriali).
window.ArenaDraw = (() => {
  const { MAP, CHARS } = window.ArenaShared;
  const TAU = Math.PI * 2;

  const shade = (hex, f) => {
    const n = parseInt(hex.slice(1), 16);
    let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    const t = f < 0 ? 0 : 255, p = Math.abs(f);
    r = Math.round((t - r) * p + r); g = Math.round((t - g) * p + g); b = Math.round((t - b) * p + b);
    return `rgb(${r},${g},${b})`;
  };

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  // ---------- arena (disegnata una volta) ----------
  function makeGround() {
    const c = document.createElement('canvas');
    c.width = MAP.w; c.height = MAP.h;
    const g = c.getContext('2d');
    const T = 100;
    for (let y = 0; y < MAP.h; y += T) {
      for (let x = 0; x < MAP.w; x += T) {
        g.fillStyle = ((x + y) / T) % 2 ? '#d9c08a' : '#d2b77f';
        g.fillRect(x, y, T, T);
      }
    }
    // macchie e sassolini
    let seed = 11;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    for (let i = 0; i < 420; i++) {
      g.fillStyle = rnd() < 0.5 ? 'rgba(120, 90, 50, .12)' : 'rgba(255, 255, 255, .10)';
      g.beginPath();
      g.arc(rnd() * MAP.w, rnd() * MAP.h, 2 + rnd() * 6, 0, TAU);
      g.fill();
    }
    // linee del campo
    g.strokeStyle = 'rgba(255,255,255,.35)'; g.lineWidth = 6;
    g.beginPath(); g.arc(MAP.w / 2, MAP.h / 2, 260, 0, TAU); g.stroke();
    g.setLineDash([24, 18]);
    g.beginPath(); g.moveTo(MAP.w / 2, 0); g.lineTo(MAP.w / 2, MAP.h / 2 - 260); g.moveTo(MAP.w / 2, MAP.h / 2 + 260); g.lineTo(MAP.w / 2, MAP.h); g.stroke();
    g.setLineDash([]);
    // bordo
    g.strokeStyle = '#6b4a2a'; g.lineWidth = 16; g.strokeRect(8, 8, MAP.w - 16, MAP.h - 16);
    // muri: ombra, lato e piano
    for (const w of MAP.walls) {
      g.fillStyle = 'rgba(0,0,0,.25)';
      roundRect(g, w.x + 8, w.y + 14, w.w, w.h, 10); g.fill();
      g.fillStyle = '#7b5a3c';
      roundRect(g, w.x, w.y + 8, w.w, w.h, 10); g.fill();
      g.fillStyle = '#b58a5c';
      roundRect(g, w.x, w.y, w.w, w.h - 4, 10); g.fill();
      g.strokeStyle = 'rgba(0,0,0,.25)'; g.lineWidth = 2;
      // mattoni
      for (let yy = w.y + 20; yy < w.y + w.h - 8; yy += 22) {
        g.beginPath(); g.moveTo(w.x + 6, yy); g.lineTo(w.x + w.w - 6, yy); g.stroke();
      }
      g.strokeStyle = '#5a3f26'; g.lineWidth = 3;
      roundRect(g, w.x, w.y, w.w, w.h - 4, 10); g.stroke();
    }
    return c;
  }

  function makeBushes() {
    const c = document.createElement('canvas');
    c.width = MAP.w; c.height = MAP.h;
    const g = c.getContext('2d');
    let seed = 5;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    for (const b of MAP.bushes) {
      const blobs = [];
      for (let y = b.y + 22; y < b.y + b.h; y += 34) {
        for (let x = b.x + 22; x < b.x + b.w; x += 34) blobs.push([x + (rnd() - 0.5) * 10, y + (rnd() - 0.5) * 10, 26 + rnd() * 8]);
      }
      g.fillStyle = '#1f5f2a';
      for (const [x, y, r] of blobs) { g.beginPath(); g.arc(x, y + 4, r, 0, TAU); g.fill(); }
      for (const [x, y, r] of blobs) {
        const grd = g.createRadialGradient(x - r * 0.3, y - r * 0.4, 2, x, y, r);
        grd.addColorStop(0, '#6ccf5f'); grd.addColorStop(1, '#2f8a3a');
        g.fillStyle = grd;
        g.beginPath(); g.arc(x, y, r - 2, 0, TAU); g.fill();
      }
      g.fillStyle = 'rgba(255,255,255,.18)';
      for (const [x, y, r] of blobs) { g.beginPath(); g.arc(x - r * 0.35, y - r * 0.35, r * 0.25, 0, TAU); g.fill(); }
    }
    return c;
  }

  // ---------- lottatori ----------
  // Disegna un lottatore centrato in (x, y) con raggio r, girato verso l'angolo `aim`.
  function fighter(ctx, x, y, char, aim, r, opt = {}) {
    const def = CHARS[char] || CHARS.folgore;
    const col = def.color;
    const ca = Math.cos(aim), sa = Math.sin(aim);
    ctx.save();
    ctx.globalAlpha = opt.alpha ?? 1;

    // anello a terra: verde per te, rosso per gli avversari
    if (opt.ring) {
      ctx.strokeStyle = opt.ring; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.ellipse(x, y + r * 0.75, r * 1.05, r * 0.45, 0, 0, TAU); ctx.stroke();
    }
    ctx.fillStyle = 'rgba(0,0,0,.28)';
    ctx.beginPath(); ctx.ellipse(x, y + r * 0.8, r * 0.95, r * 0.38, 0, 0, TAU); ctx.fill();

    // arma (sotto il corpo, verso la mira)
    ctx.save();
    ctx.translate(x, y); ctx.rotate(aim);
    ctx.fillStyle = '#37474f'; ctx.strokeStyle = '#111'; ctx.lineWidth = 2;
    if (char === 'macigno') {
      roundRect(ctx, r * 0.3, -r * 0.42, r * 1.05, r * 0.84, 6); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#263238'; roundRect(ctx, r * 1.2, -r * 0.5, r * 0.25, r, 4); ctx.fill();
    } else if (char === 'falco') {
      roundRect(ctx, r * 0.3, -r * 0.16, r * 1.6, r * 0.32, 4); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#90a4ae'; roundRect(ctx, r * 0.6, -r * 0.3, r * 0.5, r * 0.2, 3); ctx.fill();
    } else {
      roundRect(ctx, r * 0.35, -r * 0.42, r * 1.0, r * 0.26, 4); ctx.fill(); ctx.stroke();
      roundRect(ctx, r * 0.35, r * 0.16, r * 1.0, r * 0.26, 4); ctx.fill(); ctx.stroke();
    }
    ctx.restore();

    // corpo
    const grd = ctx.createRadialGradient(x - r * 0.35, y - r * 0.45, r * 0.15, x, y, r);
    grd.addColorStop(0, shade(col, 0.45)); grd.addColorStop(0.7, col); grd.addColorStop(1, shade(col, -0.25));
    ctx.fillStyle = grd;
    ctx.strokeStyle = shade(col, -0.6); ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill(); ctx.stroke();

    // dettagli del personaggio
    if (char === 'folgore') {
      // capelli a punte e saetta
      ctx.fillStyle = shade(col, -0.45);
      for (let i = -2; i <= 2; i++) {
        const a = aim + Math.PI + i * 0.38;
        ctx.beginPath();
        ctx.moveTo(x + Math.cos(a - 0.2) * r * 0.85, y + Math.sin(a - 0.2) * r * 0.85);
        ctx.lineTo(x + Math.cos(a) * r * 1.35, y + Math.sin(a) * r * 1.35);
        ctx.lineTo(x + Math.cos(a + 0.2) * r * 0.85, y + Math.sin(a + 0.2) * r * 0.85);
        ctx.fill();
      }
      ctx.fillStyle = '#fff8e1'; ctx.strokeStyle = '#e65100'; ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(x - r * 0.1, y - r * 0.55); ctx.lineTo(x - r * 0.35, y + r * 0.05); ctx.lineTo(x - r * 0.05, y + r * 0.02);
      ctx.lineTo(x - r * 0.2, y + r * 0.55); ctx.lineTo(x + r * 0.3, y - r * 0.12); ctx.lineTo(x, y - r * 0.1); ctx.lineTo(x + r * 0.18, y - r * 0.55);
      ctx.closePath(); ctx.globalAlpha *= 0.55; ctx.fill(); ctx.globalAlpha = opt.alpha ?? 1;
    } else if (char === 'macigno') {
      // crepe nella pietra e sopracciglio
      ctx.strokeStyle = shade(col, -0.5); ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x - r * 0.6, y + r * 0.2); ctx.lineTo(x - r * 0.3, y + r * 0.35); ctx.lineTo(x - r * 0.35, y + r * 0.6);
      ctx.moveTo(x + r * 0.2, y + r * 0.5); ctx.lineTo(x + r * 0.45, y + r * 0.3);
      ctx.stroke();
      ctx.fillStyle = shade(col, -0.25);
      ctx.beginPath(); ctx.arc(x - r * 0.45, y - r * 0.5, r * 0.18, 0, TAU); ctx.arc(x + r * 0.5, y + r * 0.1, r * 0.13, 0, TAU); ctx.fill();
    } else if (char === 'falco') {
      // cresta e becco
      ctx.fillStyle = '#ffffff';
      const back = aim + Math.PI;
      ctx.beginPath();
      ctx.moveTo(x + Math.cos(back - 0.5) * r * 0.8, y + Math.sin(back - 0.5) * r * 0.8);
      ctx.lineTo(x + Math.cos(back) * r * 1.45, y + Math.sin(back) * r * 1.45);
      ctx.lineTo(x + Math.cos(back + 0.5) * r * 0.8, y + Math.sin(back + 0.5) * r * 0.8);
      ctx.fill();
      ctx.fillStyle = '#ffa726'; ctx.strokeStyle = '#8d4b00'; ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(x + ca * r * 0.55 - sa * r * 0.25, y + sa * r * 0.55 + ca * r * 0.25);
      ctx.lineTo(x + ca * r * 1.15, y + sa * r * 1.15);
      ctx.lineTo(x + ca * r * 0.55 + sa * r * 0.25, y + sa * r * 0.55 - ca * r * 0.25);
      ctx.closePath(); ctx.fill(); ctx.stroke();
    }

    // occhi rivolti verso la mira
    for (const side of [-1, 1]) {
      const ex = x + Math.cos(aim + side * 0.55) * r * 0.48;
      const ey = y + Math.sin(aim + side * 0.55) * r * 0.48;
      ctx.fillStyle = '#fff'; ctx.strokeStyle = '#222'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(ex, ey, r * 0.22, 0, TAU); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#111';
      ctx.beginPath(); ctx.arc(ex + ca * r * 0.08, ey + sa * r * 0.08, r * 0.11, 0, TAU); ctx.fill();
      if (char === 'macigno') {
        ctx.strokeStyle = '#3e2723'; ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(ex - sa * r * 0.22 * side - ca * r * 0.05, ey + ca * r * 0.22 * side - sa * r * 0.05);
        ctx.lineTo(ex + ca * r * 0.12, ey + sa * r * 0.12);
        ctx.stroke();
      }
    }

    // scudo all'ingresso e scatto
    if (opt.shield) {
      ctx.strokeStyle = 'rgba(129, 212, 250, .9)'; ctx.fillStyle = 'rgba(129, 212, 250, .18)'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(x, y, r * 1.35, 0, TAU); ctx.fill(); ctx.stroke();
    }
    if (opt.superReady) {
      ctx.strokeStyle = `rgba(255, 213, 79, ${0.5 + 0.4 * Math.sin(performance.now() / 160)})`; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(x, y, r * 1.2, 0, TAU); ctx.stroke();
    }
    ctx.restore();
  }

  // Ritratto per la sala d'attesa.
  function portrait(canvas, char) {
    const dpr = window.devicePixelRatio || 1;
    const size = canvas.clientWidth || 72;
    canvas.width = size * dpr; canvas.height = size * dpr;
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, size, size);
    fighter(ctx, size * 0.45, size * 0.48, char, -0.35, size * 0.3);
  }

  function bars(ctx, x, y, r, hp, mh, name, color, me) {
    const w = Math.max(54, r * 2.6), h = 7;
    const top = y - r - 22;
    ctx.fillStyle = 'rgba(0,0,0,.6)';
    roundRect(ctx, x - w / 2 - 1, top - 1, w + 2, h + 2, 4); ctx.fill();
    ctx.fillStyle = me ? '#69f0ae' : '#ff5252';
    roundRect(ctx, x - w / 2, top, Math.max(0, (w * hp) / mh), h, 3); ctx.fill();
    ctx.font = '700 13px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,.75)';
    ctx.strokeText(name, x, top - 5);
    ctx.fillStyle = me ? '#fff' : color;
    ctx.fillText(name, x, top - 5);
  }

  function ammo(ctx, x, y, r, value, max) {
    const w = 16, gap = 3, total = max * w + (max - 1) * gap;
    const top = y + r + 12;
    for (let i = 0; i < max; i++) {
      const fill = Math.max(0, Math.min(1, value - i));
      const bx = x - total / 2 + i * (w + gap);
      ctx.fillStyle = 'rgba(0,0,0,.6)'; roundRect(ctx, bx, top, w, 6, 3); ctx.fill();
      ctx.fillStyle = fill >= 1 ? '#ffb300' : 'rgba(255, 179, 0, .55)';
      roundRect(ctx, bx, top, w * fill, 6, 3); ctx.fill();
    }
  }

  function bullet(ctx, x, y, char, big) {
    const col = (CHARS[char] || CHARS.folgore).color;
    const r = big ? 13 : 7;
    const grd = ctx.createRadialGradient(x, y, 1, x, y, r * 2);
    grd.addColorStop(0, '#fff'); grd.addColorStop(0.35, col); grd.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = grd;
    ctx.beginPath(); ctx.arc(x, y, r * 2, 0, TAU); ctx.fill();
  }

  return { makeGround, makeBushes, fighter, portrait, bars, ammo, bullet, roundRect, shade };
})();
