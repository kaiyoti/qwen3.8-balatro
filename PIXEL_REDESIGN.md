# Phase 2 redesign — pixel-art style + real Balatro layout, on Phaser

I've reviewed the actual reference screenshot (attached to this prompt as an
image — look at it directly). This phase replaces the CSS-only redesign's
rendering approach and layout with something structurally much closer to the
real game. Game logic in `game.js` (the pure functions: hand eval, scoring,
economy, flow, `getState()`) **does not change** — this is a rendering-layer
swap, same as before. All 240 tests must still pass after.

## Engine choice: Phaser (my call as PM/architect)

Switch card/table rendering to **Phaser** (vendor the library as a single
local file, e.g. `lib/phaser.min.js` — download it once during this session
via whatever means you have, then reference it locally; the shipped
`index.html` must not make live external requests at load time, same
no-CDN-at-runtime constraint as before). Reasoning: Phaser's `pixelArt: true`
config does exactly the crisp-nearest-neighbor pixel rendering we want out of
the box, and its built-in tween/particle system is the natural way to do the
animations this phase asks for (card fan, flying cards, splash effects)
without hand-rolling a physics-less animation system in CSS.

Keep `game.js`'s pure logic functions as the single source of truth for game
state; Phaser only reads that state and renders/animates it, and calls back
into the existing flow functions (`onPlayClick`, `toggleSelect`, etc.) on
input. Don't duplicate scoring/economy logic inside Phaser scene code.

## Layout — match the reference structure

Looking at the reference image:

1. **Left sidebar, full height, ~25% width, dark navy panel** — NOT a top
   HUD bar like the current build. Contains, top to bottom: blind name
   banner, blind requirement/description text, "Score at least" target with
   an icon, round score, the chips×mult splash display (see below),
   Hands/Discards counters side by side, a money display, Ante/Round
   counters side by side. Style: rounded rectangle panels, bold borders,
   drop shadows, blue/white/orange/red color-coded by meaning, matching the
   reference's panel colors as closely as reasonable.

2. **Main play area, remaining width** — textured/gradient background (the
   reference uses a swirling blue pattern; a simpler pixel-art-friendly
   gradient or repeating pixel texture is fine, doesn't need to be as
   elaborate). Top: joker row, small overlapping fanned cards, count
   indicator (e.g. "6/7" for jokers held/max). Middle: play area where
   scoring cards land when a hand is played (empty when nothing's been
   played yet this action). Bottom: the player's hand.

## The hand: curved arc, not a straight row

This is the one you specifically flagged. The held hand must fan out in an
arc like cards actually held in a hand: each card rotated a few degrees
(outer cards rotate outward more, center card(s) close to upright), with a
slight vertical offset so the arc curves (outer cards sit slightly lower than
center). Classic technique: for card `i` of `n`, compute an angle offset from
center index and apply `rotate(angle) translateY(offset)`, both scaling with
distance from center. Selected cards lift further (as now) — combine the lift
with the existing rotation rather than resetting it.

## Play animation: cards fly to the table

When Play Hand is clicked, the selected cards should visibly animate from
their hand position/rotation to a landed position in the play area (a tween:
position + rotation settling to ~0, maybe a small bounce), not just
disappear/re-render instantly. This is a good fit for Phaser tweens. Discard
can be a simpler fade/toss, doesn't need the same treatment.

## Chips × Mult splash indicator

The blue "chips" blob and red "mult" blob with an "X" between them (see
reference: blue blob "340", red blob "21,600" separated by "X"). Show this in
the left sidebar, updating with the current accumulated chips/mult for the
in-progress play (or the base hand-type values while cards are selected but
not yet played, similar to how the current build shows a hand-type preview
line — same idea, styled as these two colored blob shapes instead of plain
text). Simple layered rounded-blob shapes with the number centered are
enough; don't need paint-splatter SVG art, just clearly blue vs red colored
panels reading as "chips" and "mult" the way the reference does.

## Joker roster + graphics — mimic https://tiereditems.com/003/

That page is a tier list covering the real game's full joker roster. Fetch it
yourself (you have `web_fetch`) — I'm deliberately not summarizing it myself
so you're working from the actual source, not my secondhand description.

- **Priority is the graphics/visual style, not mechanical fidelity.** Use it
  to expand our joker set beyond the current 12 with more variety, and to
  make each joker's icon/card visually resemble its real counterpart's
  color palette, silhouette, and theme — not necessarily to replicate every
  real joker's exact mechanic. Adapt effects to fit our existing simplified
  engine (numeric +chips/+mult/xmult triggered by hand-type/suit/card-count/
  money conditions) the same way the current 12 do. Skip any whose *concept*
  fundamentally requires systems we don't have (tarot/planet/spectral cards,
  vouchers, card editions/seals/enhancements, multi-round persistent
  triggers) rather than forcing a bad fit — note what you skipped and why.
