'use strict';
// Minigioco "Rissa": arena d'azione in tempo reale, tutti contro tutti.
// Sala d'attesa con le stanze comuni (lib/rooms.js), partita su WebSocket.
const A = require('../../public/arena/shared');
const { Sim } = require('./sim');
const { createRoomManager } = require('../../lib/rooms');
const { httpError } = require('../../lib/http');
const { acceptWebSocket } = require('../../lib/ws');

const MAX_FIGHTERS = 6;
const BOT_NAMES = ['Bullone', 'Ruggine', 'Scintilla', 'Trottola', 'Fischio', 'Pepe'];
const durationSec = () => Number(process.env.ARENA_DURATION) || 120;
const charOk = (c) => Object.prototype.hasOwnProperty.call(A.CHARS, c);
const fighters = (g, room) => room.players.size + g.bots.length;

function stopMatch(g) {
  if (g.loop) clearInterval(g.loop);
  g.loop = null;
  g.sim = null;
}

const manager = createRoomManager({
  maxPlayers: MAX_FIGHTERS,
  createGame(host) {
    return { phase: 'lobby', picks: { [host.id]: 'folgore' }, bots: [], sim: null, loop: null, results: null, matchNo: 0, sockets: new Map() };
  },
  canJoin(room) {
    const g = room.game;
    if (g.phase === 'playing') return 'La partita è in corso: entra alla prossima.';
    return fighters(g, room) >= MAX_FIGHTERS ? 'L\'arena è piena.' : null;
  },
  onJoin(room, player) {
    const chars = Object.keys(A.CHARS);
    room.game.picks[player.id] = chars[room.players.size % chars.length];
  },
  onLeave(room, player) {
    const g = room.game;
    delete g.picks[player.id];
    const set = g.sockets.get(player.id);
    if (set) for (const ws of set) ws.close();
    g.sockets.delete(player.id);
    if (g.sim) g.sim.removePlayer(player.id);
    if (room.players.size === 0) stopMatch(g);
  },
  view(room) {
    const g = room.game;
    return {
      game: {
        phase: g.phase,
        matchNo: g.matchNo,
        picks: g.picks,
        bots: g.bots.map((b) => ({ id: b.id, name: b.name, char: b.char })),
        results: g.results,
        max: MAX_FIGHTERS,
      },
    };
  },
  actions: {
    pick(room, player, body) {
      const g = room.game;
      if (g.phase === 'playing') throw httpError(400, 'Cambia personaggio a fine partita.');
      if (!charOk(body.char)) throw httpError(400, 'Personaggio sconosciuto.');
      g.picks[player.id] = body.char;
    },
    addBot(room, player, body, { requireHost }) {
      requireHost(room, player);
      const g = room.game;
      if (g.phase === 'playing') throw httpError(400, 'Aspetta la fine della partita.');
      if (fighters(g, room) >= MAX_FIGHTERS) throw httpError(400, 'L\'arena è piena.');
      const used = new Set(g.bots.map((b) => b.base));
      const base = BOT_NAMES.find((n) => !used.has(n)) || `Bot ${g.bots.length + 1}`;
      const chars = Object.keys(A.CHARS);
      const char = charOk(body.char) ? body.char : chars[Math.floor(Math.random() * chars.length)];
      g.bots.push({ id: 'bot-' + Math.random().toString(36).slice(2, 9), base, name: `${base} 🤖`, char });
    },
    removeBot(room, player, body, { requireHost }) {
      requireHost(room, player);
      const g = room.game;
      if (g.phase === 'playing') throw httpError(400, 'Aspetta la fine della partita.');
      g.bots = g.bots.filter((b) => b.id !== body.botId);
    },
    start(room, player, body, { requireHost }) {
      requireHost(room, player);
      const g = room.game;
      if (g.phase === 'playing') throw httpError(400, 'La partita è già in corso.');
      if (fighters(g, room) < 2) throw httpError(400, 'Servono almeno 2 lottatori: invita qualcuno o aggiungi un bot.');
      const list = [
        ...[...room.players.values()].map((p) => ({ id: p.id, name: p.name, char: g.picks[p.id] || 'folgore' })),
        ...g.bots.map((b) => ({ id: b.id, name: b.name, char: b.char, bot: true })),
      ];
      // posizioni di partenza mescolate
      for (let i = list.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [list[i], list[j]] = [list[j], list[i]]; }
      g.sim = new Sim({ players: list, duration: durationSec() });
      g.phase = 'playing';
      g.results = null;
      g.matchNo += 1;
      const sim = g.sim;
      g.loop = setInterval(() => {
        if (manager.rooms.get(room.code) !== room || g.sim !== sim) { clearInterval(g.loop); return; }
        sim.step();
        for (const [id, set] of g.sockets) {
          if (!set.size) continue;
          const msg = JSON.stringify(sim.snapshot(id));
          for (const ws of set) ws.send(msg);
        }
        if (sim.over) {
          g.results = sim.results();
          g.phase = 'results';
          const end = JSON.stringify({ t: 'end', results: g.results });
          for (const set of g.sockets.values()) for (const ws of set) ws.send(end);
          stopMatch(g);
          manager.broadcast(room);
        }
      }, A.TICK * 1000);
      g.loop.unref?.();
    },
  },
});

// WebSocket della partita: /api/arena/rooms/CODICE/ws?playerId=…&token=…
function handleUpgrade(req, socket, head, url, parts) {
  const reject = (code, msg) => { socket.end(`HTTP/1.1 ${code} ${msg}\r\nConnection: close\r\n\r\n`); };
  if (parts[0] !== 'rooms' || parts[2] !== 'ws') return reject(404, 'Not Found');
  const room = manager.rooms.get(String(parts[1] || '').toUpperCase());
  if (!room) return reject(404, 'Not Found');
  const player = room.players.get(url.searchParams.get('playerId'));
  if (!player || player.token !== url.searchParams.get('token')) return reject(403, 'Forbidden');
  const ws = acceptWebSocket(req, socket, head);
  if (!ws) return;
  const g = room.game;
  if (!g.sockets.has(player.id)) g.sockets.set(player.id, new Set());
  g.sockets.get(player.id).add(ws);
  room.lastActivity = Date.now();
  ws.on('message', (text) => {
    if (text.length > 512) return;
    let m;
    try { m = JSON.parse(text); } catch { return; }
    if (m && m.t === 'in' && g.sim) g.sim.pushInput(player.id, m);
  });
  ws.on('close', () => {
    const set = g.sockets.get(player.id);
    if (set) { set.delete(ws); if (!set.size) g.sockets.delete(player.id); }
  });
  ws.send(JSON.stringify({ t: 'hello', phase: g.phase, matchNo: g.matchNo }));
}

module.exports = { handleApi: manager.handleApi, handleUpgrade, rooms: manager.rooms };
