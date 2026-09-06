/* =====================================================================
   Balatro Clone — game.js
   Single classic script (no build step, no deps, works over file://).
   Pure game logic is DOM-free so this file can be required from Node
   for headless tests (see test-hands.js).

   Section map:
     1. DATA         — cards, hand table, joker pool, blind table, constants
     2. STATE        — run state shape + helpers
     3. DECK         — build / shuffle / deal / refill
     4. HAND EVAL    — poker hand detection + scoring-card selection
     5. SCORING      — chips x mult pipeline with joker effects
     6. ECONOMY      — rewards, interest, payouts
     7. SHOP         — offers, buy/sell, reroll, skip
     8. FLOW         — play/discard actions, blind progression, run reset
     9. UI / RENDER  — DOM rendering + input
    10. INIT         — browser boot + Node exports
   ===================================================================== */

'use strict';

/* ---------------- 1. DATA ---------------- */

const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
const SUITS = ['spade', 'heart', 'diamond', 'club'];
const SUIT_SYMBOL = { spade: '♠', heart: '♥', diamond: '♦', club: '♣' };
const RED_SUITS = new Set(['heart', 'diamond']);
// Fixed suit order (used for sort grouping + rank-sort tiebreaks)
const SUIT_ORDER = { spade: 0, heart: 1, diamond: 2, club: 3 };

// Chip value per rank: 2-10 = pip value, J/Q/K = 10, A = 11
const CHIP_VALUE = {
  '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9,
  '10': 10, J: 10, Q: 10, K: 10, A: 11,
};

// 2..14, used for ordering and straight detection
function rankValue(rank) {
  if (rank === 'A') return 14;
  if (rank === 'K') return 13;
  if (rank === 'Q') return 12;
  if (rank === 'J') return 11;
  return parseInt(rank, 10);
}

// Balatro base hand values (fixed for v1, no hand leveling)
const HANDS = {
  HIGH_CARD:      { name: 'High Card',       chips: 5,   mult: 1 },
  PAIR:           { name: 'Pair',            chips: 10,  mult: 2 },
  TWO_PAIR:       { name: 'Two Pair',        chips: 20,  mult: 2 },
  THREE_KIND:     { name: 'Three of a Kind', chips: 30,  mult: 3 },
  STRAIGHT:       { name: 'Straight',        chips: 30,  mult: 4 },
  FLUSH:          { name: 'Flush',           chips: 35,  mult: 4 },
  FULL_HOUSE:     { name: 'Full House',      chips: 40,  mult: 4 },
  FOUR_KIND:      { name: 'Four of a Kind',  chips: 60,  mult: 7 },
  STRAIGHT_FLUSH: { name: 'Straight Flush',  chips: 100, mult: 8 },
};

const BLIND_NAMES = ['Small Blind', 'Big Blind', 'Boss Blind'];
const BLIND_TARGETS = { 1: [300, 450, 675], 2: [800, 1200, 1800], 3: [2000, 3000, 4500] };

const MAX_HAND_SIZE = 8;
const MAX_SELECTED = 5;
const MAX_JOKERS = 5;
const START_PLAYS = 4;
const START_DISCARDS = 3;
const START_MONEY = 4;
const MAX_ANTE = 3;
const BLIND_REWARD_BASE = 3; // $3 + $1 per unused discard
const INTEREST_CAP = 5;      // $1 per $5 held, wins only
const SKIP_COST = 4;         // skipping a blind costs $4 (small/big only), no interest
const SHOP_REROLL_BASE = 5;  // +$1 per reroll this shop, resets next shop
const SHOP_OFFER_COUNT = 5;

// Standard poker hand ranking (for "or better" joker conditions)
const HAND_RANK_ORDER = {
  HIGH_CARD: 0, PAIR: 1, TWO_PAIR: 2, THREE_KIND: 3, STRAIGHT: 4,
  FLUSH: 5, FULL_HOUSE: 6, FOUR_KIND: 7, STRAIGHT_FLUSH: 8,
};

