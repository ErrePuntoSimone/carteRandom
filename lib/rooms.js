'use strict';
// Gestore generico di stanze multiplayer: codici, giocatori con token,
// aggiornamenti in tempo reale via Server-Sent Events, rientro, uscita e pulizia.
// Ogni minigioco fornisce il proprio stato (`room.game`) e la funzione `view`.
const crypto = require('crypto');
const { httpError, sendJson, readBody } = require('./http');

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function cleanName(name) {
  return String(name || '').replace(/\s+/g, ' ').trim().slice(0, 24);
}
const newId = () => crypto.randomBytes(12).toString('hex');

/**
 * @param {object} opts
 * @param {(host) => any} opts.createGame          stato iniziale del gioco
 * @param {(room, player) => void} [opts.onJoin]   nuovo giocatore entrato
 * @param {(room, player) => void} [opts.onLeave]  giocatore uscito o rimosso
 * @param {(room, viewerId) => object} opts.view   stato inviato a ogni giocatore
 * @param {object} opts.actions                    { nome: (room, player, body) => any }
 */
function createRoomManager(opts) {
  const maxPlayers = opts.maxPlayers || 30;
  const ttl = opts.ttlMs || 1000 * 60 * 60 * 6;
  const rooms = new Map();

  function newCode() {
    let code;
    do {
      code = '';
      for (let i = 0; i < 5; i++) code += CODE_ALPHABET[crypto.randomInt(CODE_ALPHABET.length)];
    } while (rooms.has(code));
    return code;
  }

  function stateOf(room, viewerId) {
    return {
      code: room.code,
      hostId: room.hostId,
      you: viewerId,
      members: [...room.players.values()].map((p) => ({ id: p.id, name: p.name, online: p.streams.size > 0 })),
      ...opts.view(room, viewerId),
    };
  }

  function broadcast(room) {
    for (const p of room.players.values()) {
      if (!p.streams.size) continue;
      const data = `event: state\ndata: ${JSON.stringify(stateOf(room, p.id))}\n\n`;
      for (const res of p.streams) res.write(data);
    }
  }

  function disconnect(player, reason) {
    for (const res of player.streams) {
      res.write(`event: kicked\ndata: ${JSON.stringify({ reason })}\n\n`);
      res.end();
    }
    player.streams.clear();
  }

  function getRoom(code) {
    const room = rooms.get(String(code || '').toUpperCase());
    if (!room) throw httpError(404, 'Stanza non trovata.');
    room.lastActivity = Date.now();
    return room;
  }

  function auth(room, playerId, token) {
    const p = room.players.get(playerId);
    if (!p || p.token !== token) throw httpError(403, 'Giocatore non riconosciuto.');
    return p;
  }

  function newPlayer(name) {
    return { id: newId(), token: newId(), name, streams: new Set() };
  }

  const isHost = (room, player) => room.hostId === player.id;
  function requireHost(room, player) {
    if (!isHost(room, player)) throw httpError(403, 'Solo chi ha creato la stanza può farlo.');
  }

  function removePlayer(room, player, reason) {
    room.players.delete(player.id);
    if (opts.onLeave) opts.onLeave(room, player);
    disconnect(player, reason);
    if (room.players.size === 0) { rooms.delete(room.code); return; }
    if (room.hostId === player.id) room.hostId = room.players.keys().next().value;
    broadcast(room);
  }

  // parts: percorso dopo /api/<gioco>, es. ['rooms', 'ABCDE', 'join']
  async function handleApi(req, res, url, parts) {
    if (parts[0] !== 'rooms') throw httpError(404, 'Non trovato');

    if (req.method === 'POST' && parts.length === 1) {
      const body = await readBody(req);
      const name = cleanName(body.name);
      if (!name) throw httpError(400, 'Inserisci un nome.');
      const host = newPlayer(name);
      const room = {
        code: newCode(), hostId: host.id, players: new Map([[host.id, host]]),
        lastActivity: Date.now(), game: null,
      };
      room.game = opts.createGame(host, room);
      rooms.set(room.code, room);
      return sendJson(res, 201, { code: room.code, playerId: host.id, token: host.token });
    }

    const room = getRoom(parts[1]);
    const action = parts[2];

    if (req.method === 'GET' && action === 'events') {
      const p = auth(room, url.searchParams.get('playerId'), url.searchParams.get('token'));
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

    if (action === 'join') {
      const existing = room.players.get(body.playerId);
      if (existing && existing.token === body.token) {
        return sendJson(res, 200, { code: room.code, playerId: existing.id, token: existing.token });
      }
      const name = cleanName(body.name);
      if (!name) throw httpError(400, 'Inserisci un nome.');
      if (room.players.size >= maxPlayers) throw httpError(400, 'La stanza è piena.');
      if ([...room.players.values()].some((p) => p.name.toLowerCase() === name.toLowerCase())) {
        throw httpError(409, 'Questo nome è già usato nella stanza.');
      }
      const player = newPlayer(name);
      room.players.set(player.id, player);
      if (opts.onJoin) opts.onJoin(room, player);
      broadcast(room);
      return sendJson(res, 201, { code: room.code, playerId: player.id, token: player.token });
    }

    const player = auth(room, body.playerId, body.token);

    if (action === 'leave') {
      removePlayer(room, player, 'Hai lasciato la stanza.');
      return sendJson(res, 200, { ok: true });
    }
    if (action === 'kick') {
      requireHost(room, player);
      const target = room.players.get(body.targetId);
      if (!target || target.id === player.id) throw httpError(400, 'Giocatore non valido.');
      removePlayer(room, target, 'Sei stato rimosso dalla stanza.');
      return sendJson(res, 200, { ok: true });
    }

    const fn = opts.actions && Object.prototype.hasOwnProperty.call(opts.actions, action) && opts.actions[action];
    if (!fn) throw httpError(404, 'Non trovato');
    const result = fn(room, player, body, { requireHost, isHost });
    broadcast(room);
    return sendJson(res, 200, { ok: true, ...(result || {}) });
  }

  setInterval(() => {
    const now = Date.now();
    for (const [code, room] of rooms) {
      const anyoneOnline = [...room.players.values()].some((p) => p.streams.size > 0);
      if (!anyoneOnline && now - room.lastActivity > ttl) rooms.delete(code);
    }
  }, 60 * 1000).unref();

  return { rooms, handleApi, broadcast };
}

module.exports = { createRoomManager, cleanName };
