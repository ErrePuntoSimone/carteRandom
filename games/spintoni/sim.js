'use strict';
// Simulazione autorevole di "Spintoni": gira sul server a 30 passi al secondo.
const S = require('../../public/spintoni/shared');

const RESPAWN = 1.4;
const RESPAWN_SHIELD = 2;
const KO_CREDIT = 8; // secondi in cui l'ultimo colpo vale come KO
const r1 = (v) => Math.round(v * 10) / 10;
const r3 = (v) => Math.round(v * 1000) / 1000;
const NEUTRAL = { mx: 0, up: false, down: false };
const SNAP_DEFAULTS = S.SNAP_DEFAULTS;
// numeri della fisica arrotondati al millesimo: abbastanza per la previsione, molti meno caratteri
function roundPh(o) {
  for (const k in o) if (typeof o[k] === 'number') o[k] = r3(o[k]);
  if (o.att) { o.att.t = r3(o.att.t); o.att.c = r3(o.att.c || 0); }
  if (o.buf) o.buf.t = r3(o.buf.t);
  return o;
}

class Sim {
  constructor({ players, stocks = 3, duration = 240, countdown = 0, rng = Math.random }) {
    this.cd = countdown; // conto alla rovescia iniziale (secondi): tutti fermi, il tempo non scorre
    this.rng = rng;
    this.stocks = stocks;
    this.duration = duration;
    this.time = 0;
    this.tick = 0;
    this.over = false;
    this.events = [];
    this.fighters = new Map();
    this.outOrder = 0;
    players.forEach((p, i) => this.add(p, i));
    this.started = this.fighters.size;
  }

  add({ id, name, char, bot }, i) {
    const sp = S.STAGE.spawns[i % S.STAGE.spawns.length];
    const f = S.newFighter(sp.x, sp.y, char);
    f.face = sp.x < S.STAGE.w / 2 ? 1 : -1;
    f.g = true;
    Object.assign(f, {
      id, name, bot: !!bot, slot: i, dmg: 0, stocks: this.stocks, alive: true, respawnAt: 0, out: 0,
      kos: 0, falls: 0, dealt: 0, lastHitBy: null, lastHitAt: -99, hitBy: new Set(),
      queue: [], seq: 0, held: { ...NEUTRAL },
      brain: bot ? { think: 0, inp: { ...NEUTRAL }, jumpT: 0, holdT: 0 } : null,
    });
    this.fighters.set(id, f);
  }

  remove(id) {
    const f = this.fighters.get(id);
    if (!f) return;
    f.stocks = 0; f.alive = false; f.left = true;
    if (!f.out) f.out = ++this.outOrder;
  }

  pushInput(id, m) {
    const f = this.fighters.get(id);
    if (!f || f.bot) return;
    const s = Math.floor(Number(m.s));
    if (!(s > f.seq) || (f.queue.length && s <= f.queue[f.queue.length - 1].s)) return;
    f.queue.push({
      s, mx: Math.max(-1, Math.min(1, Number(m.mx) || 0)), up: !!m.up, down: !!m.dn,
      j: !!m.j, l: !!m.l, h: !!m.h, sp: !!m.sp, hd: !!m.hd, d: !!m.d, dd: !!m.dd,
    });
    if (f.queue.length > 10) f.queue.splice(0, f.queue.length - 10);
  }

