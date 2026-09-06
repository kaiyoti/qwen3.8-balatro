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
// Boss column = 2x small-blind base (real Balatro); per-boss multipliers
// (Wall 4x, Needle 1x) are applied by blindTarget() when a boss is active.
const BLIND_TARGETS = { 1: [300, 450, 600], 2: [800, 1200, 1600], 3: [2000, 3000, 4000] };

const MAX_HAND_SIZE = 8;
const MAX_SELECTED = 5;
const MAX_JOKERS = 5;
const START_PLAYS = 4;
const START_DISCARDS = 3;
const START_MONEY = 4;
const MAX_ANTE = 3;
const BLIND_REWARD_BASE = 3; // $3 + $1 per unused discard
const BOSS_REWARD_BASE = 5;  // boss blinds pay $5 base (real Balatro)

// --- Boss Blinds (curated roster from balatrowiki.org, ante-gated) ---
// minAnte: first ante this boss can appear on. targetMult: multiplier on the
// small-blind base target (default 2x; The Wall 4x; The Needle 1x).
// Debuffed cards: 0 base/enhancement/edition chips+mult, all card effects
// nullified, but still count for hand detection. Face-down cards: hidden from
// the player only — they score normally when played.
// The boss's name/effect are hidden ("?") until the first valid play.
const BOSS_BLINDS = [
  // Ante 1 pool
  { id: 'hook',     name: 'The Hook',     minAnte: 1, text: 'After each play, 2 random cards in hand are removed' },
  { id: 'psychic',  name: 'The Psychic',  minAnte: 1, text: 'You must play exactly 5 cards' },
  { id: 'manacle',  name: 'The Manacle',  minAnte: 1, text: 'Hand size is 7 this round' },
  { id: 'goad',     name: 'The Goad',     minAnte: 1, text: 'All Spade cards are debuffed' },
  { id: 'club',     name: 'The Club',     minAnte: 1, text: 'All Club cards are debuffed' },
  { id: 'pillar',   name: 'The Pillar',   minAnte: 1, text: 'Cards played this ante (small/big) are debuffed' },
  // Ante 2 unlocks
  { id: 'wall',     name: 'The Wall',     minAnte: 2, targetMult: 4, text: '4x base score requirement' },
  { id: 'flint',    name: 'The Flint',    minAnte: 2, text: 'Base chips and mult of played hands are halved' },
  { id: 'water',    name: 'The Water',    minAnte: 2, text: 'You start with 0 discards' },
  { id: 'arm',      name: 'The Arm',      minAnte: 2, text: 'Each played hand type is permanently leveled down 1' },
  { id: 'mouth',    name: 'The Mouth',    minAnte: 2, text: 'Only one hand type can be played this round' },
  { id: 'house',    name: 'The House',    minAnte: 2, text: 'Your first hand is dealt face down' },
  { id: 'needle',   name: 'The Needle',   minAnte: 2, targetMult: 1, text: 'You can only play 1 hand' },
  // Ante 3 unlocks
  { id: 'eye',      name: 'The Eye',      minAnte: 3, text: 'No repeated hand types this round' },
  { id: 'tooth',    name: 'The Tooth',    minAnte: 3, text: 'Lose $1 for each card you play' },
];
const INTEREST_CAP = 5;      // $1 per $5 held, wins only
const SKIP_COST = 4;         // skipping a blind costs $4 (small/big only), no interest
const SHOP_REROLL_BASE = 5;  // +$1 per reroll this shop, resets next shop
const SHOP_OFFER_COUNT = 5;

// --- Card Modifiers (Phase 4) ---

const ENHANCEMENTS = ['bonus', 'mult', 'wild', 'glass', 'steel', 'stone', 'gold', 'lucky'];
const SEALS = ['gold', 'red', 'blue', 'purple'];
const EDITIONS = ['foil', 'holographic', 'polychrome', 'negative'];
const STICKERS = ['eternal', 'perishable', 'rental'];

