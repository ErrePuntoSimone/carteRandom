'use strict';
// Server senza dipendenze: HTTP + Server-Sent Events per gli aggiornamenti in tempo reale.
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { buildDeck, DECKS } = require('./decks');

const PORT = Number(process.env.PORT) || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');
const ROOM_TTL_MS = 1000 * 60 * 60 * 6; // stanze inattive eliminate dopo 6 ore
const MAX_PLAYERS = 60;

/** @type {Map<string, Room>} */
const rooms = new Map();

function newId() {
  return crypto.randomBytes(12).toString('hex');
}

function newRoomCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code;
  do {
    code = '';
    for (let i = 0; i < 5; i++) code += alphabet[crypto.randomInt(alphabet.length)];
  } while (rooms.has(code));
  return code;
}

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function cleanName(name) {
  return String(name || '').replace(/\s+/g, ' ').trim().slice(0, 24);
}

function createRoom(hostName) {
  const code = newRoomCode();
  const host = { id: newId(), token: newId(), name: hostName, card: null, streams: new Set() };
  const room = {
    code,
    hostId: host.id,
    players: new Map([[host.id, host]]),
    deckId: 'francesi',
    customCards: [],
    round: 0,
    revealed: false,
    lastActivity: Date.now(),
  };
  rooms.set(code, room);
  return { room, player: host };
}

function publicState(room, viewerId) {
  return {
    code: room.code,
    hostId: room.hostId,
    you: viewerId,
    deckId: room.deckId,
    customCards: room.customCards,
    round: room.round,
    revealed: room.revealed,
    players: [...room.players.values()].map((p) => ({
      id: p.id,
      name: p.name,
      online: p.streams.size > 0,
      hasCard: !!p.card,
      card: p.id === viewerId || room.revealed ? p.card : null,
    })),
  };
}

function broadcast(room) {
  for (const p of room.players.values()) {
    const data = `event: state\ndata: ${JSON.stringify(publicState(room, p.id))}\n\n`;
    for (const res of p.streams) res.write(data);
  }
}

function closeRoomFor(player, reason) {
  for (const res of player.streams) {
    res.write(`event: kicked\ndata: ${JSON.stringify({ reason })}\n\n`);
    res.end();
  }
  player.streams.clear();
}

function deal(room) {
  const deck = buildDeck(room.deckId, room.customCards);
  const players = [...room.players.values()];
  if (deck.length === 0) throw httpError(400, 'Il mazzo è vuoto.');
  if (players.length > deck.length) {
    throw httpError(400, `Ci sono ${players.length} giocatori ma il mazzo ha solo ${deck.length} carte.`);
  }
  const cards = shuffle(deck);
  players.forEach((p, i) => { p.card = cards[i]; });
  room.round += 1;
  room.revealed = false;
}

function httpError(status, message) {
  const e = new Error(message);
  e.status = status;
  return e;
}

// ---------- HTTP helpers ----------
function sendJson(res, status, body) {
  const data = JSON.stringify(body);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(data);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > 64 * 1024) { reject(httpError(413, 'Richiesta troppo grande.')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      if (!chunks.length) return resolve({});
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
      catch { reject(httpError(400, 'JSON non valido.')); }
    });
    req.on('error', reject);
  });
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json; charset=utf-8',
};

function serveStatic(req, res, pathname) {
  let rel = pathname === '/' ? '/index.html' : pathname;
  const file = path.normalize(path.join(PUBLIC_DIR, rel));
  if (!file.startsWith(PUBLIC_DIR + path.sep)) return sendJson(res, 403, { error: 'Vietato' });
  fs.readFile(file, (err, data) => {
    if (err) {
      // fallback SPA: /r/CODICE -> index.html
      if (!path.extname(rel)) {
        return fs.readFile(path.join(PUBLIC_DIR, 'index.html'), (e2, html) => {
          if (e2) return sendJson(res, 500, { error: 'Errore interno' });
          res.writeHead(200, { 'Content-Type': MIME['.html'] });
          res.end(html);
        });
      }
      return sendJson(res, 404, { error: 'Non trovato' });
    }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
    res.end(data);
  });
}

function getRoom(code) {
  const room = rooms.get(String(code || '').toUpperCase());
  if (!room) throw httpError(404, 'Stanza non trovata.');
  room.lastActivity = Date.now();
  return room;
}

function auth(room, body) {
  const p = room.players.get(body.playerId);
  if (!p || p.token !== body.token) throw httpError(403, 'Giocatore non riconosciuto.');
  return p;
}

function requireHost(room, player) {
  if (room.hostId !== player.id) throw httpError(403, 'Solo chi ha creato la stanza può farlo.');
}

