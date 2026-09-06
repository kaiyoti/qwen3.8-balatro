'use strict';
/* Headless self-test — Phase 5: Boss Blinds (ante-gated roster, "?" reveal
   on first play, debuff/face-down semantics, per-boss effects, $5 reward).
   Run:  node test-boss.js
   Exits 0 when all checks pass, 1 on any failure. */

const G = require('./game.js');
const { computePlayScore, BOSS_BLINDS } = G;

let passed = 0, failed = 0;
function check(label, cond) {
  if (cond) { passed++; }
  else { failed++; console.log(`  FAIL  ${label}`); }
}
const S = () => G.getState();

// Enter a boss blind at the given ante with a forced boss id
// (deterministic: mark every other eligible boss as already seen).
function enterBoss(ante, id) {
  const s = S();
  s.ante = ante;
  s.blindIdx = 2;
  s.bossSeen = BOSS_BLINDS
    .filter(b => b.minAnte <= ante && b.id !== id).map(b => b.id);
  G.startBlind();
  check(`enterBoss: rolled ${id}`, s.boss && s.boss.id === id);
  return s;
}

console.log('== Roster & eligibility ==');
check('15 bosses defined', BOSS_BLINDS.length === 15);
check('unique ids, names, texts',
  new Set(BOSS_BLINDS.map(b => b.id)).size === 15 &&
  BOSS_BLINDS.every(b => b.name && b.text));
check('min ante pool: ante1=6, ante2=13, ante3=15',
  BOSS_BLINDS.filter(b => b.minAnte <= 1).length === 6 &&
  BOSS_BLINDS.filter(b => b.minAnte <= 2).length === 13 &&
  BOSS_BLINDS.filter(b => b.minAnte <= 3).length === 15);

// rollBoss never rolls above the ante gate
{
  G.newRun();
  let ok = true;
  for (let i = 0; i < 200; i++) {
    const b = G.rollBoss(1);
    if (b.minAnte > 1) ok = false;
  }
  check('rollBoss(1) always from ante-1 pool', ok);
}

// No-repeat: with 5 of the 6 ante-1 bosses seen, only the 6th can roll
{
  G.newRun();
  const s = S();
  s.bossSeen = ['hook', 'psychic', 'manacle', 'goad', 'club'];
  let ok = true;
  for (let i = 0; i < 50; i++) {
    if (G.rollBoss(1).id !== 'pillar') ok = false;
  }
  check('no-repeat: only un-seen boss rolls', ok);
}

console.log('== Round start & reveal ==');
{
  const s = enterBoss(2, 'water');
  check('boss starts hidden (revealed=false)', s.boss.revealed === false);
  check('boss recorded in bossSeen', s.bossSeen.includes('water'));
}
{
  G.newRun();
  S().blindIdx = 0;
  G.startBlind();
  check('non-boss blind: boss is null', S().boss === null);
}
{
  // Reveal on first valid play; blocked play does NOT reveal
  const s = enterBoss(1, 'psychic');
  s.hand = [
    { rank: '2', suit: 'heart' }, { rank: '3', suit: 'heart' },
    { rank: '4', suit: 'heart' }, { rank: '5', suit: 'heart' },
    { rank: '6', suit: 'heart' }, { rank: '7', suit: 'heart' },
    { rank: '8', suit: 'heart' }, { rank: '9', suit: 'heart' },
  ];
  s.selected = [0, 1, 2, 3]; // 4 cards -> blocked by psychic
  G.onPlayClick();
  check('Psychic: 4-card play blocked, not revealed',
    s.boss.revealed === false && s.playsLeft === 4 && s.roundScore === 0);
  s.selected = [0, 1, 2, 3, 4]; // 5 cards -> valid
  G.onPlayClick();
  check('Psychic: 5-card play allowed, boss revealed',
    s.boss.revealed === true && s.playsLeft === 3);
}