// Expanded joker pool (28 jokers).
// { id, name, short, cost, rarity: 'common'|'uncommon'|'rare', kind: 'chips'|'mult'|'xmult'|'none',
//   value | amount(ctx), cond(ctx)?, text }
// ctx = { cards, handType, pairCount, hasSuit, cardCount, discardsLeft }
const JOKERS = [
  // --- Common (20) ---
  { id: 'joker', name: 'Joker', short: 'J', cost: 2, rarity: 'common', kind: 'mult', value: 4,
    text: '+4 Mult' },
  { id: 'greedy', name: 'Greedy Joker', short: 'd', cost: 5, rarity: 'common', kind: 'mult', value: 3,
    cond: c => c.hasSuit('diamond'), text: '+3 Mult if hand contains a Diamond' },
  { id: 'lusty', name: 'Lusty Joker', short: 'h', cost: 5, rarity: 'common', kind: 'mult', value: 3,
    cond: c => c.hasSuit('heart'), text: '+3 Mult if hand contains a Heart' },
  { id: 'wrathful', name: 'Wrathful Joker', short: 's', cost: 5, rarity: 'common', kind: 'mult', value: 3,
    cond: c => c.hasSuit('spade'), text: '+3 Mult if hand contains a Spade' },
  { id: 'gluttonous', name: 'Gluttonous Joker', short: 'c', cost: 5, rarity: 'common', kind: 'mult', value: 3,
    cond: c => c.hasSuit('club'), text: '+3 Mult if hand contains a Club' },
  { id: 'jolly', name: 'Jolly Joker', short: 'jo', cost: 3, rarity: 'common', kind: 'mult', value: 8,
    cond: c => c.pairCount >= 1, text: '+8 Mult if hand contains a Pair' },
  { id: 'zany', name: 'Zany Joker', short: 'za', cost: 4, rarity: 'common', kind: 'mult', value: 12,
    cond: c => HAND_RANK_ORDER[c.handType] >= HAND_RANK_ORDER.THREE_KIND,
    text: '+12 Mult if hand is Three of a Kind or better' },
  { id: 'mad', name: 'Mad Joker', short: 'ma', cost: 4, rarity: 'common', kind: 'chips',
    amount: c => 10 * c.pairCount, text: '+10 Chips per pair in hand' },
  { id: 'crazy', name: 'Crazy Joker', short: 'cr', cost: 4, rarity: 'common', kind: 'mult', value: 12,
    cond: c => c.handType === 'STRAIGHT', text: '+12 Mult if hand is a Straight' },
  { id: 'droll', name: 'Droll Joker', short: 'dr', cost: 4, rarity: 'common', kind: 'mult', value: 10,
    cond: c => c.handType === 'FLUSH', text: '+10 Mult if hand is a Flush' },
  { id: 'sly', name: 'Sly Joker', short: 'sl', cost: 3, rarity: 'common', kind: 'chips', value: 50,
    cond: c => c.pairCount >= 1, text: '+50 Chips if hand contains a Pair' },
  { id: 'half', name: 'Half Joker', short: 'ha', cost: 5, rarity: 'common', kind: 'mult', value: 20,
    cond: c => c.cardCount <= 3, text: '+20 Mult if hand has 3 or fewer cards' },
  { id: 'wily', name: 'Wily Joker', short: 'wi', cost: 4, rarity: 'common', kind: 'chips', value: 100,
    cond: c => HAND_RANK_ORDER[c.handType] >= HAND_RANK_ORDER.THREE_KIND,
    text: '+100 Chips if hand is Three of a Kind or better' },
  { id: 'clever', name: 'Clever Joker', short: 'cl', cost: 4, rarity: 'common', kind: 'chips', value: 80,
    cond: c => c.handType === 'TWO_PAIR', text: '+80 Chips if hand is Two Pair' },
  { id: 'devious', name: 'Devious Joker', short: 'de', cost: 4, rarity: 'common', kind: 'chips', value: 100,
    cond: c => c.handType === 'STRAIGHT', text: '+100 Chips if hand is a Straight' },
  { id: 'crafty', name: 'Crafty Joker', short: 'cf', cost: 4, rarity: 'common', kind: 'chips', value: 80,
    cond: c => c.handType === 'FLUSH', text: '+80 Chips if hand is a Flush' },
  { id: 'banner', name: 'Banner', short: 'ba', cost: 5, rarity: 'common', kind: 'chips',
    amount: c => 30 * (c.discardsLeft || 0), text: '+30 Chips per remaining discard' },
  { id: 'even_steven', name: 'Even Steven', short: 'ev', cost: 4, rarity: 'common', kind: 'mult',
    amount: c => 4 * c.cards.filter(cd => parseInt(cd.rank, 10) % 2 === 0).length,
    text: '+4 Mult per even-rank card in hand' },
  { id: 'odd_todd', name: 'Odd Todd', short: 'ot', cost: 4, rarity: 'common', kind: 'chips',
    amount: c => 31 * c.cards.filter(cd => { const v = rankValue(cd.rank); return v % 2 === 1; }).length,
    text: '+31 Chips per odd-rank card in hand' },
  { id: 'gros_michel', name: 'Gros Michel', short: 'gm', cost: 5, rarity: 'common', kind: 'mult', value: 15,
    text: '+15 Mult' },

  // --- Uncommon (5) ---
  { id: 'showman', name: 'Showman', short: 'sh', cost: 5, rarity: 'uncommon', kind: 'none', value: 0,
    text: 'Jokers may appear multiple times in shop' },
  { id: 'blackboard', name: 'Blackboard', short: 'bb', cost: 6, rarity: 'uncommon', kind: 'xmult', value: 3,
    cond: c => c.cards.every(cd => cd.suit === 'spade' || cd.suit === 'club'),
    text: 'x3 Mult if all cards in hand are Spades or Clubs' },
  { id: 'flower_pot', name: 'Flower Pot', short: 'fp', cost: 6, rarity: 'uncommon', kind: 'xmult', value: 3,
    cond: c => { const s = new Set(c.cards.map(cd => cd.suit)); return s.size === 4; },
    text: 'x3 Mult if hand contains all four suits' },
  { id: 'fibonacci', name: 'Fibonacci', short: 'fi', cost: 8, rarity: 'uncommon', kind: 'mult',
    amount: c => 8 * c.cards.filter(cd => ['A','2','3','5','8'].includes(cd.rank)).length,
    text: '+8 Mult per Ace, 2, 3, 5, or 8 in hand' },
  { id: 'arrowhead', name: 'Arrowhead', short: 'ar', cost: 7, rarity: 'uncommon', kind: 'chips',
    amount: c => 50 * c.cards.filter(cd => cd.suit === 'spade').length,
    text: '+50 Chips per Spade in hand' },

  // --- Rare (3) ---
  { id: 'the_duo', name: 'The Duo', short: 'td', cost: 8, rarity: 'rare', kind: 'xmult', value: 2,
    cond: c => c.pairCount >= 1, text: 'x2 Mult if hand contains a Pair' },
  { id: 'the_trio', name: 'The Trio', short: 'tt', cost: 8, rarity: 'rare', kind: 'xmult', value: 3,
    cond: c => HAND_RANK_ORDER[c.handType] >= HAND_RANK_ORDER.THREE_KIND,
    text: 'x3 Mult if hand is Three of a Kind or better' },
  { id: 'the_order', name: 'The Order', short: 'to', cost: 8, rarity: 'rare', kind: 'xmult', value: 3,
    cond: c => c.handType === 'STRAIGHT', text: 'x3 Mult if hand is a Straight' },
];

