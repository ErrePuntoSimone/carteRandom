'use strict';
// Codice condiviso tra server e browser per "Spintoni": arena, lottatori e fisica.
// La stessa funzione stepFighter gira sul server (autorità) e sul telefono (previsione).
(function (root) {
  const TICK = 1 / 30; // 30 aggiornamenti al secondo

  // Arena grande quanto lo schermo (16:9). Si perde una vita uscendo dai bordi "di esplosione".
  const STAGE = {
    w: 1600, h: 900,
    main: { x: 300, y: 640, w: 1000, h: 80 },
    plats: [
      { x: 420, y: 470, w: 250 },
      { x: 930, y: 470, w: 250 },
      { x: 675, y: 305, w: 250 },
    ],
    blast: { l: -170, r: 1770, t: -420, b: 1060 },
    spawns: [{ x: 520, y: 640 }, { x: 1080, y: 640 }, { x: 680, y: 640 }, { x: 920, y: 640 }],
  };

  const PHYS = {
    g: 2700, maxFall: 1450, fastFall: 2100,
    accel: 5600, airAccel: 2600, friction: 4200,
    jumpMul: 0.9, w: 46, h: 86,
    dodgeTime: 0.28, dodgeCd: 0.9, dodgeSpeed: 520,
    dropTime: 0.25, buffer: 0.15,
  };

  // Lottatori originali: stessa mossa base, peso e potenza diversi.
  const CHARS = {
    pepe: { name: 'Pepe', color: '#ff7043', desc: 'Leggero e scattante: corre e salta più di tutti, ma vola via prima.', speed: 610, jump: 1120, weight: 0.85, power: 0.92 },
    gilda: { name: 'Gilda', color: '#ab47bc', desc: 'Equilibrata: né troppo pesante né troppo leggera.', speed: 540, jump: 1060, weight: 1.0, power: 1.0 },
    tonno: { name: 'Tonno', color: '#42a5f5', desc: 'Pesante e potente: lento, ma difficile da buttare fuori.', speed: 470, jump: 1000, weight: 1.25, power: 1.15 },
  };

  // Attacchi: tempi (s), danno (%), forza del lancio e zone di colpo per direzione.
  // ang: angolo del lancio in gradi rispetto all'avanti (90 = verso l'alto, negativo = verso il basso).
  const MOVES = {
    light: {
      startup: 0.05, active: 0.08, recovery: 0.13, dmg: 5, base: 320, growth: 7,
      boxes: {
        side: { x: 30, y: -66, w: 66, h: 38, ang: 40 },
        up: { x: -34, y: -140, w: 68, h: 56, ang: 88 },
        down: { x: 10, y: -36, w: 76, h: 36, ang: 25, airAng: -70 },
      },
    },
    heavy: {
      startup: 0.2, active: 0.1, recovery: 0.28, dmg: 12, base: 470, growth: 13,
      boxes: {
        side: { x: 26, y: -76, w: 88, h: 54, ang: 38 },
        up: { x: -42, y: -158, w: 84, h: 70, ang: 85 },
        down: { x: 6, y: -40, w: 96, h: 42, ang: 30, airAng: -75 },
      },
    },
  };

  const sign = (v) => (v > 0 ? 1 : v < 0 ? -1 : 0);
  const approach = (v, target, step) => (v < target ? Math.min(target, v + step) : Math.max(target, v - step));

  function newFighter(x, y, char) {
    return {
      x, y, vx: 0, vy: 0, face: 1, g: false, onPlat: false, jumps: 1,
      att: null, attN: 0, buf: null, hs: 0, dg: 0, dgDir: 0, dodgeCd: 0, inv: 0, drop: 0,
      char: CHARS[char] ? char : 'gilda',
    };
  }

  // Copia solo i campi di fisica (per la previsione sul telefono).
  const FIELDS = ['x', 'y', 'vx', 'vy', 'face', 'g', 'onPlat', 'jumps', 'attN', 'hs', 'dg', 'dgDir', 'dodgeCd', 'inv', 'drop', 'char'];
  function physState(f) {
    const o = {};
    for (const k of FIELDS) o[k] = f[k];
    o.att = f.att ? { ty: f.att.ty, dir: f.att.dir, t: f.att.t, air: f.att.air, id: f.att.id } : null;
    o.buf = f.buf ? { ty: f.buf.ty, t: f.buf.t } : null;
    return o;
  }

  const moveTotal = (m) => m.startup + m.active + m.recovery;
  const isActive = (att) => {
    if (!att) return false;
    const m = MOVES[att.ty];
    return att.t >= m.startup && att.t < m.startup + m.active;
  };

  // Zona di colpo dell'attacco in corso (coordinate del mondo), o null.
  function hitbox(f) {
    if (!isActive(f.att)) return null;
    const b = MOVES[f.att.ty].boxes[f.att.dir];
    const x = f.face > 0 ? f.x + b.x : f.x - b.x - b.w;
    return { x, y: f.y + b.y, w: b.w, h: b.h };
  }
  const hurtbox = (f) => ({ x: f.x - PHYS.w / 2, y: f.y - PHYS.h, w: PHYS.w, h: PHYS.h });
  const overlap = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

  /**
   * Un passo di fisica.
   * inp: { mx (-1..1), up, down (tenuti premuti), j, l, h, d, dd (premuti in questo passo) }
   */
  function stepFighter(f, inp, dt = TICK) {
    const ch = CHARS[f.char];
    const mx = Math.max(-1, Math.min(1, Number(inp.mx) || 0));
    f.inv = Math.max(0, f.inv - dt);
    f.dodgeCd = Math.max(0, f.dodgeCd - dt);
    f.drop = Math.max(0, f.drop - dt);

    if (f.hs > 0) {
      // in volo dopo un colpo: nessun controllo
      f.hs = Math.max(0, f.hs - dt);
      f.att = null;
      f.buf = null;
      f.vx *= Math.max(0, 1 - 1.1 * dt);
      f.vy = Math.min(f.vy + PHYS.g * dt, PHYS.maxFall * 1.4);
      integrate(f, dt, false);
      if (f.g) f.vx = approach(f.vx, 0, PHYS.friction * 0.5 * dt);
      return f;
    }

    if (f.att) {
      f.att.t += dt;
      if (f.att.t >= moveTotal(MOVES[f.att.ty])) f.att = null;
    }
    if (f.dg > 0) f.dg = Math.max(0, f.dg - dt);
    if (inp.l) f.buf = { ty: 'light', t: PHYS.buffer };
    if (inp.h) f.buf = { ty: 'heavy', t: PHYS.buffer };
    if (f.buf) { f.buf.t -= dt; if (f.buf.t <= 0) f.buf = null; }

    const free = !f.att && f.dg <= 0;
    if (free && f.buf) {
      const dir = inp.up ? 'up' : inp.down ? 'down' : 'side';
      if (Math.abs(mx) > 0.3) f.face = sign(mx);
      f.attN += 1;
      f.att = { ty: f.buf.ty, dir, t: 0, air: !f.g, id: f.attN };
      f.buf = null;
    } else if (free && inp.d && f.dodgeCd <= 0) {
      f.dg = PHYS.dodgeTime;
      f.dodgeCd = PHYS.dodgeCd;
      f.inv = Math.max(f.inv, PHYS.dodgeTime);
      f.dgDir = Math.abs(mx) > 0.3 ? sign(mx) : 0;
    }

    // movimento orizzontale
    const groundAttack = f.att && f.g;
    if (f.dg > 0) {
      if (f.g) f.vx = f.dgDir * PHYS.dodgeSpeed;
      else { f.vx = f.dgDir * PHYS.dodgeSpeed * 0.7; f.vy = Math.min(f.vy, 60); }
    } else {
      const target = groundAttack ? 0 : mx * ch.speed;
      const acc = f.g ? (Math.abs(mx) < 0.1 || groundAttack ? PHYS.friction : PHYS.accel) : PHYS.airAccel;
      f.vx = approach(f.vx, target, acc * dt);
      if (!f.att && Math.abs(mx) > 0.3) f.face = sign(mx);
    }

    // salto e doppio salto
    if (inp.j && !f.att && f.dg <= 0) {
      if (f.g) { f.vy = -ch.jump; f.g = false; f.jumps = 1; }
      else if (f.jumps > 0) { f.vy = -ch.jump * PHYS.jumpMul; f.jumps -= 1; }
    }
    // scendere da una piattaforma sospesa
    if (inp.dd && f.g && f.onPlat && !f.att) { f.drop = PHYS.dropTime; f.g = false; f.y += 2; }

    // gravità (più veloce tenendo giù)
    const maxFall = inp.down && !f.g && f.vy > 0 ? PHYS.fastFall : PHYS.maxFall;
    f.vy = Math.min(f.vy + PHYS.g * dt, maxFall);
    if (inp.down && !f.g && f.vy > 0) f.vy = Math.max(f.vy, PHYS.fastFall * 0.75);
    integrate(f, dt, true);
    return f;
  }

  function integrate(f, dt) {
    const half = PHYS.w / 2;
    const prevX = f.x, prevY = f.y;
    f.x += f.vx * dt;
    f.y += f.vy * dt;
    const wasG = f.g;
    f.g = false; f.onPlat = false;

    const m = STAGE.main;
    const overX = f.x + half > m.x && f.x - half < m.x + m.w;
    if (overX) {
      if (f.vy >= 0 && prevY <= m.y + 0.5 && f.y >= m.y) {
        land(f, m.y);
      } else if (f.vy < 0 && prevY - PHYS.h >= m.y + m.h && f.y - PHYS.h < m.y + m.h) {
        f.y = m.y + m.h + PHYS.h; f.vy = 0; // testata contro il fondo dell'isola
      } else if (f.y > m.y + 0.5 && f.y - PHYS.h < m.y + m.h) {
        // contro il fianco dell'isola: spinto fuori dal lato da cui arriva
        if (prevX <= m.x + m.w / 2) f.x = m.x - half; else f.x = m.x + m.w + half;
        f.vx = 0;
      }
    }
    if (!f.g && f.drop <= 0 && f.vy >= 0) {
      for (const p of STAGE.plats) {
        if (f.x > p.x - 6 && f.x < p.x + p.w + 6 && prevY <= p.y + 0.5 && f.y >= p.y) {
          land(f, p.y);
          f.onPlat = true;
          break;
        }
      }
    }
    if (!wasG && f.g && f.att && f.att.air) f.att = null; // atterrando si interrompe l'attacco in aria
  }

  function land(f, y) {
    f.y = y;
    if (f.vy > 0) f.vy = 0;
    f.g = true;
    f.jumps = 1;
  }

  const outOfBounds = (f) => f.x < STAGE.blast.l || f.x > STAGE.blast.r || f.y > STAGE.blast.b || f.y < STAGE.blast.t;

  const api = { TICK, STAGE, PHYS, CHARS, MOVES, newFighter, physState, stepFighter, hitbox, hurtbox, overlap, isActive, moveTotal, outOfBounds };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.SpintoniShared = api;
})(typeof self !== 'undefined' ? self : this);
