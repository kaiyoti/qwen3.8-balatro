'use strict';
/* Headless self-test — hand evaluation (Milestone 3).
   Run:  node test-hands.js
   Exits 0 when all checks pass, 1 on any failure. */

const { buildDeck, evaluateHand, HANDS } = require('./game.js');

let passed = 0;
let failed = 0;

function check(label, cond) {
  if (cond) { passed++; console.log(`  PASS  ${label}`); }
  else { failed++; console.log(`  FAIL  ${label}`); }
}

const c = (rank, suit) => ({ rank, suit });

function caseCheck(label, cards, expectedType, expectedScoringRanks) {
  console.log(`\n${label}`);
  const r = evaluateHand(cards);
  check(`type is ${expectedType}`, r.type === expectedType);
  const got = r.scoring.map(x => x.rank).sort().join('|');
  const want = expectedScoringRanks.slice().sort().join('|');
  check(`scoring cards [${expectedScoringRanks.join(', ')}] (got [${r.scoring.map(x => x.rank).join(', ')}])`,
    got === want);
  check(`base values ${HANDS[expectedType].chips}c x ${HANDS[expectedType].mult}m`,
    r.base.chips === HANDS[expectedType].chips && r.base.mult === HANDS[expectedType].mult);
}

console.log('== Base hand table (Balatro values) ==');
const EXPECTED_BASE = {
  HIGH_CARD: [5, 1], PAIR: [10, 2], TWO_PAIR: [20, 2], THREE_KIND: [30, 3],
  STRAIGHT: [30, 4], FLUSH: [35, 4], FULL_HOUSE: [40, 4], FOUR_KIND: [60, 7],
  STRAIGHT_FLUSH: [100, 8],
};
for (const [k, [chips, mult]] of Object.entries(EXPECTED_BASE)) {
  check(`${k}: ${chips} chips x ${mult} mult`,
    HANDS[k] && HANDS[k].chips === chips && HANDS[k].mult === mult);
}

console.log('\n== Deck ==');
{
  const d = buildDeck();
  check('deck has 52 cards', d.length === 52);
  check('all rank+suit combos unique', new Set(d.map(x => x.rank + x.suit)).size === 52);
}

console.log('\n== Required cases ==');

caseCheck('Pair (kickers must not score)',
  [c('A', 'heart'), c('A', 'spade'), c('7', 'diamond'), c('9', 'club'), c('K', 'spade')],
  'PAIR', ['A', 'A']);

caseCheck('Two Pair (both pairs score, kicker does not)',
  [c('J', 'heart'), c('J', 'spade'), c('4', 'diamond'), c('4', 'club'), c('K', 'spade')],
  'TWO_PAIR', ['J', 'J', '4', '4']);

caseCheck('Full House (all 5 score)',
  [c('Q', 'heart'), c('Q', 'spade'), c('Q', 'diamond'), c('8', 'club'), c('8', 'spade')],
  'FULL_HOUSE', ['Q', 'Q', 'Q', '8', '8']);

caseCheck('Ace-low straight (A-2-3-4-5)',
  [c('A', 'spade'), c('2', 'heart'), c('3', 'diamond'), c('4', 'club'), c('5', 'spade')],
  'STRAIGHT', ['A', '2', '3', '4', '5']);

caseCheck('Straight flush',
  [c('7', 'spade'), c('8', 'spade'), c('9', 'spade'), c('10', 'spade'), c('J', 'spade')],
  'STRAIGHT_FLUSH', ['7', '8', '9', '10', 'J']);

console.log('\n== Extra coverage ==');

caseCheck('High Card (top card only scores)',
  [c('A', 'heart'), c('K', 'spade'), c('7', 'diamond'), c('3', 'club'), c('9', 'spade')],
  'HIGH_CARD', ['A']);

caseCheck('Three of a Kind (only the three score)',
  [c('9', 'heart'), c('9', 'spade'), c('9', 'diamond'), c('4', 'club'), c('K', 'spade')],
  'THREE_KIND', ['9', '9', '9']);

caseCheck('Four of a Kind (kicker does not score)',
  [c('10', 'heart'), c('10', 'spade'), c('10', 'diamond'), c('10', 'club'), c('3', 'spade')],
  'FOUR_KIND', ['10', '10', '10', '10']);

caseCheck('Flush',
  [c('2', 'heart'), c('5', 'heart'), c('9', 'heart'), c('J', 'heart'), c('K', 'heart')],
  'FLUSH', ['2', '5', '9', 'J', 'K']);

caseCheck('King-high straight (10-J-Q-K-A)',
  [c('10', 'heart'), c('J', 'spade'), c('Q', 'diamond'), c('K', 'club'), c('A', 'spade')],
  'STRAIGHT', ['10', 'J', 'Q', 'K', 'A']);

caseCheck('Near-miss A-2-3-4-6 is NOT a straight',
  [c('A', 'heart'), c('2', 'spade'), c('3', 'diamond'), c('4', 'club'), c('6', 'spade')],
  'HIGH_CARD', ['A']);

caseCheck('9-10-J-Q-K mixed suits = straight, not flush',
  [c('9', 'spade'), c('10', 'spade'), c('J', 'spade'), c('Q', 'spade'), c('K', 'heart')],
  'STRAIGHT', ['9', '10', 'J', 'Q', 'K']);

caseCheck('3-card Three of a Kind',
  [c('K', 'heart'), c('K', 'spade'), c('K', 'diamond')],
  'THREE_KIND', ['K', 'K', 'K']);

caseCheck('2-card Pair',
  [c('5', 'heart'), c('5', 'club')],
  'PAIR', ['5', '5']);

caseCheck('Single card = High Card',
  [c('A', 'club')],
  'HIGH_CARD', ['A']);

caseCheck('4-card Four of a Kind',
  [c('2', 'heart'), c('2', 'spade'), c('2', 'diamond'), c('2', 'club')],
  'FOUR_KIND', ['2', '2', '2', '2']);

console.log('\n== pairCount (joker context for Mad/Sly) ==');
{
  const fh = evaluateHand([c('Q', 'heart'), c('Q', 'spade'), c('Q', 'diamond'), c('8', 'club'), c('8', 'spade')]);
  check('full house -> pairCount 2 (trips rank + pair rank, each one pair)', fh.pairCount === 2);
  const tp = evaluateHand([c('J', 'heart'), c('J', 'spade'), c('4', 'diamond'), c('4', 'club'), c('K', 'spade')]);
  check('two pair -> pairCount 2', tp.pairCount === 2);
  const fk = evaluateHand([c('10', 'heart'), c('10', 'spade'), c('10', 'diamond'), c('10', 'club'), c('3', 'spade')]);
  check('four of a kind -> pairCount 1', fk.pairCount === 1);
  const tk = evaluateHand([c('9', 'heart'), c('9', 'spade'), c('9', 'diamond'), c('4', 'club'), c('K', 'spade')]);
  check('three of a kind -> pairCount 1 (trips count as one pair)', tk.pairCount === 1);
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exitCode = failed === 0 ? 0 : 1;