// ---------- Routes ----------
async function handleApi(req, res, url) {
  const parts = url.pathname.split('/').filter(Boolean); // ['api', ...]

  if (req.method === 'GET' && parts[1] === 'decks') {
    return sendJson(res, 200, Object.entries(DECKS).map(([id, d]) => ({ id, name: d.name, size: d.size })));
  }

  if (req.method === 'POST' && parts.length === 2 && parts[1] === 'rooms') {
    const body = await readBody(req);
    const name = cleanName(body.name);
    if (!name) throw httpError(400, 'Inserisci un nome.');
    const { room, player } = createRoom(name);
    return sendJson(res, 201, { code: room.code, playerId: player.id, token: player.token });
  }

  if (parts[1] !== 'rooms' || !parts[2]) throw httpError(404, 'Non trovato');
  const room = getRoom(parts[2]);
  const action = parts[3];

  if (req.method === 'GET' && action === 'events') {
    const p = room.players.get(url.searchParams.get('playerId'));
    if (!p || p.token !== url.searchParams.get('token')) throw httpError(403, 'Giocatore non riconosciuto.');
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-store',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    res.write('retry: 2000\n\n');
    p.streams.add(res);
    broadcast(room);
    const ping = setInterval(() => res.write(': ping\n\n'), 20000);
    req.on('close', () => {
      clearInterval(ping);
      p.streams.delete(res);
      if (rooms.get(room.code) === room) broadcast(room);
    });
    return;
  }

  if (req.method !== 'POST') throw httpError(405, 'Metodo non consentito.');
  const body = await readBody(req);

  switch (action) {
    case 'join': {
      // rientro con credenziali esistenti
      const existing = room.players.get(body.playerId);
      if (existing && existing.token === body.token) {
        return sendJson(res, 200, { code: room.code, playerId: existing.id, token: existing.token });
      }
      const name = cleanName(body.name);
      if (!name) throw httpError(400, 'Inserisci un nome.');
      if (room.players.size >= MAX_PLAYERS) throw httpError(400, 'La stanza è piena.');
      if ([...room.players.values()].some((p) => p.name.toLowerCase() === name.toLowerCase())) {
        throw httpError(409, 'Questo nome è già usato nella stanza.');
      }
      const player = { id: newId(), token: newId(), name, card: null, streams: new Set() };
      room.players.set(player.id, player);
      broadcast(room);
      return sendJson(res, 201, { code: room.code, playerId: player.id, token: player.token });
    }
    case 'settings': {
      const p = auth(room, body);
      requireHost(room, p);
      if (body.deckId !== undefined) {
        if (!DECKS[body.deckId]) throw httpError(400, 'Mazzo sconosciuto.');
        room.deckId = body.deckId;
      }
      if (Array.isArray(body.customCards)) {
        room.customCards = body.customCards
          .map((c) => String(c).trim().slice(0, 40))
          .filter(Boolean)
          .slice(0, 200);
      }
      broadcast(room);
      return sendJson(res, 200, { ok: true });
    }
    case 'deal': {
      const p = auth(room, body);
      requireHost(room, p);
      deal(room);
      broadcast(room);
      return sendJson(res, 200, { ok: true, round: room.round });
    }
    case 'reveal': {
      const p = auth(room, body);
      requireHost(room, p);
      room.revealed = !!body.revealed;
      broadcast(room);
      return sendJson(res, 200, { ok: true });
    }
    case 'kick': {
      const p = auth(room, body);
      requireHost(room, p);
      const target = room.players.get(body.targetId);
      if (!target || target.id === p.id) throw httpError(400, 'Giocatore non valido.');
      room.players.delete(target.id);
      closeRoomFor(target, 'Sei stato rimosso dalla stanza.');
      broadcast(room);
      return sendJson(res, 200, { ok: true });
    }
    case 'leave': {
      const p = auth(room, body);
      room.players.delete(p.id);
      closeRoomFor(p, 'Hai lasciato la stanza.');
      if (room.players.size === 0) {
        rooms.delete(room.code);
      } else {
        if (room.hostId === p.id) room.hostId = room.players.keys().next().value;
        broadcast(room);
      }
      return sendJson(res, 200, { ok: true });
    }
    default:
      throw httpError(404, 'Non trovato');
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  try {
    if (url.pathname === '/healthz') return sendJson(res, 200, { ok: true, rooms: rooms.size });
    if (url.pathname.startsWith('/api/')) return await handleApi(req, res, url);
    if (req.method !== 'GET' && req.method !== 'HEAD') return sendJson(res, 405, { error: 'Metodo non consentito.' });
    serveStatic(req, res, url.pathname);
  } catch (err) {
    const status = err.status || 500;
    if (status === 500) console.error(err);
    if (!res.headersSent) sendJson(res, status, { error: status === 500 ? 'Errore interno.' : err.message });
  }
});

// pulizia periodica delle stanze inattive
setInterval(() => {
  const now = Date.now();
  for (const [code, room] of rooms) {
    const anyoneOnline = [...room.players.values()].some((p) => p.streams.size > 0);
    if (!anyoneOnline && now - room.lastActivity > ROOM_TTL_MS) rooms.delete(code);
  }
}, 60 * 1000).unref();

if (require.main === module) {
  server.listen(PORT, '0.0.0.0', () => console.log(`Carte Random in ascolto su http://localhost:${PORT}`));
}

module.exports = { server, rooms };
