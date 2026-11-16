'use strict';
// Codice condiviso tra server e browser per "Rissa": mappa, personaggi e movimento.
// Lo stesso codice di movimento gira sul telefono (previsione) e sul server (autorità).
(function (root) {
  const TICK = 0.05; // 20 aggiornamenti al secondo

  const MAP = {
    w: 1800,
    h: 1200,
    walls: [
      { x: 800, y: 520, w: 200, h: 160 },
      { x: 300, y: 250, w: 240, h: 60 }, { x: 1260, y: 250, w: 240, h: 60 },
      { x: 300, y: 890, w: 240, h: 60 }, { x: 1260, y: 890, w: 240, h: 60 },
      { x: 590, y: 90, w: 60, h: 220 }, { x: 1150, y: 90, w: 60, h: 220 },
      { x: 590, y: 890, w: 60, h: 220 }, { x: 1150, y: 890, w: 60, h: 220 },
      { x: 120, y: 540, w: 160, h: 120 }, { x: 1520, y: 540, w: 160, h: 120 },
    ],
    bushes: [
      { x: 420, y: 470, w: 200, h: 260 }, { x: 1180, y: 470, w: 200, h: 260 },
      { x: 820, y: 200, w: 160, h: 120 }, { x: 820, y: 880, w: 160, h: 120 },
      { x: 40, y: 40, w: 220, h: 150 }, { x: 1540, y: 40, w: 220, h: 150 },
      { x: 40, y: 1010, w: 220, h: 150 }, { x: 1540, y: 1010, w: 220, h: 150 },
    ],
    spawns: [
      { x: 200, y: 330 }, { x: 1600, y: 870 }, { x: 1600, y: 330 },
      { x: 200, y: 870 }, { x: 900, y: 110 }, { x: 900, y: 1090 },
    ],
  };

  // Personaggi originali: ognuno ha attacco base (munizioni che si ricaricano) e super.
  const CHARS = {
    folgore: {
      name: 'Folgore', color: '#ffca28', desc: 'Veloce. Raffica di 3 colpi, super: scatto che travolge.',
      hp: 3000, speed: 340, radius: 22,
      attack: { count: 3, spread: 0.16, speed: 950, range: 520, damage: 360, r: 7, reload: 1.0 },
      superName: 'Scatto', superCharge: 2600,
    },
    macigno: {
      name: 'Macigno', color: '#8d6e63', desc: 'Resistente. Rosa di colpi da vicino, super: onda d\'urto.',
      hp: 5200, speed: 280, radius: 26,
      attack: { count: 5, spread: 0.55, speed: 780, range: 320, damage: 300, r: 8, reload: 1.4 },
      superName: 'Onda d\'urto', superCharge: 3000,
    },
    falco: {
      name: 'Falco', color: '#4fc3f7', desc: 'Fragile. Colpo singolo a lunga gittata, super: dardo perforante.',
      hp: 2400, speed: 300, radius: 21,
      attack: { count: 1, spread: 0, speed: 1350, range: 920, damage: 1100, r: 7, reload: 1.6 },
      superName: 'Dardo perforante', superCharge: 2800,
    },
  };

  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

  // Spinge un cerchio fuori da un rettangolo, se lo tocca.
  function pushOut(p, r, rect) {
    const cx = clamp(p.x, rect.x, rect.x + rect.w);
    const cy = clamp(p.y, rect.y, rect.y + rect.h);
    let dx = p.x - cx, dy = p.y - cy;
    const d2 = dx * dx + dy * dy;
    if (d2 >= r * r) return false;
    if (d2 === 0) {
      // centro dentro il rettangolo: esce dal lato più vicino
      const left = p.x - rect.x, right = rect.x + rect.w - p.x, top = p.y - rect.y, bottom = rect.y + rect.h - p.y;
      const m = Math.min(left, right, top, bottom);
      if (m === left) p.x = rect.x - r; else if (m === right) p.x = rect.x + rect.w + r;
      else if (m === top) p.y = rect.y - r; else p.y = rect.y + rect.h + r;
      return true;
    }
    const d = Math.sqrt(d2);
    dx /= d; dy /= d;
    p.x = cx + dx * r;
    p.y = cy + dy * r;
    return true;
  }

  // Muove un cerchio di (dx, dy) tenendo conto di muri e bordi.
  function moveCircle(p, dx, dy, r) {
    p.x += dx; p.y += dy;
    for (let pass = 0; pass < 2; pass++) for (const w of MAP.walls) pushOut(p, r, w);
    p.x = clamp(p.x, r, MAP.w - r);
    p.y = clamp(p.y, r, MAP.h - r);
    return p;
  }

  // Un passo di movimento con l'input del giocatore (vettore -1..1).
  function stepMove(p, mx, my, speed, r, dt = TICK) {
    let len = Math.hypot(mx, my);
    if (len > 1) { mx /= len; my /= len; len = 1; }
    if (len < 0.05) return p;
    return moveCircle(p, mx * speed * dt, my * speed * dt, r);
  }

  const inRect = (x, y, rc, pad = 0) => x >= rc.x - pad && x <= rc.x + rc.w + pad && y >= rc.y - pad && y <= rc.y + rc.h + pad;
  const inBush = (x, y) => MAP.bushes.some((b) => inRect(x, y, b));
  const hitsWall = (x, y, r) => x < 0 || y < 0 || x > MAP.w || y > MAP.h || MAP.walls.some((w) => inRect(x, y, w, r * 0.5));

  const api = { TICK, MAP, CHARS, clamp, moveCircle, stepMove, inRect, inBush, hitsWall };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.ArenaShared = api;
})(typeof self !== 'undefined' ? self : this);
