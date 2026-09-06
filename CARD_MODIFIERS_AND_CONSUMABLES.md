# Phase 4 — Card modifiers, consumables, and a few UI additions

**NOT YET APPROVED FOR IMPLEMENTATION.** This is prepared and waiting — do
not start until explicitly told to proceed. This phase is large; expect to
propose your own multi-pass breakdown (plan first, as always) rather than
one big pass.

Answering directly, for the record: no, none of the below (card modifiers,
consumables) exist yet. REQUIREMENTS.md explicitly deferred all of it out of
v1 scope, and PIXEL_REDESIGN.md told you to skip any joker needing these
systems. This phase is where they get built.

## Part A — Card modifiers (data below is already researched, from
https://balatrowiki.org/w/Card_modifiers — you do not need to re-fetch this
page, it's transcribed accurately here)

### A1. Enhancements (playing cards only, one per card)

| Enhancement | Effect |
|---|---|
| Bonus | +30 Chips when scored |
| Mult | +4 Mult when scored |
| Wild | Counts as every suit simultaneously (affects flush/suit-joker checks) |
| Glass | x2 Mult when scored; 1-in-4 chance to be destroyed (removed from the deck permanently) after scoring resolves |
| Steel | x1.5 Mult while held in hand (not played — applies based on the *rest* of the hand at scoring time, not just played cards) |
| Stone | +50 Chips flat; has no rank or suit; always scores regardless of hand type (a structural wildcard for scoring purposes) |
| Gold | $3 if still held in hand at end of round (i.e. not played this round) |
| Lucky | Per scored card: independent 1-in-5 chance of +20 Mult, and independent 1-in-15 chance of +$20 |

### A2. Seals (playing cards only, one per card)

| Seal | Effect |
|---|---|
| Gold | Earn $3 when this card is played and scores |
| Red | Retrigger this card's scoring/effects 1 extra time |
| Blue | If held (not played) at end of round: creates a Planet card for whatever poker hand type was last played this round |
| Purple | Creates a Tarot card when this specific card is discarded |

Note: Red Seal retriggers do not themselves get retriggered by other
retrigger sources (avoid infinite/recursive retrigger chains).

### A3. Editions (playing cards AND jokers; consumables get Negative only)

| Edition | On a playing card | On a Joker | On a consumable | Shop cost add-on |
|---|---|---|---|---|
| Foil | +50 Chips when scored | +50 Chips, applied before the Joker's own effect | — | +$2 |
| Holographic | +10 Mult when scored | +10 Mult, applied before the Joker's own effect | — | +$3 |
| Polychrome | x1.5 Mult when scored | x1.5 Mult, applied after the Joker's own effect | — | +$5 |
| Negative | — (not applicable) | +1 Joker slot | +1 Consumable slot | +$5 |

Real Balatro restricts Negative to a specific legendary Joker (Perkeo) we
likely won't have — your call whether to gate it behind something
equivalent or just make it a rare roll; note whichever you pick as a
decision in your report.

### A4. Stickers (Jokers only, in-run, not purchasable directly)

| Sticker | Effect |
|---|---|
| Eternal | Cannot be sold or destroyed |
| Perishable | The Joker's effect is disabled ("debuffed") after 5 rounds |
| Rental | Lose $3 at the end of every round while held |

A Joker can never be both Eternal and Perishable at once. All three are
independent of Rental (a Joker could be Eternal *and* Rental, etc.).

### A5. Appearance rates (from the same source — for whatever mechanism you
build to introduce modifiers, e.g. a booster pack or shop roll; adapt as
needed to fit our simplified shop, note your adaptation)

Joker edition/sticker odds (no special voucher — we don't have Hone/Glow Up
vouchers as a starting point, but the numbers are here in case Part B adds
them): Negative 0.3%, Polychrome 0.3%, Holographic 1.4%, Foil 2%, Eternal
30%, Perishable 30%, Rental 30% (each independent; can't be both Eternal and
Perishable).

Playing card edition/enhancement/seal odds (base rate, before any
voucher-style multiplier): Polychrome 1.2%, Holographic 2.8%, Foil 4%,
Enhancement 40%, Seal 20% — each enhancement/seal variant is evenly split
within its category.

### Suggested engine integration (your call on final structure, this is a
starting point not a mandate)

- Add `enhancement`, `seal`, `edition` fields to the card object shape
  (currently just `{rank, suit}`); `null`/`undefined` = none.
