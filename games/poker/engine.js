'use strict';
// Motore di gioco del poker Texas Hold'em no-limit, senza carte:
// gestisce bottone, bui, turni, puntate, all-in, piatti laterali e vincite.
// Le carte vere restano sul tavolo: chi vince ogni piatto lo indica il gioco.
// Funzioni pure sullo stato "table" (nessun I/O), così sono facili da testare.

const STREETS = ['Preflop', 'Flop', 'Turn', 'River'];
const MAX_LOG = 60;

class GameError extends Error {
  constructor(message) { super(message); this.status = 400; }
}

function createTable(settings = {}) {
  return {
    settings: {
      startingStack: 1000,
      smallBlind: 10,
      bigBlind: 20,
      ...settings,
    },
    seats: [],          // ordine dei posti al tavolo: [{ id, name, stack, sittingOut, leaving }]
    dealerId: null,
    dealerIdx: -1,
    handNo: 0,
    phase: 'lobby',     // lobby | betting | showdown | over
    hand: null,
    log: [],
    lastResult: null,   // [{ id, name, amount }]
  };
}

// ---------- utility ----------
const seat = (t, id) => t.seats.find((s) => s.id === id);
const nameOf = (t, id) => (seat(t, id) || {}).name || '?';
function log(t, text) {
  t.log.push({ at: Date.now(), hand: t.handNo, text });
  if (t.log.length > MAX_LOG) t.log.splice(0, t.log.length - MAX_LOG);
}
function toInt(v) {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) ? n : NaN;
}

// Il prossimo id nell'ordine circolare dopo `fromId` che soddisfa `pred`.
function nextAfter(order, fromId, pred, includeSelf = false) {
  const n = order.length;
  if (!n) return null;
  let start = order.indexOf(fromId);
  if (start === -1) start = n - 1;
  for (let k = includeSelf ? 0 : 1; k <= n; k++) {
    const id = order[(start + k) % n];
    if (pred(id)) return id;
  }
  return null;
}

// ---------- giocatori ----------
function addPlayer(t, id, name) {
  if (seat(t, id)) return;
  t.seats.push({ id, name, stack: t.settings.startingStack, sittingOut: false, leaving: false });
  log(t, `${name} si siede al tavolo con ${t.settings.startingStack}`);
}

// Un giocatore esce: se è in mano lascia le carte (fold), poi viene tolto a fine mano.
function removePlayer(t, id) {
  const s = seat(t, id);
  if (!s) return;
  const h = t.hand;
  const inHand = h && h.players[id] && (t.phase === 'betting' || t.phase === 'showdown');
  if (inHand) {
    s.leaving = true;
    if (t.phase === 'betting' && !h.players[id].folded) {
      h.players[id].folded = true;
      log(t, `${s.name} lascia il tavolo (fold)`);
      if (h.toAct === id) advance(t, id);
      else checkProgress(t);
    } else {
      log(t, `${s.name} lascerà il tavolo a fine mano`);
    }
    return;
  }
  t.seats = t.seats.filter((x) => x.id !== id);
  log(t, `${s.name} lascia il tavolo`);
}

function setSittingOut(t, id, value) {
  const s = seat(t, id);
  if (!s) throw new GameError('Giocatore non trovato.');
  s.sittingOut = !!value;
  log(t, value ? `${s.name} salta le prossime mani` : `${s.name} torna in gioco`);
}

function ensureBetweenHands(t) {
  if (t.phase === 'betting' || t.phase === 'showdown') {
    throw new GameError('Si può fare solo tra una mano e l\'altra.');
  }
}

function setStack(t, id, value) {
  ensureBetweenHands(t);
  const s = seat(t, id);
  if (!s) throw new GameError('Giocatore non trovato.');
  const v = toInt(value);
  if (!(v >= 0) || v > 1e9) throw new GameError('Valore non valido.');
  log(t, `Stack di ${s.name} corretto: ${s.stack} → ${v}`);
  s.stack = v;
}

function rebuy(t, id) {
  ensureBetweenHands(t);
  const s = seat(t, id);
  if (!s) throw new GameError('Giocatore non trovato.');
  s.stack += t.settings.startingStack;
  log(t, `${s.name} ricarica ${t.settings.startingStack} (ora ${s.stack})`);
}

