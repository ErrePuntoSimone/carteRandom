'use strict';
// Minigioco "Briscola": tavolo da 2 o da 4 (a coppie), carte nascoste per ogni giocatore.
const B = require('./engine');
const { createRoomManager } = require('../../lib/rooms');
const { httpError } = require('../../lib/http');

// Quanto resta visibile la presa sul tavolo prima di essere raccolta.
const trickDelay = () => Number(process.env.BRISCOLA_TRICK_MS) || 1600;

const manager = createRoomManager({
  maxPlayers: 4,
  listInfo(room) { return { max: room.game.mode, label: room.game.mode === 4 ? 'A coppie (4)' : 'Sfida (2)' }; },
  createGame(host, room, body) {
    const g = B.createGame(Number(body && body.mode) === 4 ? 4 : 2);
    B.addPlayer(g, host.id, host.name);
    return g;
  },
  canJoin(room) {
    const g = room.game;
    return g.players.length >= g.mode ? `Il tavolo è pieno (${g.mode} giocatori).` : null;
  },
  onJoin(room, player) { B.addPlayer(room.game, player.id, player.name); },
  onLeave(room, player) { B.removePlayer(room.game, player.id); },
  view(room, viewerId) { return { game: B.viewFor(room.game, viewerId) }; },
  actions: {
    mode(room, player, body, { requireHost }) {
      requireHost(room, player);
      B.setMode(room.game, Number(body.mode));
    },
    seat(room, player, body, { isHost }) {
      const target = body.targetId || player.id;
      if (target !== player.id && !isHost(room, player)) throw httpError(403, 'Solo l\'host può spostare gli altri.');
      B.moveSeat(room.game, target, Number(body.dir));
    },
    start(room, player, body, { requireHost }) {
      requireHost(room, player);
      B.start(room.game);
    },
    play(room, player, body) {
      const g = room.game;
      B.play(g, player.id, String(body.cardId || ''));
      if (g.phase === 'trick') {
        const handNo = g.handNo;
        setTimeout(() => {
          // la stanza o la partita potrebbero non esserci più
          if (manager.rooms.get(room.code) !== room || g.handNo !== handNo || g.phase !== 'trick') return;
          B.collect(g);
          manager.broadcast(room);
        }, trickDelay());
      }
    },
  },
});

module.exports = { handleApi: manager.handleApi, rooms: manager.rooms };
