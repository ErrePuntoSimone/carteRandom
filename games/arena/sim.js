'use strict';
// Simulazione autorevole di "Rissa": gira sul server a 20 passi al secondo.
const A = require('../../public/arena/shared');

const MAX_AMMO = 3;
const SHOT_COOLDOWN = 0.32;
const RESPAWN = 3;
const SPAWN_SHIELD = 1.5;
const REGEN_DELAY = 3;
const REGEN_RATE = 0.13; // frazione della vita al secondo
const REVEAL_DIST = 170;

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const r2 = (v) => Math.round(v * 100) / 100;
const r1 = (v) => Math.round(v * 10) / 10;

class Sim {
  /**
   * @param {object} o
   * @param {{id, name, char, bot?}[]} o.players
   * @param {number} [o.duration] durata in secondi
   * @param {number} [o.target]   KO per vincere
   * @param {() => number} [o.rng]
   */
  constructor({ players, duration = 120, target = 10, rng = Math.random }) {
    this.rng = rng;
    this.duration = duration;
    this.target = target;
    this.time = 0;
    this.tick = 0;
    this.over = false;
    this.bullets = [];
    this.events = [];
    this.nextBullet = 1;
    this.players = new Map();
    players.forEach((p, i) => this.addPlayer(p, i));
  }

  addPlayer({ id, name, char, bot }, i = this.players.size) {
    const c = A.CHARS[char] ? char : 'folgore';
    const def = A.CHARS[c];
    const sp = A.MAP.spawns[i % A.MAP.spawns.length];
    this.players.set(id, {
      id, name, char: c, bot: !!bot, def,
      x: sp.x, y: sp.y, hp: def.hp, maxHp: def.hp, alive: true, respawnAt: 0, shield: SPAWN_SHIELD,
      kills: 0, deaths: 0, damage: 0,
      ammo: MAX_AMMO, reloadT: 0, cooldown: 0, superV: 0,
      aim: 0, faceX: 1, faceY: 0, lastHurt: -99, lastAttack: -99,
      queue: [], input: { mx: 0, my: 0, ax: 0, ay: 0 }, seq: 0,
      fireReq: 0, fireDone: 0, supReq: 0, supDone: 0,
      dash: null,
      brain: bot ? { strafe: 1, strafeT: 0, stuckT: 0, wander: null, wanderT: 0, lastX: sp.x, lastY: sp.y } : null,
    });
  }

  removePlayer(id) { this.players.delete(id); }

  // Input dal telefono: un messaggio ogni 50 ms con numero progressivo.
  pushInput(id, m) {
    const p = this.players.get(id);
    if (!p || p.bot) return;
    const s = Math.floor(Number(m.s));
    if (!(s > p.seq) || (p.queue.length && s <= p.queue[p.queue.length - 1].s)) return;
    const num = (v) => (Number.isFinite(Number(v)) ? A.clamp(Number(v), -1, 1) : 0);
    p.queue.push({ s, mx: num(m.mx), my: num(m.my), ax: num(m.ax), ay: num(m.ay) });
    if (p.queue.length > 8) p.queue.splice(0, p.queue.length - 8);
    const f = Math.floor(Number(m.f)), u = Math.floor(Number(m.u));
    if (f > p.fireReq) p.fireReq = f;
    if (u > p.supReq) p.supReq = u;
  }

