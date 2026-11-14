'use strict';
// Motore della Briscola (mazzo napoletano da 40 carte), a 2 giocatori o a 4 in coppie.
// Funzioni pure sullo stato del gioco: il server si occupa di stanze e tempi.

const SUITS = [
  { id: 'denari', name: 'Denari' },
  { id: 'coppe', name: 'Coppe' },
  { id: 'spade', name: 'Spade' },
  { id: 'bastoni', name: 'Bastoni' },
];
// rank: 1..10 (8 = Fante, 9 = Cavallo, 10 = Re)
const RANK_NAMES = { 1: 'Asso', 2: 'Due', 3: 'Tre', 4: 'Quattro', 5: 'Cinque', 6: 'Sei', 7: 'Sette', 8: 'Fante', 9: 'Cavallo', 10: 'Re' };
const RANK_LABELS = { 1: 'A', 8: 'F', 9: 'C', 10: 'R' };
const POINTS = { 1: 11, 3: 10, 10: 4, 9: 3, 8: 2 };
// forza nella presa: Asso > Tre > Re > Cavallo > Fante > 7 > 6 > 5 > 4 > 2
const STRENGTH = { 1: 10, 3: 9, 10: 8, 9: 7, 8: 6, 7: 5, 6: 4, 5: 3, 4: 2, 2: 1 };
const MAX_LOG = 40;

class GameError extends Error {
  constructor(message) { super(message); this.status = 400; }
}

