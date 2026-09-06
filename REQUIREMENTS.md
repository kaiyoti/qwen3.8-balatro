# Balatro Clone — MVP Requirements

Single-page browser game (HTML/CSS/JS, no build step, no external deps/CDNs —
must work by opening index.html directly or via a trivial static file server).

## Scope for this MVP (v1)

Reduced from full Balatro (8 antes, ~150 jokers, tarot/planet/spectral cards,
vouchers, multiple decks/stakes) to a tight vertical slice that is still
recognizably Balatro and fully playable start-to-finish:

- **3 Antes only** (Ante 1-3), each with Small Blind -> Big Blind -> Boss Blind.
- **Standard 52-card deck**, no editions/enhancements/seals for v1.
- **12 Jokers** (listed below) — simple, numeric, no complex triggers/synergy chains.
- **No tarot/planet/spectral cards, no vouchers, no packs.** Shop sells only
  Jokers + a "reroll" button + "skip blind for $ " option.
- **One deck/stake** (equivalent to default Red Deck, White Stake).

## Core loop

1. Round starts: draw hand of 8 cards from a shuffled 52-card deck.
2. Player selects 1-5 cards, then either **Play Hand** or **Discard**.
   - 4 plays and 3 discards allowed per blind (both counters shown in UI).
   - After playing or discarding, draw back up to 8.
3. Playing a hand scores **Chips x Mult** (see Scoring) added to a running
   round score.