- You have my explicit go-ahead to actually download/vendor image assets
  from that page locally if that gets a better visual match than hand-drawn
  SVG (your call on SVG-recreation vs. downloaded-reference-image per
  joker) — this is a local, personal, non-distributed project, not
  something being published or sold, so that's fine. Keep any downloaded
  assets local to the project (no live hotlinking at runtime, same
  no-external-request-at-load constraint as everything else).
- Give me a sense of scale in your plan (roughly how many jokers you're
  proposing, not necessarily the full ~150) before implementing — I'd
  rather calibrate scope once than have you build far more or fewer than
  makes sense here.

## Joker rarity tiers + real appearance-frequency weighting

Real Balatro assigns each joker a rarity (Common/Uncommon/Rare/Legendary) and
weights shop-offer odds by it (commons appear far more often than rares;
legendaries aren't purchasable in the normal shop pool at all in the real
game — research this rather than assuming, see below). Our current 12 jokers
have no rarity concept at all — every offer is uniform-random. Fix this as
part of the roster expansion:

- Research the actual rarity tier and the actual shop-appearance-weight/odds
  per tier online yourself (you have `web_fetch`) — don't guess the numbers,
  look them up. Cite briefly in your report what you found and where.
- Tag every joker (existing 12 + new ones) with a rarity tier.
- Shop offer generation should draw using the real weighted odds you found,
  not uniform random — while still respecting the existing no-duplicate-
  unless-Showman rule above.
- Rarity should be visually indicated too (e.g. a colored frame/corner tag
  matching the tier, consistent with the pixel-art styling elsewhere) —
  your call on exact treatment, doesn't need to be elaborate.
- Cover this with tests: weighted-distribution sanity check over many
  simulated offers (commons should dominate, rares should be rare) and a
  check that every joker has exactly one valid rarity tag.

## Duplicate-joker rule (design correction from an earlier decision)

Earlier in this project I approved "duplicate jokers across shops: allowed"
as a simplification — that was wrong, reverse it. Real Balatro's actual rule:
a joker already in the player's owned collection cannot appear again in
future shop offers **unless the player owns the Joker "Showman"** (real
effect: "Jokers, Tarot, Planet, and Spectral cards may appear multiple
times" — we only have Jokers, so just gate joker-offer duplication on it).

Implement this as part of the roster expansion above:
- Add Showman as one of the new jokers (uncommon-ish, no numeric scoring
  effect — its effect is purely on shop-offer generation).
- Shop offer generation must exclude any currently-owned joker id from the
  candidate pool, UNLESS Showman is owned, in which case duplicates are
  allowed again (including possibly offering a second Showman itself).
- Update/add tests: without Showman, generate many shops and confirm no
  offer ever duplicates an owned joker; with Showman owned, confirm
  duplicates can appear (may need a seeded/forced-random test rather than
  relying on probability).

## Pixel art styling

- Vendor an open-license pixel font locally (e.g. "Press Start 2P", OFL
  licensed — fetch it once and save as a local asset, reference via local
  `@font-face`, not a live Google Fonts link) for headers/numbers/scores —
  the chunky pixel-digit look is a big part of the reference's readability
  for big numbers. Since that font is hard to read in long text, use a
  more legible fallback (system monospace or the current font stack) for
  tooltip/effect body text — mixed-font approach, not everything needs to
  be the display font.
- Cards, joker frames, panels: thick dark outlines, drop shadows (hard
  offset shadows read as more "pixel game" than soft blurred ones — see how
  every card/panel in the reference has a crisp drop shadow beneath it).
- Doesn't have to visually match Balatro's specific card/joker art —
  original icon-based joker designs from the previous phase are fine to
  keep, just apply the pixel-art rendering treatment (crisp edges, no
  antialiasing blur, `image-rendering: pixelated` where relevant, Phaser's
  `pixelArt: true`) and add shadows consistently.

## Process

Same as always: plan first (Phaser integration approach, how state flows
from `game.js` into Phaser scene rendering, font vendoring approach, the
fan-math approach for the hand arc) — wait for sign-off before implementing.
Rerun all 5 test files and confirm 240/240 after implementing, since
`game.js`'s logic must stay untouched even though its render-triggering call
sites will change.
