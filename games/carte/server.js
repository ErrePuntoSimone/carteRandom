'use strict';
// Minigioco "Carte Random": stanze multiplayer, una carta a caso per giocatore.
const crypto = require('crypto');
const { buildDeck, DECKS } = require('./decks');
const { httpError, sendJson, readBody } = require('../../lib/http');

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
    public: !!room.public,
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
// parts: percorso dopo /api/carte, es. ['rooms', 'ABCDE', 'join']
async function handleApi(req, res, url, parts) {

  if (req.method === 'GET' && parts[0] === 'decks') {
    return sendJson(res, 200, Object.entries(DECKS).map(([id, d]) => ({ id, name: d.name, size: d.size })));
  }

  if (req.method === 'GET' && parts.length === 1 && parts[0] === 'rooms') {
    const list = [];
    for (const room of rooms.values()) {
      if (!room.public || room.players.size >= MAX_PLAYERS) continue;
      const host = room.players.get(room.hostId);
      list.push({ code: room.code, host: host ? host.name : '', players: room.players.size, max: MAX_PLAYERS, label: '' });
    }
    return sendJson(res, 200, list.slice(0, 50));
  }

  if (req.method === 'POST' && parts.length === 1 && parts[0] === 'rooms') {
    const body = await readBody(req);
    const name = cleanName(body.name);
    if (!name) throw httpError(400, 'Inserisci un nome.');
    const { room, player } = createRoom(name);
    return sendJson(res, 201, { code: room.code, playerId: player.id, token: player.token });
  }

  if (parts[0] !== 'rooms' || !parts[1]) throw httpError(404, 'Non trovato');
  const room = getRoom(parts[1]);
  const action = parts[2];

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
    case 'visibility': {
      const p = auth(room, body);
      requireHost(room, p);
      room.public = !!body.public;
      broadcast(room);
      return sendJson(res, 200, { ok: true, public: room.public });
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

// pulizia periodica delle stanze inattive
setInterval(() => {
  const now = Date.now();
  for (const [code, room] of rooms) {
    const anyoneOnline = [...room.players.values()].some((p) => p.streams.size > 0);
    if (!anyoneOnline && now - room.lastActivity > ROOM_TTL_MS) rooms.delete(code);
  }
}, 60 * 1000).unref();


module.exports = { handleApi, rooms };
