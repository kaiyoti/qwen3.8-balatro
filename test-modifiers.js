'use strict';
/* Headless self-test — Phase 4 Part A: Card modifiers (enhancements, seals,
   editions, stickers). Tests the scoring pipeline with modifier effects,
   hand-eval special cases (Wild, Stone), retrigger, and round-end hooks.
   Run:  node test-modifiers.js
   Exits 0 when all checks pass, 1 on any failure. */

const G = require('./game.js');
const { computePlayScore, evaluateHand, buildDeck, ENHANCEMENTS, SEALS, EDITIONS } = G;

let passed = 0, failed = 0;
function check(label, cond) {
  if (cond) { passed++; }
  else { failed++; console.log(`  FAIL  ${label}`); }
}

// Helper: make a card with optional modifiers
function card(rank, suit, mods = {}) {
  return { rank, suit, ...mods };
}

console.log('== Enhancements ==');

// Bonus: +30 chips when scored
{
  const c = card('A', 'spade', { enhancement: 'bonus' });
  const r = computePlayScore([c], []);
  check('Bonus: high card A + bonus = 5 + 11 + 30 = 46 chips', r.chips === 46);
}

// Mult: +4 mult when scored
{
  const c = card('A', 'spade', { enhancement: 'mult' });
  const r = computePlayScore([c], []);
  check('Mult: high card A + mult = 5 + 11 chips, 1 + 4 = 5 mult', r.chips === 16 && r.mult === 5);
}

// Glass: x2 mult when scored
{
  const c = card('A', 'spade', { enhancement: 'glass' });
  const r = computePlayScore([c], []);
  check('Glass: high card A, mult 1*2 = 2', r.mult === 2);
}

// Steel: x1.5 mult while held (pass full hand as 4th arg)
{
  const a = card('A', 'spade');
  const steel = card('K', 'heart', { enhancement: 'steel' });
  // Play just the Ace, but Steel is in hand (not played)
  const r = computePlayScore([a], [], 0, [a, steel]);
  check('Steel: held steel gives x1.5 mult (1*1.5=1.5)', r.mult === 1.5);
}

// Stone: +50 chips, no rank/suit, always scores
{
  const stone = { rank: null, suit: null, enhancement: 'stone' };
  const a = card('A', 'spade');
  const r = computePlayScore([a, stone], []);
  // High card: A scores (11), stone always scores (+50), base 5
  check('Stone: high card A + stone = 5 + 11 + 50 = 66 chips', r.chips === 66);
  check('Stone: in scoring set', r.eval.scoring.length === 2);
}
// Lucky: random, verify shape and that the $20 roll can fire
{
  const c = card('A', 'spade', { enhancement: 'lucky' });
  const r = computePlayScore([c], []);
  check('Lucky: doesn\'t crash, mult >= 1', r.mult >= 1);
  check('Lucky: money is 0 or 20 (1-in-15 roll)', r.money === 0 || r.money === 20);
  let hits = 0;
  for (let i = 0; i < 100; i++) {
    if (computePlayScore([c], []).money === 20) hits++;
  }
  check('Lucky: $20 fired at least once in 100 rolls', hits >= 1);
}

console.log('== Editions (on cards) ==');

// Foil: +50 chips when scored
{
  const c = card('A', 'spade', { edition: 'foil' });
  const r = computePlayScore([c], []);
  check('Foil: high card A + foil = 5 + 11 + 50 = 66 chips', r.chips === 66);
}

// Holographic: +10 mult when scored
{
  const c = card('A', 'spade', { edition: 'holographic' });
  const r = computePlayScore([c], []);
  check('Holo: high card A, mult 1 + 10 = 11', r.mult === 11);
}

// Polychrome: x1.5 mult when scored
{
  const c = card('A', 'spade', { edition: 'polychrome' });
  const r = computePlayScore([c], []);
  check('Poly: high card A, mult 1*1.5 = 1.5', r.mult === 1.5);
}

console.log('== Editions (on jokers) ==');

// Foil joker: +50 chips
{
  const c = card('A', 'spade');
  const joker = { id: 'test', kind: 'chips', value: 10, edition: 'foil' };
  const r = computePlayScore([c], [joker]);
  check('Foil joker: +50 + 10 joker = 65 extra chips', r.chips === 5 + 11 + 50 + 10);
}

