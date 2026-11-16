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
    dodgeTime: 0.28, dodgeCd: 0.9, dodgeSpeed: 860,
    dropTime: 0.25, buffer: 0.15,
    chargeMax: 2, // secondi massimi di carica del pugno forte
    chargeRecovery: 0.7, // fermo in più dopo un forte caricato: proporzionale alla carica (massimo, a carica piena)
    airJumps: 2, // salti in aria disponibili dopo aver lasciato il suolo
    coyote: 0.1, jumpBuffer: 0.12, // salto ancora possibile appena lasciato il bordo / salto premuto poco prima di atterrare
  };

  // Mosse di base, comuni a tutti i lottatori (ognuno può sostituirle in parte nel suo file in chars/).
  // Tempi (s), danno (%), forza del lancio e zone di colpo per direzione.
  // ang: angolo del lancio in gradi rispetto all'avanti (90 = verso l'alto, negativo = verso il basso).
  // Campi facoltativi di una mossa (tutti gestiti dal motore, vedi README "Creare un personaggio"):
  //   chargeable  si carica tenendo premuto           lunge      passo in avanti {speed, time}
  //   motion      spinte durante la mossa [{from, to, vx, vy, edgeStop}]   keepOnLand  in aria non si interrompe atterrando
  //   armor       corazza {from, to}: i colpi fanno danno ma non lanciano
  //   counter     parata {from, to, dmg, base, growth, ang}: se colpito in quel momento risponde
  //   cooldown    tempo di ricarica (speciale)         anim       animazione dello sprite da usare
  const MOVES = {
    light: {
      startup: 0.05, active: 0.08, recovery: 0.13, dmg: 5, base: 320, growth: 7,
      lunge: { speed: 200, time: 0.12 }, // passo in avanti mentre si colpisce (unità/s, secondi)
      boxes: {
        side: { x: 30, y: -66, w: 66, h: 38, ang: 40 },
        up: { x: -34, y: -140, w: 68, h: 56, ang: 88 },
        down: { x: 10, y: -36, w: 76, h: 36, ang: 25, airAng: -70 },
      },
    },
    heavy: {
      startup: 0.2, active: 0.1, recovery: 0.28, dmg: 12, base: 470, growth: 13, chargeable: true,
      lunge: { speed: 280, time: 0.18 },
      boxes: {
        side: { x: 26, y: -76, w: 88, h: 54, ang: 38 },
        up: { x: -42, y: -158, w: 84, h: 70, ang: 85 },
        down: { x: 6, y: -40, w: 96, h: 42, ang: 30, airAng: -75 },
      },
    },
  };

  // ---------- lottatori: uno per file in public/spintoni/chars/ (elenco e ordine in chars/index.json) ----------
  const ATTACKS = ['light', 'heavy', 'special'];
  const CHARS = {};
  function registerChar(def) {
    const moves = {};
    for (const ty of ATTACKS) {
      const base = MOVES[ty] || null, own = (def.moves || {})[ty] || null;
      if (!base && !own) continue;
      moves[ty] = { ...(base || {}), ...(own || {}) };
      moves[ty].boxes = { ...((base && base.boxes) || {}), ...((own && own.boxes) || {}) };
    }
    CHARS[def.id] = { ...def.stats, name: def.name, color: def.color, desc: def.desc, moves, hooks: def.hooks || {}, fx: { color: def.color, glow: '#ffffff', shape: 'dot', ...(def.fx || {}) } };
  }
  const charDefs = typeof module !== 'undefined' && module.exports
    ? require('./chars/index.json').map((id) => require(`./chars/${id}.js`))
    : root.SpintoniCharDefs || [];
  for (const d of charDefs) registerChar(d);
  const DEFAULT_CHAR = CHARS.gilda ? 'gilda' : Object.keys(CHARS)[0];
  const moveOf = (char, ty) => ((CHARS[char] || CHARS[DEFAULT_CHAR]).moves[ty]) || MOVES.light;

  const sign = (v) => (v > 0 ? 1 : v < 0 ? -1 : 0);
  const approach = (v, target, step) => (v < target ? Math.min(target, v + step) : Math.max(target, v - step));

  function newFighter(x, y, char) {
    return {
      x, y, vx: 0, vy: 0, face: 1, g: false, onPlat: false, jumps: PHYS.airJumps,
      att: null, attN: 0, buf: null, hs: 0, dg: 0, dgDir: 0, dodgeCd: 0, spCd: 0, inv: 0, drop: 0, coyote: 0, jbuf: 0,
      char: CHARS[char] ? char : DEFAULT_CHAR,
    };
  }

  // Copia solo i campi di fisica (per la previsione sul telefono).
  const FIELDS = ['x', 'y', 'vx', 'vy', 'face', 'g', 'onPlat', 'jumps', 'attN', 'hs', 'dg', 'dgDir', 'dodgeCd', 'spCd', 'inv', 'drop', 'coyote', 'jbuf', 'char'];
  function physState(f) {
    const o = {};
    for (const k of FIELDS) o[k] = f[k];
    o.att = f.att ? { ty: f.att.ty, dir: f.att.dir, t: f.att.t, air: f.att.air, id: f.att.id, c: f.att.c, rel: f.att.rel } : null;
    o.buf = f.buf ? { ty: f.buf.ty, t: f.buf.t } : null;
    return o;
  }

  const moveTotal = (m) => m.startup + m.active + m.recovery;
  // durata complessiva di un attacco in corso: il forte caricato resta fermo di più, in proporzione alla carica
  const attackTotal = (f) => moveTotal(moveOf(f.char, f.att.ty)) + chargeFrac(f.att) * PHYS.chargeRecovery;
  const isActive = (f) => {
    const att = f.att;
    if (!att) return false;
    const m = moveOf(f.char, att.ty);
    return att.t >= m.startup && att.t < m.startup + m.active;
  };
  // la mossa in corso è in una sua finestra (armor, counter...)?
  const inWindow = (f, key) => {
    if (!f.att) return null;
    const w = moveOf(f.char, f.att.ty)[key];
    return w && f.att.t >= w.from && f.att.t < w.to ? w : null;
  };

  // Zona di colpo dell'attacco in corso (coordinate del mondo), o null.
  function hitbox(f) {
    if (!isActive(f)) return null;
    const b = moveOf(f.char, f.att.ty).boxes[f.att.dir];
    if (!b) return null;
    const x = f.face > 0 ? f.x + b.x : f.x - b.x - b.w;
    return { x, y: f.y + b.y, w: b.w, h: b.h };
  }
  const hurtbox = (f) => ({ x: f.x - PHYS.w / 2, y: f.y - PHYS.h, w: PHYS.w, h: PHYS.h });
  const overlap = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

  // Quanto è carico un attacco (0..1).
  const chargeFrac = (a) => Math.min(1, (a && a.c ? a.c : 0) / PHYS.chargeMax);

  // Velocità del passo in avanti dell'attacco in corso (0 se non c'è): decresce nel tempo.
  // In avanti vale tutto, verso il basso un po' meno, verso l'alto poco; in aria la metà.
  function lungeVelocity(f) {
    const a = f.att;
    if (!a) return 0;
    const m = moveOf(f.char, a.ty);
    const lg = m.lunge;
    if (!lg) return 0;
    // il forte avanza quando parte il colpo (non mentre si prepara o si carica)
    if (m.chargeable && !a.rel) return 0;
    const lt = m.chargeable ? a.t - m.startup + 0.001 : a.t;
    if (lt < 0 || lt >= lg.time) return 0;
    const mult = a.dir === 'side' ? 1 : a.dir === 'down' ? 0.6 : 0.35;
    return f.face * lg.speed * mult * (a.air ? 0.5 : 1) * (1 + 0.6 * chargeFrac(a)) * (1 - 0.6 * (lt / lg.time));
  }

  // Estremi della superficie su cui si sta in piedi (isola o piattaforma), per non cadere avanzando con un colpo.
  function supportRange(f) {
    if (f.onPlat) {
      for (const p of STAGE.plats) if (f.x > p.x - 6 && f.x < p.x + p.w + 6 && Math.abs(f.y - p.y) < 3) return [p.x, p.x + p.w];
    }
    return [STAGE.main.x, STAGE.main.x + STAGE.main.w];
  }

  // Spinta della mossa in corso in questo istante (motion), o null.
  function motionNow(f) {
    if (!f.att) return null;
    const m = moveOf(f.char, f.att.ty);
    if (!m.motion) return null;
    for (const mo of m.motion) if (f.att.t >= mo.from && f.att.t < mo.to) return mo;
    return null;
  }

  /**
   * Un passo di fisica.
   * inp: { mx (-1..1), up, down, hd (tenuti premuti), j, l, h, sp, d, dd (premuti in questo passo) }
   */
  function stepFighter(f, inp, dt = TICK) {
    const ch = CHARS[f.char];
    const mx = Math.max(-1, Math.min(1, Number(inp.mx) || 0));
    f.inv = Math.max(0, f.inv - dt);
    f.dodgeCd = Math.max(0, f.dodgeCd - dt);
    f.spCd = Math.max(0, (f.spCd || 0) - dt);
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

    // tolleranze: salto "perdonato" appena lasciato il bordo e salto premuto poco prima di atterrare
    f.coyote = f.g ? PHYS.coyote : Math.max(0, f.coyote - dt);
    f.jbuf = inp.j ? PHYS.jumpBuffer : Math.max(0, f.jbuf - dt);

    if (f.att) {
      const a = f.att, m = moveOf(f.char, a.ty);
      if (m.chargeable && !a.rel && a.t + dt >= m.startup) {
        // fine della preparazione: se il tasto è ancora premuto si carica (al massimo chargeMax secondi), poi parte
        if (inp.hd && a.c < PHYS.chargeMax) { a.c = Math.min(PHYS.chargeMax, a.c + dt); a.t = m.startup - 0.001; }
        else { a.rel = true; a.t += dt; }
      } else a.t += dt;
      if (a.t >= attackTotal(f)) f.att = null;
    }
    // la schivata interrompe la carica
    if (f.att && !f.att.rel && f.att.c > 0 && inp.d && f.dodgeCd <= 0) f.att = null;
    if (f.dg > 0) f.dg = Math.max(0, f.dg - dt);
    if (inp.l) f.buf = { ty: 'light', t: PHYS.buffer };
    if (inp.h) f.buf = { ty: 'heavy', t: PHYS.buffer };
    if (inp.sp && f.spCd <= 0 && CHARS[f.char].moves.special) f.buf = { ty: 'special', t: PHYS.buffer };
    if (f.buf) { f.buf.t -= dt; if (f.buf.t <= 0) f.buf = null; }

    const free = !f.att && f.dg <= 0;
    if (free && f.buf) {
      const m = moveOf(f.char, f.buf.ty);
      let dir = inp.up ? 'up' : inp.down ? 'down' : 'side';
      if (!m.boxes[dir]) dir = 'side'; // mosse senza varianti per direzione
      if (Math.abs(mx) > 0.3) f.face = sign(mx);
      f.attN += 1;
      f.att = { ty: f.buf.ty, dir, t: 0, air: !f.g, id: f.attN, c: 0, rel: !m.chargeable };
      if (m.cooldown) f.spCd = m.cooldown;
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
      else { f.vx = f.dgDir * PHYS.dodgeSpeed * 0.8; f.vy = Math.min(f.vy, 60); }
    } else {
      const target = groundAttack ? 0 : mx * ch.speed;
      const acc = f.g ? (Math.abs(mx) < 0.1 || groundAttack ? PHYS.friction : PHYS.accel) : PHYS.airAccel;
      f.vx = approach(f.vx, target, acc * dt);
      if (!f.att && Math.abs(mx) > 0.3) f.face = sign(mx);
      // passo in avanti mentre si colpisce (a terra non si esce dall'isola o dalla piattaforma)
      const lg = lungeVelocity(f);
      if (lg !== 0) {
        if (f.g) {
          const [lo, hi] = supportRange(f);
          const nx = f.x + lg * dt;
          if (nx > lo + 10 && nx < hi - 10) f.vx = lg;
        } else {
          f.vx = Math.max(-ch.speed * 1.2, Math.min(ch.speed * 1.2, f.vx + lg * 0.3));
        }
      }
      // spinte proprie della mossa (scatti, salite): a terra con edgeStop non si esce dalla superficie
      const mo = motionNow(f);
      if (mo) {
        if (mo.vx !== undefined) {
          let vx = f.face * mo.vx;
          if (f.g && mo.edgeStop) {
            const [lo, hi] = supportRange(f);
            const nx = f.x + vx * dt;
            if (nx < lo + 10 || nx > hi - 10) vx = 0;
          }
          f.vx = vx;
        }
        if (mo.vy !== undefined) { f.vy = mo.vy - PHYS.g * dt; if (mo.vy < 0) f.g = false; }
      }
    }

    // salto e doppio salto; durante il recupero di un colpo si può annullare saltando
    // dopo il colpo si può annullare con un salto, ma non se era caricato: quella pausa va scontata
    const curMove = f.att && moveOf(f.char, f.att.ty);
    const recovering = f.att && !(f.att.c > 0) && !curMove.cooldown && f.att.t >= curMove.startup + curMove.active;
    if (f.jbuf > 0 && (!f.att || recovering) && f.dg <= 0) {
      if (f.g || f.coyote > 0) {
        // da terra, o appena lasciato il bordo (o salto premuto poco prima di atterrare)
        f.att = null; f.buf = null;
        f.vy = -ch.jump; f.g = false; f.jumps = PHYS.airJumps; f.coyote = 0; f.jbuf = 0;
      } else if (inp.j && f.jumps > 0) {
        // in aria una pressione nuova usa il doppio salto; se è già stato usato il salto resta in memoria (jbuf) e parte all'atterraggio
        f.att = null; f.buf = null;
        f.vy = -ch.jump * PHYS.jumpMul; f.jumps -= 1; f.jbuf = 0;
      }
    }
    // scendere da una piattaforma sospesa
    if (inp.dd && f.g && f.onPlat && !f.att) { f.drop = PHYS.dropTime; f.g = false; f.y += 2; f.coyote = 0; }

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
    // atterrando si interrompe l'attacco in aria (salvo mosse che lo prevedono)
    if (!wasG && f.g && f.att && f.att.air && !moveOf(f.char, f.att.ty).keepOnLand) f.att = null;
  }

  function land(f, y) {
    f.y = y;
    if (f.vy > 0) f.vy = 0;
    f.g = true;
    f.jumps = PHYS.airJumps;
  }

  const outOfBounds = (f) => f.x < STAGE.blast.l || f.x > STAGE.blast.r || f.y > STAGE.blast.b || f.y < STAGE.blast.t;

  // Colori per i dettagli del personaggio (bandana, polsini, scarpe...). null = colori originali.
  const COLORS = [
    { id: 'rosso', name: 'Rosso', hex: '#e53935' },
    { id: 'arancio', name: 'Arancio', hex: '#fb8c00' },
    { id: 'giallo', name: 'Giallo', hex: '#fdd835' },
    { id: 'verde', name: 'Verde', hex: '#43a047' },
    { id: 'acqua', name: 'Acqua', hex: '#26c6da' },
    { id: 'azzurro', name: 'Azzurro', hex: '#42a5f5' },
    { id: 'blu', name: 'Blu', hex: '#3949ab' },
    { id: 'viola', name: 'Viola', hex: '#8e24aa' },
    { id: 'rosa', name: 'Rosa', hex: '#ec407a' },
    { id: 'bianco', name: 'Bianco', hex: '#f5f5f5' },
    { id: 'nero', name: 'Nero', hex: '#424242' },
  ];
  const colorHex = (id) => (COLORS.find((c) => c.id === id) || {}).hex || null;

  // Snapshot: ogni quanti passi il server manda lo stato (2 = 15 al secondo) e valori omessi quando sono "a riposo".
  const SEND_EVERY = 2;
  const SNAP_DEFAULTS = { vx: 0, vy: 0, a: null, hs: 0, dg: 0, inv: false };

  const api = {
    TICK, SEND_EVERY, SNAP_DEFAULTS, STAGE, PHYS, CHARS, MOVES, ATTACKS, COLORS, colorHex, registerChar, moveOf, inWindow, newFighter, physState, stepFighter,
    hitbox, hurtbox, overlap, isActive, moveTotal, outOfBounds, lungeVelocity, chargeFrac, attackTotal,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.SpintoniShared = api;
})(typeof self !== 'undefined' ? self : this);