// Appearance rates (Part A5)
const CARD_MOD_RATES = {
  enhancement: 0.40,  // 40% chance a card has an enhancement
  seal: 0.20,         // 20% chance a card has a seal
  edition: { foil: 0.04, holographic: 0.028, polychrome: 0.012 }, // mutually exclusive
};
const JOKER_MOD_RATES = {
  edition: { foil: 0.02, holographic: 0.014, polychrome: 0.003, negative: 0.003 },
  sticker: { eternal: 0.30, perishable: 0.30, rental: 0.30 }, // mutually exclusive (eternal vs perishable)
};

function rollCardModifiers() {
  const mod = {};
  if (Math.random() < CARD_MOD_RATES.enhancement) {
    mod.enhancement = ENHANCEMENTS[Math.floor(Math.random() * ENHANCEMENTS.length)];
  }
  if (Math.random() < CARD_MOD_RATES.seal) {
    mod.seal = SEALS[Math.floor(Math.random() * SEALS.length)];
  }
  const ed = Math.random();
  let cum = 0;
  for (const [name, rate] of Object.entries(CARD_MOD_RATES.edition)) {
    cum += rate;
    if (ed < cum) { mod.edition = name; break; }
  }
  return mod;
}

function rollJokerModifiers() {
  const mod = {};
  const ed = Math.random();
  let cum = 0;
  for (const [name, rate] of Object.entries(JOKER_MOD_RATES.edition)) {
    cum += rate;
    if (ed < cum) { mod.edition = name; break; }
  }
  const st = Math.random();
  let cum2 = 0;
  for (const [name, rate] of Object.entries(JOKER_MOD_RATES.sticker)) {
    cum2 += rate;
    if (st < cum2) { mod.sticker = name; break; }
  }
  // Can't be both Eternal and Perishable (mutually exclusive by design of single roll)
  return mod;
}

// --- Consumables (Phase 4 Pass 2) ---
const MAX_CONSUMABLES = 4;

// Planet cards: level up a hand type permanently for the run
const PLANET_CARDS = [
  { id: 'pluto',    name: 'Pluto',    handType: 'HIGH_CARD',      text: 'Level up High Card' },
  { id: 'mercury',  name: 'Mercury',  handType: 'PAIR',           text: 'Level up Pair' },
  { id: 'uranus',   name: 'Uranus',   handType: 'TWO_PAIR',       text: 'Level up Two Pair' },
  { id: 'venus',    name: 'Venus',    handType: 'THREE_KIND',     text: 'Level up Three of a Kind' },
  { id: 'saturn',   name: 'Saturn',   handType: 'STRAIGHT',       text: 'Level up Straight' },
  { id: 'jupiter',  name: 'Jupiter',  handType: 'FLUSH',          text: 'Level up Flush' },
  { id: 'earth',    name: 'Earth',    handType: 'FULL_HOUSE',     text: 'Level up Full House' },
  { id: 'mars',     name: 'Mars',     handType: 'FOUR_KIND',      text: 'Level up Four of a Kind' },
  { id: 'neptune',  name: 'Neptune',  handType: 'STRAIGHT_FLUSH', text: 'Level up Straight Flush' },
];

// Target up to n cards for a tarot: the selection if the player selected
// anything, otherwise the first n cards of the hand (so the tarot is never
// wasted). Destructive tarots (Hanged Man) use the selection directly.
function targetCards(s, n) {
  if (s.selected && s.selected.length > 0) {
    return s.selected.slice(0, n).map(i => s.hand[i]).filter(Boolean);
  }
  return s.hand.slice(0, n);
}

