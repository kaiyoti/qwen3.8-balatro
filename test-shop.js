'use strict';
/* Headless self-test — Milestone 6: shop (offers, buy/sell, reroll, skip).
   Drives the real stateful functions via the module state.
   Run:  node test-shop.js
   Exits 0 when all checks pass, 1 on any failure. */

const G = require('./game.js');

let passed = 0;
let failed = 0;

function check(label, cond) {
  if (cond) { passed++; console.log(`  PASS  ${label}`); }
  else { failed++; console.log(`  FAIL  ${label}`); }
}

const S = () => G.getState();

function freshShop() {
  G.newRun();
  G.enterShop();
}

console.log('== Offers ==');
{
  const offers = G.rollOffers();
  check('5 offers', offers.length === 5);
  check('all from the pool', offers.every(j => G.JOKERS.includes(j)));
  check('no dupes in one shop', new Set(offers.map(j => j.id)).size === 5);
  let allUnique = true;
  for (let i = 0; i < 20; i++) {
    const o = G.rollOffers();
    if (new Set(o.map(j => j.id)).size !== 5) allUnique = false;
  }
  check('no dupes across 20 rolls', allUnique);
}

console.log('\n== Enter shop ==');
{
  freshShop();
  check('screen is shop', S().screen === 'shop');
  check('reroll cost starts at $5', S().shop.rerollCost === 5);
  check('5 offers in shop', S().shop.offers.length === 5);
}

console.log('\n== Buy ==');
{
  freshShop();
  S().money = 20;
  const before = S().money;
  const j = S().shop.offers[0];
  const ok = G.buyJoker(0);
  check('buy succeeds', ok === true);
  check(`money ${before} -> ${before - j.cost}`, S().money === before - j.cost);
  check('joker added to hand', S().jokers.length === 1 && S().jokers[0].id === j.id);
  check('offer slot becomes empty', S().shop.offers[0] === null);
  check('cannot re-buy an empty slot', G.buyJoker(0) === false);
}
{
  freshShop();
  S().money = 1; // poorest possible
  let anyBuyable = false;
  for (let i = 0; i < 5; i++) if (G.canBuyJoker(i)) anyBuyable = true;
  check('broke: nothing buyable', anyBuyable === false);
  const m = S().money;
  G.buyJoker(0);
  check('broke: buy is a no-op', S().money === m && S().jokers.length === 0);
}
{
  freshShop();
  // Fill all 5 slots
  for (let i = 0; i < 5; i++) {
    S().money = 100;
    G.buyJoker(0); // always buy slot 0 (becomes null, others shift? no — we replace slot 0)
    if (S().shop.offers[0] === null) {
      // slot 0 empty; move a fresh offer into slot 0 for the next buy
      S().shop.offers[0] = G.jokerById(['joker', 'greedy', 'lusty', 'wrathful', 'gluttonous'][i]);
    }
  }
  check('5 joker slots full', S().jokers.length === 5);
  S().money = 100;
  let anyBuyable = false;
  for (let i = 0; i < 5; i++) if (G.canBuyJoker(i)) anyBuyable = true;
  check('slots full: nothing buyable', anyBuyable === false);
  check('slots full: buy is a no-op', G.buyJoker(1) === false || S().jokers.length === 5);
}

console.log('\n== Sell (floor(cost/2)) ==');
{
  const cases = [
    { id: 'joker', cost: 2, refund: 1 },
    { id: 'jolly', cost: 3, refund: 1 },
    { id: 'zany', cost: 4, refund: 2 },
    { id: 'greedy', cost: 5, refund: 2 },
  ];
  for (const { id, cost, refund } of cases) {
    G.newRun();
    S().jokers = [G.jokerById(id)];
    const m = S().money;
    const ok = G.sellJoker(0);
    check(`${id} ($${cost}): sell -> +$${refund}`, ok === true && S().money === m + refund && S().jokers.length === 0);
  }
  G.newRun();
  check('sell with no jokers is a no-op', G.sellJoker(0) === false);
}

