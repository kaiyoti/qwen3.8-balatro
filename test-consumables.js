'use strict';
/* Headless self-test — Phase 4 Pass 2: Consumables (planets, tarot,
   hand leveling, slot system).
   Run:  node test-consumables.js
   Exits 0 when all checks pass, 1 on any failure. */

const G = require('./game.js');
const { getHandBase, HANDS, PLANET_LEVELS, PLANET_CARDS, TAROT_CARDS,
  computePlayScore, useConsumable, addConsumable, MAX_CONSUMABLES } = G;

let passed = 0, failed = 0;
function check(label, cond) {
  if (cond) { passed++; }
  else { failed++; console.log(`  FAIL  ${label}`); }
}

console.log('== Hand Leveling ==');

// Base level 0 = unchanged
{
  const base = getHandBase('PAIR', {});
  check('Pair level 0: 10 chips, 2 mult', base.chips === 10 && base.mult === 2);
}

// Level 1 adds planet increments
{
  const base = getHandBase('PAIR', { PAIR: 1 });
  check('Pair level 1: 25 chips (10+15), 3 mult (2+1)', base.chips === 25 && base.mult === 3);
}

// Level 3 stacks
{
  const base = getHandBase('STRAIGHT', { STRAIGHT: 3 });
  check('Straight level 3: 120 chips (30+90), 13 mult (4+9)', base.chips === 120 && base.mult === 13);
}

// No handLevels = base values
{
  const base = getHandBase('FLUSH', null);
  check('Flush no levels: 35 chips, 4 mult', base.chips === 35 && base.mult === 4);
}

// All 9 planet types have valid data
{
  for (const [type, inc] of Object.entries(PLANET_LEVELS)) {
    check(`${type} has valid planet data`, inc.chips > 0 && inc.mult > 0 && inc.name.length > 0);
  }
}

console.log('== Scoring with hand levels ==');

// Pair with level 1: base should be 25 chips, 3 mult (not 10, 2)
{
  const cards = [
    { rank: 'A', suit: 'spade' }, { rank: 'A', suit: 'heart' },
  ];
  const levels = { PAIR: 1 };
  const r = computePlayScore(cards, [], 0, null, levels);
  // Base: 25 chips, 3 mult. Cards: 11+11=22 chips. Total: 47 chips, 3 mult = 141
  check('Pair lvl1: 25+22=47 chips, 3 mult, total 141', r.chips === 47 && r.mult === 3 && r.total === 141);
}

// Compare with no levels
{
  const cards = [
    { rank: 'A', suit: 'spade' }, { rank: 'A', suit: 'heart' },
  ];
  const r0 = computePlayScore(cards, [], 0, null, null);
  const r1 = computePlayScore(cards, [], 0, null, { PAIR: 2 });
  check('Pair lvl2 scores higher than lvl0', r1.total > r0.total);
}

console.log('== Planet Cards ==');

check('9 planet cards defined', PLANET_CARDS.length === 9);
check('All planet cards have valid handType', PLANET_CARDS.every(p => HANDS[p.handType] !== undefined));
check('All planet cards have unique IDs', new Set(PLANET_CARDS.map(p => p.id)).size === 9);

console.log('== Tarot Cards ==');

check('10 tarot cards defined', TAROT_CARDS.length === 10);
check('All tarot have apply function', TAROT_CARDS.every(t => typeof t.apply === 'function'));
check('All tarot have unique IDs', new Set(TAROT_CARDS.map(t => t.id)).size === 10);

// Test specific tarot effects
G.newRun();
{
  const s = G.getState();

  // Hermit: double money
  s.money = 5;
  s.consumables = [{ type: 'tarot', id: 'hermit', name: 'The Hermit' }];
  G.useConsumable(0);
  check('Hermit: $5 doubled to $10', s.money === 10);

  // Hermit cap at $20
  s.money = 15;
  s.consumables = [{ type: 'tarot', id: 'hermit', name: 'The Hermit' }];
  G.useConsumable(0);
  check('Hermit: $15 capped at $20', s.money === 20);
}

{
  const s = G.getState();
  s.money = 10;
  s.hand = [{ rank: '5', suit: 'spade' }, { rank: '7', suit: 'heart' }];
  s.selected = [0, 1];
  s.deck = G.buildDeck(true).slice();
  s.consumables = [{ type: 'tarot', id: 'hanged', name: 'The Hanged Man' }];
  G.useConsumable(0);
  check('Hanged Man: selection cleared after destroy', s.selected.length === 0);
}

{
  const s = G.getState();
  s.hand = [{ rank: '5', suit: 'spade' }, { rank: '7', suit: 'heart' }];
  s.deck = G.buildDeck(true).slice();
  s.consumables = [{ type: 'tarot', id: 'lovers', name: 'The Lovers' }];
  G.useConsumable(0);
  check('Lovers: first card becomes Wild', s.hand[0].enhancement === 'wild');
}