// Holo joker: +10 mult
{
  const c = card('A', 'spade');
  const joker = { id: 'test', kind: 'mult', value: 4, edition: 'holographic' };
  const r = computePlayScore([c], [joker]);
  check('Holo joker: +10 + 4 joker = 14 extra mult', r.mult === 1 + 10 + 4);
}

// Poly joker: x1.5 mult
{
  const c = card('A', 'spade');
  const joker = { id: 'test', kind: 'xmult', value: 2, edition: 'polychrome' };
  const r = computePlayScore([c], [joker]);
  check('Poly joker: mult 1 * 2 * 1.5 = 3', r.mult === 3);
}

console.log('== Seals ==');

// Red Seal: retrigger (double card contribution)
{
  const c = card('A', 'spade', { seal: 'red' });
  const r = computePlayScore([c], []);
  // A = 11 chips, red seal doubles it: 5 + 11 + 11 = 27
  check('Red Seal: A retriggered = 5 + 11 + 11 = 27 chips', r.chips === 27);
}

// Red Seal with Bonus enhancement
{
  const c = card('A', 'spade', { enhancement: 'bonus', seal: 'red' });
  const r = computePlayScore([c], []);
  // A=11, bonus=+30, total card contrib=41, retrigger adds another 41
  // 5 + 11 + 30 + 41 = 87
  check('Red Seal + Bonus: 5 + 11 + 30 + 41 = 87', r.chips === 87);
}

// Gold Seal: +$3 when this card is played and scores
{
  const c = card('A', 'spade', { seal: 'gold' });
  const r = computePlayScore([c], []);
  check('Gold Seal: scoring card earns $3', r.money === 3);
}

// Gold Seal on a non-scoring kicker: no money
{
  const kicker = card('K', 'heart', { seal: 'gold' });
  const a = card('A', 'spade');
  const r = computePlayScore([kicker, a], []);
  check('Gold Seal: non-scoring kicker earns $0', r.money === 0);
}

// onPlayClick credits seal/lucky money to state (pair of aces, target $300 -> no blind transition)
{
  G.newRun();
  const s = G.getState();
  s.hand = [
    card('A', 'spade', { seal: 'gold' }), card('A', 'heart'),
    card('2', 'spade'), card('3', 'spade'),
    card('4', 'spade'), card('5', 'spade'),
  ];
  s.selected = [0, 1];
  const before = s.money;
  G.onPlayClick();
  check('Gold Seal: onPlayClick credits +$3', s.money === before + 3);
}

// Blue/Purple Seal: tested in Pass 2 (test-consumables.js)

console.log('== Wild enhancement ==');

// Wild: counts as every suit for flush
{
  const wild = card('A', 'spade', { enhancement: 'wild' });
  const h1 = card('7', 'heart');
  const h2 = card('9', 'heart');
  const h3 = card('J', 'heart');
  const h4 = card('K', 'heart');
  // Wild + 4 hearts (not a straight) = flush (wild counts as heart)
  const r = evaluateHand([wild, h1, h2, h3, h4]);
  check('Wild: counts as heart for flush', r.type === 'FLUSH');
}

// Wild: also counts as spade
{
  const wild = card('A', 'heart', { enhancement: 'wild' });
  const s1 = card('7', 'spade');
  const s2 = card('9', 'spade');
  const s3 = card('J', 'spade');
  const s4 = card('K', 'spade');
  const r = evaluateHand([wild, s1, s2, s3, s4]);
  check('Wild: counts as spade for flush', r.type === 'FLUSH');
}

console.log('== Stone in hand eval ==');

// Stone: doesn't participate in pair detection
{
  const stone = { rank: null, suit: null, enhancement: 'stone' };
  const a1 = card('A', 'spade');
  const a2 = card('A', 'heart');
  const k1 = card('K', 'club');
  const k2 = card('K', 'diamond');
  // Without stone: two pair. With stone: still two pair (stone doesn't count)
  const r = evaluateHand([a1, a2, k1, k2, stone]);
  check('Stone: excluded from pair detection (still two pair)', r.type === 'TWO_PAIR');
}

