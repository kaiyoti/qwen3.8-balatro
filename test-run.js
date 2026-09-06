'use strict';
/* Headless self-test — Milestones 7/8: full-run playthrough simulation,
   loss path, New Run reset. Drives the real flow functions (onPlayClick,
   buyJoker, sellJoker, skipBlind, goNextBlind, newRun) headlessly.
   Run:  node test-run.js
   Exits 0 when all checks pass, 1 on any failure. */

const G = require('./game.js');

let passed = 0;
let failed = 0;

function check(label, cond) {
  if (cond) { passed++; console.log(`  PASS  ${label}`); }
  else { failed++; console.log(`  FAIL  ${label}`); }
}

const S = () => G.getState();

// Rig the hand to a royal flush (spades) + 3 filler cards, select the royal.
// Deck is topped up so refills always reach 8 (tests flow, not deck depletion).
function playRoyal() {
  S().deck = G.buildDeck().slice();
  S().hand = [
    { rank: '9', suit: 'spade' }, { rank: '10', suit: 'spade' },
    { rank: 'J', suit: 'spade' }, { rank: 'Q', suit: 'spade' }, { rank: 'K', suit: 'spade' },
    { rank: '2', suit: 'heart' }, { rank: '3', suit: 'heart' }, { rank: '4', suit: 'heart' },
  ];
  S().selected = [0, 1, 2, 3, 4];
  G.onPlayClick();
}

function invariants(label) {
  check(`${label}: hand refilled to 8, selection cleared`,
    S().hand.length === 8 && S().selected.length === 0);
  check(`${label}: money >= 0, jokers <= 5`,
    S().money >= 0 && S().jokers.length <= 5);
}

console.log('== Full victory run (9 blinds) ==');
{
  G.newRun();
  check('run starts at ante 1 small, $4, 8 cards',
    S().ante === 1 && S().blindIdx === 0 && S().money === 4 && S().hand.length === 8);

  // --- Ante 1 Small: 1 royal play (1192 >= 300) ---
  playRoyal();
  invariants('a1 small play 1');
  check('won a1 small -> shop', S().screen === 'shop');
  check('a1 small payout: $4 -> $10 (reward 6, no interest)', S().money === 10);

  // Shop 1: buy the base Joker ($2) — deterministic offers
  S().shop.offers = [G.jokerById('joker'), null, null, null, null];
  G.buyJoker(0);
  check('bought Joker: $10 -> $8, 1 joker held', S().money === 8 && S().jokers.length === 1);

  // Skip the Big Blind (costs $4, no interest) -> fresh shop before the boss
  G.skipBlind();
  check('skipped a1 big: $8 -> $4, now ante 1 boss', S().money === 4 && S().blindIdx === 2);
  check('shop is fresh after skip (reroll $5)', S().screen === 'shop' && S().shop.rerollCost === 5);

  G.goNextBlind();
  // --- Ante 1 Boss: royal WITH Joker: 149 chips x 12 mult = 1788 >= 675 ---
  playRoyal();
  invariants('a1 boss play 1');
  check('joker applied: boss scored 1788 (149 x 12)', S().roundScore === 1788);
  check('won a1 boss -> shop (ante 2 small next)', S().screen === 'shop' && S().ante === 2 && S().blindIdx === 0);
  check('a1 boss payout: $4 + 6 reward + 0 interest = $10', S().money === 10);

  // Shop 3: sell the Joker back (floor(2/2) = $1)
  G.toggleSellMode();
  check('sell mode on', G.isSellMode() === true);
  G.sellJoker(0);
  check('sold Joker: $10 -> $11, 0 jokers', S().money === 11 && S().jokers.length === 0);
  G.toggleSellMode();
  check('sell mode off', G.isSellMode() === false);

  // --- Ante 2: Small (1 play), Big (2), Boss (2) ---
  G.goNextBlind(); playRoyal();
  check('won a2 small -> shop', S().screen === 'shop' && S().blindIdx === 1);
  check('a2 small payout: 11 + 6 + 2 interest = $19', S().money === 19);

  G.goNextBlind(); playRoyal();
  check('a2 big play 1: 1192 < 1200, still playing', S().screen === 'play' && S().roundScore === 1192);
  playRoyal();
  invariants('a2 big play 2');
  check('won a2 big on play 2 (2384) -> shop', S().screen === 'shop' && S().roundScore === 2384);
  check('a2 big payout: 19 + 6 + 3 interest = $28', S().money === 28);

  G.goNextBlind(); playRoyal(); playRoyal();
  check('won a2 boss on play 2 -> shop (ante 3 small next)',
    S().screen === 'shop' && S().ante === 3 && S().blindIdx === 0);

  // --- Ante 3: Small (2), Big (3), Boss (4) ---
  G.goNextBlind(); playRoyal();
  check('a3 small play 1: 1192 < 2000, still playing', S().screen === 'play');
  playRoyal();
  invariants('a3 small play 2');
  check('won a3 small on play 2 -> shop', S().screen === 'shop' && S().blindIdx === 1);

  G.goNextBlind(); playRoyal(); playRoyal();
  check('a3 big play 2: 2384 < 3000, still playing', S().screen === 'play');
  playRoyal();
  invariants('a3 big play 3');
  check('won a3 big on play 3 (3576) -> shop', S().screen === 'shop' && S().blindIdx === 2);

  G.goNextBlind(); playRoyal(); playRoyal(); playRoyal();
  check('a3 boss play 3: 3576 < 4500, still playing', S().screen === 'play' && S().playsLeft === 1);
  playRoyal();
  invariants('a3 boss play 4');
  check('won final boss on play 4 (4768) -> VICTORY', S().screen === 'victory');
  check('final money positive and consistent', S().money >= 42);
}

