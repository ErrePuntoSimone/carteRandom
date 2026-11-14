'use strict';
// Minigioco "Poker senza carte": stanze multiplayer che gestiscono
// turni, dealer, bui, puntate e fiches. Le carte sono quelle vere sul tavolo.
const E = require('./engine');
const { createRoomManager } = require('../../lib/rooms');
const { httpError } = require('../../lib/http');

// Chi può gestire il tavolo (avviare mani, assegnare piatti, agire per altri):
// l'host della stanza e il dealer della mano.
function isManager(room, player) {
  return room.hostId === player.id || room.game.dealerId === player.id;
}
function requireManager(room, player) {
  if (!isManager(room, player)) throw httpError(403, 'Solo l\'host o il dealer possono farlo.');
}

const manager = createRoomManager({
  maxPlayers: 10, // come le sedie del tavolo
  createGame(host) {
    const t = E.createTable();
    E.addPlayer(t, host.id, host.name);
    return t;
  },
  onJoin(room, player) { E.addPlayer(room.game, player.id, player.name); },
  onLeave(room, player) { E.removePlayer(room.game, player.id); },
  view(room) { return { table: E.publicView(room.game) }; },
  actions: {
    // impostazioni: fiches iniziali e bui (host)
    settings(room, player, body, { requireHost }) {
      requireHost(room, player);
      E.updateSettings(room.game, body);
    },
    start(room, player) {
      requireManager(room, player);
      E.startHand(room.game);
    },
    // azione di gioco: fold, check, call, bet/raise (amount = puntata totale), allin.
    // L'host o il dealer possono agire per il giocatore di turno (es. telefono scarico).
    act(room, player, body) {
      const t = room.game;
      let actor = player.id;
      if (body.as && body.as !== player.id) {
        requireManager(room, player);
        actor = body.as;
      }
      E.act(t, actor, { type: body.type, amount: body.amount });
    },
    award(room, player, body) {
      requireManager(room, player);
      E.award(room.game, Number(body.pot), Array.isArray(body.winners) ? body.winners : []);
    },
    sitout(room, player, body, { isHost }) {
      const target = body.targetId || player.id;
      if (target !== player.id && !isHost(room, player)) throw httpError(403, 'Solo l\'host può farlo.');
      E.setSittingOut(room.game, target, !!body.value);
    },
    stack(room, player, body, { requireHost }) {
      requireHost(room, player);
      E.setStack(room.game, body.targetId, body.value);
    },
    rebuy(room, player, body, { isHost }) {
      const target = body.targetId || player.id;
      if (target !== player.id && !isHost(room, player)) throw httpError(403, 'Solo l\'host può farlo.');
      E.rebuy(room.game, target);
    },
    // cambiare sedia: ognuno per sé, l'host anche per gli altri
    chair(room, player, body, { isHost }) {
      const target = body.targetId || player.id;
      if (target !== player.id && !isHost(room, player)) throw httpError(403, 'Solo l\'host può spostare gli altri.');
      E.takeChair(room.game, target, body.chair);
    },
    seat(room, player, body, { requireHost }) {
      requireHost(room, player);
      E.moveSeat(room.game, body.targetId, Number(body.dir));
    },
    dealer(room, player, body, { requireHost }) {
      requireHost(room, player);
      E.setDealer(room.game, body.targetId);
    },
  },
});

module.exports = { handleApi: manager.handleApi, rooms: manager.rooms };