  step() {
    if (this.over) return;
    const dt = S.TICK;
    this.tick += 1;
    this.events = [];
    if (this.cd > 0) {
      this.cd = Math.max(0, this.cd - dt);
      for (const f of this.fighters.values()) {
        if (f.queue.length) f.seq = f.queue[f.queue.length - 1].s; // input confermati ma ignorati
        f.queue.length = 0;
        f.held = { ...NEUTRAL };
      }
      return;
    }
    this.time += dt;

    for (const f of this.fighters.values()) {
      if (!f.alive) {
        if (f.stocks > 0 && this.time >= f.respawnAt) this.respawn(f);
        else continue;
      }
      if (f.bot) {
        S.stepFighter(f, this.think(f), dt);
      } else {
        // un passo per input (2 se il telefono è in ritardo); senza input, si continua con quelli tenuti
        const n = f.queue.length > 3 ? 2 : f.queue.length ? 1 : 0;
        if (!n) S.stepFighter(f, f.held, dt);
        for (let k = 0; k < n; k++) {
          const inp = f.queue.shift();
          f.seq = inp.s;
          f.held = { mx: inp.mx, up: inp.up, down: inp.down, hd: inp.hd };
          S.stepFighter(f, inp, dt);
        }
      }
      if (f.att && f.att.t <= dt + 1e-9) {
        f.hitBy = new Set();
        this.events.push({ t: 'swing', id: f.id, ty: f.att.ty });
      }
    }

    this.resolveHits();

    for (const f of this.fighters.values()) {
      if (f.alive && S.outOfBounds(f)) this.ko(f);
    }

    const left = [...this.fighters.values()].filter((f) => f.stocks > 0);
    if ((this.started >= 2 && left.length <= 1) || this.time >= this.duration) this.over = true;
  }

  resolveHits() {
    const hits = [];
    for (const a of this.fighters.values()) {
      if (!a.alive) continue;
      const box = S.hitbox(a);
      if (!box) continue;
      for (const v of this.fighters.values()) {
        if (v === a || !v.alive || v.inv > 0 || a.hitBy.has(v.id)) continue;
        if (S.overlap(box, S.hurtbox(v))) {
          a.hitBy.add(v.id);
          hits.push([a, v, { ty: a.att.ty, dir: a.att.dir, air: a.att.air, p: S.chargeFrac(a.att) }]);
        }
      }
    }
    // i colpi si applicano tutti insieme: due pugni nello stesso istante vanno a segno entrambi
    // (la parata e la corazza si guardano prima di applicarli, sullo stato di quell'istante)
    const plan = hits.map(([a, v, att]) => [a, v, att, S.inWindow(v, 'counter'), S.inWindow(v, 'armor')]);
    for (const [a, v, att, counter, armor] of plan) {
      if (counter) this.counterHit(v, a, counter);
      else this.applyHit(a, v, att, { armor: !!armor });
    }
  }

  // Lancio: danno, forza (base + crescita con il danno), angolo; potenza di chi colpisce e peso di chi lo subisce.
  launch(a, v, { dmg, base, growth, ang, face, ty, p = 0, armor = false }) {
    const ca = S.CHARS[a.char], cv = S.CHARS[v.char];
    const d = dmg * ca.power * (1 + p);
    v.dmg = Math.min(999, v.dmg + d);
    a.dealt += d;
    v.lastHitBy = a.id; v.lastHitAt = this.time;
    const kb = (((base + growth * v.dmg) * ca.power) / cv.weight) * (1 + 0.7 * p);
    if (armor) {
      // corazza: il danno resta, il lancio no (e la mossa continua)
      this.events.push({ t: 'hit', id: v.id, by: a.id, x: r1(v.x), y: r1(v.y - 50), ty, kb: 0, ch: 0, arm: 1, vx: 0, vy: 0 });
      return;
    }
    const r = (ang * Math.PI) / 180;
    v.vx = Math.cos(r) * kb * face;
    v.vy = -Math.sin(r) * kb;
    if (v.g && v.vy > 0) v.vy = -v.vy * 0.45; // schiacciato a terra: rimbalza
    v.g = false;
    v.hs = Math.min(1.2, kb * 0.00032 + 0.08);
    v.att = null; v.buf = null; v.dg = 0;
    this.events.push({ t: 'hit', id: v.id, by: a.id, x: r1(v.x), y: r1(v.y - 50), ty, kb: Math.round(kb), ch: r1(p), vx: r1(v.vx), vy: r1(v.vy) });
  }