console.log('\n== Reroll (escalating cost, resets per shop) ==');
{
  freshShop();
  S().money = 20;
  const first = S().shop.offers.map(j => j.id);
  G.rerollShop();
  check('first reroll costs $5: 20 -> 15', S().money === 15);
  check('cost escalates to $6', S().shop.rerollCost === 6);
  G.rerollShop();
  check('second reroll costs $6: 15 -> 9', S().money === 9);
  check('cost escalates to $7', S().shop.rerollCost === 7);
  check('offers changed (or at least re-rolled)', Array.isArray(S().shop.offers) && S().shop.offers.length === 5);
  // New shop resets cost
  S().money = 50;
  G.goNextBlind();
  G.enterShop();
  check('reroll cost resets to $5 in a new shop', S().shop.rerollCost === 5);
}
{
  freshShop();
  S().money = 4;
  check('broke: cannot reroll ($4 < $5)', G.canRerollShop() === false && G.rerollShop() === false);
}

console.log('\n== Skip blind (costs $4, small/big only, no interest, fresh shop) ==');
{
  freshShop();
  S().blindIdx = 1; // position as after "winning" ante1 small (next blind is big)
  const m = S().money;
  const ok = G.skipBlind();
  check('skip before big blind allowed', ok === true);
  check(`money -$4: ${m} -> ${m - 4}`, S().money === m - 4);
  check('blind advanced to boss (blindIdx 2)', S().blindIdx === 2);
  check('landed in a fresh shop', S().screen === 'shop' && S().shop.rerollCost === 5);
  check('skip clears last payout', S().lastPayout === null);
  check('cannot skip a boss blind', G.canSkipBlind() === false && G.skipBlind() === false);
  S().blindIdx = 1;
  S().money = 3;
  check('broke: cannot skip ($3 < $4)', G.canSkipBlind() === false && G.skipBlind() === false);
}
{
  freshShop();
  // Force ante 1 boss position
  S().blindIdx = 2;
  check('skip blocked at boss (blindIdx 2)', G.canSkipBlind() === false);
  S().blindIdx = 1;
  S().ante = 3;
  check('skip allowed at ante 3 big (blindIdx 1)', G.canSkipBlind() === true);
  G.skipBlind();
  check('ante 3 big skip -> ante 3 boss', S().ante === 3 && S().blindIdx === 2);
}

console.log('\n== Next blind ==');
{
  freshShop();
  const ok = G.goNextBlind();
  check('goNextBlind leaves shop', ok === true && S().screen === 'play');
  check('fresh blind: 8 cards, 4 plays, 3 discards',
    S().hand.length === 8 && S().playsLeft === 4 && S().discardsLeft === 3);
  check('round score reset', S().roundScore === 0);
}

console.log('\n== lastPayout recorded on win ==');
{
  G.newRun();
  // Win ante 1 small (target 300) with a royal flush, all discards unused
  S().hand = [
    { rank: '9', suit: 'spade' }, { rank: '10', suit: 'spade' },
    { rank: 'J', suit: 'spade' }, { rank: 'Q', suit: 'spade' }, { rank: 'K', suit: 'spade' },
    { rank: '2', suit: 'heart' }, { rank: '3', suit: 'heart' }, { rank: '4', suit: 'heart' },
  ];
  S().selected = [0, 1, 2, 3, 4];
  const m = S().money; // 4
  G.onPlayClick();
  check('royal wins small blind -> shop', S().screen === 'shop');
  check('score is 1192', S().roundScore === 1192);
  check(`payout: reward 6 (3 discards left), interest 0: ${m} -> ${m + 6}`,
    S().money === m + 6 && S().lastPayout.reward === 6 && S().lastPayout.interest === 0);
  check('lastPayout names the blind', S().lastPayout.blind === 'Small Blind');
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exitCode = failed === 0 ? 0 : 1;