console.log('== Boss targets & reward ==');
{
  enterBoss(1, 'hook');
  check('default boss target = 2x small (600)', G.blindTarget() === 600);
}
{
  S().bossSeen = BOSS_BLINDS.filter(b => b.id !== 'wall').map(b => b.id);
  S().ante = 2; S().blindIdx = 2;
  G.startBlind();
  check('The Wall target = 4x small (3200)', G.blindTarget() === 3200);
}
{
  S().bossSeen = BOSS_BLINDS.filter(b => b.id !== 'needle').map(b => b.id);
  S().ante = 3; S().blindIdx = 2;
  G.startBlind();
  check('The Needle target = 1x small (2000)', G.blindTarget() === 2000);
}
{
  check('boss payout: $5 base + 3 discards = 8',
    G.applyBlindClearPayout(4, 3, true).reward === 8);
  check('non-boss payout unchanged: $3 base + 3 = 6',
    G.applyBlindClearPayout(4, 3, false).reward === 6);
}

console.log('== Round-setup effects ==');
{
  const s = enterBoss(2, 'water');
  check('Water: 0 discards', s.discardsLeft === 0);
}
{
  const s = enterBoss(2, 'needle');
  check('Needle: 1 play only', s.playsLeft === 1);
}
{
  const s = enterBoss(1, 'manacle');
  check('Manacle: hand size 7', s.hand.length === 7);
}
{
  const s = enterBoss(2, 'house');
  check('House: initial hand face down', s.hand.every(c => c.faceDown === true));
}
{
  const s = enterBoss(1, 'goad');
  const all = [...s.hand, ...s.deck];
  check('Goad: all spades debuffed, no others',
    all.filter(c => c.suit === 'spade').every(c => c.debuffed === true) &&
    all.filter(c => c.suit !== 'spade').every(c => c.debuffed !== true));
}
{
  const s = enterBoss(1, 'club');
  const all = [...s.hand, ...s.deck];
  check('Club: all clubs debuffed, no others',
    all.filter(c => c.suit === 'club').every(c => c.debuffed === true) &&
    all.filter(c => c.suit !== 'club').every(c => c.debuffed !== true));
}
{
  // Pillar: cards played during the small blind are debuffed at boss start.
  // Part 1: onPlayClick tracks played cards into playedThisAnte.
  G.newRun();
  const s = S();
  s.hand = [
    { rank: 'A', suit: 'spade' },
    { rank: '2', suit: 'heart' }, { rank: '3', suit: 'heart' },
    { rank: '4', suit: 'heart' }, { rank: '5', suit: 'heart' },
    { rank: '6', suit: 'heart' }, { rank: '7', suit: 'heart' },
    { rank: '8', suit: 'heart' },
  ];
  s.deck = G.buildDeck(true).slice(8);
  s.selected = [0];
  G.onPlayClick(); // play the A-spade on the small blind
  check('Pillar: A-spade tracked as played this ante',
    s.playedThisAnte.includes('A-spade'));
  // Part 2: boss setup debuffs the matching cards (clean deck, so the
  // A-spade can't have been rolled into a Stone with null rank)
  s.boss = { id: 'pillar', name: 'The Pillar', text: 'x', targetMult: 2, revealed: false };
  const d = G.buildDeck(true);
  s.hand = d.slice(0, 8);
  s.deck = d.slice(8);
  G.applyBossSetup();
  const ace = [...s.hand, ...s.deck].find(c => c.rank === 'A' && c.suit === 'spade');
  check('Pillar: the played A-spade is debuffed', ace && ace.debuffed === true);
}

