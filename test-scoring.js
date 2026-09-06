'use strict';
/* Headless self-test — Milestone 4: scoring pipeline, economy, win/loss.
   Run:  node test-scoring.js
   Exits 0 when all checks pass, 1 on any failure. */

const {
  computePlayScore,
  blindReward, interest, applyBlindClearPayout,
  nextBlind, blindResult,
  CHIP_VALUE, BLIND_TARGETS,
} = require('./game.js');

let passed = 0;
let failed = 0;

function check(label, cond) {
  if (cond) { passed++; console.log(`  PASS  ${label}`); }
  else { failed++; console.log(`  FAIL  ${label}`); }
}

const c = (rank, suit) => ({ rank, suit });

console.log('== Chip values ==');
check('2-10 = pip value', CHIP_VALUE['2'] === 2 && CHIP_VALUE['7'] === 7 && CHIP_VALUE['10'] === 10);
check('J/Q/K = 10', CHIP_VALUE.J === 10 && CHIP_VALUE.Q === 10 && CHIP_VALUE.K === 10);
check('A = 11', CHIP_VALUE.A === 11);

console.log('\n== computePlayScore (no jokers) ==');
{
  const s = computePlayScore([c('A', 'heart'), c('A', 'spade'), c('7', 'diamond')]);
  check('pair of aces: (10 + 11 + 11) x 2 = 64', s.chips === 32 && s.mult === 2 && s.total === 64);
}
{
  const s = computePlayScore([c('K', 'spade'), c('7', 'heart')]);
  check('high card K: (5 + 10) x 1 = 15', s.chips === 15 && s.mult === 1 && s.total === 15);
}
{
  const s = computePlayScore([c('J', 'heart'), c('J', 'spade'), c('4', 'diamond'), c('4', 'club'), c('K', 'spade')]);
  check('two pair J+4 (kicker K excluded): (20 + 28) x 2 = 96', s.chips === 48 && s.mult === 2 && s.total === 96);
}
{
  const s = computePlayScore([c('Q', 'heart'), c('Q', 'spade'), c('Q', 'diamond'), c('8', 'club'), c('8', 'spade')]);
  check('full house QQQ88 (Q=10 chips): (40 + 46) x 4 = 344', s.chips === 86 && s.mult === 4 && s.total === 344);
}
{
  const s = computePlayScore([c('9', 'spade'), c('10', 'spade'), c('J', 'spade'), c('Q', 'spade'), c('K', 'spade')]);
  check('royal flush (J/Q/K=10 chips): (100 + 49) x 8 = 1192', s.chips === 149 && s.mult === 8 && s.total === 1192);
}
{
  const s = computePlayScore([c('A', 'spade'), c('2', 'heart'), c('3', 'diamond'), c('4', 'club'), c('5', 'spade')]);
  check('wheel straight: (30 + 25) x 4 = 220', s.chips === 55 && s.mult === 4 && s.total === 220);
}

console.log('\n== Joker pipeline ==');
{
  // Deliberately out of group order in the list: mult joker before chips joker
  const jokers = [{ kind: 'mult', value: 4 }, { kind: 'chips', value: 10 }];
  const s = computePlayScore([c('A', 'heart'), c('A', 'spade')], jokers);
  check('+10 chips & +4 mult both apply: 42 x 6 = 252', s.chips === 42 && s.mult === 6 && s.total === 252);
}
{
  const s = computePlayScore([c('A', 'heart'), c('A', 'spade')], [{ kind: 'xmult', value: 2 }]);
  check('x2 mult joker: 32 x 4 = 128', s.chips === 32 && s.mult === 4 && s.total === 128);
}
{
  // Lusty-style suit-conditional joker
  const jokers = [{ kind: 'mult', value: 3, cond: ctx => ctx.hasSuit('heart') }];
  const no = computePlayScore([c('A', 'spade'), c('A', 'club')], jokers);
  const yes = computePlayScore([c('A', 'heart'), c('A', 'club')], jokers);
  check('conditional joker skipped without a heart', no.mult === 2);
  check('conditional joker fires with a heart', yes.mult === 5);
}
{
  // Mad-style per-pair amount()
  const jokers = [{ kind: 'chips', amount: ctx => 10 * ctx.pairCount }];
  const s = computePlayScore([c('J', 'heart'), c('J', 'spade'), c('4', 'diamond'), c('4', 'club'), c('K', 'spade')], jokers);
  check('per-pair chips on two pair: (48 + 20) x 2 = 136', s.chips === 68 && s.total === 136);
}
{
  // Grouped evaluation order: all +chips -> all +mult -> all xmult
  const jokers = [
    { kind: 'xmult', value: 3 },
    { kind: 'chips', value: 5 },
    { kind: 'mult', value: 1 },
    { kind: 'chips', value: 7 },
  ];
  const s = computePlayScore([c('K', 'spade')], jokers);
  check('grouped order: chips 15+5+7=27, mult (1+1)x3=6, total 162',
    s.chips === 27 && s.mult === 6 && s.total === 162);
}
{
  const s = computePlayScore([c('K', 'spade')], []);
  check('empty joker list = plain base score', s.chips === 15 && s.mult === 1 && s.total === 15);
}