{
  const s = G.getState();
  s.hand = [{ rank: '5', suit: 'spade' }, { rank: '7', suit: 'heart' }];
  s.consumables = [{ type: 'tarot', id: 'tower', name: 'The Tower' }];
  G.useConsumable(0);
  check('Tower: first card becomes Stone (null rank)', s.hand[0].enhancement === 'stone' && s.hand[0].rank === null);
}

{
  const s = G.getState();
  s.hand = [{ rank: '5', suit: 'spade' }, { rank: '7', suit: 'heart' }];
  s.consumables = [{ type: 'tarot', id: 'sun', name: 'The Sun' }];
  G.useConsumable(0);
  check('Sun: cards become Hearts', s.hand[0].suit === 'heart' && s.hand[1].suit === 'heart');
}

console.log('== Planet card use ==');

{
  const s = G.getState();
  s.handLevels = {};
  s.consumables = [{ type: 'planet', id: 'mercury', name: 'Mercury' }];
  G.useConsumable(0);
  check('Mercury: PAIR level 1', s.handLevels.PAIR === 1);

  s.consumables = [{ type: 'planet', id: 'mercury', name: 'Mercury' }];
  G.useConsumable(0);
  check('Mercury again: PAIR level 2', s.handLevels.PAIR === 2);
}

console.log('== Consumable slot limits ==');

{
  const s = G.getState();
  s.consumables = [];
  check('Empty slot: addConsumable succeeds', G.addConsumable({ type: 'tarot', id: 'hermit', name: 'test' }) === true);
  check('Slot count is 1', s.consumables.length === 1);

  // Fill to max
  while (s.consumables.length < MAX_CONSUMABLES) {
    G.addConsumable({ type: 'tarot', id: 'hermit', name: 'fill' });
  }
  check('Slot full at MAX_CONSUMABLES', s.consumables.length === MAX_CONSUMABLES);
  check('Add when full returns false', G.addConsumable({ type: 'tarot', id: 'hermit', name: 'overflow' }) === false);
  check('Slot count unchanged after overflow', s.consumables.length === MAX_CONSUMABLES);
}

// Use removes from slot
{
  const s = G.getState();
  s.consumables = [{ type: 'tarot', id: 'hermit', name: 'test' }, { type: 'planet', id: 'pluto', name: 'Pluto' }];
  G.useConsumable(0);
  check('Use removes from slot (2→1)', s.consumables.length === 1);
  check('Remaining is the planet', s.consumables[0].id === 'pluto');
}

// Use out of bounds
{
  const s = G.getState();
  s.consumables = [];
  check('Use out of bounds returns false', G.useConsumable(0) === false);
}

console.log('== Blue Seal (round-end hook) ==');

// Blue-sealed card held at round end -> planet for the hand type last played
{
  G.newRun();
  const s = G.getState();
  s.consumables = [];
  s.hand = [{ rank: '5', suit: 'spade', seal: 'blue' }, { rank: '7', suit: 'heart' }];
  s.lastHandType = 'PAIR';
  G.applyRoundEndHooks();
  check('Blue Seal: creates Mercury for last PAIR',
    s.consumables.length === 1 && s.consumables[0].type === 'planet' && s.consumables[0].id === 'mercury');
}

// One planet per blue-sealed card held
{
  G.newRun();
  const s = G.getState();
  s.consumables = [];
  s.hand = [{ rank: '5', suit: 'spade', seal: 'blue' }, { rank: '6', suit: 'spade', seal: 'blue' }];
  s.lastHandType = 'FLUSH';
  G.applyRoundEndHooks();
  check('Blue Seal: 2 blue cards -> 2 Jupiter planets',
    s.consumables.length === 2 && s.consumables.every(c => c.id === 'jupiter'));
}

// No hand played this round -> no planet
{
  G.newRun();
  const s = G.getState();
  s.consumables = [];
  s.hand = [{ rank: '5', suit: 'spade', seal: 'blue' }];
  s.lastHandType = null;
  G.applyRoundEndHooks();
  check('Blue Seal: no hand played -> no planet', s.consumables.length === 0);
}

// Slot full -> planet lost
{
  G.newRun();
  const s = G.getState();
  s.consumables = [
    { type: 'tarot', id: 'hermit', name: 'fill1' }, { type: 'tarot', id: 'hermit', name: 'fill2' },
    { type: 'tarot', id: 'hermit', name: 'fill3' }, { type: 'tarot', id: 'hermit', name: 'fill4' },
  ];
  s.hand = [{ rank: '5', suit: 'spade', seal: 'blue' }];
  s.lastHandType = 'PAIR';
  G.applyRoundEndHooks();
  check('Blue Seal: slot full -> planet lost', s.consumables.length === 4);
}