{
  // Flint: base chips/mult of played hands halved
  const s = enterBoss(2, 'flint');
  s.hand = [
    { rank: 'A', suit: 'spade' }, { rank: 'A', suit: 'heart' },
    { rank: '2', suit: 'spade' }, { rank: '3', suit: 'spade' },
    { rank: '4', suit: 'spade' }, { rank: '5', suit: 'spade' },
    { rank: '6', suit: 'spade' }, { rank: '7', suit: 'spade' },
  ];
  s.selected = [0, 1];
  const r = G.computePlayScore(s.hand.slice(0, 2), [], 3, s.hand, s.handLevels);
  // Pair base 10/2 -> 5/1; aces 11+11: chips 5+22=27, mult 1, total 27
  check('Flint: pair base halved (5+22=27 chips, x1 = 27)',
    r.chips === 27 && r.mult === 1 && r.total === 27);
}

console.log('== Per-play effects ==');
{
  // Hook: 2 random hand cards removed after each play
  const s = enterBoss(1, 'hook');
  s.hand = [
    { rank: '9', suit: 'spade' }, { rank: '10', suit: 'spade' },
    { rank: 'J', suit: 'spade' }, { rank: 'Q', suit: 'spade' },
    { rank: 'K', suit: 'spade' }, { rank: '2', suit: 'heart' },
    { rank: '3', suit: 'heart' }, { rank: '4', suit: 'heart' },
  ];
  // Clean deck: the royal clears the blind, and round-end Glass destruction
  // would otherwise randomly remove glass-enhanced cards from the deck.
  // 44 cards = 52 minus the 8 now in hand.
  s.deck = G.buildDeck(true).slice(8);
  s.selected = [0, 1, 2, 3, 4];
  G.onPlayClick();
  check('Hook: hand shrinks by 2 after play (8->6)', s.hand.length === 6);
  // 5 played cards leave the run, 2 hook cards return: hand+deck = 52-5
  check('Hook: removed cards returned to deck (hand+deck = 47)',
    s.hand.length + s.deck.length === 47);
}
{
  // Arm: played hand type permanently levels down 1
  const s = enterBoss(2, 'arm');
  s.handLevels = { PAIR: 2 };
  s.hand = [
    { rank: 'A', suit: 'spade' }, { rank: 'A', suit: 'heart' },
    { rank: '2', suit: 'spade' }, { rank: '3', suit: 'spade' },
    { rank: '4', suit: 'spade' }, { rank: '5', suit: 'spade' },
    { rank: '6', suit: 'spade' }, { rank: '7', suit: 'spade' },
  ];
  s.selected = [0, 1];
  G.onPlayClick();
  check('Arm: PAIR level 2 -> 1', s.handLevels.PAIR === 1);
  s.hand = [
    { rank: 'A', suit: 'diamond' }, { rank: 'A', suit: 'club' },
    { rank: '2', suit: 'heart' }, { rank: '3', suit: 'heart' },
    { rank: '4', suit: 'heart' }, { rank: '5', suit: 'heart' },
    { rank: '6', suit: 'heart' }, { rank: '7', suit: 'heart' },
  ];
  s.selected = [0, 1];
  G.onPlayClick();
  check('Arm: PAIR level 1 -> 0 (floor)', s.handLevels.PAIR === 0);
}
{
  // Tooth: -$1 per card played
  const s = enterBoss(3, 'tooth');
  s.hand = [
    { rank: '9', suit: 'spade' }, { rank: '10', suit: 'spade' },
    { rank: 'J', suit: 'spade' }, { rank: 'Q', suit: 'spade' },
    { rank: 'K', suit: 'spade' }, { rank: '2', suit: 'heart' },
    { rank: '3', suit: 'heart' }, { rank: '4', suit: 'heart' },
  ];
  s.money = 10;
  s.selected = [0, 1, 2, 3, 4];
  G.onPlayClick();
  check('Tooth: 5 cards played, $10 -> $5', s.money === 5);
}