console.log('\n== Economy: reward + interest ==');
check('reward: $3 + 3 discards = $6', blindReward(3) === 6);
check('reward: $3 + 1 discard = $4', blindReward(1) === 4);
check('reward: $3 + 0 discards = $3', blindReward(0) === 3);
check('interest: 0->$0, 4->$0, 5->$1, 9->$1, 10->$2, 24->$4',
  interest(0) === 0 && interest(4) === 0 && interest(5) === 1 &&
  interest(9) === 1 && interest(10) === 2 && interest(24) === 4);
check('interest capped at $5: 25->$5, 30->$5, 1000->$5',
  interest(25) === 5 && interest(30) === 5 && interest(1000) === 5);
{
  const p = applyBlindClearPayout(4, 3);
  check('payout $4 + 3 discards: reward 6, interest 0 -> $10',
    p.reward === 6 && p.interest === 0 && p.money === 10);
  const p2 = applyBlindClearPayout(20, 1);
  check('payout $20 + 1 discard: reward 4, interest 4 -> $28',
    p2.reward === 4 && p2.interest === 4 && p2.money === 28);
}

console.log('\n== Win/loss decision ==');
check('score == target -> won', blindResult(300, 2, 300) === 'won');
check('score > target, plays exhausted -> won (win wins the tie)', blindResult(300, 0, 300) === 'won');
check('under target, plays exhausted -> lost', blindResult(299, 0, 300) === 'lost');
check('under target, plays remain -> ongoing', blindResult(299, 2, 300) === 'ongoing');
check('zero score, plays remain -> ongoing', blindResult(0, 3, 300) === 'ongoing');

console.log('\n== Blind progression ==');
check('ante 1: small -> big', JSON.stringify(nextBlind(1, 0)) === '{"ante":1,"blindIdx":1}');
check('ante 1: big -> boss', JSON.stringify(nextBlind(1, 1)) === '{"ante":1,"blindIdx":2}');
check('ante 1: boss -> ante 2 small', JSON.stringify(nextBlind(1, 2)) === '{"ante":2,"blindIdx":0}');
check('ante 2: small -> big', JSON.stringify(nextBlind(2, 0)) === '{"ante":2,"blindIdx":1}');
check('ante 2: boss -> ante 3 small', JSON.stringify(nextBlind(2, 2)) === '{"ante":3,"blindIdx":0}');
check('ante 3: boss -> null (victory)', nextBlind(3, 2) === null);
check('ante 3: small -> big', JSON.stringify(nextBlind(3, 0)) === '{"ante":3,"blindIdx":1}');

console.log('\n== Blind targets table ==');
check('ante 1: 300/450/600', JSON.stringify(BLIND_TARGETS[1]) === '[300,450,600]');
check('ante 2: 800/1200/1600', JSON.stringify(BLIND_TARGETS[2]) === '[800,1200,1600]');
check('ante 3: 2000/3000/4000', JSON.stringify(BLIND_TARGETS[3]) === '[2000,3000,4000]');
check('boss = 2x small in every ante',
  [1, 2, 3].every(a => BLIND_TARGETS[a][2] === BLIND_TARGETS[a][0] * 2));

console.log('\n== Simulated blind (integration) ==');
{
  // Start of run: $4, ante 1 small (target 300). Play a royal flush on play 1.
  let money = 4, discardsLeft = 3, playsLeft = 4, roundScore = 0;
  const hand = [c('9', 'spade'), c('10', 'spade'), c('J', 'spade'), c('Q', 'spade'), c('K', 'spade')];
  const s = computePlayScore(hand, []);
  playsLeft -= 1;
  roundScore += s.total;
  const result = blindResult(roundScore, playsLeft, BLIND_TARGETS[1][0]);
  check('royal flush (1192) clears 300 on the first play', result === 'won');
  const payout = applyBlindClearPayout(money, discardsLeft);
  check('payout: $6 reward + $0 interest on $4 -> $10',
    payout.reward === 6 && payout.interest === 0 && payout.money === 10);
  check('next blind is ante 1 big', JSON.stringify(nextBlind(1, 0)) === '{"ante":1,"blindIdx":1}');
}
{
  // Loss path: 4 plays, max 299 each, target 300
  let roundScore = 0, playsLeft = 4;
  for (let i = 0; i < 4; i++) {
    roundScore += 74; // e.g. four pair-of-aces-equivalent plays (296 total)
    playsLeft -= 1;
  }
  check('296 < 300 after 4 plays -> lost', blindResult(roundScore, playsLeft, 300) === 'lost');
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exitCode = failed === 0 ? 0 : 1;
