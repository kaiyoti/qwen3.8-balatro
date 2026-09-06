'use strict';
/* Headless self-test — Milestone 5: the 12 jokers.
   Run:  node test-jokers.js
   Exits 0 when all checks pass, 1 on any failure. */

const { JOKERS, jokerById, sellPrice, computePlayScore, HAND_RANK_ORDER } = require('./game.js');

let passed = 0;
let failed = 0;

function check(label, cond) {
  if (cond) { passed++; console.log(`  PASS  ${label}`); }
  else { failed++; console.log(`  FAIL  ${label}`); }
}

const c = (rank, suit) => ({ rank, suit });

// Score delta of a single joker vs baseline
function withJoker(id, cards) {
  const base = computePlayScore(cards, []);
  const withJ = computePlayScore(cards, [jokerById(id)]);
  return { base, withJ };
}

console.log('== Pool integrity ==');
check('exactly 28 jokers', JOKERS.length === 28);
check('unique ids', new Set(JOKERS.map(j => j.id)).size === 28);
{
  const expectedCosts = { joker: 2, greedy: 5, lusty: 5, wrathful: 5, gluttonous: 5,
    jolly: 3, zany: 4, mad: 4, crazy: 4, droll: 4, sly: 3, half: 5,
    wily: 4, clever: 4, devious: 4, crafty: 4, banner: 5,
    even_steven: 4, odd_todd: 4, gros_michel: 5,
    showman: 5, blackboard: 6, flower_pot: 6, fibonacci: 8, arrowhead: 7,
    the_duo: 8, the_trio: 8, the_order: 8 };
  check('costs match spec', JOKERS.every(j => expectedCosts[j.id] === j.cost));
  check('sell price = floor(cost/2)', JOKERS.every(j => sellPrice(j) === Math.floor(j.cost / 2)));
  check('every joker has text', JOKERS.every(j => typeof j.text === 'string' && j.text.length > 0));
}

console.log('\n== Joker (+4 Mult, unconditional) ==');
{
  const { base, withJ } = withJoker('joker', [c('7', 'heart'), c('7', 'spade')]);
  check('mult 2 -> 6', base.mult === 2 && withJ.mult === 6);
  check('chips unchanged', withJ.chips === base.chips);
}

console.log('\n== Suit jokers (Greedy/Lusty/Wrathful/Gluttonous, +3 Mult) ==');
{
  const suitCards = {
    greedy:     { yes: c('K', 'diamond'), no: c('K', 'spade'),   other: c('9', 'heart') },
    lusty:      { yes: c('K', 'heart'),   no: c('K', 'spade'),   other: c('9', 'diamond') },
    wrathful:   { yes: c('K', 'spade'),   no: c('K', 'diamond'), other: c('9', 'heart') },
    gluttonous: { yes: c('K', 'club'),    no: c('K', 'diamond'), other: c('9', 'heart') },
  };
  for (const [id, { yes, no, other }] of Object.entries(suitCards)) {
    const y = withJoker(id, [yes, other]);
    const n = withJoker(id, [no, other]);
    check(`${id}: fires with its suit (mult 1 -> 4)`, y.withJ.mult === 4);
    check(`${id}: silent without its suit (mult stays 1)`, n.withJ.mult === 1);
  }
  // suit in a non-scoring kicker still counts ("hand contains")
  const k = withJoker('greedy', [c('7', 'diamond'), c('7', 'spade'), c('A', 'diamond')]);
  check('greedy: diamond kicker still triggers', k.withJ.mult === 5);
}

console.log('\n== Jolly Joker (+8 Mult if contains a pair) ==');
{
  const pair = withJoker('jolly', [c('A', 'heart'), c('A', 'spade')]);
  check('pair: mult 2 -> 10', pair.withJ.mult === 10);
  const fh = withJoker('jolly', [c('Q', 'heart'), c('Q', 'spade'), c('Q', 'diamond'), c('8', 'club'), c('8', 'spade')]);
  check('full house contains a pair: mult 4 -> 12', fh.withJ.mult === 12);
  const noPair = withJoker('jolly', [c('A', 'heart'), c('K', 'spade')]);
  check('no pair: unchanged (mult 1)', noPair.withJ.mult === 1);
}

console.log('\n== Zany Joker (+12 Mult if Three of a Kind or better) ==');
{
  const tk = withJoker('zany', [c('9', 'heart'), c('9', 'spade'), c('9', 'diamond')]);
  check('three of a kind: mult 3 -> 15', tk.withJ.mult === 15);
  const pair = withJoker('zany', [c('A', 'heart'), c('A', 'spade')]);
  check('pair only: unchanged (mult 2)', pair.withJ.mult === 2);
  const straight = withJoker('zany', [c('9', 'spade'), c('10', 'heart'), c('J', 'diamond'), c('Q', 'club'), c('K', 'spade')]);
  check('straight (ranked above 3k): mult 4 -> 16 [interpretation, see report]', straight.withJ.mult === 16);
}