  // ---------- passo di simulazione ----------
  step() {
    if (this.over) return;
    const dt = A.TICK;
    this.time += dt;
    this.tick += 1;
    this.events = [];

    for (const p of this.players.values()) {
      if (!p.alive) {
        if (this.time >= p.respawnAt) this.respawn(p);
        else continue;
      }
      if (p.bot) this.think(p);
      p.shield = Math.max(0, p.shield - dt);

      // movimento: un passo per ogni input ricevuto (2 se il telefono è in ritardo)
      if (p.dash) {
        this.stepDash(p, dt);
      } else if (p.bot) {
        A.stepMove(p, p.input.mx, p.input.my, p.def.speed, p.def.radius, dt);
      } else {
        const n = p.queue.length > 3 ? 2 : p.queue.length ? 1 : 0;
        for (let k = 0; k < n; k++) {
          const inp = p.queue.shift();
          p.input = inp;
          p.seq = inp.s;
          A.stepMove(p, inp.mx, inp.my, p.def.speed, p.def.radius, dt);
        }
      }
      if (Math.hypot(p.input.mx, p.input.my) > 0.2) { p.faceX = p.input.mx; p.faceY = p.input.my; }
      if (Math.hypot(p.input.ax, p.input.ay) > 0.2) p.aim = Math.atan2(p.input.ay, p.input.ax);
      else if (Math.hypot(p.input.mx, p.input.my) > 0.2) p.aim = Math.atan2(p.faceY, p.faceX);

      // ricarica e colpi
      p.cooldown = Math.max(0, p.cooldown - dt);
      if (p.ammo < MAX_AMMO) {
        p.reloadT += dt;
        if (p.reloadT >= p.def.attack.reload) { p.ammo += 1; p.reloadT = 0; }
      } else p.reloadT = 0;
      if (p.fireReq > p.fireDone && p.cooldown <= 0 && p.ammo >= 1 && !p.dash) {
        p.fireDone = p.fireReq;
        this.shoot(p);
      } else if (p.fireReq > p.fireDone && p.ammo < 1) {
        p.fireDone = p.fireReq; // senza munizioni il colpo va perso
      }
      if (p.supReq > p.supDone) {
        p.supDone = p.supReq;
        if (p.superV >= 1 && !p.dash) this.useSuper(p);
      }

      // rigenerazione
      if (this.time - p.lastHurt > REGEN_DELAY && this.time - p.lastAttack > REGEN_DELAY - 1 && p.hp < p.maxHp) {
        p.hp = Math.min(p.maxHp, p.hp + p.maxHp * REGEN_RATE * dt);
      }
    }

    this.stepBullets(dt);

    const top = Math.max(0, ...[...this.players.values()].map((p) => p.kills));
    if (this.time >= this.duration || top >= this.target) this.over = true;
  }

  respawn(p) {
    // il punto più lontano dai nemici vivi
    const enemies = [...this.players.values()].filter((o) => o !== p && o.alive);
    let best = A.MAP.spawns[0], bestD = -1;
    for (const s of A.MAP.spawns) {
      const d = enemies.length ? Math.min(...enemies.map((e) => dist(e, s))) : this.rng() * 1000;
      if (d > bestD) { bestD = d; best = s; }
    }
    Object.assign(p, {
      x: best.x, y: best.y, hp: p.maxHp, alive: true, shield: SPAWN_SHIELD,
      ammo: MAX_AMMO, reloadT: 0, cooldown: 0, dash: null, lastHurt: -99,
    });
    p.queue.length = 0;
    this.events.push({ t: 'spawn', id: p.id, x: p.x, y: p.y });
  }

  // direzione di tiro: quella scelta, oppure mira automatica sul nemico più vicino
  aimDir(p, range) {
    if (Math.hypot(p.input.ax, p.input.ay) > 0.2) {
      const l = Math.hypot(p.input.ax, p.input.ay);
      return { x: p.input.ax / l, y: p.input.ay / l };
    }
    let best = null, bestD = range * 1.15;
    for (const o of this.players.values()) {
      if (o === p || !o.alive || !this.canSee(p, o)) continue;
      const d = dist(p, o);
      if (d < bestD) { bestD = d; best = o; }
    }
    if (best) {
      const d = dist(p, best) || 1;
      return { x: (best.x - p.x) / d, y: (best.y - p.y) / d };
    }
    return { x: Math.cos(p.aim), y: Math.sin(p.aim) };
  }

  shoot(p) {
    const a = p.def.attack;
    const dir = this.aimDir(p, a.range);
    const base = Math.atan2(dir.y, dir.x);
    p.aim = base;
    p.ammo -= 1;
    p.cooldown = SHOT_COOLDOWN;
    p.lastAttack = this.time;
    for (let i = 0; i < a.count; i++) {
      const ang = a.count === 1 ? base : base - a.spread / 2 + (a.spread * i) / (a.count - 1);
      this.spawnBullet(p, ang, a.speed, a.range, a.damage, a.r, 'shot');
    }
    this.events.push({ t: 'shot', id: p.id, a: r2(base) });
  }

  spawnBullet(p, ang, speed, range, damage, r, kind, pierce = false) {
    const off = p.def.radius + 4;
    this.bullets.push({
      id: this.nextBullet++, owner: p.id, char: p.char, kind,
      x: p.x + Math.cos(ang) * off, y: p.y + Math.sin(ang) * off,
      vx: Math.cos(ang) * speed, vy: Math.sin(ang) * speed,
      left: range, damage, r, pierce, hit: new Set(),
    });
  }