// onPlayClick records the hand type for Blue Seal
{
  G.newRun();
  const s = G.getState();
  s.hand = [
    { rank: 'A', suit: 'spade' }, { rank: 'A', suit: 'heart' },
    { rank: '2', suit: 'spade' }, { rank: '3', suit: 'spade' },
    { rank: '4', suit: 'spade' }, { rank: '5', suit: 'spade' },
  ];
  s.selected = [0, 1];
  s.lastHandType = null;
  G.onPlayClick();
  check('onPlayClick: records lastHandType PAIR', s.lastHandType === 'PAIR');
}

console.log('== Purple Seal (creates tarot on discard) ==');

// Discarding a purple-sealed card creates a random tarot
{
  G.newRun();
  const s = G.getState();
  s.hand = [{ rank: '5', suit: 'spade', seal: 'purple' }, { rank: '7', suit: 'heart' }];
  s.deck = G.buildDeck(true).slice();
  s.selected = [0];
  s.consumables = [];
  G.onDiscardClick();
  const con = s.consumables[0];
  const validId = con && G.TAROT_CARDS.some(t => t.id === con.id);
  check('Purple Seal: discard creates a valid tarot',
    s.consumables.length === 1 && con.type === 'tarot' && validId);
  check('Purple Seal: card was discarded', !s.hand.some(c => c.seal === 'purple'));
}

// Hanged Man destruction also triggers Purple Seal
{
  G.newRun();
  const s = G.getState();
  s.hand = [{ rank: '5', suit: 'spade', seal: 'purple' }, { rank: '7', suit: 'heart' }];
  s.deck = G.buildDeck(true).slice();
  s.selected = [0];
  s.consumables = [{ type: 'tarot', id: 'hanged', name: 'The Hanged Man' }];
  G.useConsumable(0);
  check('Purple Seal via Hanged Man: hanged consumed, 1 tarot created',
    s.consumables.length === 1 && s.consumables[0].type === 'tarot');
}

console.log('== Tarot cards (remaining five) ==');

// Temperance: $ = sum of joker sell values, max $50
{
  G.newRun();
  const s = G.getState();
  s.jokers = [G.JOKERS[0], G.JOKERS[1]];
  const expected = Math.min(50, s.jokers.reduce((sum, j) => sum + G.sellPrice(j), 0));
  s.money = 10;
  s.consumables = [{ type: 'tarot', id: 'temperance', name: 'Temperance' }];
  G.useConsumable(0);
  check(`Temperance: +$${expected} from joker sell values`, s.money === 10 + expected);
}

// Chariot: targets the selected card, not hand[0]
{
  G.newRun();
  const s = G.getState();
  s.hand = [{ rank: '5', suit: 'spade' }, { rank: '7', suit: 'heart' }];
  s.selected = [1];
  s.consumables = [{ type: 'tarot', id: 'chariot', name: 'The Chariot' }];
  G.useConsumable(0);
  check('Chariot: selected card becomes Steel', s.hand[1].enhancement === 'steel');
  check('Chariot: unselected card untouched', s.hand[0].enhancement === undefined);
}

// Justice: selected card becomes Glass
{
  G.newRun();
  const s = G.getState();
  s.hand = [{ rank: '5', suit: 'spade' }, { rank: '7', suit: 'heart' }];
  s.selected = [0];
  s.consumables = [{ type: 'tarot', id: 'justice', name: 'Justice' }];
  G.useConsumable(0);
  check('Justice: selected card becomes Glass', s.hand[0].enhancement === 'glass');
}

// Devil: no selection -> falls back to first card, becomes Gold
{
  G.newRun();
  const s = G.getState();
  s.hand = [{ rank: '5', suit: 'spade' }, { rank: '7', suit: 'heart' }];
  s.selected = [];
  s.consumables = [{ type: 'tarot', id: 'devil', name: 'The Devil' }];
  G.useConsumable(0);
  check('Devil: fallback to first card, becomes Gold', s.hand[0].enhancement === 'gold');
}

// Strength: K becomes A; other selected card 9 -> 10
{
  G.newRun();
  const s = G.getState();
  s.hand = [{ rank: 'K', suit: 'spade' }, { rank: '9', suit: 'heart' }];
  s.selected = [0, 1];
  s.consumables = [{ type: 'tarot', id: 'strength', name: 'Strength' }];
  G.useConsumable(0);
  check('Strength: K -> A', s.hand[0].rank === 'A');
  check('Strength: 9 -> 10', s.hand[1].rank === '10');
}

// Strength: A stays A
{
  G.newRun();
  const s = G.getState();
  s.hand = [{ rank: 'A', suit: 'spade' }];
  s.selected = [0];
  s.consumables = [{ type: 'tarot', id: 'strength', name: 'Strength' }];
  G.useConsumable(0);
  check('Strength: A stays A', s.hand[0].rank === 'A');
}

// Summary
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