  applyHit(a, v, att, { armor = false } = {}) {
    const move = S.moveOf(a.char, att.ty);
    const box = move.boxes[att.dir] || move.boxes.side;
    const p = att.p || 0; // carica del pugno forte (0..1): fino al doppio del danno e quasi al doppio del lancio
    const ang = att.dir === 'down' && att.air && box.airAng !== undefined ? box.airAng : box.ang;
    this.launch(a, v, { dmg: move.dmg, base: move.base, growth: move.growth, ang, face: a.face, ty: att.ty, p, armor });
  }

  // Parata riuscita: il colpo non arriva e chi para risponde subito.
  counterHit(def, att, c) {
    def.face = att.x >= def.x ? 1 : -1;
    def.att = null;
    def.inv = Math.max(def.inv, 0.25);
    this.events.push({ t: 'counter', id: def.id, by: att.id, x: r1(def.x), y: r1(def.y - 60) });
    this.launch(def, att, { dmg: c.dmg, base: c.base, growth: c.growth, ang: c.ang, face: def.face, ty: 'special' });
  }

  ko(f) {
    f.alive = false;
    f.stocks -= 1;
    f.falls += 1;
    f.respawnAt = this.time + RESPAWN;
    const killer = f.lastHitBy && this.time - f.lastHitAt < KO_CREDIT ? this.fighters.get(f.lastHitBy) : null;
    if (killer && killer !== f) killer.kos += 1;
    if (f.stocks <= 0 && !f.out) f.out = ++this.outOrder;
    const B = S.STAGE;
    this.events.push({
      t: 'ko', id: f.id, by: killer ? killer.id : null,
      x: r1(Math.max(0, Math.min(B.w, f.x))), y: r1(Math.max(0, Math.min(B.h, f.y))), left: f.stocks,
    });
  }

  respawn(f) {
    const others = [...this.fighters.values()].filter((o) => o !== f && o.alive);
    let best = S.STAGE.spawns[0], bestD = -1;
    for (const sp of S.STAGE.spawns) {
      const d = others.length ? Math.min(...others.map((o) => Math.abs(o.x - sp.x))) : this.rng();
      if (d > bestD) { bestD = d; best = sp; }
    }
    Object.assign(f, S.newFighter(best.x, 140, f.char), {
      alive: true, dmg: 0, inv: RESPAWN_SHIELD, lastHitBy: null, attN: f.attN,
    });
    f.queue.length = 0;
    this.events.push({ t: 'spawn', id: f.id, x: r1(f.x), y: 140 });
  }