// Rarity weights for shop offer generation (from Balatro community data-mining)
const RARITY_WEIGHTS = { common: 100, uncommon: 55, rare: 25 };
const RARITY_ORDER = ['common', 'uncommon', 'rare'];

function jokerById(id) { return JOKERS.find(j => j.id === id); }
function sellPrice(joker) { return Math.floor(joker.cost / 2); }

// Presentation-only: per-joker frame + icon colors and inline SVG icons.
// Icons use currentColor, so they inherit the chip's --joker-icon color.
const JOKER_FRAME = {
  joker: '#e8a020', greedy: '#e05656', lusty: '#e86aa6', wrathful: '#5a78d6',
  gluttonous: '#4cc38a', jolly: '#f08c3c', zany: '#35c0dc', mad: '#d9534f',
  crazy: '#b06ad6', droll: '#3fbfb2', sly: '#9b6ad6', half: '#7a9cc9',
  wily: '#4a90d9', clever: '#5cb85c', devious: '#d9534f', crafty: '#3fbfb2',
  banner: '#5bc0de', even_steven: '#8e8e8e', odd_todd: '#c0a040', gros_michel: '#7ec850',
  showman: '#c0a0ff', blackboard: '#2c2c2c', flower_pot: '#ff69b4',
  fibonacci: '#ff8c00', arrowhead: '#8b4513',
  the_duo: '#9370db', the_trio: '#4169e1', the_order: '#dc143c',
};
const JOKER_ICON = {
  joker: '#c9821a', greedy: '#d3303b', lusty: '#d3303b', wrathful: '#23252e',
  gluttonous: '#23252e', jolly: '#e8720c', zany: '#0aa3c4', mad: '#b52e28',
  crazy: '#8a46c0', droll: '#0f9c94', sly: '#7a49c9', half: '#4a6fc0',
  wily: '#2e6eb0', clever: '#3d8b3d', devious: '#b52e28', crafty: '#0f9c94',
  banner: '#2a7fa8', even_steven: '#666666', odd_todd: '#9a7b20', gros_michel: '#5a9a30',
  showman: '#8a60c0', blackboard: '#111111', flower_pot: '#cc4488',
  fibonacci: '#cc6600', arrowhead: '#6b3410',
  the_duo: '#6a40b0', the_trio: '#2050a0', the_order: '#a01030',
};
const JOKER_ICONS = {
  joker: '<svg viewBox="0 0 24 24"><circle cx="5" cy="6" r="2.2"/><circle cx="12" cy="4" r="2.2"/><circle cx="19" cy="6" r="2.2"/><path d="M12 6c-2 3-4.5 4-6.5 6.5S4 18 4 19c2.5 1.5 5.5 1.5 8 1.5s5.5 0 8-1.5c0-1 0-4-1.5-6.5S14 9 12 6z"/></svg>',
  greedy: '<svg viewBox="0 0 24 24"><path d="M12 3l6 9-6 9-6-9z"/></svg>',
  lusty: '<svg viewBox="0 0 24 24"><path d="M12 21C7 16.5 3 13 3 8.8 3 6 5.2 4 7.8 4c1.7 0 3.3.9 4.2 2.3C12.9 4.9 14.5 4 16.2 4 18.8 4 21 6 21 8.8c0 4.2-4 7.7-9 12.2z"/></svg>',
  wrathful: '<svg viewBox="0 0 24 24"><path d="M12 2L6 10c-2 2.5-1 6 1.8 6 1.2 0 2.3-.6 2.9-1.5.2 1.8.7 3.6 1.3 4.5.6-.9 1.1-2.7 1.3-4.5.6.9 1.7 1.5 2.9 1.5C19 16 20 12.5 18 10z"/></svg>',
  gluttonous: '<svg viewBox="0 0 24 24"><circle cx="12" cy="7.5" r="4"/><circle cx="7.5" cy="14" r="4"/><circle cx="16.5" cy="14" r="4"/><path d="M11 14h2l1.5 7h-5z"/></svg>',
  jolly: '<svg viewBox="0 0 24 24"><rect x="4" y="4" width="16" height="16" rx="3.5"/><circle cx="9" cy="9" r="2" fill="#fff"/><circle cx="15" cy="15" r="2" fill="#fff"/></svg>',
  zany: '<svg viewBox="0 0 24 24"><path d="M13 2L5 13h5l-2 9 9-12h-5z"/></svg>',
  mad: '<svg viewBox="0 0 24 24"><rect x="5" y="14" width="14" height="5" rx="2.5"/><rect x="5" y="8.5" width="14" height="5" rx="2.5"/><rect x="5" y="3" width="14" height="5" rx="2.5"/></svg>',
  crazy: '<svg viewBox="0 0 24 24"><path d="M12 2l2.9 6.3 6.9.8-5.1 4.7 1.4 6.8L12 17.3 5.9 20.6l1.4-6.8L2.2 9.1l6.9-.8z"/></svg>',
  droll: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><circle cx="9" cy="10" r="1.6" fill="#fff"/><circle cx="15" cy="10" r="1.6" fill="#fff"/><path d="M8 14c1 1.8 2.5 2.6 4 2.6s3-.8 4-2.6" stroke="#fff" stroke-width="1.8" fill="none" stroke-linecap="round"/></svg>',
  sly: '<svg viewBox="0 0 24 24"><path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6z"/><circle cx="12" cy="12" r="3.2" fill="#fff"/></svg>',
  half: '<svg viewBox="0 0 24 24"><path d="M15 3a9 9 0 1 0 6 15.5A10.5 10.5 0 0 1 15 3z"/></svg>',
  wily: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M8 12h8M12 8v8" stroke="#fff" stroke-width="2"/></svg>',
  clever: '<svg viewBox="0 0 24 24"><rect x="4" y="4" width="16" height="16" rx="3"/><path d="M8 8h8M8 12h5" stroke="#fff" stroke-width="2"/></svg>',
  devious: '<svg viewBox="0 0 24 24"><path d="M4 18l4-8 4 4 4-8 4 12H4z"/></svg>',
  crafty: '<svg viewBox="0 0 24 24"><path d="M12 3C8 8 4 12 4 16a8 8 0 0 0 16 0c0-4-4-8-8-13z"/></svg>',
  banner: '<svg viewBox="0 0 24 24"><rect x="6" y="3" width="12" height="18" rx="1"/><path d="M6 7h12M6 17h12" stroke="#fff" stroke-width="1.5"/></svg>',
  even_steven: '<svg viewBox="0 0 24 24"><rect x="3" y="6" width="8" height="12" rx="2"/><rect x="13" y="6" width="8" height="12" rx="2"/></svg>',
  odd_todd: '<svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="4"/><path d="M12 12v8M8 16h8" stroke="#fff" stroke-width="2"/></svg>',
  gros_michel: '<svg viewBox="0 0 24 24"><path d="M8 3h8l2 14a4 4 0 0 1-4 4h-4a4 4 0 0 1-4-4z"/><path d="M10 7v6M14 7v6" stroke="#fff" stroke-width="1.5"/></svg>',
  showman: '<svg viewBox="0 0 24 24"><path d="M12 2l3 7h7l-5.5 4.5 2 7L12 16l-6.5 4.5 2-7L2 9h7z"/></svg>',
  blackboard: '<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="14" rx="2"/><path d="M7 10h10M7 14h6" stroke="#fff" stroke-width="2"/></svg>',
  flower_pot: '<svg viewBox="0 0 24 24"><path d="M8 14h8l-1 7H9z"/><circle cx="12" cy="8" r="4"/></svg>',
  fibonacci: '<svg viewBox="0 0 24 24"><path d="M3 21c3-1 5-4 6-7s3-6 6-7 6 1 6 4-2 5-4 5-3-2-4-1-1 4-3 5" stroke-width="2" fill="none"/></svg>',
  arrowhead: '<svg viewBox="0 0 24 24"><path d="M12 2L4 12h5v10h6V12h5z"/></svg>',
  the_duo: '<svg viewBox="0 0 24 24"><circle cx="8" cy="10" r="4"/><circle cx="16" cy="10" r="4"/><path d="M4 20c0-2 2-4 4-4s4 2 4 4M12 20c0-2 2-4 4-4s4 2 4 4" fill="none" stroke-width="2"/></svg>',
  the_trio: '<svg viewBox="0 0 24 24"><circle cx="12" cy="6" r="3"/><circle cx="6" cy="16" r="3"/><circle cx="18" cy="16" r="3"/></svg>',
  the_order: '<svg viewBox="0 0 24 24"><path d="M4 4h4v16H4zM10 4h4v16h-4zM16 4h4v16h-4z"/></svg>',
};