// Tarot cards: modify cards, gain money, or destroy
const TAROT_CARDS = [
  { id: 'hermit',   name: 'The Hermit',    text: 'Double your money (max $20)',
    apply: (s) => { s.money = Math.min(20, s.money * 2); } },
  { id: 'temperance', name: 'Temperance',  text: 'Gain $ = sell value of jokers (max $50)',
    apply: (s) => { const v = Math.min(50, s.jokers.reduce((sum, j) => sum + sellPrice(j), 0)); s.money += v; } },
  { id: 'hanged',   name: 'The Hanged Man', text: 'Destroy up to 2 selected cards',
    apply: (s) => {
      purpleSealCreates(s.selected.map(i => s.hand[i]).filter(Boolean));
      s.hand = s.hand.filter((_, i) => !s.selected.includes(i));
      s.selected = [];
      drawUp();
    } },
  { id: 'lovers',   name: 'The Lovers',    text: '1 card becomes Wild',
    apply: (s) => { const t = targetCards(s, 1); if (t.length) t[0].enhancement = 'wild'; } },
  { id: 'chariot',  name: 'The Chariot',   text: '1 card becomes Steel',
    apply: (s) => { const t = targetCards(s, 1); if (t.length) t[0].enhancement = 'steel'; } },
  { id: 'justice',  name: 'Justice',       text: '1 card becomes Glass',
    apply: (s) => { const t = targetCards(s, 1); if (t.length) t[0].enhancement = 'glass'; } },
  { id: 'devil',    name: 'The Devil',     text: '1 card becomes Gold',
    apply: (s) => { const t = targetCards(s, 1); if (t.length) t[0].enhancement = 'gold'; } },
  { id: 'tower',    name: 'The Tower',     text: '1 card becomes Stone',
    apply: (s) => { const t = targetCards(s, 1); if (t.length) { t[0].enhancement = 'stone'; t[0].rank = null; t[0].suit = null; } } },
  { id: 'strength', name: 'Strength',      text: 'Up to 2 cards: rank +1 (K becomes A)',
    apply: (s) => {
      const RANK_ORDER = ['2','3','4','5','6','7','8','9','10','J','Q','K','A'];
      for (const c of targetCards(s, 2)) {
        if (c.rank) {
          const idx = RANK_ORDER.indexOf(c.rank);
          if (idx >= 0 && idx < RANK_ORDER.length - 1) c.rank = RANK_ORDER[idx + 1];
        }
      }
    } },
  { id: 'sun',      name: 'The Sun',       text: 'Up to 3 cards become Hearts',
    apply: (s) => { for (const c of targetCards(s, 3)) { if (c.suit !== null) c.suit = 'heart'; } } },
];

// Use a consumable by index (removes it from the slot)
function useConsumable(idx, hand) {
  if (idx < 0 || idx >= state.consumables.length) return false;
  const con = state.consumables[idx];
  if (con.type === 'planet') {
    const pc = PLANET_CARDS.find(p => p.id === con.id);
    if (pc) {
      state.handLevels[pc.handType] = (state.handLevels[pc.handType] || 0) + 1;
    }
  } else if (con.type === 'tarot') {
    const tc = TAROT_CARDS.find(t => t.id === con.id);
    if (tc && tc.apply) tc.apply(hand || state);
  }
  state.consumables.splice(idx, 1);
  if (IS_BROWSER) render();
  return true;
}

// Add a consumable to the slot (returns false if full)
function addConsumable(con) {
  if (state.consumables.length >= MAX_CONSUMABLES) return false;
  state.consumables.push(con);
  return true;
}

// Purple Seal: each purple-sealed card being discarded creates a random
// tarot. Overflow past the slot limit is lost.
function purpleSealCreates(cards) {
  for (const c of cards) {
    if (c && c.seal === 'purple') {
      const t = TAROT_CARDS[Math.floor(Math.random() * TAROT_CARDS.length)];
      addConsumable({ type: 'tarot', id: t.id, name: t.name });
    }
  }
}

// Standard poker hand ranking (for "or better" joker conditions)
const HAND_RANK_ORDER = {
  HIGH_CARD: 0, PAIR: 1, TWO_PAIR: 2, THREE_KIND: 3, STRAIGHT: 4,
  FLUSH: 5, FULL_HOUSE: 6, FOUR_KIND: 7, STRAIGHT_FLUSH: 8,
};

// --- Hand Leveling (Phase 4 Pass 2: Planet cards) ---
// Per-level increments for each hand type (from balatrowiki.org)
const PLANET_LEVELS = {
  HIGH_CARD:      { name: 'Pluto',   chips: 10, mult: 1 },
  PAIR:           { name: 'Mercury', chips: 15, mult: 1 },
  TWO_PAIR:       { name: 'Uranus',  chips: 20, mult: 1 },
  THREE_KIND:     { name: 'Venus',   chips: 20, mult: 2 },
  STRAIGHT:       { name: 'Saturn',  chips: 30, mult: 3 },
  FLUSH:          { name: 'Jupiter', chips: 15, mult: 2 },
  FULL_HOUSE:     { name: 'Earth',   chips: 25, mult: 2 },
  FOUR_KIND:      { name: 'Mars',    chips: 30, mult: 3 },
  STRAIGHT_FLUSH: { name: 'Neptune', chips: 40, mult: 4 },
};

