'use strict';
// Definizione dei mazzi disponibili.
// Ogni carta: { label, rank, suit, color } (suit/color opzionali per mazzi personalizzati)

const FRENCH_SUITS = [
  { suit: '♠', name: 'Picche', color: 'black' },
  { suit: '♥', name: 'Cuori', color: 'red' },
  { suit: '♦', name: 'Quadri', color: 'red' },
  { suit: '♣', name: 'Fiori', color: 'black' },
];
const FRENCH_RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

const NEAPOLITAN_SUITS = [
  { suit: '🪙', name: 'Denari', color: 'gold' },
  { suit: '🏆', name: 'Coppe', color: 'red' },
  { suit: '⚔️', name: 'Spade', color: 'blue' },
  { suit: '🪵', name: 'Bastoni', color: 'green' },
];
const NEAPOLITAN_RANKS = [
  ['1', 'Asso'], ['2', 'Due'], ['3', 'Tre'], ['4', 'Quattro'], ['5', 'Cinque'],
  ['6', 'Sei'], ['7', 'Sette'], ['F', 'Fante'], ['C', 'Cavallo'], ['R', 'Re'],
];

function french(withJokers) {
  const cards = [];
  for (const s of FRENCH_SUITS) {
    for (const r of FRENCH_RANKS) {
      cards.push({ label: `${r} di ${s.name}`, rank: r, suit: s.suit, color: s.color });
    }
  }
  if (withJokers) {
    cards.push({ label: 'Jolly Rosso', rank: '★', suit: 'JOLLY', color: 'red' });
    cards.push({ label: 'Jolly Nero', rank: '★', suit: 'JOLLY', color: 'black' });
  }
  return cards;
}

function neapolitan() {
  const cards = [];
  for (const s of NEAPOLITAN_SUITS) {
    for (const [r, n] of NEAPOLITAN_RANKS) {
      cards.push({ label: `${n} di ${s.name}`, rank: r, suit: s.suit, color: s.color });
    }
  }
  return cards;
}

const DECKS = {
  francesi: { name: 'Carte francesi (52)', size: 52, build: () => french(false) },
  francesiJolly: { name: 'Carte francesi + Jolly (54)', size: 54, build: () => french(true) },
  napoletane: { name: 'Carte napoletane (40)', size: 40, build: neapolitan },
  custom: { name: 'Mazzo personalizzato', size: null, build: null },
};

function buildDeck(deckId, customCards = []) {
  const d = DECKS[deckId];
  if (!d) return [];
  if (deckId === 'custom') {
    return customCards.map((label) => ({ label, rank: null, suit: null, color: 'custom' }));
  }
  return d.build();
}

module.exports = { DECKS, buildDeck };