  // ---------- bot ----------
  think(f) {
    const br = f.brain;
    const dt = S.TICK;
    const m = S.STAGE.main;
    const inp = { mx: 0, up: false, down: false, j: false, l: false, h: false, d: false, dd: false };
    const offStage = f.x < m.x - 10 || f.x > m.x + m.w + 10 || f.y > m.y + 20;

    // rientro: verso il centro, salto quando si scende
    const sp = S.CHARS[f.char].moves.special;
    if (offStage) {
      inp.mx = f.x < S.STAGE.w / 2 ? 1 : -1;
      if (f.vy > 120 && f.jumps > 0 && f.hs <= 0) inp.j = true;
      // finiti i salti, chi ha una speciale per rientrare la usa
      else if (f.vy > 120 && f.jumps === 0 && sp && sp.recover && f.spCd <= 0 && !f.att) inp.sp = true;
      return inp;
    }

    br.think -= dt;
    if (br.think > 0) { br.holdT = Math.max(0, br.holdT - dt); return { ...br.inp, j: false, l: false, h: false, sp: false, d: false, dd: false, hd: br.holdT > 0 }; }
    br.think = 0.07 + this.rng() * 0.08; // tempo di reazione

    let target = null, bestD = Infinity;
    for (const o of this.fighters.values()) {
      if (o === f || !o.alive) continue;
      const d = Math.hypot(o.x - f.x, o.y - f.y);
      if (d < bestD) { bestD = d; target = o; }
    }
    if (!target) { br.inp = inp; return inp; }

    const dx = target.x - f.x, dy = target.y - f.y;
    const near = Math.abs(dx) < 100 && Math.abs(dy) < 80;
    if (!near) {
      inp.mx = Math.sign(dx);
      // non buttarsi giù dall'isola inseguendo chi è fuori
      const nextX = f.x + inp.mx * 60;
      if (f.g && (nextX < m.x + 30 || nextX > m.x + m.w - 30) && !f.onPlat) inp.mx = 0;
      if (dy < -110 && Math.abs(dx) < 220 && f.g && this.rng() < 0.6) inp.j = true;
      if (dy > 60 && f.onPlat && this.rng() < 0.4) inp.dd = true;
    } else {
      f.face = dx >= 0 ? 1 : -1;
      inp.mx = Math.sign(dx) * 0.4;
      const r = this.rng();
      if (target.att && r < 0.12 && f.dodgeCd <= 0) inp.d = true;
      else if (sp && f.spCd <= 0 && r < 0.2 && (sp.counter ? target.att : true)) inp.sp = true;
      else if (r < 0.75) {
        const heavy = target.dmg > 60 ? this.rng() < 0.5 : this.rng() < 0.2;
        if (heavy) {
          inp.h = true;
          // a volte lo carica un po' (con meno di 1,2 s, per non restare fermo troppo)
          br.holdT = this.rng() < 0.3 ? 0.3 + this.rng() * 0.9 : 0;
          inp.hd = br.holdT > 0;
        } else inp.l = true;
        if (dy < -55) inp.up = true;
        else if (dy > 40 && !f.g) inp.down = true;
      }
    }
    br.inp = { mx: inp.mx, up: inp.up, down: inp.down };
    return inp;
  }

  // ---------- stato da inviare ----------
  // ev: eventi da includere (il server ci mette quelli accumulati dall'ultimo invio)
  snapshot(viewerId, ev = this.events) {
    const me = this.fighters.get(viewerId);
    const fs = [];
    for (const f of this.fighters.values()) {
      const base = {
        id: f.id, c: f.char, sl: f.slot, al: f.alive, st: f.stocks, dm: Math.round(f.dmg),
        x: r1(f.x), y: r1(f.y), vx: r1(f.vx), vy: r1(f.vy), fc: f.face, g: f.g,
        a: f.att ? { ty: f.att.ty, dir: f.att.dir, t: r3(f.att.t), air: f.att.air, c: r3(f.att.c || 0), rel: f.att.rel ? 1 : 0 } : null,
        hs: r3(f.hs), dg: r3(f.dg), inv: f.inv > 0,
      };
      // per risparmiare banda i valori "a riposo" non si mandano (il client li rimette con SNAP_DEFAULTS)
      for (const k in SNAP_DEFAULTS) if (base[k] === SNAP_DEFAULTS[k]) delete base[k];
      if (f.id === viewerId) base.ph = roundPh(S.physState(f));
      fs.push(base);
    }
    return {
      t: 's', k: this.tick, ack: me ? me.seq : 0, cd: r1(this.cd),
      left: r1(Math.max(0, this.duration - this.time)),
      f: fs, ev,
    };
  }

  results() {
    return [...this.fighters.values()]
      .map((f) => ({ id: f.id, name: f.name, char: f.char, bot: f.bot, stocks: Math.max(0, f.stocks), kos: f.kos, falls: f.falls, dmg: Math.round(f.dmg), out: f.out }))
      .sort((a, b) => b.stocks - a.stocks || (b.out || 1e9) - (a.out || 1e9) || b.kos - a.kos || a.dmg - b.dmg);
  }
}

module.exports = { Sim };