// Get the effective base for a hand type given its current level
function getHandBase(type, handLevels) {
  const base = HANDS[type];
  const lvl = (handLevels && handLevels[type]) || 0;
  if (lvl === 0) return { chips: base.chips, mult: base.mult };
  const inc = PLANET_LEVELS[type];
  return {
    chips: base.chips + lvl * inc.chips,
    mult: base.mult + lvl * inc.mult,
  };
}

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
    consumables: [], // tarot/planet/spectral cards (max 4)
    handLevels: {},  // { PAIR: 0, TWO_PAIR: 0, ... } per-run leveling
    lastHandType: null, // hand type of last play this round (Blue Seal); null if none
    boss: null,      // { id, name, text, targetMult, revealed } active boss blind
    bossSeen: [],    // boss ids already appeared this run (no repeats until all seen)
    playedThisAnte: [],  // "rank-suit" keys played during small/big of this ante (The Pillar)
    playedHandTypes: [], // hand types played this round (The Mouth / The Eye)
    screen: 'play', // 'play' | 'shop' | 'gameover' | 'victory'
    shop: null,     // { offers: [joker|null x5], rerollCost }
    lastPayout: null,
    sortMode: null, // null | 'rank' | 'suit'
  };
}

function blindName() { return BLIND_NAMES[state.blindIdx]; }
// Boss targets scale off the small-blind base by the boss's targetMult
// (default 2x; The Wall 4x; The Needle 1x).
function blindTarget() {
  if (state.blindIdx === 2 && state.boss) {
    return Math.round(BLIND_TARGETS[state.ante][0] * state.boss.targetMult);
  }
  return BLIND_TARGETS[state.ante][state.blindIdx];
}

/* ---------------- 3. DECK ---------------- */

function buildDeck(noMods) {
  const deck = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      const card = { rank, suit };
      if (!noMods) {
        const mod = rollCardModifiers();
        if (mod.enhancement) card.enhancement = mod.enhancement;
        if (mod.seal) card.seal = mod.seal;
        if (mod.edition) card.edition = mod.edition;
        if (card.enhancement === 'stone') { card.rank = null; card.suit = null; }
      }
      deck.push(card);
    }
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

// Roll the boss for this round: random from the ante-eligible pool
// (minAnte <= current ante), with no repeat until every eligible boss has
// appeared once (real Balatro's fewest-appearances rule, simplified).
function rollBoss(ante) {
  const eligible = BOSS_BLINDS.filter(b => b.minAnte <= ante);
  let pool = eligible.filter(b => !state.bossSeen.includes(b.id));
  if (pool.length === 0) pool = eligible;
  return pool[Math.floor(Math.random() * pool.length)];
}

// Effective hand size (The Manacle: 7)
function effMaxHand() {
  return state.boss && state.boss.id === 'manacle' ? MAX_HAND_SIZE - 1 : MAX_HAND_SIZE;
}

// Round-start boss effects (called after the deck/hand are built)
function applyBossSetup() {
  const b = state.boss;
  if (!b) return;
  const all = () => [...state.hand, ...state.deck];
  switch (b.id) {
    case 'water':  state.discardsLeft = 0; break;
    case 'needle': state.playsLeft = 1; break;
    case 'house':  state.hand.forEach(c => { c.faceDown = true; }); break;
    case 'goad':   all().forEach(c => { if (c.suit === 'spade') c.debuffed = true; }); break;
    case 'club':   all().forEach(c => { if (c.suit === 'club') c.debuffed = true; }); break;
    case 'pillar':
      if (state.playedThisAnte.length > 0) {
        all().forEach(c => {
          if (c.rank !== null && state.playedThisAnte.includes(c.rank + '-' + c.suit)) {
            c.debuffed = true;
          }
        });
      }
      break;
  }
}