function moveSeat(t, id, dir) {
  ensureBetweenHands(t);
  const i = t.seats.findIndex((s) => s.id === id);
  const j = i + (dir < 0 ? -1 : 1);
  if (i === -1 || j < 0 || j >= t.seats.length) return;
  [t.seats[i], t.seats[j]] = [t.seats[j], t.seats[i]];
}

function setDealer(t, id) {
  ensureBetweenHands(t);
  if (!seat(t, id)) throw new GameError('Giocatore non trovato.');
  // il prossimo startHand sposta il bottone di un posto: ci posizioniamo prima
  const i = t.seats.findIndex((s) => s.id === id);
  t.dealerIdx = (i - 1 + t.seats.length) % t.seats.length;
  t.dealerId = t.seats[t.dealerIdx].id;
  t.forcedDealer = id;
  log(t, `Il bottone del dealer va a ${nameOf(t, id)} dalla prossima mano`);
}

function updateSettings(t, s) {
  const next = { ...t.settings };
  for (const k of ['startingStack', 'smallBlind', 'bigBlind']) {
    if (s[k] === undefined) continue;
    const v = toInt(s[k]);
    if (!(v > 0) || v > 1e9) throw new GameError('Valori non validi.');
    next[k] = v;
  }
  if (next.smallBlind > next.bigBlind) throw new GameError('Il piccolo buio non può superare il grande buio.');
  const changed = next.smallBlind !== t.settings.smallBlind || next.bigBlind !== t.settings.bigBlind;
  t.settings = next;
  if (changed) {
    const when = t.phase === 'betting' || t.phase === 'showdown' ? ' dalla prossima mano' : '';
    log(t, `Bui: ${next.smallBlind}/${next.bigBlind}${when}`);
  }
}

// ---------- mano ----------
function startHand(t) {
  ensureBetweenHands(t);
  // rimuove chi aveva chiesto di uscire
  t.seats = t.seats.filter((s) => !s.leaving);
  const order = t.seats.filter((s) => s.stack > 0 && !s.sittingOut).map((s) => s.id);
  if (order.length < 2) throw new GameError('Servono almeno 2 giocatori con fiches.');

  // sposta il bottone sul prossimo giocatore attivo
  const seatIds = t.seats.map((s) => s.id);
  let dealerId;
  if (t.forcedDealer && order.includes(t.forcedDealer)) {
    dealerId = t.forcedDealer;
  } else if (t.dealerId === null) {
    dealerId = order[0];
  } else {
    // parte dal posto del dealer precedente (anche se nel frattempo è uscito)
    const fromIdx = seatIds.includes(t.dealerId) ? seatIds.indexOf(t.dealerId) : t.dealerIdx;
    dealerId = null;
    for (let k = 1; k <= seatIds.length; k++) {
      const id = seatIds[(fromIdx + k + seatIds.length) % seatIds.length];
      if (order.includes(id)) { dealerId = id; break; }
    }
  }
  t.forcedDealer = null;
  t.dealerId = dealerId;
  t.dealerIdx = seatIds.indexOf(dealerId);
  t.handNo += 1;

  const { smallBlind: sb, bigBlind: bb } = t.settings;
  const players = {};
  for (const id of order) {
    players[id] = { bet: 0, committed: 0, folded: false, allIn: false, acted: false, fullActed: false };
  }
  const h = {
    no: t.handNo, sb, bb, order, players, dealerId,
    street: 0, currentBet: 0, minRaise: bb, toAct: null,
    sbId: null, bbId: null, pots: null, runout: false, lastAction: null,
  };
  t.hand = h;
  t.phase = 'betting';
  t.lastResult = null;

  const headsUp = order.length === 2;
  h.sbId = headsUp ? dealerId : nextAfter(order, dealerId, () => true);
  h.bbId = nextAfter(order, h.sbId, () => true);

  log(t, `— Mano n. ${t.handNo} · dealer ${nameOf(t, dealerId)} · bui ${sb}/${bb} —`);
  post(t, h.sbId, sb, 'piccolo buio');
  post(t, h.bbId, bb, 'grande buio');
  h.currentBet = bb;
  h.minRaise = bb;

  // primo a parlare: dopo il grande buio
  h.toAct = nextAfter(order, h.bbId, (id) => needsAction(h, id));
  if (!h.toAct) endRound(t);
  return h;
}

