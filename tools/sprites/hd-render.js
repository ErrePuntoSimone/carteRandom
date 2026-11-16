'use strict';
// Disegnatore ad alta qualità dei lottatori di "Spintoni" (gira nel browser, usato dal generatore di sprite).
// Ogni posa è descritta da pochi numeri (posizione di piedi e mani, inclinazione del busto...);
// gomiti e ginocchia sono calcolati con la cinematica inversa, così gli arti si piegano in modo naturale.
// Tutte le coordinate sono in unità di gioco, con l'origine nei piedi e il personaggio rivolto a destra.
window.HD = (() => {
  const TAU = Math.PI * 2;
  const OUT = '#1c1224';
  const LW = 3.2;
  const lerp = (a, b, t) => a + (b - a) * t;
  const ease = (t) => t * t * (3 - 2 * t);
  const rot = (v, a) => ({ x: v.x * Math.cos(a) - v.y * Math.sin(a), y: v.x * Math.sin(a) + v.y * Math.cos(a) });
  const add = (a, b) => ({ x: a.x + b.x, y: a.y + b.y });

  // ---------- aspetto dei tre personaggi ----------
  const STYLES = {
    pepe: {
      skin: '#eab18a', skinD: '#c98a63', top: '#ff7043', topD: '#cf4a1f', bot: '#27406f', botD: '#1a2b4f',
      shoe: '#f7f7f7', shoeD: '#bfbfbf', accent: '#e53935', hair: '#2a1b16',
      sw: 30, ww: 24, limb: 9.5, head: 15, arm: [18, 17], leg: [17.5, 17.5], glove: 12.5, shorts: true,
    },
    gilda: {
      skin: '#f2c9a0', skinD: '#d3a276', top: '#ab47bc', topD: '#7b2f8a', bot: '#2c2340', botD: '#1c162b',
      shoe: '#ffc107', shoeD: '#c79100', accent: '#ffd740', hair: '#5b1a8b',
      sw: 31, ww: 23, limb: 9, head: 15, arm: [18, 17], leg: [17.5, 17.5], glove: 12.5, shorts: false,
    },
    tonno: {
      skin: '#e3ae86', skinD: '#c08560', top: '#42a5f5', topD: '#2b7bc0', bot: '#38474f', botD: '#252f35',
      shoe: '#6d4c41', shoeD: '#4a3229', accent: '#fff59d', hair: '#4e342e',
      sw: 46, ww: 38, limb: 12.5, head: 17, arm: [19, 18], leg: [17.5, 17.5], glove: 15, shorts: false,
    },
  };

  // ---------- pose ----------
  const BASE = {
    bx: 0, by: 0, lean: 0.08,
    fFoot: { x: 14, y: 0 }, bFoot: { x: -14, y: 0 },
    fHand: { x: 37, y: -55 }, bHand: { x: 21, y: -60 },
    head: { dx: 2, dy: 0, tilt: 0 },
    eyes: 'n', mouth: 'n', trail: null, wind: 0.4,
  };
  const clone = (o) => JSON.parse(JSON.stringify(o));
  function pose(over = {}) {
    const p = clone(BASE);
    for (const [k, v] of Object.entries(over)) {
      if (v && typeof v === 'object' && !Array.isArray(v) && p[k] && typeof p[k] === 'object') Object.assign(p[k], v);
      else p[k] = v;
    }
    return p;
  }
  function mix(a, b, t) {
    if (typeof a === 'number') return lerp(a, b, t);
    if (a && b && typeof a === 'object' && typeof b === 'object') {
      const o = {};
      for (const k of Object.keys(a)) o[k] = mix(a[k], b[k], t);
      return o;
    }
    return t < 0.5 ? a : b;
  }
  const mixPose = (a, b, t) => {
    const o = mix(a, b, t);
    o.trail = (t < 0.5 ? a : b).trail;
    return o;
  };

  // ---------- cinematica inversa a due segmenti ----------
  function ik(a, t, l1, l2, bend) {
    let dx = t.x - a.x, dy = t.y - a.y;
    let d = Math.hypot(dx, dy) || 0.001;
    const max = l1 + l2 - 0.02, min = Math.abs(l1 - l2) + 0.5;
    const cl = Math.max(min, Math.min(max, d));
    const ex = a.x + (dx / d) * cl, ey = a.y + (dy / d) * cl;
    d = cl;
    const ang = Math.atan2(dy, dx);
    const cos = (l1 * l1 + d * d - l2 * l2) / (2 * l1 * d);
    const A = Math.acos(Math.max(-1, Math.min(1, cos))) * bend;
    return { j: { x: a.x + Math.cos(ang + A) * l1, y: a.y + Math.sin(ang + A) * l1 }, e: { x: ex, y: ey } };
  }

  // ---------- primitive di disegno ----------
  function path(ctx, pts) {
    ctx.beginPath();
    pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
  }
  function limb(ctx, a, j, b, w, c1, c1d, c2, c2d) {
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.strokeStyle = OUT; ctx.lineWidth = w + LW * 2;
    path(ctx, [a, j, b]); ctx.stroke();
    for (const [p, q, c, cd] of [[a, j, c1, c1d], [j, b, c2 || c1, c2d || c1d]]) {
      ctx.strokeStyle = cd; ctx.lineWidth = w; path(ctx, [p, q]); ctx.stroke();
      ctx.save(); ctx.translate(-w * 0.1, -w * 0.13);
      ctx.strokeStyle = c; ctx.lineWidth = w * 0.7; path(ctx, [p, q]); ctx.stroke();
      ctx.restore();
    }
  }
  // riempie una forma con ombreggiatura a mezzaluna (base chiara, bordo scuro in basso a destra) e contorno
  function shaded(ctx, drawPath, base, dark, shift = 3.2) {
    drawPath(); ctx.fillStyle = dark; ctx.fill();
    ctx.save(); drawPath(); ctx.clip();
    ctx.translate(-shift, -shift * 0.8); drawPath(); ctx.fillStyle = base; ctx.fill();
    ctx.restore();
    drawPath(); ctx.strokeStyle = OUT; ctx.lineWidth = LW; ctx.lineJoin = 'round'; ctx.stroke();
  }
  const ellipsePath = (ctx, x, y, rx, ry, r = 0) => () => { ctx.beginPath(); ctx.ellipse(x, y, rx, ry, r, 0, TAU); };
  function roundRectPath(ctx, x, y, w, h, r) {
    return () => {
      ctx.beginPath();
      ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
      ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
    };
  }

  function glove(ctx, hand, fore, r) {
    // polsino bianco verso l'avambraccio
    const dir = Math.atan2(fore.y - hand.y, fore.x - hand.x);
    const cuff = { x: hand.x + Math.cos(dir) * r * 0.95, y: hand.y + Math.sin(dir) * r * 0.95 };
    ctx.save();
    ctx.translate(cuff.x, cuff.y); ctx.rotate(dir);
    shaded(ctx, roundRectPath(ctx, -r * 0.35, -r * 0.7, r * 0.8, r * 1.4, 3), '#fafafa', '#c9c9c9', 1.5);
    ctx.restore();
    shaded(ctx, ellipsePath(ctx, hand.x, hand.y, r, r * 0.95), '#e53935', '#a01c1c', r * 0.28);
    // pollice e riflesso
    shaded(ctx, ellipsePath(ctx, hand.x + r * 0.1, hand.y + r * 0.62, r * 0.55, r * 0.34, 0.2), '#e53935', '#a01c1c', 1);
    ctx.fillStyle = 'rgba(255,255,255,.65)';
    ctx.beginPath(); ctx.ellipse(hand.x - r * 0.32, hand.y - r * 0.4, r * 0.26, r * 0.16, -0.6, 0, TAU); ctx.fill();
  }

  function shoe(ctx, foot, st, front) {
    const c = ctx;
    c.save();
    c.translate(foot.x, foot.y);
    shaded(c, roundRectPath(c, -6, -8.5, 20, 11, 5), st.shoe, st.shoeD, 2);
    // suola e dettaglio
    c.fillStyle = OUT; c.fillRect(-5, 1.2, 18, 2.6);
    c.fillStyle = st.accent; c.fillRect(-1, -6.4, 8, 2.4);
    c.restore();
    if (front) { /* nessun dettaglio extra */ }
  }

  function trail(ctx, from, to, w) {
    const dx = to.x - from.x, dy = to.y - from.y, d = Math.hypot(dx, dy);
    if (d < 6) return;
    const nx = -dy / d, ny = dx / d;
    ctx.save();
    for (const [k, a, ww] of [[0, 0.8, w], [1, 0.45, w * 0.55], [-1, 0.45, w * 0.55]]) {
      const ox = nx * k * w * 0.9, oy = ny * k * w * 0.9;
      const g = ctx.createLinearGradient(from.x, from.y, to.x, to.y);
      g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(1, `rgba(255,255,255,${a})`);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(from.x + ox, from.y + oy);
      ctx.lineTo(to.x + ox + nx * ww * 0.5, to.y + oy + ny * ww * 0.5);
      ctx.lineTo(to.x + ox - nx * ww * 0.5, to.y + oy - ny * ww * 0.5);
      ctx.closePath(); ctx.fill();
    }
    ctx.restore();
  }

  // ---------- testa e volto ----------
  function face(ctx, id, st, p, r) {
    // occhi
    const eyes = p.eyes;
    const eye = (x, y, rx, ry) => {
      if (eyes === 'c') {
        ctx.strokeStyle = OUT; ctx.lineWidth = 2.4; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(x - rx, y); ctx.quadraticCurveTo(x, y + ry * 0.9, x + rx, y); ctx.stroke();
        return;
      }
      ctx.fillStyle = '#fff'; ctx.strokeStyle = OUT; ctx.lineWidth = 1.8;
      ctx.beginPath(); ctx.ellipse(x, y, rx, ry * (eyes === 'o' ? 1.15 : 1), 0, 0, TAU); ctx.fill(); ctx.stroke();
      if (eyes === 'x') {
        ctx.strokeStyle = OUT; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(x - 2.4, y - 2.4); ctx.lineTo(x + 2.4, y + 2.4); ctx.moveTo(x + 2.4, y - 2.4); ctx.lineTo(x - 2.4, y + 2.4); ctx.stroke();
        return;
      }
      ctx.fillStyle = '#1b1b1b';
      ctx.beginPath(); ctx.arc(x + rx * 0.3, y + ry * 0.05, eyes === 'o' ? 1.7 : 2.7, 0, TAU); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(x + rx * 0.2, y - ry * 0.25, 0.9, 0, TAU); ctx.fill();
    };
    const wide = id === 'tonno' ? 1.1 : 1;
    eye(0.4, -1.5, 3.0 * wide, 3.7);
    eye(7.8 * wide, -1.5, 3.6 * wide, 4.3);
    // sopracciglia
    ctx.strokeStyle = id === 'tonno' ? '#3e2723' : st.hair; ctx.lineWidth = id === 'tonno' ? 3.4 : 2.6; ctx.lineCap = 'round';
    ctx.beginPath();
    if (eyes === 'a' || eyes === 'x') {
      ctx.moveTo(-4.5, -9.5); ctx.lineTo(3.2, -5.8); ctx.moveTo(3.6, -10.5); ctx.lineTo(12, -6.4);
    } else if (eyes === 'o') {
      ctx.moveTo(-4, -10.5); ctx.lineTo(3, -11.5); ctx.moveTo(4, -12.2); ctx.lineTo(11.5, -11.5);
    } else {
      ctx.moveTo(-4, -8.6); ctx.lineTo(3, -9.1); ctx.moveTo(3.8, -9.6); ctx.lineTo(11, -9.2);
    }
    ctx.stroke();
    // bocca
    const m = p.mouth;
    const mx = 6.2 * wide, my = 7.6;
    ctx.strokeStyle = OUT; ctx.lineWidth = 2; ctx.lineCap = 'round';
    if (m === 'g') {
      ctx.fillStyle = '#fff'; ctx.beginPath(); roundRectPath(ctx, mx - 5.5, my - 3, 11, 6, 2.5)(); ctx.fill(); ctx.stroke();
      ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(mx - 1.8, my - 3); ctx.lineTo(mx - 1.8, my + 3); ctx.moveTo(mx + 1.8, my - 3); ctx.lineTo(mx + 1.8, my + 3); ctx.stroke();
    } else if (m === 'o') {
      ctx.fillStyle = '#4a1a1a'; ctx.beginPath(); ctx.ellipse(mx, my + 1, 3.4, 4.4, 0, 0, TAU); ctx.fill(); ctx.stroke();
    } else if (m === 's') {
      ctx.fillStyle = '#4a1a1a'; ctx.beginPath(); ctx.ellipse(mx, my + 1, 6.2, 5.6, 0, 0, TAU); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#e57373'; ctx.beginPath(); ctx.ellipse(mx + 0.5, my + 3.4, 3.8, 2.2, 0, 0, TAU); ctx.fill();
    } else {
      ctx.beginPath(); ctx.moveTo(mx - 4, my - 0.5); ctx.quadraticCurveTo(mx, my + 4.2, mx + 4.8, my - 1); ctx.stroke();
    }
  }

  function head(ctx, id, st, p, C, r, t) {
    ctx.save();
    ctx.translate(C.x, C.y); ctx.rotate(p.head.tilt);
    const wob = Math.sin(t * TAU * 2) * 0.1;
    // elementi dietro la testa
    if (id === 'pepe') {
      // lacci della bandana al vento
      const droop = 0.5 + p.wind * 0.6;
      for (const [len, a0] of [[26, -0.1], [20, 0.35]]) {
        const a = Math.PI + a0 - droop * 0.35 + wob * 0.3;
        ctx.fillStyle = st.accent; ctx.strokeStyle = OUT; ctx.lineWidth = 2.4; ctx.lineJoin = 'round';
        ctx.beginPath();
        ctx.moveTo(-r * 0.6, -r * 0.4);
        ctx.quadraticCurveTo(-r - len * 0.5, -r * 0.5 + Math.sin(a) * len * 0.5 + 4, -r + Math.cos(a) * len, -r * 0.4 + Math.sin(a) * len + 5);
        ctx.quadraticCurveTo(-r - len * 0.3, -r * 0.1 + 6, -r * 0.55, -r * 0.05);
        ctx.closePath(); ctx.fill(); ctx.stroke();
      }
    } else if (id === 'gilda') {
      // coda di cavallo
      const swing = 0.2 + p.wind * 0.5 + wob;
      ctx.fillStyle = st.hair; ctx.strokeStyle = OUT; ctx.lineWidth = 2.6; ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(-r * 0.7, -r * 0.55);
      ctx.bezierCurveTo(-r - 14, -r - 2 + swing * 6, -r - 26, 2 + swing * 16, -r - 20 - swing * 6, 12 + swing * 12);
      ctx.bezierCurveTo(-r - 10, 4 + swing * 6, -r - 4, 0, -r * 0.6, -r * 0.05);
      ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = st.accent; ctx.beginPath(); ctx.arc(-r * 0.78, -r * 0.5, 3.2, 0, TAU); ctx.fill(); ctx.stroke();
    }
    // testa
    const wide = id === 'tonno' ? 1.1 : 1;
    shaded(ctx, ellipsePath(ctx, 0, 0, r * wide, r), st.skin, st.skinD, 3);
    if (id === 'tonno') {
      // mandibola larga
      shaded(ctx, ellipsePath(ctx, 3, r * 0.45, r * 0.85, r * 0.55), st.skin, st.skinD, 2.2);
      ctx.fillStyle = st.skin; ctx.beginPath(); ctx.ellipse(1, 0, r * 0.9, r * 0.75, 0, 0, TAU); ctx.fill();
    }
    // orecchio
    shaded(ctx, ellipsePath(ctx, -r * 0.82 * wide, 1.5, 3.4, 4.4), st.skin, st.skinD, 1);

    // capelli e accessori
    if (id === 'pepe') {
      // ciuffo nero a punte + bandana
      ctx.fillStyle = st.hair; ctx.strokeStyle = OUT; ctx.lineWidth = 2.4; ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(-r - 1, -3);
      ctx.lineTo(-r - 5, -r - 5); ctx.lineTo(-r * 0.5, -r - 1); ctx.lineTo(-r * 0.4, -r - 10); ctx.lineTo(0, -r - 2);
      ctx.lineTo(r * 0.4, -r - 9); ctx.lineTo(r * 0.5, -r + 1); ctx.lineTo(r * 0.98, -r * 0.45);
      ctx.lineTo(r * 0.7, -r * 0.28); ctx.lineTo(-r * 0.2, -r * 0.36); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.save();
      ctx.beginPath(); ctx.ellipse(0, 0, r * 1.02, r * 1.02, 0, 0, TAU); ctx.clip();
      ctx.fillStyle = st.accent; ctx.fillRect(-r - 2, -r * 0.62, r * 2 + 4, 6.4);
      ctx.fillStyle = 'rgba(0,0,0,.2)'; ctx.fillRect(-r - 2, -r * 0.62 + 4.2, r * 2 + 4, 2.2);
      ctx.restore();
      ctx.strokeStyle = OUT; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(-r - 1, -r * 0.62); ctx.lineTo(r + 1, -r * 0.62); ctx.moveTo(-r - 1, -r * 0.62 + 6.4); ctx.lineTo(r + 1, -r * 0.62 + 6.4); ctx.stroke();
    } else if (id === 'gilda') {
      ctx.fillStyle = st.hair; ctx.strokeStyle = OUT; ctx.lineWidth = 2.6; ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(-r - 1.5, 3);
      ctx.bezierCurveTo(-r - 3, -r - 2, r * 0.3, -r - 6, r * 0.96, -r * 0.4);
      ctx.bezierCurveTo(r * 0.7, -r * 0.55, r * 0.5, -r * 0.2, r * 0.18, -r * 0.35);
      ctx.bezierCurveTo(-r * 0.2, -r * 0.2, -r * 0.5, -r * 0.1, -r * 0.65, 4);
      ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,.28)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(-r * 0.5, -r * 0.85); ctx.quadraticCurveTo(0, -r - 1, r * 0.55, -r * 0.7); ctx.stroke();
    } else {
      // testa pelata lucida
      ctx.fillStyle = 'rgba(255,255,255,.4)'; ctx.beginPath(); ctx.ellipse(-r * 0.2, -r * 0.62, 4.6, 2.6, -0.4, 0, TAU); ctx.fill();
    }

    face(ctx, id, st, p, r);

    if (id === 'tonno') {
      // baffi
      ctx.fillStyle = '#4e342e'; ctx.strokeStyle = OUT; ctx.lineWidth = 2; ctx.lineJoin = 'round';
      ctx.beginPath(); ctx.moveTo(7, 3.4); ctx.quadraticCurveTo(15, 1.6, 20, 6.4); ctx.quadraticCurveTo(14, 9, 7.4, 6.8); ctx.quadraticCurveTo(2.6, 9, -1.2, 6.4); ctx.quadraticCurveTo(3, 2, 7, 3.4);
      ctx.closePath(); ctx.fill(); ctx.stroke();
    }
    ctx.restore();
  }

  // ---------- busto ----------
  function torso(ctx, id, st, p, hip) {
    const sw = st.sw, ww = st.ww;
    ctx.save();
    ctx.translate(hip.x, hip.y); ctx.rotate(p.lean);
    const shape = () => {
      ctx.beginPath();
      ctx.moveTo(-ww / 2, 3);
      ctx.quadraticCurveTo(-sw / 2 - 2, -12, -sw / 2, -25);
      ctx.quadraticCurveTo(-sw / 2 + 1, -33, -sw / 4, -33.5);
      ctx.lineTo(sw / 4, -33.5);
      ctx.quadraticCurveTo(sw / 2 - 1, -33, sw / 2, -25);
      ctx.quadraticCurveTo(sw / 2 + 2, -12, ww / 2, 3);
      ctx.closePath();
    };
    shaded(ctx, shape, st.top, st.topD, 4);
    ctx.save(); shape(); ctx.clip();
    if (id === 'pepe') {
      ctx.fillStyle = '#fff3e0'; ctx.fillRect(-sw, -22, sw * 2, 4.4); // striscia bianca
      ctx.fillStyle = st.skin; ctx.beginPath(); ctx.moveTo(-6, -34); ctx.quadraticCurveTo(0, -24, 6, -34); ctx.fill();
    } else if (id === 'gilda') {
      // giacca aperta con maglia scura e stella
      ctx.fillStyle = '#d1c4e9'; ctx.fillRect(-4, -34, 11, 40);
      ctx.fillStyle = st.topD; ctx.fillRect(-4.4, -34, 1.6, 40); ctx.fillRect(6.4, -34, 1.6, 40);
      ctx.fillStyle = st.accent;
      for (let i = 0; i < 10; i++) {
        const a = -Math.PI / 2 + (i * Math.PI) / 5, rr = i % 2 ? 2.6 : 6;
        const px = 1.6 + Math.cos(a) * rr, py = -19 + Math.sin(a) * rr;
        if (i) ctx.lineTo(px, py); else { ctx.beginPath(); ctx.moveTo(px, py); }
      }
      ctx.closePath(); ctx.fill();
    } else {
      // canottiera con pettorale e peli
      ctx.fillStyle = 'rgba(255,255,255,.22)'; ctx.beginPath(); ctx.ellipse(4, -17, 14, 11, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = st.skin; ctx.beginPath(); ctx.moveTo(-9, -34); ctx.quadraticCurveTo(2, -20, 13, -34); ctx.fill();
      ctx.strokeStyle = 'rgba(78,52,46,.55)'; ctx.lineWidth = 1.4;
      for (let i = -1; i <= 1; i++) { ctx.beginPath(); ctx.moveTo(2 + i * 4, -30); ctx.lineTo(3 + i * 4, -26); ctx.stroke(); }
    }
    // cintura
    ctx.fillStyle = st.bot; ctx.fillRect(-sw, -3, sw * 2, 10);
    ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.fillRect(-sw, 3, sw * 2, 4);
    ctx.fillStyle = id === 'pepe' ? st.accent : '#ffd740'; ctx.fillRect(-4, -3, 9, 6);
    ctx.restore();
    shape(); ctx.strokeStyle = OUT; ctx.lineWidth = LW; ctx.stroke();
    ctx.restore();
  }

  // ---------- figura completa ----------
  function draw(ctx, id, p, t = 0) {
    const st = STYLES[id];
    const hip = { x: p.bx, y: -34 + p.by };
    const R = (v) => add(hip, rot(v, p.lean));
    const sf = R({ x: 6, y: -27 }), sb = R({ x: -5, y: -27 });
    const neck = R({ x: 3, y: -34 });
    const headC = { x: neck.x + p.head.dx, y: neck.y - st.head * 0.72 + p.head.dy };

    const fl = ik({ x: hip.x + 5, y: hip.y + 2 }, p.fFoot, st.leg[0], st.leg[1], -1);
    const bl = ik({ x: hip.x - 5, y: hip.y + 2 }, p.bFoot, st.leg[0], st.leg[1], -1);
    const fa = ik(sf, p.fHand, st.arm[0], st.arm[1], 1);
    const ba = ik(sb, p.bHand, st.arm[0], st.arm[1], 1);
    const legC = (seg) => (st.shorts && seg === 2 ? [st.skin, st.skinD] : [st.bot, st.botD]);

    // braccio dietro
    limb(ctx, sb, ba.j, ba.e, st.limb * 0.92, st.skin, st.skinD, st.skin, st.skinD);
    glove(ctx, ba.e, ba.j, st.glove * 0.95);
    // gambe
    for (const [leg, hp, foot] of [[bl, { x: hip.x - 5, y: hip.y + 2 }, p.bFoot], [fl, { x: hip.x + 5, y: hip.y + 2 }, p.fFoot]]) {
      limb(ctx, hp, leg.j, leg.e, st.limb * 1.05, st.bot, st.botD, ...legC(2));
      shoe(ctx, foot, st, leg === fl);
    }
    torso(ctx, id, st, p, hip);
    head(ctx, id, st, p, headC, st.head, t);

    // pugno davanti con scia
    if (p.trail) trail(ctx, p.trail, fa.e, st.glove * 1.1);
    limb(ctx, sf, fa.j, fa.e, st.limb * 0.95, st.skin, st.skinD, st.skin, st.skinD);
    glove(ctx, fa.e, fa.j, st.glove);
    return { hand: fa.e, head: headC };
  }

  // ---------- animazioni ----------
  const guard = (o = {}) => pose(o);

  function attack(guardPose, wind, impact, follow, phases) {
    const [s, a, r] = phases;
    const N = s + a + r;
    return {
      frames: N, loop: false, phases,
      fn(i) {
        if (i < s) return mixPose(guardPose, wind, ease((i + 1) / s));
        if (i < s + a) {
          const j = i - s;
          return mixPose(impact, follow, a > 1 ? (j / (a - 1)) * 0.45 : 0);
        }
        const k = i - s - a;
        return mixPose(follow, guardPose, ease((k + 1) / r));
      },
    };
  }

  const ANIMS = {};
  const G = guard();

  ANIMS.idle = {
    frames: 6, loop: true, fps: 8,
    fn(i, N) {
      const t = i / N, s = Math.sin(t * TAU);
      return pose({ by: 1.3 * s, lean: 0.08 + 0.015 * s, fHand: { x: 37, y: -55 + 1.6 * s }, bHand: { x: 21, y: -60 + 1.4 * s }, head: { dx: 2, dy: 0.6 * s, tilt: 0 }, wind: 0.2 + 0.1 * s });
    },
  };
  ANIMS.run = {
    frames: 8, loop: true, fps: 14,
    fn(i, N) {
      const ph = (i / N) * TAU;
      const leg = (a) => ({ x: 22 * Math.sin(a), y: -13 * Math.max(0, Math.cos(a)) });
      const f = leg(ph), b = leg(ph + Math.PI);
      return pose({
        by: -2.2 * Math.abs(Math.cos(ph)) + 1, bx: 3, lean: 0.24,
        fFoot: { x: f.x + 6, y: f.y }, bFoot: { x: b.x + 4, y: b.y },
        fHand: { x: 22 + 9 * Math.sin(ph + Math.PI), y: -58 + 3 * Math.cos(ph) }, bHand: { x: 14 + 9 * Math.sin(ph), y: -60 + 3 * Math.cos(ph + Math.PI) },
        head: { dx: 3, dy: 0, tilt: 0.06 }, mouth: 'n', eyes: 'n', wind: 0.9,
      });
    },
  };
  ANIMS.air = {
    frames: 3, loop: false,
    fn(i) {
      return [
        pose({ by: -1, lean: -0.02, fFoot: { x: 6, y: -15 }, bFoot: { x: -14, y: -6 }, fHand: { x: 26, y: -76 }, bHand: { x: 8, y: -78 }, eyes: 'a', mouth: 'o', wind: 0.1 }),
        pose({ by: 0, lean: 0.1, fFoot: { x: 16, y: -17 }, bFoot: { x: -4, y: -21 }, fHand: { x: 28, y: -66 }, bHand: { x: 12, y: -68 }, eyes: 'n', mouth: 'n', wind: 0.3 }),
        pose({ by: 3, lean: 0.06, fFoot: { x: 10, y: -3 }, bFoot: { x: -10, y: -9 }, fHand: { x: 24, y: -88 }, bHand: { x: 2, y: -86 }, eyes: 'o', mouth: 'o', wind: 0.8 }),
      ][i];
    },
  };
  ANIMS.dodge = {
    frames: 2, loop: false,
    fn(i) {
      return [
        pose({ by: 12, lean: 0.45, fFoot: { x: 22, y: 0 }, bFoot: { x: -16, y: 0 }, fHand: { x: 34, y: -42 }, bHand: { x: 18, y: -48 }, eyes: 'c', mouth: 'g', head: { dx: 4, dy: 2, tilt: 0.2 }, wind: 0.9 }),
        pose({ by: 20, lean: 0.72, fFoot: { x: 32, y: 0 }, bFoot: { x: -26, y: 0 }, fHand: { x: 40, y: -32 }, bHand: { x: 22, y: -36 }, eyes: 'c', mouth: 'n', head: { dx: 5, dy: 4, tilt: 0.3 }, wind: 1 }),
      ][i];
    },
  };
  ANIMS.hurt = {
    frames: 1, loop: false,
    fn() {
      return pose({ by: 0, lean: -0.45, fFoot: { x: 16, y: -9 }, bFoot: { x: -12, y: -16 }, fHand: { x: 32, y: -92 }, bHand: { x: -26, y: -76 }, eyes: 'x', mouth: 'o', head: { dx: -2, dy: 1, tilt: -0.5 }, wind: 1 });
    },
  };

  // pugno veloce / forte × lato / alto / basso / basso in aria
  const eyesA = { eyes: 'a', mouth: 'g' };
  ANIMS.light_side = attack(G,
    pose({ bx: -3, lean: -0.02, fHand: { x: 8, y: -58 }, bHand: { x: 16, y: -64 }, ...eyesA }),
    pose({ bx: 12, lean: 0.2, fFoot: { x: 28, y: 0 }, bFoot: { x: -12, y: 0 }, fHand: { x: 62, y: -66 }, bHand: { x: 12, y: -62 }, eyes: 'a', mouth: 's', trail: { x: 6, y: -60 }, wind: 0.8 }),
    pose({ bx: 8, lean: 0.16, fFoot: { x: 26, y: 0 }, fHand: { x: 54, y: -64 }, bHand: { x: 12, y: -62 }, ...eyesA, wind: 0.6 }), [2, 2, 2]);
  ANIMS.heavy_side = attack(G,
    pose({ bx: -12, lean: -0.3, fFoot: { x: 8, y: 0 }, bFoot: { x: -22, y: 0 }, fHand: { x: -12, y: -56 }, bHand: { x: 10, y: -68 }, head: { dx: 0, dy: 0, tilt: -0.15 }, ...eyesA }),
    pose({ bx: 32, lean: 0.48, fFoot: { x: 50, y: 0 }, bFoot: { x: -6, y: -3 }, fHand: { x: 88, y: -58 }, bHand: { x: 6, y: -50 }, eyes: 'a', mouth: 's', trail: { x: -12, y: -56 }, head: { dx: 3, dy: 1, tilt: 0.1 }, wind: 1 }),
    pose({ bx: 26, lean: 0.4, fFoot: { x: 46, y: 0 }, bFoot: { x: -8, y: -1 }, fHand: { x: 80, y: -56 }, bHand: { x: 6, y: -52 }, ...eyesA, wind: 0.8 }), [3, 2, 3]);
  ANIMS.light_up = attack(G,
    pose({ by: 4, lean: 0.0, fHand: { x: 18, y: -46 }, bHand: { x: 10, y: -58 }, ...eyesA }),
    pose({ by: -6, lean: -0.05, fFoot: { x: 12, y: -3 }, bFoot: { x: -10, y: 0 }, fHand: { x: 14, y: -108 }, bHand: { x: 8, y: -66 }, eyes: 'a', mouth: 's', trail: { x: 20, y: -44 }, wind: 0.8 }),
    pose({ by: -4, lean: -0.03, fFoot: { x: 12, y: -2 }, fHand: { x: 12, y: -96 }, bHand: { x: 8, y: -66 }, ...eyesA, wind: 0.6 }), [2, 2, 2]);
  ANIMS.heavy_up = attack(G,
    pose({ by: 14, lean: 0.15, fFoot: { x: 18, y: 0 }, bFoot: { x: -18, y: 0 }, fHand: { x: 20, y: -30 }, bHand: { x: 12, y: -42 }, ...eyesA }),
    pose({ by: -16, lean: -0.15, fFoot: { x: 12, y: -13 }, bFoot: { x: -8, y: -17 }, fHand: { x: 10, y: -122 }, bHand: { x: 4, y: -70 }, eyes: 'a', mouth: 's', trail: { x: 24, y: -36 }, head: { dx: 0, dy: -1, tilt: -0.12 }, wind: 1 }),
    pose({ by: -12, lean: -0.1, fFoot: { x: 12, y: -10 }, bFoot: { x: -8, y: -14 }, fHand: { x: 6, y: -108 }, bHand: { x: 4, y: -70 }, ...eyesA, wind: 0.8 }), [3, 2, 3]);
  ANIMS.light_down = attack(G,
    pose({ by: 10, lean: 0.25, fHand: { x: 22, y: -42 }, bHand: { x: 10, y: -52 }, fFoot: { x: 18, y: 0 }, bFoot: { x: -16, y: 0 }, ...eyesA }),
    pose({ by: 26, lean: 0.55, fFoot: { x: 32, y: 0 }, bFoot: { x: -20, y: 0 }, fHand: { x: 58, y: -22 }, bHand: { x: 14, y: -38 }, eyes: 'a', mouth: 's', trail: { x: 20, y: -46 }, head: { dx: 5, dy: 3, tilt: 0.2 }, wind: 0.8 }),
    pose({ by: 22, lean: 0.5, fFoot: { x: 30, y: 0 }, bFoot: { x: -18, y: 0 }, fHand: { x: 50, y: -24 }, bHand: { x: 14, y: -38 }, ...eyesA, wind: 0.6 }), [2, 2, 2]);
  ANIMS.heavy_down = attack(G,
    pose({ by: 18, lean: 0.35, fHand: { x: 24, y: -42 }, bHand: { x: 12, y: -52 }, fFoot: { x: 20, y: 0 }, bFoot: { x: -18, y: 0 }, ...eyesA }),
    pose({ by: 32, lean: 0.7, fFoot: { x: 42, y: 0 }, bFoot: { x: -24, y: 0 }, fHand: { x: 76, y: -14 }, bHand: { x: 20, y: -30 }, eyes: 'a', mouth: 's', trail: { x: 18, y: -50 }, head: { dx: 6, dy: 4, tilt: 0.3 }, wind: 1 }),
    pose({ by: 28, lean: 0.64, fFoot: { x: 40, y: 0 }, bFoot: { x: -22, y: 0 }, fHand: { x: 66, y: -16 }, bHand: { x: 20, y: -30 }, ...eyesA, wind: 0.8 }), [3, 2, 3]);
  ANIMS.light_downair = attack(G,
    pose({ lean: 0.15, fFoot: { x: 10, y: -14 }, bFoot: { x: -6, y: -18 }, fHand: { x: 20, y: -72 }, bHand: { x: 8, y: -74 }, ...eyesA }),
    pose({ bx: 6, by: -2, lean: 0.6, fFoot: { x: 4, y: -22 }, bFoot: { x: -14, y: -16 }, fHand: { x: 38, y: -6 }, bHand: { x: 12, y: -54 }, eyes: 'a', mouth: 's', trail: { x: 22, y: -74 }, wind: 1 }),
    pose({ bx: 5, by: -2, lean: 0.5, fFoot: { x: 4, y: -20 }, bFoot: { x: -12, y: -16 }, fHand: { x: 34, y: -10 }, bHand: { x: 10, y: -56 }, ...eyesA, wind: 0.8 }), [2, 2, 2]);
  ANIMS.heavy_downair = attack(G,
    pose({ lean: 0.1, fFoot: { x: 10, y: -14 }, bFoot: { x: -6, y: -18 }, fHand: { x: 16, y: -86 }, bHand: { x: 4, y: -84 }, ...eyesA }),
    pose({ bx: 8, by: -2, lean: 0.82, fFoot: { x: -2, y: -24 }, bFoot: { x: -20, y: -14 }, fHand: { x: 44, y: 0 }, bHand: { x: 14, y: -44 }, eyes: 'a', mouth: 's', trail: { x: 18, y: -90 }, head: { dx: 5, dy: 3, tilt: 0.3 }, wind: 1 }),
    pose({ bx: 7, by: -2, lean: 0.7, fFoot: { x: -2, y: -22 }, bFoot: { x: -18, y: -14 }, fHand: { x: 38, y: -6 }, bHand: { x: 14, y: -46 }, ...eyesA, wind: 0.9 }), [3, 2, 3]);

  for (const [name, a] of Object.entries(ANIMS)) a.name = name;

  return { STYLES, ANIMS, draw, pose };
})();