  useSuper(p) {
    p.superV = 0;
    p.lastAttack = this.time;
    const dir = this.aimDir(p, p.char === 'falco' ? 1250 : 400);
    p.aim = Math.atan2(dir.y, dir.x);
    if (p.char === 'folgore') {
      p.dash = { t: 0.22, vx: dir.x * 1500, vy: dir.y * 1500, hit: new Set() };
      p.shield = Math.max(p.shield, 0.25);
    } else if (p.char === 'macigno') {
      const R = 250;
      for (const o of this.players.values()) {
        if (o === p || !o.alive) continue;
        const d = dist(p, o);
        if (d > R + o.def.radius) continue;
        this.damage(o, 1500, p, true);
        if (o.alive) {
          const k = d || 1;
          A.moveCircle(o, ((o.x - p.x) / k) * 150, ((o.y - p.y) / k) * 150, o.def.radius);
        }
      }
      this.events.push({ t: 'wave', id: p.id, x: r1(p.x), y: r1(p.y), r: R });
    } else {
      this.spawnBullet(p, p.aim, 1500, 1250, 1700, 13, 'super', true);
    }
    this.events.push({ t: 'super', id: p.id });
  }

  stepDash(p, dt) {
    const d = p.dash;
    const step = Math.min(dt, d.t);
    A.moveCircle(p, d.vx * step, d.vy * step, p.def.radius);
    for (const o of this.players.values()) {
      if (o === p || !o.alive || d.hit.has(o.id)) continue;
      if (dist(p, o) < p.def.radius + o.def.radius + 6) {
        d.hit.add(o.id);
        this.damage(o, 1000, p, true);
      }
    }
    d.t -= dt;
    if (d.t <= 0) p.dash = null;
  }

  stepBullets(dt) {
    const keep = [];
    for (const b of this.bullets) {
      let alive = true;
      // sotto-passi per non "saltare" i bersagli
      const speed = Math.hypot(b.vx, b.vy);
      const n = Math.max(1, Math.ceil((speed * dt) / 18));
      for (let k = 0; k < n && alive; k++) {
        const sx = (b.vx * dt) / n, sy = (b.vy * dt) / n;
        b.x += sx; b.y += sy;
        b.left -= Math.hypot(sx, sy);
        if (b.left <= 0 || A.hitsWall(b.x, b.y, b.r)) { alive = false; break; }
        for (const o of this.players.values()) {
          if (o.id === b.owner || !o.alive || b.hit.has(o.id)) continue;
          if (Math.hypot(o.x - b.x, o.y - b.y) < o.def.radius + b.r) {
            b.hit.add(o.id);
            const owner = this.players.get(b.owner);
            this.damage(o, b.damage, owner, b.kind === 'super');
            if (!b.pierce) { alive = false; break; }
          }
        }
      }
      if (alive) keep.push(b);
      else this.events.push({ t: 'pop', x: r1(b.x), y: r1(b.y), c: b.char });
    }
    this.bullets = keep;
  }

  damage(o, amount, from, isSuper = false) {
    if (!o.alive || o.shield > 0) return;
    const amt = Math.min(o.hp, amount);
    o.hp -= amount;
    o.lastHurt = this.time;
    if (from && from !== o) {
      from.damage += amt;
      if (!isSuper) from.superV = Math.min(1, from.superV + amount / from.def.superCharge);
    }
    this.events.push({ t: 'hit', id: o.id, n: Math.round(amount), x: r1(o.x), y: r1(o.y) });
    if (o.hp <= 0) {
      o.hp = 0;
      o.alive = false;
      o.deaths += 1;
      o.respawnAt = this.time + RESPAWN;
      o.dash = null;
      if (from && from !== o) from.kills += 1;
      this.events.push({ t: 'ko', id: o.id, by: from ? from.id : null, x: r1(o.x), y: r1(o.y) });
    }
  }

  // nei cespugli si è invisibili, tranne da vicino o subito dopo aver attaccato
  canSee(viewer, o) {
    if (!viewer || viewer === o) return true;
    if (!A.inBush(o.x, o.y)) return true;
    if (this.time - o.lastAttack < 1) return true;
    return dist(viewer, o) < REVEAL_DIST;
  }

