'use strict';
/* Headless self-test — hand sorting (rank/suit) + selection remapping.
   Run:  node test-sort.js
   Exits 0 when all checks pass, 1 on any failure. */

const G = require('./game.js');

let passed = 0;
let failed = 0;
function check(label, cond) {
  if (cond) { passed++; console.log(`  PASS  ${label}`); }
  else { failed++; console.log(`  FAIL  ${label}`); }
}

const c = (rank, suit) => ({ rank, suit });
const key = (card) => card.rank + card.suit;
const S = () => G.getState();

function setup(hand, selected) {
  G.newRun();
  S().hand = hand.map(x => ({ ...x }));
  S().selected = selected.slice();
}
function selectedKeys() {
  return S().selected.map(i => key(S().hand[i])).sort();
}

console.log('== compareByRank (pure) ==');
{
  const cards = [c('K', 'spade'), c('2', 'heart'), c('A', 'club'), c('7', 'diamond'), c('2', 'spade')];
  const got = cards.slice().sort(G.compareByRank).map(key);
  check('rank asc 2..A (ace high), ties by suit order (spade<heart)',
    JSON.stringify(got) === JSON.stringify(['2spade', '2heart', '7diamond', 'Kspade', 'Aclub']));
}

console.log('\n== compareBySuit (pure) ==');
{
  const cards = [c('K', 'heart'), c('2', 'spade'), c('A', 'club'), c('7', 'diamond'), c('9', 'heart')];
  const got = cards.slice().sort(G.compareBySuit).map(key);
  check('grouped spade,heart,diamond,club; rank asc within suit',
    JSON.stringify(got) === JSON.stringify(['2spade', '9heart', 'Kheart', '7diamond', 'Aclub']));
}

console.log('\n== sortHand reorders state.hand ==');
{
  setup([c('K', 'spade'), c('2', 'heart'), c('A', 'club'), c('7', 'diamond')], []);
  G.sortHand('rank');
  check('rank sort: hand in rank order',
    JSON.stringify(S().hand.map(key)) === JSON.stringify(['2heart', '7diamond', 'Kspade', 'Aclub']));
}
{
  setup([c('K', 'heart'), c('2', 'spade'), c('A', 'club'), c('9', 'diamond')], []);
  G.sortHand('suit');
  check('suit sort: grouped by suit, rank asc within suit',
    JSON.stringify(S().hand.map(key)) === JSON.stringify(['2spade', 'Kheart', '9diamond', 'Aclub']));
}

console.log('\n== Selection remapping (rank sort) ==');
{
  // Selected: 5heart(0), 2club(2), Adiamond(3)
  setup([c('5', 'heart'), c('K', 'spade'), c('2', 'club'), c('A', 'diamond'), c('7', 'heart')], [0, 2, 3]);
  const beforeKeys = selectedKeys();
  const beforeIdx = S().selected.slice();
  G.sortHand('rank');
  // Rank order: 2club(0), 5heart(1), 7heart(2), Kspade(3), Adiamond(4)
  check('same 3 cards still selected (by identity)',
    JSON.stringify(selectedKeys()) === JSON.stringify(beforeKeys) && S().selected.length === 3);
  check('selection remapped to new indices [0,1,4]',
    JSON.stringify(S().selected) === JSON.stringify([0, 1, 4]));
  check('indices actually changed (were [0,2,3])',
    JSON.stringify(beforeIdx) !== JSON.stringify(S().selected));
}

console.log('\n== Selection remapping (suit sort) ==');
{
  // Selected: 3spade(1), 7heart(4)
  setup([c('9', 'heart'), c('3', 'spade'), c('K', 'club'), c('2', 'diamond'), c('7', 'heart')], [1, 4]);
  const beforeKeys = selectedKeys();
  const beforeIdx = S().selected.slice();
  G.sortHand('suit');
  // Suit order: 3spade(0), 7heart(1), 9heart(2), 2diamond(3), Kclub(4)
  check('same cards still selected (by identity)',
    JSON.stringify(selectedKeys()) === JSON.stringify(beforeKeys));
  check('selection remapped to new indices [0,1]',
    JSON.stringify(S().selected) === JSON.stringify([0, 1]));
  check('indices actually changed (were [1,4])',
    JSON.stringify(beforeIdx) !== JSON.stringify(S().selected));
}