console.log('== Play restrictions ==');
{
  // Mouth: only one hand type this round
  const s = enterBoss(2, 'mouth');
  s.hand = [
    { rank: 'A', suit: 'spade' }, { rank: 'A', suit: 'heart' },
    { rank: '9', suit: 'heart' }, { rank: '10', suit: 'heart' },
    { rank: 'J', suit: 'heart' }, { rank: 'Q', suit: 'heart' },
    { rank: 'K', suit: 'heart' }, { rank: '2', suit: 'spade' },
  ];
  s.selected = [0, 1]; // pair of aces
  G.onPlayClick();
  check('Mouth: first hand type (pair) allowed', s.roundScore > 0);
  // After the play, the heart 9-K shift to indices 0-4
  s.selected = [0, 1, 2, 3, 4]; // flush of hearts — different type
  const scoreBefore = s.roundScore;
  G.onPlayClick();
  check('Mouth: different hand type blocked',
    s.roundScore === scoreBefore && s.playsLeft === 3);
  s.hand = [
    { rank: 'A', suit: 'diamond' }, { rank: 'A', suit: 'club' },
    { rank: '9', suit: 'spade' }, { rank: '10', suit: 'spade' },
    { rank: 'J', suit: 'spade' }, { rank: 'Q', suit: 'spade' },
    { rank: 'K', suit: 'spade' }, { rank: '2', suit: 'diamond' },
  ];
  s.selected = [0, 1]; // pair again — same type, allowed
  G.onPlayClick();
  check('Mouth: same hand type still allowed', s.playsLeft === 2);
}
{
  // Eye: no repeated hand types
  const s = enterBoss(3, 'eye');
  s.hand = [
    { rank: 'A', suit: 'spade' }, { rank: 'A', suit: 'heart' },
    { rank: '9', suit: 'heart' }, { rank: '10', suit: 'heart' },
    { rank: 'J', suit: 'heart' }, { rank: 'Q', suit: 'heart' },
    { rank: 'K', suit: 'heart' }, { rank: '2', suit: 'spade' },
  ];
  s.selected = [0, 1]; // pair
  G.onPlayClick();
  s.hand = [
    { rank: 'A', suit: 'diamond' }, { rank: 'A', suit: 'club' },
    { rank: '9', suit: 'spade' }, { rank: '10', suit: 'spade' },
    { rank: 'J', suit: 'spade' }, { rank: 'Q', suit: 'spade' },
    { rank: 'K', suit: 'spade' }, { rank: '2', suit: 'diamond' },
  ];
  const scoreBefore = s.roundScore;
  s.selected = [0, 1]; // pair again — repeated type, blocked
  G.onPlayClick();
  check('Eye: repeated hand type blocked',
    s.roundScore === scoreBefore && s.playsLeft === 3);
  s.selected = [2, 3, 4, 5, 6]; // flush — new type, allowed
  G.onPlayClick();
  check('Eye: new hand type allowed', s.playsLeft === 2);
}

console.log('== Debuff scoring ==');
{
  // Debuffed card: 0 contribution, still counts for detection
  const deb = { rank: 'A', suit: 'spade', debuffed: true };
  const a = { rank: 'A', suit: 'heart' };
  const r = computePlayScore([deb, a], []);
  check('debuffed pair: still detected as PAIR', r.eval.type === 'PAIR');
  check('debuffed pair: 10 base + 11 (one ace) = 21 chips, x2 = 42',
    r.chips === 21 && r.mult === 2 && r.total === 42);
}
{
  // Debuffed nullifies enhancement/edition/seal contributions
  const deb = { rank: 'A', suit: 'spade', debuffed: true, enhancement: 'bonus', edition: 'foil', seal: 'gold' };
  const r = computePlayScore([deb], []);
  check('debuffed A: no bonus/foil chips, no gold money',
    r.chips === 5 && r.money === 0);
}

console.log('== Face-down scoring ==');
{
  // Face-down is hidden from the player only; scoring is normal
  const fd = [
    { rank: 'A', suit: 'spade', faceDown: true },
    { rank: 'A', suit: 'heart', faceDown: true },
  ];
  const r = computePlayScore(fd, []);
  check('face-down pair: detected as PAIR, scores normally (32x2=64)',
    r.eval.type === 'PAIR' && r.total === 64);
}

// Summary
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