  // ---------- bot ----------
  think(p) {
    const br = p.brain;
    const dt = A.TICK;
    let target = null, bestD = Infinity;
    for (const o of this.players.values()) {
      if (o === p || !o.alive || !this.canSee(p, o)) continue;
      const d = dist(p, o);
      if (d < bestD) { bestD = d; target = o; }
    }
    // bloccato contro un muro? per un po' va in una direzione a caso
    const moved = Math.hypot(p.x - br.lastX, p.y - br.lastY);
    br.lastX = p.x; br.lastY = p.y;
    const wantMove = Math.hypot(p.input.mx, p.input.my) > 0.3;
    br.stuckT = wantMove && moved < 2 ? br.stuckT + dt : 0;
    if (br.stuckT > 0.35) { br.wanderT = 0.7; br.wander = this.rng() * Math.PI * 2; br.stuckT = 0; }

    br.strafeT -= dt;
    if (br.strafeT <= 0) { br.strafe = this.rng() < 0.5 ? -1 : 1; br.strafeT = 0.8 + this.rng() * 1.4; }

    let mx = 0, my = 0, ax = 0, ay = 0;
    const range = p.def.attack.range;
    if (br.wanderT > 0) {
      br.wanderT -= dt;
      mx = Math.cos(br.wander); my = Math.sin(br.wander);
    } else if (target) {
      const dx = (target.x - p.x) / bestD, dy = (target.y - p.y) / bestD;
      const want = range * 0.62;
      if (bestD > want + 60) { mx = dx; my = dy; } else if (bestD < want - 80) { mx = -dx; my = -dy; }
      mx += -dy * br.strafe * 0.8; my += dx * br.strafe * 0.8;
    } else {
      const c = { x: A.MAP.w / 2 + Math.cos(this.time * 0.4 + p.x) * 400, y: A.MAP.h / 2 + Math.sin(this.time * 0.3) * 300 };
      const d = dist(p, c) || 1;
      mx = (c.x - p.x) / d; my = (c.y - p.y) / d;
    }
    if (target) {
      const noise = (this.rng() - 0.5) * 0.22;
      const ang = Math.atan2(target.y - p.y, target.x - p.x) + noise;
      ax = Math.cos(ang); ay = Math.sin(ang);
      if (bestD < range * 0.95 && p.ammo >= 1 && p.cooldown <= 0 && this.rng() < 0.22) p.fireReq += 1;
      const superRange = p.char === 'macigno' ? 230 : p.char === 'folgore' ? 330 : 1100;
      if (p.superV >= 1 && bestD < superRange && this.rng() < 0.3) p.supReq += 1;
    }
    p.input = { mx, my, ax, ay };
  }

  // ---------- stato da inviare ----------
  snapshot(viewerId) {
    const viewer = this.players.get(viewerId);
    const players = [];
    for (const o of this.players.values()) {
      if (!this.canSee(viewer, o)) continue;
      players.push({
        id: o.id, x: r1(o.x), y: r1(o.y), hp: Math.round(o.hp), mh: o.maxHp, c: o.char,
        a: r2(o.aim), al: o.alive, sh: o.shield > 0, d: !!o.dash,
        ...(o.id === viewerId ? {
          am: r2(o.ammo + (o.ammo < MAX_AMMO ? o.reloadT / o.def.attack.reload : 0)),
          sp: r2(o.superV), rs: o.alive ? 0 : r1(Math.max(0, o.respawnAt - this.time)),
        } : { sp: o.superV >= 1 ? 1 : 0 }),
      });
    }
    return {
      t: 's', k: this.tick, ack: viewer ? viewer.seq : 0,
      left: r1(Math.max(0, this.duration - this.time)),
      p: players,
      b: this.bullets.map((b) => ({ id: b.id, x: r1(b.x), y: r1(b.y), c: b.char, s: b.kind === 'super' ? 1 : 0 })),
      ev: this.events,
      sc: [...this.players.values()].map((o) => ({ id: o.id, n: o.name, k: o.kills, c: o.char })),
    };
  }

  results() {
    return [...this.players.values()]
      .map((p) => ({ id: p.id, name: p.name, char: p.char, bot: p.bot, kills: p.kills, deaths: p.deaths, damage: Math.round(p.damage) }))
      .sort((a, b) => b.kills - a.kills || a.deaths - b.deaths || b.damage - a.damage);
  }
}

module.exports = { Sim, MAX_AMMO, RESPAWN };