function post(t, id, amount, what) {
  const s = seat(t, id);
  const p = t.hand.players[id];
  const amt = Math.min(amount, s.stack);
  s.stack -= amt;
  p.bet += amt;
  p.committed += amt;
  if (s.stack === 0) p.allIn = true;
  log(t, `${s.name} mette il ${what}: ${amt}${p.allIn ? ' (all-in)' : ''}`);
}

function needsAction(h, id) {
  const p = h.players[id];
  return !p.folded && !p.allIn && (!p.acted || p.bet < h.currentBet);
}
const live = (h) => h.order.filter((id) => !h.players[id].folded);
const canBet = (h) => h.order.filter((id) => !h.players[id].folded && !h.players[id].allIn);
const potTotal = (h) => h.order.reduce((s, id) => s + h.players[id].committed, 0);

// Cosa può fare il giocatore di turno.
function available(t) {
  const h = t.hand;
  if (!h || t.phase !== 'betting' || !h.toAct) return null;
  const p = h.players[h.toAct];
  const stack = seat(t, h.toAct).stack;
  const toCall = Math.min(h.currentBet - p.bet, stack);
  const maxTo = p.bet + stack;
  const canRaise = !p.fullActed && maxTo > h.currentBet;
  const minTo = Math.min(h.currentBet + h.minRaise, maxTo);
  return {
    playerId: h.toAct,
    canCheck: p.bet >= h.currentBet,
    toCall,
    callIsAllIn: toCall > 0 && toCall === stack,
    canRaise,
    isBet: h.currentBet === 0,
    minTo,
    maxTo,
    pot: potTotal(h),
  };
}

function act(t, playerId, action) {
  const h = t.hand;
  if (!h || t.phase !== 'betting') throw new GameError('Non c\'è una mano in corso.');
  if (h.toAct !== playerId) throw new GameError(`Non è il tuo turno: tocca a ${nameOf(t, h.toAct)}.`);
  const p = h.players[playerId];
  const s = seat(t, playerId);
  const av = available(t);
  const type = action && action.type;

  const pay = (amt) => {
    s.stack -= amt; p.bet += amt; p.committed += amt;
    if (s.stack === 0) p.allIn = true;
  };

  let text;
  switch (type) {
    case 'fold':
      p.folded = true;
      text = `${s.name} passa (fold)`;
      break;
    case 'check':
      if (!av.canCheck) throw new GameError(`Non puoi fare check: devi chiamare ${av.toCall}.`);
      text = `${s.name} fa check`;
      break;
    case 'call': {
      if (av.canCheck) throw new GameError('Non c\'è niente da chiamare: puoi fare check.');
      pay(av.toCall);
      text = `${s.name} chiama ${av.toCall}${p.allIn ? ' (all-in)' : ''}`;
      break;
    }
    case 'raise':
    case 'bet':
    case 'allin': {
      const to = type === 'allin' ? av.maxTo : toInt(action.amount);
      if (type === 'allin' && to <= h.currentBet) {
        // all-in che non supera la puntata: è una chiamata
        const amt = to - p.bet;
        pay(amt);
        text = `${s.name} chiama ${amt} (all-in)`;
        break;
      }
      if (!av.canRaise) throw new GameError('Non puoi rilanciare adesso: puoi solo chiamare o passare.');
      if (!Number.isFinite(to)) throw new GameError('Importo non valido.');
      if (to > av.maxTo) throw new GameError(`Hai solo ${av.maxTo - p.bet} fiches.`);
      if (to <= h.currentBet) throw new GameError(`Devi puntare più di ${h.currentBet}.`);
      if (to < h.currentBet + h.minRaise && to !== av.maxTo) {
        throw new GameError(`${h.currentBet === 0 ? 'La puntata' : 'Il rilancio'} minimo è a ${h.currentBet + h.minRaise}.`);
      }
      const raiseBy = to - h.currentBet;
      const wasBet = h.currentBet === 0;
      pay(to - p.bet);
      if (raiseBy >= h.minRaise) {
        h.minRaise = raiseBy;
        for (const id of h.order) if (id !== playerId) h.players[id].fullActed = false;
      }
      h.currentBet = to;
      for (const id of h.order) if (id !== playerId) h.players[id].acted = false;
      text = `${s.name} ${wasBet ? 'punta' : 'rilancia a'} ${to}${p.allIn ? ' (all-in)' : ''}`;
      break;
    }
    default:
      throw new GameError('Azione sconosciuta.');
  }
  p.acted = true;
  p.fullActed = true;
  h.lastAction = { playerId, text };
  log(t, text);
  advance(t, playerId);
}