4. Beat the blind by reaching its **chip target** before running out of plays.
   Reaching the target early still lets remaining plays/discards be used
   (they don't carry over) — round ends immediately once target is met OR
   plays run out.
5. On win: go to Shop. On loss (target not met when plays exhausted): Game Over
   screen with stats (ante reached, blind, score).
6. Shop: player has $ (from blind reward + interest, see Economy). Can buy
   up to 5 Jokers offered (random from the 12-Joker pool, no dupes in one
   shop), reroll shop for $5 (increases $1 per reroll this shop, resets next
   blind), or skip straight to next blind.
7. After Boss Blind of Ante 3 is beaten: **Victory screen.**

## Scoring (must match Balatro's real formula shape)

- Each playable poker hand type has a **base Chips** and **base Mult**,
  which *level up* is NOT required for v1 (fixed base values below, no
  planet-card leveling).
- When a hand is played, only the cards that count toward that hand type
  are "scored" (e.g. in a Pair, only the 2 paired cards score chips; kickers
  don't). This is a real Balatro rule — don't skip it, it changes hand-type
  incentives a lot.
- Each scoring card contributes its **chip value** to the Chips total:
  2-10 = pip value, J/Q/K = 10, A = 11.
- Joker effects then apply on top, in the order jokers are held (left to
  right), each modifying running Chips/Mult per its effect type
  (`+chips`, `+mult`, `xmult`), evaluated in that fixed order:
  1. All `+chips` effects
  2. All `+mult` effects
  3. All `xmult` effects (multiplicative, applied in joker order)
- Final score for the play = `Chips * Mult`, added to round score.

Base hand values (Chips / Mult) — use Balatro's real base values:

| Hand | Chips | Mult |
|---|---|---|
| High Card | 5 | 1 |
| Pair | 10 | 2 |
| Two Pair | 20 | 2 |
| Three of a Kind | 30 | 3 |
| Straight | 30 | 4 |
| Flush | 35 | 4 |
| Full House | 40 | 4 |
| Four of a Kind | 60 | 7 |
| Straight Flush | 100 | 8 |

## The 12 Jokers (v1 pool)

Numeric/simple effects only, no per-card conditional triggers beyond what's
listed:

1. **Joker** — +4 Mult. ($2 cost)
2. **Greedy Joker** — +3 Mult if hand contains a Diamond. ($5)
3. **Lusty Joker** — +3 Mult if hand contains a Heart. ($5)
4. **Wrathful Joker** — +3 Mult if hand contains a Spade. ($5)
5. **Gluttonous Joker** — +3 Mult if hand contains a Club. ($5)
6. **Jolly Joker** — +8 Mult if played hand is a Pair (or better containing a pair). ($3)
7. **Zany Joker** — +12 Mult if played hand is Three of a Kind+. ($4)
8. **Mad Joker** — +10 Chips per pair in the played hand. ($4)
9. **Crazy Joker** — +12 Mult if played hand is a Straight. ($4)
10. **Droll Joker** — +10 Mult if played hand is a Flush. ($4)
11. **Sly Joker** — +50 Chips if played hand contains a Pair. ($3)
12. **Half Joker** — +20 Mult if played hand has 3 or fewer cards. ($5)

Max 5 Joker slots. Jokers sold back for half their buy price (rounded down).

## Economy

- Beating a blind pays: `$3 + (1 per remaining discard, unused)`.
- Interest: `+$1 per $5 held, capped at $5 interest`, paid after every blind.
- Skipping a blind (optional, small/big blind only, not boss) pays a flat
  $/tag placeholder of `$4` and skips straight to shop (v1 simplification —
  real Balatro gives a Tag; out of scope).

## Blind chip targets (v1 fixed, no random boss debuffs beyond a name/skin — v1 boss blinds are mechanically identical to Big Blind but 1.5x score target)

| Ante | Small Blind | Big Blind | Boss Blind |
|---|---|---|---|
| 1 | 300 | 450 | 675 |
| 2 | 800 | 1200 | 1800 |
| 3 | 2000 | 3000 | 4500 |

## UI requirements

- Cards rendered as DOM elements (div/svg), showing rank+suit clearly,
  suit color (red/black), selectable (click toggles selection, max 5).
- Persistent HUD: current Ante/Blind name, chip target, current round score,
  plays remaining, discards remaining, money, held Jokers (with tooltips
  showing their effect text).
- Play Hand / Discard buttons disabled appropriately (e.g. Discard disabled
  at 0 discards left, both disabled if nothing selected).
- Shop screen: show 5 joker offers with price/effect text, Buy button
  (disabled if can't afford or slots full), Reroll button, "Next Blind"
  button to leave shop.
- Game Over and Victory screens with a "New Run" button that resets
  everything.

## Explicit non-goals for v1 (do not implement, do not ask about — just skip)

Tarot/Planet/Spectral cards, vouchers, booster packs, card
editions/enhancements/seals, multiple decks/stakes, save/load, animations
beyond basic CSS transitions, sound, mobile touch support, Five of a Kind /
Flush Five / Flush House (require enhancement cards, out of scope since no
enhancements exist in v1).

## Deliverable structure

Plain files in this directory: `index.html`, `style.css`, `game.js` (further
split game.js into modules only if you (the implementer) think it's
warranted — your call, mention it in your plan).

## Standing deployment constraint (confirmed working, keep it this way)

This project is intended for GitHub Pages hosting eventually. Verified as of
Phase 3: it's pure static HTML/CSS/JS with everything vendored locally (no
Node/build step required to run it, no server-side code, no runtime network
calls), works opening `index.html` directly via `file://` with zero console
errors, and every asset reference (`<script src>`, `<link href>`, CSS
`url()`) is a relative path, not an absolute `/`-rooted one — required since
GitHub Pages serves project sites from a subdirectory
(`username.github.io/repo-name/`), where absolute paths would 404. Any
future change must preserve all of this: no `fetch()`/`XMLHttpRequest`, no
new absolute paths, no dependency that requires a server or build step to
produce the shipped files (vendoring a new library the same way Phaser was
vendored is fine).

## Process

1. First, respond with an **implementation plan only** — no code yet:
   file/module breakdown, core data structures (card, joker, game state),
   and the order you'll build things in (milestones). Wait for sign-off.
2. Do not proceed to the next milestone without reporting what you finished
   and any deviations from the plan.