console.log('\n== New Run reset (from victory) ==');
{
  G.newRun();
  const s = S();
  check('screen back to play', s.screen === 'play');
  check('ante 1 small, score 0, $4, 4 plays, 3 discards',
    s.ante === 1 && s.blindIdx === 0 && s.roundScore === 0 &&
    s.money === 4 && s.playsLeft === 4 && s.discardsLeft === 3);
  check('fresh 8-card hand, no jokers, no shop',
    s.hand.length === 8 && s.jokers.length === 0 && s.shop === null && s.selected.length === 0);
}

console.log('\n== Loss run (game over) ==');
{
  G.newRun();
  // Use one discard first, then four weak single-card plays (7 chips each = 28 < 300)
  S().hand = [
    { rank: '2', suit: 'spade' }, { rank: '3', suit: 'spade' }, { rank: '4', suit: 'spade' },
    { rank: '5', suit: 'spade' }, { rank: '6', suit: 'spade' }, { rank: '7', suit: 'spade' },
    { rank: '8', suit: 'spade' }, { rank: '9', suit: 'spade' },
  ];
  S().selected = [0, 1, 2];
  G.onDiscardClick();
  check('discard used: 3 -> 2, hand refilled', S().discardsLeft === 2 && S().hand.length === 8);

  for (let play = 1; play <= 4; play++) {
    S().hand = [
      { rank: '2', suit: 'heart' }, { rank: '3', suit: 'heart' }, { rank: '4', suit: 'heart' },
      { rank: '5', suit: 'heart' }, { rank: '6', suit: 'heart' }, { rank: '7', suit: 'heart' },
      { rank: '8', suit: 'heart' }, { rank: '9', suit: 'heart' },
    ];
    S().selected = [0]; // single 2: (5 + 2) x 1 = 7
    G.onPlayClick();
    if (play < 4) {
      check(`weak play ${play}: ongoing at ${play * 7}/300 with ${4 - play} plays left`,
        S().screen === 'play' && S().roundScore === play * 7 && S().playsLeft === 4 - play);
    }
  }
  check('4 plays exhausted, 28 < 300 -> GAME OVER', S().screen === 'gameover');
  check('plays fully spent', S().playsLeft === 0);

  G.newRun();
  check('New Run after loss: back to ante 1 small, $4',
    S().screen === 'play' && S().ante === 1 && S().blindIdx === 0 && S().money === 4);
}

console.log('\n== Edge: win on the final play (no plays left, target met) ==');
{
  G.newRun();
  // Three weak plays (21 chips), then a royal on the 4th: 21 + 1192 >= 300 with 0 plays left
  for (let i = 1; i <= 3; i++) {
    S().hand = [
      { rank: '2', suit: 'heart' }, { rank: '3', suit: 'heart' }, { rank: '4', suit: 'heart' },
      { rank: '5', suit: 'heart' }, { rank: '6', suit: 'heart' }, { rank: '7', suit: 'heart' },
      { rank: '8', suit: 'heart' }, { rank: '9', suit: 'heart' },
    ];
    S().selected = [0];
    G.onPlayClick();
  }
  check('three weak plays: 21/300, 1 play left', S().roundScore === 21 && S().playsLeft === 1);
  playRoyal();
  check('win on final play: target met + plays exhausted -> win (shop)',
    S().screen === 'shop' && S().roundScore === 1213);
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exitCode = failed === 0 ? 0 : 1;