// Dopo un'azione: fine mano, fine giro o prossimo giocatore.
function advance(t, fromId) {
  const h = t.hand;
  if (live(h).length === 1) return winUncontested(t);
  const next = nextAfter(h.order, fromId, (id) => needsAction(h, id));
  if (next) { h.toAct = next; return; }
  endRound(t);
}

// Usato quando qualcuno esce fuori turno.
function checkProgress(t) {
  const h = t.hand;
  if (live(h).length === 1) return winUncontested(t);
  if (!h.toAct || !needsAction(h, h.toAct)) advance(t, h.toAct);
}

// Restituisce la parte di puntata che nessuno ha coperto.
function returnUncalled(t) {
  const h = t.hand;
  const bets = h.order.map((id) => ({ id, bet: h.players[id].bet })).sort((a, b) => b.bet - a.bet);
  if (bets.length < 2) return;
  const diff = bets[0].bet - bets[1].bet;
  if (diff > 0) {
    const p = h.players[bets[0].id];
    p.bet -= diff; p.committed -= diff;
    seat(t, bets[0].id).stack += diff;
    if (p.allIn && seat(t, bets[0].id).stack > 0) p.allIn = false;
    log(t, `${nameOf(t, bets[0].id)} riprende ${diff} non chiamati`);
  }
}

function endRound(t) {
  const h = t.hand;
  returnUncalled(t);
  for (const id of h.order) h.players[id].bet = 0;
  h.currentBet = 0;
  h.minRaise = h.bb;
  h.toAct = null;

  if (h.street >= 3 || canBet(h).length <= 1) {
    if (h.street < 3) {
      h.runout = true;
      log(t, `Nessun'altra puntata possibile: girate tutte le carte (${STREETS.slice(h.street + 1).join(', ')})`);
      h.street = 3;
    }
    return showdown(t);
  }
  h.street += 1;
  for (const id of h.order) Object.assign(h.players[id], { acted: false, fullActed: false });
  log(t, `${STREETS[h.street]} · piatto ${potTotal(h)}`);
  h.toAct = nextAfter(h.order, h.dealerId, (id) => needsAction(h, id));
  if (!h.toAct) endRound(t);
}

function winUncontested(t) {
  const h = t.hand;
  returnUncalled(t);
  const [winner] = live(h);
  const amount = potTotal(h);
  for (const id of h.order) h.players[id].bet = 0;
  h.toAct = null;
  h.pots = [{ amount, eligible: [winner], winners: [winner], payouts: { [winner]: amount } }];
  seat(t, winner).stack += amount;
  log(t, `${nameOf(t, winner)} vince ${amount} (gli altri hanno passato)`);
  finishHand(t);
}

// Calcola piatto principale e piatti laterali in base a quanto ha messo ognuno.
function computePots(h) {
  const contrib = h.order.map((id) => ({ id, c: h.players[id].committed, folded: h.players[id].folded }));
  const levels = [...new Set(contrib.filter((x) => !x.folded && x.c > 0).map((x) => x.c))].sort((a, b) => a - b);
  const pots = [];
  let prev = 0;
  for (const L of levels) {
    const amount = contrib.reduce((s, x) => s + Math.max(0, Math.min(x.c, L) - prev), 0);
    const eligible = contrib.filter((x) => !x.folded && x.c >= L).map((x) => x.id);
    if (amount > 0) {
      // stessi aventi diritto del piatto precedente: si uniscono
      const last = pots[pots.length - 1];
      if (last && last.eligible.length === eligible.length) last.amount += amount;
      else pots.push({ amount, eligible, winners: null, payouts: null });
    }
    prev = L;
  }
  // eventuali fiches oltre l'ultimo livello (solo da chi ha passato) vanno nell'ultimo piatto
  const rest = contrib.reduce((s, x) => s + Math.max(0, x.c - prev), 0);
  if (rest > 0 && pots.length) pots[pots.length - 1].amount += rest;
  return pots;
}