// Stone: always in scoring
{
  const stone = { rank: null, suit: null, enhancement: 'stone' };
  const a = card('A', 'spade');
  const k = card('K', 'heart');
  const q = card('Q', 'club');
  const j = card('J', 'diamond');
  const t = card('10', 'spade');
  const r = evaluateHand([a, k, q, j, t, stone]);
  check('Stone: in scoring set for high card', r.scoring.includes(stone));
}

console.log('== Deck building with modifiers ==');

{
  const d = buildDeck();
  check('Deck has 52 cards (with mods)', d.length === 52);
}

{
  // 20-deck sample (1040 cards) so the rate checks are statistically tight
  // (a single 52-card deck has ~1.3% zero-edition odds — a flaky check)
  let enh = 0, seals = 0, editions = 0;
  for (let i = 0; i < 20; i++) {
    const d = buildDeck();
    enh += d.filter(c => c.enhancement).length;
    seals += d.filter(c => c.seal).length;
    editions += d.filter(c => c.edition).length;
  }
  check('enhancements at ~40% rate (1040 cards, expected ~416)', enh >= 330);
  check('seals at ~20% rate (expected ~208)', seals >= 140);
  check('editions at ~8% rate (expected ~83)', editions >= 40);
}

{
  const d = buildDeck(true);
  check('buildDeck(true): no enhancements', d.every(c => !c.enhancement));
  check('buildDeck(true): no seals', d.every(c => !c.seal));
  check('buildDeck(true): no editions', d.every(c => !c.edition));
}

console.log('== Joker modifier rolls ==');

{
  // Roll many times to verify stickers/editions appear
  let withSticker = 0, withEdition = 0;
  for (let i = 0; i < 200; i++) {
    const j = G.rollJokerModifiers();
    if (j.sticker) withSticker++;
    if (j.edition) withEdition++;
  }
  check('Joker stickers appear (~30% rate, 200 rolls)', withSticker > 30);
  check('Joker editions appear (~6% rate)', withEdition >= 3);
}

console.log('== Round-end hooks ==');

G.newRun(); // initialize state

{
  // Gold: +$3 per gold card in hand
  const state = G.getState();
  state.hand = [card('A', 'spade', { enhancement: 'gold' }), card('K', 'heart', { enhancement: 'gold' })];
  state.deck = [];
  state.jokers = [];
  state.money = 10;
  G.applyRoundEndHooks();
  check('Gold: 2 gold cards in hand = +$6', state.money === 16);
}

{
  // Rental: -$3 per rental joker
  const state = G.getState();
  state.hand = [];
  state.deck = [];
  state.jokers = [{ id: 'test', sticker: 'rental' }, { id: 'test2', sticker: 'rental' }];
  state.money = 10;
  G.applyRoundEndHooks();
  check('Rental: 2 rental jokers = -$6', state.money === 4);
}

{
  // Glass: 1-in-4 destruction (just verify it doesn't crash)
  const state = G.getState();
  state.hand = [card('A', 'spade', { enhancement: 'glass' })];
  state.deck = [];
  state.jokers = [];
  state.money = 10;
  G.applyRoundEndHooks();
  check('Glass: doesn\'t crash, money >= 0', state.money >= 0);
}

console.log('== Combined modifiers ==');

// Card with bonus + foil + red seal
{
  const c = card('A', 'spade', { enhancement: 'bonus', edition: 'foil', seal: 'red' });
  const r = computePlayScore([c], []);
  // Base 5, A=11, bonus=+30, foil=+50, red seal doubles card contrib (11+30+50=91)
  // Total: 5 + 11 + 30 + 50 + 91 = 187
  check('Bonus+Foil+Red: 5+11+30+50+91 = 187', r.chips === 187);
}

// Steel + Glass + Poly all together
{
  const glass = card('A', 'spade', { enhancement: 'glass', edition: 'polychrome' });
  const steel = card('K', 'heart', { enhancement: 'steel' });
  const r = computePlayScore([glass], [], 0, [glass, steel]);
  // Chips: 5 + 11 = 16
  // Mult: 1 (base) * 2 (glass) * 1.5 (poly) * 1.5 (steel) = 4.5
  check('Glass+Poly+Steel: mult 1*2*1.5*1.5 = 4.5', r.mult === 4.5);
}

// Summary
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