// Small helper: icon span for a joker (color comes from the chip's CSS vars)
function jokerIconSpan(j) {
  return `<span class="jk-icon">${JOKER_ICONS[j.id]}</span>`;
}
function setJokerVars(el, j) {
  el.style.setProperty('--joker-frame', JOKER_FRAME[j.id]);
  el.style.setProperty('--joker-icon', JOKER_ICON[j.id]);
}

/* ---------------- 2. STATE ---------------- */

let state = null; // created in init(); never touched in Node

function createRunState() {
  return {
    ante: 1,
    blindIdx: 0, // 0 small, 1 big, 2 boss
    money: START_MONEY,
    roundScore: 0,
    playsLeft: START_PLAYS,
    discardsLeft: START_DISCARDS,
    deck: [],    // unplayed cards, index 0 = top
    hand: [],    // up to 8 cards
    selected: [],// indices into hand
    jokers: [],
    screen: 'play', // 'play' | 'shop' | 'gameover' | 'victory'
    shop: null,     // { offers: [joker|null x5], rerollCost }
    lastPayout: null,
    sortMode: null, // null | 'rank' | 'suit'
  };
}

function blindName() { return BLIND_NAMES[state.blindIdx]; }
function blindTarget() { return BLIND_TARGETS[state.ante][state.blindIdx]; }