function startBlind() {
  state.roundScore = 0;
  state.playsLeft = START_PLAYS;
  state.discardsLeft = START_DISCARDS;
  state.playedHandTypes = [];
  if (state.blindIdx === 0) state.playedThisAnte = [];
  // Roll the boss before building the deck/hand so its setup can apply
  if (state.blindIdx === 2) {
    const b = rollBoss(state.ante);
    state.boss = { id: b.id, name: b.name, text: b.text, targetMult: b.targetMult || 2, revealed: false };
    state.bossSeen.push(state.boss.id);
  } else {
    state.boss = null;
  }
  state.deck = shuffle(buildDeck());
  state.hand = state.deck.splice(0, effMaxHand());
  state.selected = [];
  state.lastHandType = null;
  applyBossSetup();
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
// Wild: counts as every suit for flush detection.
// Stone: no rank/suit, always in scoring, excluded from pair/straight/flush.
function evaluateHand(cards) {
  // Separate Stone cards (always score, don't participate in detection)
  const stones = cards.filter(c => c.enhancement === 'stone');
  const regular = cards.filter(c => c.enhancement !== 'stone');

  const counts = {};    // rank -> count
  const suitCounts = { spade: 0, heart: 0, diamond: 0, club: 0 };
  for (const c of regular) {
    if (c.rank !== null) counts[c.rank] = (counts[c.rank] || 0) + 1;
    if (c.enhancement === 'wild') {
      // Wild counts as every suit
      for (const s of SUITS) suitCounts[s]++;
    } else if (c.suit) {
      suitCounts[c.suit] = (suitCounts[c.suit] || 0) + 1;
    }
  }
  const groups = Object.values(counts).sort((a, b) => b - a);
  const isFlush = regular.length === 5 && Object.values(suitCounts).some(v => v >= 5);
  const isStraight = isStraightRanks(regular);

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
    const validCards = regular.filter(c => c.rank !== null);
    scoring = validCards.length > 0
      ? [validCards.reduce((a, b) => (rankValue(b.rank) > rankValue(a.rank) ? b : a))]
      : [];
  } else if (type === 'PAIR' || type === 'TWO_PAIR') {
    scoring = regular.filter(c => c.rank !== null && counts[c.rank] === 2);
  } else if (type === 'THREE_KIND') {
    scoring = regular.filter(c => c.rank !== null && counts[c.rank] === 3);
  } else if (type === 'FOUR_KIND') {
    scoring = regular.filter(c => c.rank !== null && counts[c.rank] === 4);
  } else {
    scoring = regular.filter(c => c.rank !== null).slice();
  }
  // Stone cards always score
  scoring = scoring.concat(stones);

  return {
    type,
    name: HANDS[type].name,
    base: HANDS[type],
    scoring,
    pairCount: Object.values(counts).filter(v => v >= 2).length,
    hasSuit: (s) => suitCounts[s] > 0,
  };
}