console.log('\n== Mad Joker (+10 Chips per pair) ==');
{
  const pair = withJoker('mad', [c('A', 'heart'), c('A', 'spade')]);
  check('one pair: chips +10', pair.withJ.chips === pair.base.chips + 10);
  const tp = withJoker('mad', [c('J', 'heart'), c('J', 'spade'), c('4', 'diamond'), c('4', 'club'), c('K', 'spade')]);
  check('two pair: chips +20', tp.withJ.chips === tp.base.chips + 20);
  const fh = withJoker('mad', [c('Q', 'heart'), c('Q', 'spade'), c('Q', 'diamond'), c('8', 'club'), c('8', 'spade')]);
  check('full house (2 pair-groups): chips +20', fh.withJ.chips === fh.base.chips + 20);
  const none = withJoker('mad', [c('A', 'heart'), c('K', 'spade')]);
  check('no pair: unchanged', none.withJ.chips === none.base.chips);
}

console.log('\n== Crazy Joker (+12 Mult if a Straight, exactly) ==');
{
  const st = withJoker('crazy', [c('9', 'spade'), c('10', 'heart'), c('J', 'diamond'), c('Q', 'club'), c('K', 'spade')]);
  check('straight: mult 4 -> 16', st.withJ.mult === 16);
  const sf = withJoker('crazy', [c('9', 'spade'), c('10', 'spade'), c('J', 'spade'), c('Q', 'spade'), c('K', 'spade')]);
  check('straight flush is NOT a straight: unchanged (mult 8)', sf.withJ.mult === 8);
  const wheel = withJoker('crazy', [c('A', 'spade'), c('2', 'heart'), c('3', 'diamond'), c('4', 'club'), c('5', 'spade')]);
  check('ace-low straight: mult 4 -> 16', wheel.withJ.mult === 16);
}

console.log('\n== Droll Joker (+10 Mult if a Flush, exactly) ==');
{
  const fl = withJoker('droll', [c('2', 'heart'), c('5', 'heart'), c('9', 'heart'), c('J', 'heart'), c('K', 'heart')]);
  check('flush: mult 4 -> 14', fl.withJ.mult === 14);
  const sf = withJoker('droll', [c('9', 'spade'), c('10', 'spade'), c('J', 'spade'), c('Q', 'spade'), c('K', 'spade')]);
  check('straight flush is NOT a flush: unchanged (mult 8)', sf.withJ.mult === 8);
}

console.log('\n== Sly Joker (+50 Chips if contains a pair) ==');
{
  const pair = withJoker('sly', [c('A', 'heart'), c('A', 'spade')]);
  check('pair: chips +50', pair.withJ.chips === pair.base.chips + 50);
  const fk = withJoker('sly', [c('10', 'heart'), c('10', 'spade'), c('10', 'diamond'), c('10', 'club'), c('3', 'spade')]);
  check('four of a kind contains a pair: chips +50', fk.withJ.chips === fk.base.chips + 50);
  const none = withJoker('sly', [c('A', 'heart'), c('K', 'spade')]);
  check('no pair: unchanged', none.withJ.chips === none.base.chips);
}

console.log('\n== Half Joker (+20 Mult if hand has 3 or fewer cards) ==');
{
  const two = withJoker('half', [c('A', 'heart'), c('A', 'spade')]);
  check('2 cards: mult 2 -> 22', two.withJ.mult === 22);
  const three = withJoker('half', [c('9', 'heart'), c('9', 'spade'), c('9', 'diamond')]);
  check('3 cards: mult 3 -> 23', three.withJ.mult === 23);
  const four = withJoker('half', [c('A', 'heart'), c('K', 'spade'), c('Q', 'diamond'), c('J', 'club')]);
  check('4 cards: unchanged (mult 1)', four.withJ.mult === 1);
}

console.log('\n== Combined jokers (held order + grouped pipeline) ==');
{
  // Sly (+50 chips) then Jolly (+8 mult) then Joker (+4 mult), on a pair of aces
  const s = computePlayScore([c('A', 'heart'), c('A', 'spade')],
    [jokerById('sly'), jokerById('jolly'), jokerById('joker')]);
  check('sly+jolly+joker: (32+50) x (2+8+4) = 82 x 14 = 1148',
    s.chips === 82 && s.mult === 14 && s.total === 1148);
}
{
  // Hand rank sanity: ordering used by Zany
  check('rank order: HIGH_CARD < PAIR < THREE_KIND < STRAIGHT < FLUSH < FULL_HOUSE < FOUR_KIND < STRAIGHT_FLUSH',
    HAND_RANK_ORDER.HIGH_CARD < HAND_RANK_ORDER.PAIR &&
    HAND_RANK_ORDER.PAIR < HAND_RANK_ORDER.THREE_KIND &&
    HAND_RANK_ORDER.THREE_KIND < HAND_RANK_ORDER.STRAIGHT &&
    HAND_RANK_ORDER.STRAIGHT < HAND_RANK_ORDER.FLUSH &&
    HAND_RANK_ORDER.FLUSH < HAND_RANK_ORDER.FULL_HOUSE &&
    HAND_RANK_ORDER.FULL_HOUSE < HAND_RANK_ORDER.FOUR_KIND &&
    HAND_RANK_ORDER.FOUR_KIND < HAND_RANK_ORDER.STRAIGHT_FLUSH);
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exitCode = failed === 0 ? 0 : 1;