/* ---------------- 3. DECK ---------------- */

function buildDeck() {
  const deck = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) deck.push({ rank, suit });
  }
  return deck;
}

// Fisher–Yates, in place
function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function startBlind() {
  state.roundScore = 0;
  state.playsLeft = START_PLAYS;
  state.discardsLeft = START_DISCARDS;
  state.deck = shuffle(buildDeck());
  state.hand = state.deck.splice(0, MAX_HAND_SIZE);
  state.selected = [];
  state.screen = 'play';
}

function drawUp() {
  while (state.hand.length < MAX_HAND_SIZE && state.deck.length > 0) {
    state.hand.push(state.deck.shift());
  }
}

/* ---------------- 4. HAND EVAL ---------------- */

// Only 5-card hands can be straights; ace plays low for A-2-3-4-5
function isStraightRanks(cards) {
  if (cards.length !== 5) return false;
  const vals = [...new Set(cards.map(c => rankValue(c.rank)))].sort((a, b) => a - b);
  if (vals.length !== 5) return false;
  if (vals[0] === 2 && vals[1] === 3 && vals[2] === 4 && vals[3] === 5 && vals[4] === 14) return true;
  for (let i = 1; i < 5; i++) {
    if (vals[i] !== vals[i - 1] + 1) return false;
  }
  return true;
}

// Returns { type, name, base, scoring, pairCount, hasSuit }.
// `scoring` holds only the cards that count toward the hand type —
// kickers do not score (real Balatro rule).
function evaluateHand(cards) {
  const counts = {};    // rank -> count
  const suitCounts = {}; // suit -> count
  for (const c of cards) {
    counts[c.rank] = (counts[c.rank] || 0) + 1;
    suitCounts[c.suit] = (suitCounts[c.suit] || 0) + 1;
  }
  const groups = Object.values(counts).sort((a, b) => b - a); // e.g. [3,2] = full house
  const isFlush = cards.length === 5 && Object.values(suitCounts).some(v => v === 5);
  const isStraight = isStraightRanks(cards);

  let type;
  if (isStraight && isFlush) type = 'STRAIGHT_FLUSH';
  else if (groups[0] === 4) type = 'FOUR_KIND';
  else if (groups[0] === 3 && groups[1] === 2) type = 'FULL_HOUSE';
  else if (isFlush) type = 'FLUSH';
  else if (isStraight) type = 'STRAIGHT';
  else if (groups[0] === 3) type = 'THREE_KIND';
  else if (groups[0] === 2 && groups[1] === 2) type = 'TWO_PAIR';
  else if (groups[0] === 2) type = 'PAIR';
  else type = 'HIGH_CARD';

  let scoring;
  if (type === 'HIGH_CARD') {
    scoring = [cards.reduce((a, b) => (rankValue(b.rank) > rankValue(a.rank) ? b : a))];
  } else if (type === 'PAIR' || type === 'TWO_PAIR') {
    scoring = cards.filter(c => counts[c.rank] === 2);
  } else if (type === 'THREE_KIND') {
    scoring = cards.filter(c => counts[c.rank] === 3);
  } else if (type === 'FOUR_KIND') {
    scoring = cards.filter(c => counts[c.rank] === 4);
  } else {
    // STRAIGHT, FLUSH, STRAIGHT_FLUSH, FULL_HOUSE: every card scores
    scoring = cards.slice();
  }

  return {
    type,
    name: HANDS[type].name,
    base: HANDS[type],
    scoring,
    // Each rank with count >= 2 counts as one pair (3+/4-of-a-kind = 1 pair)
    pairCount: Object.values(counts).filter(v => v >= 2).length,
    hasSuit: (s) => suitCounts[s] > 0,
  };
}

/* ---------------- 5. SCORING ----------------
   Pipeline per requirements: base chips + scoring-card chip values, base
   mult, then jokers in held order grouped: all +chips -> all +mult -> xmult.
   (Joker shape is documented at the JOKERS pool in section 1.)
*/
function computePlayScore(cards, jokers = [], discardsLeft = 0) {
  const ev = evaluateHand(cards);
  const ctx = {
    cards,
    handType: ev.type,
    pairCount: ev.pairCount,
    hasSuit: ev.hasSuit,
    cardCount: cards.length,
    discardsLeft,
  };
  let chips = ev.base.chips + ev.scoring.reduce((sum, c) => sum + CHIP_VALUE[c.rank], 0);
  let mult = ev.base.mult;
  for (const kind of ['chips', 'mult', 'xmult']) {
    for (const j of jokers) {
      if (j.kind !== kind) continue;
      if (j.cond && !j.cond(ctx)) continue;
      const amt = typeof j.amount === 'function' ? j.amount(ctx) : j.value;
      if (kind === 'chips') chips += amt;
      else if (kind === 'mult') mult += amt;
      else mult *= amt;
    }
  }
  return { chips, mult, total: chips * mult, eval: ev };
}

/* ---------------- 6. ECONOMY ---------------- */

// Blind-clear reward: $3 base + $1 per unused discard
function blindReward(discardsLeft) {
  return BLIND_REWARD_BASE + discardsLeft;
}

// Interest: $1 per $5 held, capped at $5 — paid on wins only
function interest(money) {
  return Math.min(INTEREST_CAP, Math.floor(money / 5));
}

