'use strict';
/* Headless self-test — Phase 2: rarity tags, weighted distribution, Showman rule.
   Run:  node test-rarity.js
   Exits 0 when all checks pass, 1 on any failure. */

const G = require('./game.js');

let passed = 0;
let failed = 0;

function check(label, cond) {
  if (cond) { passed++; console.log(`  PASS  ${label}`); }
  else { failed++; console.log(`  FAIL  ${label}`); }
}

console.log('== Rarity validation ==');
{
  const validRarities = new Set(['common', 'uncommon', 'rare']);
  check('every joker has a valid rarity',
    G.JOKERS.every(j => validRarities.has(j.rarity)));

  check('no joker has multiple rarities (single tag)',
    G.JOKERS.every(j => typeof j.rarity === 'string'));

  // Count by rarity
  const counts = { common: 0, uncommon: 0, rare: 0 };
  G.JOKERS.forEach(j => counts[j.rarity]++);
  check(`common count = ${counts.common} (expect 20)`, counts.common === 20);
  check(`uncommon count = ${counts.uncommon} (expect 5)`, counts.uncommon === 5);
  check(`rare count = ${counts.rare} (expect 3)`, counts.rare === 3);

  check('total jokers = 28', G.JOKERS.length === 28);
}

console.log('\n== Rarity weights exist and are positive ==');
{
  const W = G.RARITY_WEIGHTS;
  check('common weight > 0', W.common > 0);
  check('uncommon weight > 0', W.uncommon > 0);
  check('rare weight > 0', W.rare > 0);
  check('common > uncommon > rare (ordering)',
    W.common > W.uncommon && W.uncommon > W.rare);
  check('no legendary in shop weights (excluded from pool)',
    !('legendary' in W));
}

console.log('\n== Weighted distribution sanity (10000 simulated offers) ==');
{
  // Simulate many offers and count rarity frequency
  const counts = { common: 0, uncommon: 0, rare: 0 };
  const N = 10000;

  // Use a fresh state with no owned jokers so full pool is available
  G.newRun();
  for (let i = 0; i < N; i++) {
    const offers = G.rollOffers();
    for (const j of offers) {
      counts[j.rarity]++;
    }
  }

  const total = counts.common + counts.uncommon + counts.rare;
  const pctCommon = counts.common / total;
  const pctUncommon = counts.uncommon / total;
  const pctRare = counts.rare / total;

  console.log(`  Distribution: C=${(pctCommon*100).toFixed(1)}% U=${(pctUncommon*100).toFixed(1)}% R=${(pctRare*100).toFixed(1)}%`);

  // Commons should dominate (>50%)
  check('commons > 50% of offers', pctCommon > 0.50);
  // With 20C/5U/3R pool, expect ~85% C, ~12% U, ~3% R
  check('uncommons > 5% (present in distribution)', pctUncommon > 0.05);
  // Rares should be <20%
  check('rares < 10%', pctRare < 0.10);
  // Ordering: common > uncommon > rare
  check('common > uncommon count', counts.common > counts.uncommon);
  check('uncommon > rare count', counts.uncommon > counts.rare);
}

console.log('\n== Showman: no duplicates without it ==');
{
  // Set up: own a specific joker, verify it never appears in offers
  G.newRun();
  const target = G.JOKERS[0]; // 'joker'
  G.getState().jokers.push(target);

  let found = false;
  for (let i = 0; i < 500; i++) {
    const offers = G.rollOffers();
    if (offers.some(j => j.id === target.id)) { found = true; break; }
  }
  check('owned joker never appears in 500 rolls (no Showman)', !found);
}

console.log('\n== Showman: duplicates allowed with it ==');
{
  // Set up: own Showman + a specific joker, verify that joker CAN appear
  G.newRun();
  const showman = G.JOKERS.find(j => j.id === 'showman');
  const target = G.JOKERS.find(j => j.id === 'joker');
  G.getState().jokers.push(showman, target);

  // With Showman, the full pool (including owned) is available.
  // Over many rolls, the target should appear at least once.
  let found = false;
  for (let i = 0; i < 2000; i++) {
    const offers = G.rollOffers();
    if (offers.some(j => j.id === target.id)) { found = true; break; }
  }
  check('owned joker CAN appear in offers (with Showman)', found);

  // Also verify Showman itself can be offered (duplicate Showman)
  let foundShowman = false;
  for (let i = 0; i < 2000; i++) {
    const offers = G.rollOffers();
    if (offers.some(j => j.id === 'showman')) { foundShowman = true; break; }
  }
  check('Showman can be offered as duplicate (with Showman owned)', foundShowman);
}