/* ---------------- 5. SCORING ----------------
   Pipeline order (documented):
   1. Chips: base + scoring card values + per-card enhancement chips + per-card edition chips
   2. Mult: base + per-card enhancement mult + per-card edition mult + joker mult
   3. xMult: Steel (×1.5/held) × Glass (×2/scored) × Polychrome (×1.5/scored) × joker xmult
   4. Red Seal: scoring card's total contribution ×2 (applied as bonus chips)
   (Joker shape is documented at the JOKERS pool in section 1.)
*/
function computePlayScore(cards, jokers = [], discardsLeft = 0, hand = null, handLevels = null) {
  const ev = evaluateHand(cards);
  // Use leveled base if handLevels provided
  let base = handLevels ? getHandBase(ev.type, handLevels) : ev.base;
  // The Flint: base chips/mult of played hands halved for the round
  if (state && state.boss && state.boss.id === 'flint') {
    base = { chips: Math.floor(base.chips / 2), mult: Math.floor(base.mult / 2) };
  }
  const ctx = {
    cards,
    handType: ev.type,
    pairCount: ev.pairCount,
    hasSuit: ev.hasSuit,
    cardCount: cards.length,
    discardsLeft,
  };

  // --- Chips pass ---
  let chips = base.chips;
  for (const c of ev.scoring) {
    // Debuffed cards (boss blinds) contribute nothing but still count for
    // hand detection — they are already in ev.scoring.
    if (c.debuffed) continue;
    // Base chip value (Stone = 0, no rank)
    if (c.rank !== null) chips += CHIP_VALUE[c.rank] || 0;
    // Enhancement chips
    if (c.enhancement === 'bonus') chips += 30;
    if (c.enhancement === 'stone') chips += 50;
    // Edition chips
    if (c.edition === 'foil') chips += 50;
    // Red Seal: double this card's contribution (chip value + enhancement + edition)
    if (c.seal === 'red') {
      let cardContrib = (c.rank !== null ? CHIP_VALUE[c.rank] || 0 : 0);
      if (c.enhancement === 'bonus') cardContrib += 30;
      if (c.enhancement === 'stone') cardContrib += 50;
      if (c.edition === 'foil') cardContrib += 50;
      chips += cardContrib; // add it again (retrigger)
    }
  }
  // Joker chips (Foil edition adds +50 before joker's own effect)
  for (const j of jokers) {
    if (j.kind !== 'chips') continue;
    if (j.cond && !j.cond(ctx)) continue;
    if (j.edition === 'foil') chips += 50;
    chips += typeof j.amount === 'function' ? j.amount(ctx) : j.value;
  }

  // --- Mult pass ---
  let mult = base.mult;
  for (const c of ev.scoring) {
    if (c.debuffed) continue;
    if (c.enhancement === 'mult') mult += 4;
    if (c.enhancement === 'lucky' && Math.random() < 0.2) mult += 20;
    if (c.edition === 'holographic') mult += 10;
  }
  // Joker mult (Holo edition adds +10 before joker's own effect)
  for (const j of jokers) {
    if (j.kind !== 'mult') continue;
    if (j.cond && !j.cond(ctx)) continue;
    if (j.edition === 'holographic') mult += 10;
    mult += typeof j.amount === 'function' ? j.amount(ctx) : j.value;
  }

  // --- xMult pass ---
  const heldCards = hand || cards; // Steel applies to held (unplayed) cards
  for (const c of heldCards) {
    if (c.debuffed) continue;
    if (c.enhancement === 'steel') mult *= 1.5;
  }
  for (const c of ev.scoring) {
    if (c.debuffed) continue;
    if (c.enhancement === 'glass') mult *= 2;
    if (c.edition === 'polychrome') mult *= 1.5;
  }
  // Joker xmult (Poly edition multiplies ×1.5 after joker's own effect)
  for (const j of jokers) {
    if (j.kind !== 'xmult') continue;
    if (j.cond && !j.cond(ctx)) continue;
    mult *= typeof j.amount === 'function' ? j.amount(ctx) : j.value;
    if (j.edition === 'polychrome') mult *= 1.5;
  }

  // --- Money pass (Gold Seal, Lucky) ---
  let money = 0;
  for (const c of ev.scoring) {
    if (c.debuffed) continue;
    if (c.seal === 'gold') money += 3;
    if (c.enhancement === 'lucky' && Math.random() < 1 / 15) money += 20;
  }

  mult = Math.round(mult * 100) / 100; // avoid floating point drift
  return { chips, mult, total: Math.round(chips * mult * 100) / 100, eval: ev, money };
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

function applyBlindClearPayout(money, discardsLeft, isBoss = false) {
  const base = isBoss ? BOSS_REWARD_BASE : BLIND_REWARD_BASE;
  const reward = base + discardsLeft;
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
  if (pool.length <= SHOP_OFFER_COUNT) {
    return pool.slice().map(j => attachJokerMods(j));
  }
  // Pick SHOP_OFFER_COUNT unique jokers via weighted rarity
  const chosen = [];
  const chosenIds = new Set();
  const candidates = pool.slice();
  for (let i = 0; i < SHOP_OFFER_COUNT && candidates.length > 0; i++) {
    const picked = weightedPick(candidates, j => RARITY_WEIGHTS[j.rarity] || 1);
    chosen.push(attachJokerMods(picked));
    chosenIds.add(picked.id);
    candidates.splice(candidates.indexOf(picked), 1);
  }
  return chosen;
}

// Create a copy of the joker with rolled modifiers attached
function attachJokerMods(j) {
  const mod = rollJokerModifiers();
  const copy = { ...j };
  if (mod.edition) copy.edition = mod.edition;
  if (mod.sticker) copy.sticker = mod.sticker;
  return copy;
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

// Boss play restrictions. Returns an error string if the play is invalid,
// else null. Restrictions apply from round start, even while the boss's
// identity is still hidden (that's the point of the "?" reveal).
function bossPlayError(handType, cardCount) {
  const b = state.boss;
  if (!b) return null;
  switch (b.id) {
    case 'psychic':
      if (cardCount !== 5) return 'The Psychic: you must play exactly 5 cards';
      break;
    case 'mouth':
      if (state.playedHandTypes.length > 0 && state.playedHandTypes[0] !== handType) {
        return 'The Mouth: only one hand type can be played this round';
      }
      break;
    case 'eye':
      if (state.playedHandTypes.includes(handType)) {
        return 'The Eye: no repeated hand types this round';
      }
      break;
  }
  return null;
}

// Per-play boss effects, applied after a valid play.
function applyBossOnPlay(handType, cardCount) {
  const b = state.boss;
  if (!b) return;
  switch (b.id) {
    case 'hook': {
      // Remove up to 2 random cards from hand back into the deck
      for (let k = 0; k < 2 && state.hand.length > 0; k++) {
        const i = Math.floor(Math.random() * state.hand.length);
        state.deck.push(state.hand.splice(i, 1)[0]);
      }
      break;
    }
    case 'arm':
      // Permanently level the played hand type down by 1 (min 0)
      if (state.handLevels[handType]) {
        state.handLevels[handType] = Math.max(0, state.handLevels[handType] - 1);
      }
      break;
    case 'tooth':
      state.money = Math.max(0, state.money - cardCount);
      break;
  }
}

function onPlayClick() {
  if (state.selected.length === 0 || state.playsLeft <= 0) return;
  const played = selectedCards();
  // Boss restriction check (before scoring); blocked plays don't reveal
  const preEv = evaluateHand(played);
  const err = bossPlayError(preEv.type, played.length);
  if (err) { setStatus(err); render(); return; }

  const s = computePlayScore(played, state.jokers, state.discardsLeft, state.hand, state.handLevels);
  // Track cards played this ante (small/big only) for The Pillar
  if (state.blindIdx !== 2) {
    for (const c of played) state.playedThisAnte.push(c.rank + '-' + c.suit);
  }
  state.playedHandTypes.push(s.eval.type);
  if (state.boss) state.boss.revealed = true;
  state.lastHandType = s.eval.type;
  state.playsLeft -= 1;
  removeSelectedCards();
  drawUp();
  if (state.sortMode) sortHand(state.sortMode);
  state.roundScore += s.total;
  if (s.money) state.money += s.money;
  applyBossOnPlay(s.eval.type, played.length);

  const result = blindResult(state.roundScore, state.playsLeft, blindTarget());
  if (result === 'won') {
    onBlindCleared();
  } else {
    const earned = s.money ? ` (+$${s.money})` : '';
    setStatus(`Played ${s.eval.name}: ${s.chips} chips × ${s.mult} mult = ${s.total} (total ${state.roundScore}/${blindTarget()})${earned}`);
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
  // Round-end hooks (card modifiers)
  applyRoundEndHooks();

  const payout = applyBlindClearPayout(state.money, state.discardsLeft, state.blindIdx === 2);
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

// Round-end effects: Gold enhancement, Blue Seal, Rental sticker, Glass destruction
function applyRoundEndHooks() {
  // Gold: +$3 per gold-enhanced card still in hand
  for (const c of state.hand) {
    if (c.enhancement === 'gold') state.money += 3;
  }
  // Blue Seal: each blue-sealed card held (not played) creates the planet
  // for the hand type last played this round. Skipped if no hand was played;
  // overflow past the slot limit is lost.
  if (state.lastHandType) {
    const planet = PLANET_CARDS.find(p => p.handType === state.lastHandType);
    for (const c of state.hand) {
      if (c.seal === 'blue' && planet) {
        addConsumable({ type: 'planet', id: planet.id, name: planet.name });
      }
    }
  }
  // Rental: -$3 per rental-stickered joker
  for (const j of state.jokers) {
    if (j.sticker === 'rental') state.money -= 3;
  }
  state.money = Math.max(0, state.money);

  // Glass: 1-in-4 chance to be destroyed after scoring (check hand + deck)
  const allCards = [...state.hand, ...state.deck];
  for (let i = allCards.length - 1; i >= 0; i--) {
    if (allCards[i].enhancement === 'glass' && Math.random() < 0.25) {
      // Remove from wherever it is
      const handIdx = state.hand.indexOf(allCards[i]);
      if (handIdx !== -1) state.hand.splice(handIdx, 1);
      else {
        const deckIdx = state.deck.indexOf(allCards[i]);
        if (deckIdx !== -1) state.deck.splice(deckIdx, 1);
      }
    }
  }
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
  purpleSealCreates(selectedCards());
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
  // Boss blind: hidden as "?" until the first valid play reveals it
  const isBoss = state.blindIdx === 2 && state.boss;
  $('hud-blind').textContent = isBoss ? (state.boss.revealed ? state.boss.name : 'Boss Blind ?') : blindName();
  const eff = $('boss-effect');
  if (eff) {
    if (isBoss) {
      eff.textContent = state.boss.revealed ? state.boss.text : '???';
      eff.style.visibility = 'visible';
    } else {
      eff.style.visibility = 'hidden';
    }
  }
  $('hud-target').textContent = `Score at least ${blindTarget()}`;
  $('hud-score').textContent = state.roundScore;
  $('hud-money').textContent = `$${state.money}`;
  $('hud-plays').textContent = state.playsLeft;
  $('hud-discards').textContent = state.discardsLeft;
  $('hud-ante').textContent = state.ante + '/' + MAX_ANTE;
}

function renderSplash() {
  if (!IS_BROWSER) return;
  const sel = selectedCards();
  if (sel.length > 0) {
    const r = computePlayScore(sel, state.jokers, state.discardsLeft, state.hand, state.handLevels);
    $('splash-chips').textContent = r.chips;
    $('splash-mult').textContent = r.mult;
    // A hand containing face-down cards shows as "???" (values hidden)
    $('hand-type-name').textContent = sel.some(c => c.faceDown) ? '???' : r.eval.name;
  } else {
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

function flashSplash() {
  if (!IS_BROWSER) return;
  const row = document.querySelector('#panel-splash .splash-row');
  if (!row) return;
  row.classList.remove('flash');
  void row.offsetWidth; // force reflow to restart animation
  row.classList.add('flash');
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
  renderConsumables();
  updateButtons();
  if (state.screen === 'shop') renderShop();
  if (state.screen === 'gameover') renderGameover();
  if (state.screen === 'victory') renderVictory();
}

function renderConsumables() {
  if (!IS_BROWSER) return;
  const row = $('consumable-row');
  if (!row) return;
  row.innerHTML = '';
  state.consumables.forEach((con, i) => {
    const el = document.createElement('div');
    el.className = 'consumable-card';
    const icon = con.type === 'planet' ? '🪐' : '🃏';
    el.innerHTML = `<span class="con-icon">${icon}</span>`;
    el.title = con.name || con.id;
    el.addEventListener('click', () => { useConsumable(i); });
    row.appendChild(el);
  });
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
  window.flashSplash = flashSplash;
  window.useConsumable = useConsumable;
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
    ENHANCEMENTS, SEALS, EDITIONS, STICKERS,
    CARD_MOD_RATES, JOKER_MOD_RATES,
    rollCardModifiers, rollJokerModifiers, applyRoundEndHooks,
    PLANET_LEVELS, getHandBase, PLANET_CARDS, TAROT_CARDS,
    MAX_CONSUMABLES, useConsumable, addConsumable,
    BOSS_BLINDS, BOSS_REWARD_BASE, rollBoss, effMaxHand, applyBossSetup,
    bossPlayError, applyBossOnPlay, blindTarget,
  };
}