function applyBlindClearPayout(money, discardsLeft) {
  const reward = blindReward(discardsLeft);
  const int = interest(money);
  return { money: money + reward + int, reward, interest: int };
}

/* ---------------- 7. SHOP ---------------- */

let sellMode = false;

// Weighted random pick from an array by a weight function
function weightedPick(arr, weightFn) {
  const total = arr.reduce((sum, item) => sum + weightFn(item), 0);
  let r = Math.random() * total;
  for (const item of arr) {
    r -= weightFn(item);
    if (r <= 0) return item;
  }
  return arr[arr.length - 1]; // fallback for floating point edge
}

// 5 offers using weighted rarity selection.
// Excludes owned jokers from the pool unless Showman is owned.
function rollOffers() {
  const ownedIds = new Set((state ? state.jokers : []).map(j => j.id));
  const hasShowman = ownedIds.has('showman');
  // Candidate pool: all jokers minus owned (unless Showman allows dupes)
  const pool = hasShowman
    ? JOKERS.slice()
    : JOKERS.filter(j => !ownedIds.has(j.id));
  if (pool.length <= SHOP_OFFER_COUNT) return pool.slice();
  // Pick SHOP_OFFER_COUNT unique jokers via weighted rarity
  const chosen = [];
  const chosenIds = new Set();
  const candidates = pool.slice();
  for (let i = 0; i < SHOP_OFFER_COUNT && candidates.length > 0; i++) {
    const picked = weightedPick(candidates, j => RARITY_WEIGHTS[j.rarity] || 1);
    chosen.push(picked);
    chosenIds.add(picked.id);
    candidates.splice(candidates.indexOf(picked), 1);
  }
  return chosen;
}

function enterShop() {
  sellMode = false;
  state.shop = { offers: rollOffers(), rerollCost: SHOP_REROLL_BASE };
  state.screen = 'shop';
}

function canBuyJoker(offerIdx) {
  const j = state.shop && state.shop.offers[offerIdx];
  return !!j && state.money >= j.cost && state.jokers.length < MAX_JOKERS;
}

function buyJoker(offerIdx) {
  if (!canBuyJoker(offerIdx)) return false;
  const j = state.shop.offers[offerIdx];
  state.money -= j.cost;
  state.jokers.push(j);
  state.shop.offers[offerIdx] = null;
  render();
  return true;
}

function sellJoker(jokerIdx) {
  const j = state.jokers[jokerIdx];
  if (!j) return false;
  state.money += sellPrice(j);
  state.jokers.splice(jokerIdx, 1);
  render();
  return true;
}

function canRerollShop() {
  return !!state.shop && state.money >= state.shop.rerollCost;
}

function rerollShop() {
  if (!canRerollShop()) return false;
  state.money -= state.shop.rerollCost;
  state.shop.rerollCost += 1; // escalates this shop, resets on next
  state.shop.offers = rollOffers();
  render();
  return true;
}

function toggleSellMode() {
  sellMode = !sellMode;
  render();
}

function isSellMode() { return sellMode; }

// Skip: small/big blinds only (never boss), costs $4, no interest, lands in
// a fresh shop for the following blind.
function canSkipBlind() {
  return state.screen === 'shop' && state.blindIdx !== 2 && state.money >= SKIP_COST;
}

function skipBlind() {
  if (!canSkipBlind()) return false;
  const next = nextBlind(state.ante, state.blindIdx);
  if (!next) return false;
  state.money -= SKIP_COST;
  state.lastPayout = null;
  state.ante = next.ante;
  state.blindIdx = next.blindIdx;
  enterShop();
  render();
  return true;
}

// Leave the shop and play the next blind
function goNextBlind() {
  if (state.screen !== 'shop') return false;
  startBlind();
  render();
  return true;
}

/* ---------------- 8. FLOW ---------------- */

function selectedCards() {
  return state.selected.map(i => state.hand[i]).filter(Boolean);
}

function removeSelectedCards() {
  const sel = new Set(state.selected);
  state.hand = state.hand.filter((_, i) => !sel.has(i));
  state.selected = [];
}

function onPlayClick() {
  if (state.selected.length === 0 || state.playsLeft <= 0) return;
  const s = computePlayScore(selectedCards(), state.jokers, state.discardsLeft);
  state.playsLeft -= 1;
  removeSelectedCards();
  drawUp();
  if (state.sortMode) sortHand(state.sortMode);
  state.roundScore += s.total;

  const result = blindResult(state.roundScore, state.playsLeft, blindTarget());
  if (result === 'won') {
    onBlindCleared();
  } else {
    setStatus(`Played ${s.eval.name}: ${s.chips} chips × ${s.mult} mult = ${s.total} (total ${state.roundScore}/${blindTarget()})`);
    if (result === 'lost') onBlindLost();
  }
  render();
}

// Pure decision; win takes priority over play exhaustion
function blindResult(roundScore, playsLeft, target) {
  if (roundScore >= target) return 'won';
  if (playsLeft === 0) return 'lost';
  return 'ongoing';
}

function onBlindCleared() {
  const payout = applyBlindClearPayout(state.money, state.discardsLeft);
  state.money = payout.money;
  state.lastPayout = { ...payout, blind: blindName() };
  const next = nextBlind(state.ante, state.blindIdx);
  if (!next) {
    state.screen = 'victory';
    return;
  }
  state.ante = next.ante;
  state.blindIdx = next.blindIdx;
  enterShop();
}