console.log('\n== Showman has no scoring effect ==');
{
  const showman = G.JOKERS.find(j => j.id === 'showman');
  check('Showman kind is "none"', showman.kind === 'none');
  check('Showman value is 0', showman.value === 0);

  // Verify it doesn't change score
  const cards = [{ rank: 'A', suit: 'heart' }, { rank: 'A', suit: 'spade' }];
  const base = G.computePlayScore(cards, []);
  const withShow = G.computePlayScore(cards, [showman]);
  check('Showman does not alter chips', withShow.chips === base.chips);
  check('Showman does not alter mult', withShow.mult === base.mult);
}

console.log('\n== New joker effects sanity ==');
{
  const c = (rank, suit) => ({ rank, suit });

  // Wily: +100 Chips if Three of a Kind or better
  const wily = G.jokerById('wily');
  const s1 = G.computePlayScore([c('9','h'), c('9','s'), c('9','d')], [wily]);
  const s1base = G.computePlayScore([c('9','h'), c('9','s'), c('9','d')], []);
  check('Wily: +100 chips on Three of a Kind', s1.chips === s1base.chips + 100);

  const s2 = G.computePlayScore([c('A','h'), c('K','s')], [wily]);
  const s2base = G.computePlayScore([c('A','h'), c('K','s')], []);
  check('Wily: no bonus on high card', s2.chips === s2base.chips);

  // Even Steven: +4 Mult per even-rank card
  const ev = G.jokerById('even_steven');
  const evenCards = [c('2','h'), c('4','s'), c('6','d')]; // 3 even cards
  const s3 = G.computePlayScore(evenCards, [ev]);
  const s3base = G.computePlayScore(evenCards, []);
  check('Even Steven: +12 mult for 3 even cards', s3.mult === s3base.mult + 12);

  const oddCards = [c('3','h'), c('5','s'), c('7','d')]; // 0 even cards
  const s4 = G.computePlayScore(oddCards, [ev]);
  const s4base = G.computePlayScore(oddCards, []);
  check('Even Steven: no bonus for all-odd', s4.mult === s4base.mult);

  // Blackboard: x3 Mult if all Spades or Clubs
  const bb = G.jokerById('blackboard');
  const scCards = [c('A','spade'), c('K','club'), c('Q','spade')];
  const s5 = G.computePlayScore(scCards, [bb]);
  const s5base = G.computePlayScore(scCards, []);
  check('Blackboard: x3 mult for all black', s5.mult === s5base.mult * 3);

  const mixedCards = [c('A','spade'), c('K','heart'), c('Q','spade')];
  const s6 = G.computePlayScore(mixedCards, [bb]);
  const s6base = G.computePlayScore(mixedCards, []);
  check('Blackboard: no bonus with a red card', s6.mult === s6base.mult);

  // Flower Pot: x3 Mult if all 4 suits present
  const fp = G.jokerById('flower_pot');
  const allSuits = [c('A','s'), c('K','h'), c('Q','d'), c('J','c')];
  const s7 = G.computePlayScore(allSuits, [fp]);
  const s7base = G.computePlayScore(allSuits, []);
  check('Flower Pot: x3 mult with all 4 suits', s7.mult === s7base.mult * 3);

  const twoSuits = [c('A','s'), c('K','h'), c('Q','s')];
  const s8 = G.computePlayScore(twoSuits, [fp]);
  const s8base = G.computePlayScore(twoSuits, []);
  check('Flower Pot: no bonus with only 2 suits', s8.mult === s8base.mult);

  // The Duo: x2 Mult if Pair
  const duo = G.jokerById('the_duo');
  const pair = [c('A','h'), c('A','s')];
  const s9 = G.computePlayScore(pair, [duo]);
  const s9base = G.computePlayScore(pair, []);
  check('The Duo: x2 mult on pair', s9.mult === s9base.mult * 2);

  const noPair = [c('A','h'), c('K','s')];
  const s10 = G.computePlayScore(noPair, [duo]);
  const s10base = G.computePlayScore(noPair, []);
  check('The Duo: no bonus on high card', s10.mult === s10base.mult);

  // Arrowhead: +50 Chips per Spade
  const ar = G.jokerById('arrowhead');
  const spadeCards = [c('A','spade'), c('K','spade'), c('Q','heart')]; // 2 spades
  const s11 = G.computePlayScore(spadeCards, [ar]);
  const s11base = G.computePlayScore(spadeCards, []);
  check('Arrowhead: +100 chips for 2 spades', s11.chips === s11base.chips + 100);

  // Banner: +30 per remaining discard
  const banner = G.jokerById('banner');
  const s12 = G.computePlayScore([c('A','h')], [banner], 3);
  const s12base = G.computePlayScore([c('A','h')], [], 3);
  check('Banner: +90 chips with 3 discards left', s12.chips === s12base.chips + 90);

  const s13 = G.computePlayScore([c('A','h')], [banner], 0);
  const s13base = G.computePlayScore([c('A','h')], [], 0);
  check('Banner: no bonus with 0 discards left', s13.chips === s13base.chips);
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exitCode = failed === 0 ? 0 : 1;