- `computePlayScore` needs per-card enhancement/edition effects folded into
  the chips/mult pipeline alongside the existing joker pipeline — probably
  as an additional pass over `scoring` cards (and, for Steel/Gold, over the
  *held but unplayed* hand) before or interleaved with the joker loop.
  Think carefully about ordering vs. the existing chips→mult→xmult joker
  grouping; document whatever order you land on.
- `evaluateHand` needs to treat Wild-suited and Stone cards specially for
  hand-type detection (Wild = any suit for flush purposes; Stone = no
  rank/suit, always in the scoring set, doesn't participate in
  pair/straight detection but still contributes its flat chip value).
- Retrigger (Red Seal) needs a real mechanism — even a simple "apply this
  card's scoring contribution N times" flag is fine, don't over-engineer.
- Round-end hooks needed for Gold enhancement, Rental sticker, and Blue
  Seal (currently we don't have an explicit "round end, before shop" hook
  point distinct from the win/loss transition — check `onBlindCleared`/
  `onBlindLost` in game.js, wire in there).
- New tests: enhancement effects, seal triggers, edition bonuses on both
  cards and jokers, sticker constraints (can't sell Eternal, Perishable
  debuff timing, Rental cost), and the Wild/Stone hand-eval special cases.

## Part B — Consumables (research this yourself)

Fetch what you need from https://balatrowiki.org/ — Tarot cards, Planet
cards, Spectral cards, Vouchers, and Booster packs each have their own wiki
page there. I'm deliberately not summarizing these for you (unlike Part A)
so you're working from the source. Same guardrail as always: don't carry
full raw fetched pages forward across turns, extract what you need into
condensed notes as you go.

Things to specifically figure out and report back on before implementing:

- **Planet cards** level up a poker hand type's base chips/mult permanently
  for the run. We currently have NO hand-leveling at all (`HANDS` in
  game.js is fixed, REQUIREMENTS.md explicitly said "no hand leveling for
  v1") — this means Part B requires adding a leveling system to the
  scoring engine, not just a new card type. Scope this honestly.
- **Tarot cards** mostly modify existing cards in hand (add
  enhancement/change rank/change suit/etc.) or affect money — depends on
  Part A's enhancement system existing first. Sequence accordingly.
- **Spectral cards** are rarer/more powerful, some destroy or transform
  cards, at least one creates a negative-edition item.
- **Vouchers** are permanent per-run shop upgrades, bought once per ante
  visit — this needs new shop UI (a voucher slot alongside joker offers)
  and a way to track "owned vouchers this run" affecting other systems
  (e.g. Hone/Glow Up would double/quadruple the Part A5 appearance rates
  above, if you choose to implement those two).
  Also: we don't need every voucher from the real game, propose a
  reasonably-sized subset in your plan.
- **Booster packs** are how players usually acquire tarot/planet/spectral
  cards and card modifiers in the real game (bought in the shop, opened for
  a choice of N items). This is likely the natural place to hook in the
  Part A5 appearance rates.
- A consumable slot system (separate from the 5 Joker slots) is needed —
  check if anything like this exists yet (it doesn't, per game.js's current
  `MAX_JOKERS` being the only slot limit).

Given the size of Part B, propose in your plan roughly how many of each
consumable type you'd implement (not necessarily the full real-game roster)
and the order (my instinct: card-modifier infrastructure from Part A first,
since Tarot/Blue-Seal/Purple-Seal all depend on it; then planet
cards+hand-leveling; then the rest) — but this is your call to make and
justify, you're the one who'll have seen the actual wiki data for Part B.

## Part C — Small UI additions (independent of A/B, can be done in any
order, even as a quick separate pass first if that's easier to slot in)

1. **Animated background.** Something with movement (a subtle wavy/shifting
   gradient or pattern), doesn't need to visually match the real game,
   just needs to not be static. Keep it cheap performance-wise — this runs
   behind gameplay every frame.
2. **Poker chip icon next to the score.** A small chip-shaped graphic next
   to the Round Score display in the sidebar (simple is fine — a colored
   circle with a ring/notch pattern reads as a poker chip well enough,
   doesn't need real art).
3. **Ante display as "current / total".** We already have `MAX_ANTE` (3) in
   game.js — the sidebar currently shows just the current ante number,
   change it to show e.g. "1/3" (current/MAX_ANTE).

## Process

As always: plan first, wait for sign-off (the human will explicitly say to
proceed with this file — don't start on your own initiative even once you
see this). Given the scope, break Part A/B into whatever number of
implementation passes makes sense to you and say so in the plan. Part C can
be folded into any pass or done standalone, your call.