function onBlindLost() {
  state.screen = 'gameover';
}

function newRun() {
  state = createRunState();
  startBlind();
  render();
}

// Pure progression: null = run complete (victory)
function nextBlind(ante, blindIdx) {
  if (blindIdx < 2) return { ante, blindIdx: blindIdx + 1 };
  if (ante < MAX_ANTE) return { ante: ante + 1, blindIdx: 0 };
  return null;
}

function onDiscardClick() {
  if (state.selected.length === 0 || state.discardsLeft <= 0) return;
  const n = state.selected.length;
  state.discardsLeft -= 1;
  removeSelectedCards();
  drawUp();
  if (state.sortMode) sortHand(state.sortMode);
  setStatus(`Discarded ${n} card(s).`);
  render();
}

function toggleSelect(i) {
  const pos = state.selected.indexOf(i);
  if (pos >= 0) state.selected.splice(pos, 1);
  else if (state.selected.length < MAX_SELECTED) state.selected.push(i); // max 5
  render();
}

// ---- Hand sorting ----
// Rank: ascending 2..A (ace high); ties broken by fixed suit order.
function compareByRank(a, b) {
  const dr = rankValue(a.rank) - rankValue(b.rank);
  return dr !== 0 ? dr : SUIT_ORDER[a.suit] - SUIT_ORDER[b.suit];
}
// Suit: group by suit (spade, heart, diamond, club); within each suit, rank asc 2..A.
function compareBySuit(a, b) {
  const ds = SUIT_ORDER[a.suit] - SUIT_ORDER[b.suit];
  return ds !== 0 ? ds : rankValue(a.rank) - rankValue(b.rank);
}

// Reorders state.hand and REMAPS state.selected so the same card objects stay
// selected — selection is stored as indices, so a plain in-place sort would
// silently point them at whichever cards land in those positions instead.
function sortHand(mode) {
  if (state.screen !== 'play') return;
  state.sortMode = mode;
  const cmp = mode === 'suit' ? compareBySuit : compareByRank;
  const sorted = state.hand.slice().sort(cmp);
  const newIndexOf = new Map(); // card object -> new index
  sorted.forEach((card, i) => newIndexOf.set(card, i));
  state.selected = state.selected
    .map(oldIdx => newIndexOf.get(state.hand[oldIdx])) // old idx -> card -> new idx
    .sort((a, b) => a - b);
  state.hand = sorted;
  render();
}

/* ---------------- 9. UI / RENDER ---------------- */

const IS_BROWSER = typeof document !== 'undefined';
const $ = (id) => document.getElementById(id);
let statusTimer = null;

function showScreen(name) {
  // 'play' = no overlay; others show their overlay div
  for (const s of ['shop', 'gameover', 'victory']) {
    const el = $('screen-' + s);
    if (el) el.classList.toggle('hidden', s !== name);
  }
}

function setStatus(msg) {
  if (!IS_BROWSER) return;
  // No dedicated status line in new layout; use splash area briefly
}

function renderHUD() {
  if (!IS_BROWSER) return;
  $('hud-blind').textContent = blindName();
  $('hud-target').textContent = `Score at least ${blindTarget()}`;
  $('hud-score').textContent = state.roundScore;
  $('hud-money').textContent = `$${state.money}`;
  $('hud-plays').textContent = state.playsLeft;
  $('hud-discards').textContent = state.discardsLeft;
  $('hud-ante').textContent = state.ante;
}

function renderSplash() {
  if (!IS_BROWSER) return;
  const sel = selectedCards();
  if (sel.length > 0) {
    const r = computePlayScore(sel, state.jokers, state.discardsLeft);
    $('base-chips').textContent = r.eval.base.chips;
    $('base-mult').textContent = r.eval.base.mult;
    $('splash-chips').textContent = r.eval.base.chips;
    $('splash-mult').textContent = r.eval.base.mult;
    $('hand-type-name').textContent = r.eval.name;
  } else {
    $('base-chips').textContent = '0';
    $('base-mult').textContent = '0';
    $('splash-chips').textContent = '0';
    $('splash-mult').textContent = '0';
    $('hand-type-name').textContent = 'select 1\u20135 cards';
  }
}

function setSplashDisplay(chips, mult) {
  if (!IS_BROWSER) return;
  $('splash-chips').textContent = chips;
  $('splash-mult').textContent = mult;
}

function updateButtons() {
  if (!IS_BROWSER) return;
  $('btn-play').disabled = state.selected.length === 0 || state.playsLeft <= 0;
  $('btn-discard').disabled = state.selected.length === 0 || state.discardsLeft <= 0;
}

function renderGameover() {
  if (!IS_BROWSER) return;
  $('gameover-stats').textContent =
    `Ante ${state.ante} \u2014 ${blindName()} \u00b7 Score ${state.roundScore} / ${blindTarget()}`;
}

function renderVictory() {
  if (!IS_BROWSER) return;
  $('victory-stats').textContent = `Final run money: $${state.money} \u00b7 Jokers: ${state.jokers.length}`;
}