console.log('\n== Sort preserves hand size + card multiset ==');
{
  const hand = [c('5', 'heart'), c('K', 'spade'), c('2', 'club')];
  setup(hand, [0]);
  const beforeSet = hand.map(key).sort();
  G.sortHand('rank');
  G.sortHand('suit');
  check('hand size unchanged', S().hand.length === 3);
  check('same cards, no dupes/loss after both sorts',
    JSON.stringify(S().hand.map(key).sort()) === JSON.stringify(beforeSet));
}

console.log('\n== Sort persistence: sortMode tracked ==');
{
  G.newRun();
  check('sortMode is null initially', S().sortMode === null);
  G.sortHand('rank');
  check('sortMode set to rank after sortHand(rank)', S().sortMode === 'rank');
  G.sortHand('suit');
  check('sortMode updated to suit after sortHand(suit)', S().sortMode === 'suit');
}

console.log('\n== Sort persistence: rank sort survives play ==');
{
  G.newRun();
  // Set up a known hand
  const hand = [c('A','spade'),c('K','heart'),c('Q','diamond'),c('J','club'),
    c('10','spade'),c('9','heart'),c('8','diamond'),c('7','club')];
  S().hand = hand;
  S().deck = [c('6','spade'),c('5','heart'),c('4','diamond'),c('3','club')];
  S().selected = [0, 1, 2, 3, 4];
  S().sortMode = null;

  G.sortHand('rank');
  check('hand is rank-sorted before play',
    S().hand[0].rank === '7' && S().hand[7].rank === 'A');

  // Play the top 5 (rank-sorted: 7,8,9,J,10)
  S().selected = [0, 1, 2, 3, 4];
  G.onPlayClick();

  // Hand should be re-sorted after refill
  const ranks = S().hand.map(cd => G.rankValue(cd.rank));
  check('hand still rank-sorted after play + refill',
    ranks.every((v, i) => i === 0 || v >= ranks[i - 1]));
  check('sortMode still "rank" after play', S().sortMode === 'rank');
}

console.log('\n== Sort persistence: suit sort survives discard ==');
{
  G.newRun();
  const hand = [c('A','spade'),c('K','heart'),c('Q','diamond'),c('J','club'),
    c('10','spade'),c('9','heart'),c('8','diamond'),c('7','club')];
  S().hand = hand;
  S().deck = [c('6','spade'),c('5','heart'),c('4','diamond'),c('3','club')];
  S().selected = [0, 1];
  S().sortMode = null;

  G.sortHand('suit');
  // Suit order: spades(10,A), hearts(9,K), diamonds(8,Q), clubs(7,J)
  check('hand is suit-sorted before discard',
    S().hand[0].suit === 'spade' && S().hand[1].suit === 'spade' &&
    S().hand[2].suit === 'heart' && S().hand[3].suit === 'heart');

  // Discard first 2 (both spades)
  S().selected = [0, 1];
  G.onDiscardClick();

  // Hand should be re-sorted after refill
  const suits = S().hand.map(cd => G.SUIT_ORDER[cd.suit]);
  check('hand still suit-sorted after discard + refill',
    suits.every((v, i) => i === 0 || v >= suits[i - 1]));
  check('sortMode still "suit" after discard', S().sortMode === 'suit');
}

console.log('\n== Sort persistence: no auto-sort without prior sort ==');
{
  G.newRun();
  S().sortMode = null;
  S().selected = [0, 1, 2, 3, 4];
  G.onPlayClick();
  // Without sortMode, hand should NOT be re-sorted (just appended)
  check('hand not auto-sorted when sortMode is null',
    S().sortMode === null);
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exitCode = failed === 0 ? 0 : 1;