function makeCard(suit, rank) {
  const s = SUITS.find((x) => x.id === suit);
  return {
    id: `${suit}-${rank}`, suit, rank,
    label: RANK_LABELS[rank] || String(rank),
    name: `${RANK_NAMES[rank]} di ${s.name}`,
    points: POINTS[rank] || 0,
  };
}
function fullDeck() {
  const d = [];
  for (const s of SUITS) for (let r = 1; r <= 10; r++) d.push(makeCard(s.id, r));
  return d;
}
function shuffle(arr, rng) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = rng(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
const defaultRng = (n) => require('crypto').randomInt(n);

function createGame(mode) {
  if (mode !== 2 && mode !== 4) throw new GameError('Si gioca in 2 o in 4.');
  return {
    mode,
    players: [],          // [{ id, name }] in ordine di gioco (in 4: posti 0 e 2 contro 1 e 3)
    phase: 'lobby',       // lobby | playing | trick | over
    handNo: 0,
    dealerIdx: -1,
    deck: [],             // carte da pescare; l'ultima è la briscola scoperta
    briscola: null,
    hands: {},
    captured: {},
    trick: [],            // [{ playerId, card }]
    turnIdx: 0,
    trickWinner: null,
    lastTrick: null,
    result: null,
    wins: [0, 0],         // partite vinte per squadra (in 2: un giocatore per squadra)
    log: [],
  };
}

const teamOf = (g, idx) => (g.mode === 4 ? idx % 2 : idx);
const idxOf = (g, id) => g.players.findIndex((p) => p.id === id);
const nameOf = (g, id) => (g.players.find((p) => p.id === id) || {}).name || '?';
function log(g, text) {
  g.log.push({ at: Date.now(), text });
  if (g.log.length > MAX_LOG) g.log.splice(0, g.log.length - MAX_LOG);
}
function teamName(g, team) {
  if (g.mode === 2) return g.players[team] ? g.players[team].name : '?';
  return g.players.filter((_, i) => i % 2 === team).map((p) => p.name).join(' e ');
}

// ---------- giocatori ----------
function addPlayer(g, id, name) {
  if (idxOf(g, id) !== -1) return;
  if (g.players.length >= g.mode) throw new GameError('Il tavolo è pieno.');
  g.players.push({ id, name });
  g.wins = [0, 0];
  log(g, `${name} si siede al tavolo`);
}

// Chi esce interrompe la partita in corso.
function removePlayer(g, id) {
  const i = idxOf(g, id);
  if (i === -1) return;
  const name = g.players[i].name;
  g.players.splice(i, 1);
  g.wins = [0, 0];
  if (g.phase === 'playing' || g.phase === 'trick') {
    resetHand(g);
    log(g, `${name} ha lasciato il tavolo: partita interrotta`);
  } else {
    log(g, `${name} ha lasciato il tavolo`);
  }
  if (g.phase === 'over') g.phase = 'lobby';
}

function resetHand(g) {
  g.phase = 'lobby';
  g.deck = []; g.briscola = null; g.hands = {}; g.captured = {};
  g.trick = []; g.trickWinner = null; g.lastTrick = null;
}

function setMode(g, mode) {
  ensureNotPlaying(g);
  if (mode !== 2 && mode !== 4) throw new GameError('Si gioca in 2 o in 4.');
  if (g.players.length > mode) throw new GameError(`Ci sono già ${g.players.length} giocatori.`);
  if (g.mode !== mode) {
    g.mode = mode;
    g.wins = [0, 0];
    g.phase = 'lobby';
    g.result = null;
    log(g, mode === 2 ? 'Si gioca in 2' : 'Si gioca in 4, a coppie');
  }
}

function ensureNotPlaying(g) {
  if (g.phase === 'playing' || g.phase === 'trick') throw new GameError('Si può fare solo tra una partita e l\'altra.');
}

// Scambia un giocatore con il vicino (in 4 serve a decidere le coppie).
function moveSeat(g, id, dir) {
  ensureNotPlaying(g);
  const n = g.players.length;
  const i = idxOf(g, id);
  if (i === -1) throw new GameError('Giocatore non trovato.');
  if (n < 3) throw new GameError('In due l\'ordine non cambia.');
  const j = (i + (Number(dir) < 0 ? -1 : 1) + n) % n;
  [g.players[i], g.players[j]] = [g.players[j], g.players[i]];
  g.wins = [0, 0];
  if (g.phase === 'over') g.phase = 'lobby';
}

// ---------- partita ----------
function start(g, rng = defaultRng) {
  ensureNotPlaying(g);
  const n = g.mode;
  if (g.players.length !== n) throw new GameError(`Servono esattamente ${n} giocatori (ora ${g.players.length}).`);
  g.handNo += 1;
  g.dealerIdx = (g.dealerIdx + 1) % n;
  g.deck = shuffle(fullDeck(), rng);
  g.hands = {}; g.captured = {};
  for (const p of g.players) { g.hands[p.id] = []; g.captured[p.id] = []; }
  // 3 carte a testa, a partire da chi è dopo il mazziere
  for (let k = 0; k < 3; k++) {
    for (let j = 1; j <= n; j++) {
      const p = g.players[(g.dealerIdx + j) % n];
      g.hands[p.id].push(g.deck.shift());
    }
  }
  // la carta successiva è la briscola: resta scoperta in fondo al mazzo
  g.briscola = g.deck.shift();
  g.deck.push(g.briscola);
  g.trick = [];
  g.trickWinner = null;
  g.lastTrick = null;
  g.result = null;
  g.turnIdx = (g.dealerIdx + 1) % n;
  g.phase = 'playing';
  log(g, `— Partita n. ${g.handNo} · mazziere ${g.players[g.dealerIdx].name} · briscola ${g.briscola.name} —`);
}

function beats(a, b, trumpSuit) {
  // true se la carta a batte la carta b (b è la migliore finora)
  if (a.suit === b.suit) return STRENGTH[a.rank] > STRENGTH[b.rank];
  return a.suit === trumpSuit;
}

function trickWinner(g) {
  let best = g.trick[0];
  for (const t of g.trick.slice(1)) if (beats(t.card, best.card, g.briscola.suit)) best = t;
  return best.playerId;
}

function play(g, playerId, cardId) {
  if (g.phase !== 'playing') throw new GameError(g.phase === 'trick' ? 'Aspetta che venga raccolta la presa.' : 'Non c\'è una partita in corso.');
  const current = g.players[g.turnIdx];
  if (current.id !== playerId) throw new GameError(`Non è il tuo turno: tocca a ${current.name}.`);
  const hand = g.hands[playerId];
  const i = hand.findIndex((c) => c.id === cardId);
  if (i === -1) throw new GameError('Non hai questa carta.');
  const [card] = hand.splice(i, 1);
  g.trick.push({ playerId, card });
  if (g.trick.length === g.mode) {
    g.trickWinner = trickWinner(g);
    g.phase = 'trick';
  } else {
    g.turnIdx = (g.turnIdx + 1) % g.mode;
  }
  return card;
}

// Raccoglie la presa, fa pescare (prima chi ha preso) e passa la mano a chi ha preso.
function collect(g) {
  if (g.phase !== 'trick') return;
  const n = g.mode;
  const w = g.trickWinner;
  const wi = idxOf(g, w);
  const pts = g.trick.reduce((s, t) => s + t.card.points, 0);
  g.captured[w].push(...g.trick.map((t) => t.card));
  g.lastTrick = { cards: g.trick, winner: w, points: pts };
  log(g, `${nameOf(g, w)} prende${pts ? ` (${pts} punti)` : ''}`);
  g.trick = [];
  g.trickWinner = null;
  if (g.deck.length) {
    for (let j = 0; j < n; j++) {
      const p = g.players[(wi + j) % n];
      g.hands[p.id].push(g.deck.shift());
    }
    if (!g.deck.length) log(g, 'Mazzo finito: si giocano le ultime carte');
  }
  g.turnIdx = wi;
  if (g.players.every((p) => g.hands[p.id].length === 0)) return finish(g);
  g.phase = 'playing';
}

function finish(g) {
  const pts = [0, 0];
  const cards = [0, 0];
  g.players.forEach((p, i) => {
    const t = teamOf(g, i);
    pts[t] += g.captured[p.id].reduce((s, c) => s + c.points, 0);
    cards[t] += g.captured[p.id].length;
  });
  let winner = null;
  if (pts[0] > 60) winner = 0;
  else if (pts[1] > 60) winner = 1;
  if (winner !== null) g.wins[winner] += 1;
  g.result = { points: pts, cards, winner, teams: [teamName(g, 0), teamName(g, 1)] };
  g.phase = 'over';
  log(g, winner === null
    ? `Pareggio: 60 a 60`
    : `${teamName(g, winner)} ${g.mode === 4 ? 'vincono' : 'vince'} ${pts[winner]} a ${pts[1 - winner]}`);
}

// Stato visto da un giocatore: le carte degli altri restano nascoste.
function viewFor(g, viewerId) {
  const n = g.players.length;
  const me = idxOf(g, viewerId);
  const playing = g.phase === 'playing' || g.phase === 'trick';
  const sorted = (cards) => cards.slice().sort((a, b) =>
    (a.suit === b.suit ? STRENGTH[b.rank] - STRENGTH[a.rank] : SUITS.findIndex((s) => s.id === a.suit) - SUITS.findIndex((s) => s.id === b.suit)));
  return {
    mode: g.mode,
    phase: g.phase,
    handNo: g.handNo,
    players: g.players.map((p, i) => ({
      id: p.id, name: p.name, team: teamOf(g, i),
      cards: playing ? g.hands[p.id].length : 0,
      dealer: i === g.dealerIdx,
    })),
    me,
    hand: me !== -1 && g.hands[viewerId] ? sorted(g.hands[viewerId]) : [],
    briscola: g.briscola,
    deckCount: playing ? g.deck.length : 0,
    trick: g.trick,
    trickWinner: g.trickWinner,
    turn: playing && g.phase === 'playing' && n ? g.players[g.turnIdx].id : null,
    lastTrick: g.lastTrick,
    result: g.result,
    wins: g.wins,
    teams: [teamName(g, 0), teamName(g, 1)],
    log: g.log.slice(-20),
  };
}

module.exports = {
  GameError, SUITS, POINTS, STRENGTH,
  createGame, addPlayer, removePlayer, setMode, moveSeat, start, play, collect, viewFor,
  fullDeck, makeCard, beats,
};