function renderShop() {
  if (!IS_BROWSER) return;
  const offersEl = $('shop-offers');
  offersEl.innerHTML = '';
  state.shop.offers.forEach((j, i) => {
    const el = document.createElement('div');
    el.className = 'shop-offer' + (j ? '' : ' sold-out');
    if (j) {
      setJokerVars(el, j);
      const rarityClass = 'rarity-' + (j.rarity || 'common');
      el.innerHTML =
        `<span class="rarity-tag ${rarityClass}">${j.rarity || 'common'}</span>` +
        `<div class="offer-icon">${JOKER_ICONS[j.id] || ''}</div>` +
        `<div class="offer-name">${j.name}</div>` +
        `<div class="offer-text">${j.text}</div>` +
        `<div class="offer-price">$${j.cost}</div>`;
      const btn = document.createElement('button');
      btn.className = 'btn btn-small';
      btn.textContent = 'Buy';
      btn.disabled = !canBuyJoker(i);
      btn.addEventListener('click', () => buyJoker(i));
      el.appendChild(btn);
    } else {
      el.innerHTML = `<div class="offer-name">Sold</div>`;
    }
    offersEl.appendChild(el);
  });

  const ownedEl = $('shop-owned');
  ownedEl.innerHTML = '';
  state.jokers.forEach((j, i) => {
    const el = document.createElement('div');
    el.className = 'owned-joker' + (sellMode ? ' for-sale' : '');
    setJokerVars(el, j);
    el.title = `${j.name} \u2014 ${j.text}`;
    el.innerHTML = JOKER_ICONS[j.id] || '';
    if (sellMode) {
      const btn = document.createElement('button');
      btn.className = 'btn btn-small';
      btn.textContent = `$${sellPrice(j)}`;
      btn.style.marginTop = '2px';
      btn.addEventListener('click', () => sellJoker(i));
      el.appendChild(btn);
    }
    ownedEl.appendChild(el);
  });
  if (state.jokers.length === 0) {
    ownedEl.innerHTML = '<div class="owned-empty">No jokers yet.</div>';
  }

  const payoutEl = $('shop-last-payout');
  payoutEl.textContent = state.lastPayout
    ? `Last blind (${state.lastPayout.blind}): +$${state.lastPayout.reward} reward, +$${state.lastPayout.interest} interest`
    : '';

  $('btn-reroll').textContent = `Reroll ($${state.shop.rerollCost})`;
  $('btn-reroll').disabled = !canRerollShop();
  $('btn-skip-blind').textContent = `Skip Blind ($${SKIP_COST})`;
  $('btn-skip-blind').disabled = !canSkipBlind();
  $('btn-sell-mode').textContent = sellMode ? 'Exit Sell Mode' : 'Sell Jokers';
}

function render() {
  if (!IS_BROWSER) return;
  showScreen(state.screen);
  renderHUD();
  renderSplash();
  updateButtons();
  if (state.screen === 'shop') renderShop();
  if (state.screen === 'gameover') renderGameover();
  if (state.screen === 'victory') renderVictory();
}

/* ---------------- 10. INIT ---------------- */

function init() {
  const on = (id, fn) => { const el = $(id); if (el) el.addEventListener('click', fn); };
  // Play/Discard are handled by renderer.js (with animations)
  // Fallback: if renderer.js hasn't overridden, bind directly
  on('btn-sort-rank', () => sortHand('rank'));
  on('btn-sort-suit', () => sortHand('suit'));
  on('btn-new-run', newRun);
  on('btn-new-run-2', newRun);
  on('btn-next-blind', goNextBlind);
  on('btn-reroll', rerollShop);
  on('btn-skip-blind', skipBlind);
  on('btn-sell-mode', toggleSellMode);
  newRun();
}

// Browser boot only — Node requires the pure sections for tests.
if (typeof document !== 'undefined') {
  // Expose state getter + joker icon data globally for renderer.js
  // (top-level `const` in a classic script does NOT auto-attach to window
  // the way a `function` declaration does - toggleSelect/onPlayClick/
  // onDiscardClick work as bare globals for that reason, but data consts
  // like JOKER_ICON need an explicit assignment here.)
  window.getState = () => state;
  window.JOKER_ICON = JOKER_ICON;
  window.JOKER_ICONS = JOKER_ICONS;
  window.CHIP_VALUE = CHIP_VALUE;
  window.setSplashDisplay = setSplashDisplay;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
}

// Headless exports (Node)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    RANKS, SUITS, SUIT_SYMBOL, CHIP_VALUE, HANDS,
    BLIND_NAMES, BLIND_TARGETS,
    buildDeck, shuffle, evaluateHand, isStraightRanks, rankValue,
    computePlayScore, blindReward, interest, applyBlindClearPayout,
    nextBlind, blindResult,
    JOKERS, jokerById, HAND_RANK_ORDER, sellPrice,
    rollOffers, enterShop, canBuyJoker, buyJoker, sellJoker,
    canRerollShop, rerollShop, toggleSellMode, isSellMode,
    canSkipBlind, skipBlind, goNextBlind,
    createRunState, startBlind, newRun,
    getState: () => state, // read-only handle for headless tests
    onPlayClick, onDiscardClick, toggleSelect,
    SUIT_ORDER, compareByRank, compareBySuit, sortHand,
    MAX_HAND_SIZE, MAX_SELECTED, MAX_JOKERS, MAX_ANTE,
    BLIND_REWARD_BASE, INTEREST_CAP, SKIP_COST,
    SHOP_REROLL_BASE, SHOP_OFFER_COUNT,
    START_PLAYS, START_DISCARDS, START_MONEY,
    RARITY_WEIGHTS, RARITY_ORDER, weightedPick,
    JOKER_FRAME, JOKER_ICON, JOKER_ICONS,
  };
}