function showdown(t) {
  const h = t.hand;
  t.phase = 'showdown';
  h.toAct = null;
  h.pots = computePots(h);
  log(t, `Showdown · ${h.pots.length > 1 ? `${h.pots.length} piatti` : `piatto ${h.pots[0].amount}`}`);
  // i piatti con un solo avente diritto si assegnano da soli
  h.pots.forEach((pot, i) => { if (pot.eligible.length === 1) award(t, i, pot.eligible, true); });
  if (h.pots.every((p) => p.winners)) finishHand(t);
}

function award(t, potIndex, winnerIds, auto = false) {
  const h = t.hand;
  if (t.phase !== 'showdown') throw new GameError('Non c\'è nessun piatto da assegnare.');
  const pot = h.pots[potIndex];
  if (!pot) throw new GameError('Piatto non trovato.');
  if (pot.winners) throw new GameError('Questo piatto è già stato assegnato.');
  const winners = [...new Set(winnerIds || [])];
  if (!winners.length) throw new GameError('Scegli almeno un vincitore.');
  if (!winners.every((id) => pot.eligible.includes(id))) throw new GameError('Vincitore non valido per questo piatto.');

  // le fiches dispari vanno ai primi vincitori dopo il dealer
  const ordered = h.order.filter((id) => winners.includes(id));
  const fromDealer = [];
  for (let k = 1; k <= h.order.length; k++) {
    const id = h.order[(h.order.indexOf(h.dealerId) + k) % h.order.length];
    if (ordered.includes(id)) fromDealer.push(id);
  }
  const share = Math.floor(pot.amount / winners.length);
  let odd = pot.amount - share * winners.length;
  pot.payouts = {};
  for (const id of fromDealer) {
    const amt = share + (odd > 0 ? 1 : 0);
    if (odd > 0) odd -= 1;
    pot.payouts[id] = amt;
    seat(t, id).stack += amt;
  }
  pot.winners = fromDealer;
  const label = h.pots.length > 1 ? (potIndex === 0 ? 'il piatto principale' : `il piatto laterale ${potIndex}`) : 'il piatto';
  const names = fromDealer.map((id) => nameOf(t, id));
  log(t, winners.length > 1
    ? `${names.join(' e ')} si dividono ${label} da ${pot.amount}`
    : `${names[0]} vince ${label} da ${pot.amount}${auto ? '' : ''}`);
  if (!auto && h.pots.every((p) => p.winners)) finishHand(t);
}

function finishHand(t) {
  const h = t.hand;
  t.phase = 'over';
  h.toAct = null;
  const totals = {};
  for (const pot of h.pots) for (const [id, amt] of Object.entries(pot.payouts || {})) totals[id] = (totals[id] || 0) + amt;
  t.lastResult = Object.entries(totals).map(([id, amount]) => ({
    id, name: nameOf(t, id), amount, net: amount - h.players[id].committed,
  }));
  for (const s of t.seats) if (s.stack === 0 && h.players[s.id]) log(t, `${s.name} ha finito le fiches`);
}

// Stato visibile a tutti (nel poker senza carte non ci sono informazioni nascoste).
function publicView(t) {
  const h = t.hand;
  return {
    settings: t.settings,
    phase: t.phase,
    handNo: t.handNo,
    dealerId: t.dealerId,
    seats: t.seats.map((s) => ({ ...s })),
    hand: h && {
      no: h.no, sb: h.sb, bb: h.bb, sbId: h.sbId, bbId: h.bbId, dealerId: h.dealerId,
      street: h.street, streetName: STREETS[h.street], runout: h.runout,
      order: h.order, players: h.players, currentBet: h.currentBet, minRaise: h.minRaise,
      toAct: h.toAct, pot: potTotal(h), pots: h.pots, lastAction: h.lastAction,
    },
    available: available(t),
    lastResult: t.lastResult,
    log: t.log.slice(-40),
  };
}

module.exports = {
  GameError, STREETS,
  createTable, addPlayer, removePlayer, setSittingOut, setStack, rebuy, moveSeat, setDealer,
  updateSettings, startHand, act, award, available, computePots, publicView,
};
