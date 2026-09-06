# Phase 3 — Card rendering fixes, animation polish, global speed control

All items below are presentation-layer (renderer.js / index.html / style.css).
Do not touch game.js scoring/economy logic except where explicitly noted
(item 8, sort persistence, is a real logic bug, not cosmetic). Rerun the full
test suite after and confirm the pass count is unchanged (or only grows if
you add tests for the sort-persistence fix).

## 1. Proper card pip layout (not just a single center symbol)

Real playing cards show a rank-specific pip arrangement for number cards:
- 2: two pips vertically centered (one up, one down, both upright... actually
  standard convention: top pip inverted, bottom pip upright, centered column)
- 3: three pips in a vertical column (top, middle, bottom)
- 4: four pips in a 2x2 rectangle
- 5: 2x2 rectangle + one center pip
- 6: 2x3 rectangle (two columns of three)
- 7: 2x3 rectangle + one pip centered in the top gap
- 8: 2x3 rectangle + one pip centered top + one centered bottom
- 9: 3x3 grid minus center-middle-row adjustments (standard 9 layout: two
  columns of 4 + one center pip) — look up the standard Bicycle-style 9 and
  10 layouts if unsure, they're well-documented conventions, don't guess.
- 10: standard 10-layout (two columns of 4 plus two centered near top/bottom)
- Ace: single large pip, centered.
- J/Q/K: single large pip is fine (we're not doing court-card art) — keep
  current treatment for face cards, this item is about number cards 2-10
  only.

Implement a lookup table of pip positions (as fractions of card width/height,
so it scales with CARD_W/CARD_H) per rank, and render that many suit-colored
pip glyphs in `createCardSprite`.

## 2. Corner index: rank AND suit stacked

Card corners (top-left, bottom-right per standard convention, or wherever
you currently place them) currently show only the rank. Add the suit symbol
directly below the rank number in each corner, same as real cards' corner
index. Suit symbol should be small, same color as the pips (red/black).

## 3. Anti-aliasing / readability

Cards currently look over-smoothed, making rank/suit text harder to read
than it should be. Reduce or eliminate anti-aliasing on card text/shapes —
your call on the mechanism (Phaser game config `antialias: false`, ensuring
`pixelArt: true` is actually applying to text objects too, disabling texture
smoothing, snapping to integer pixel positions, whatever gets a crisp
result). Verify visually before/after with a screenshot comparison.

## 4. Global animation speed multiplier

Add a single control point — e.g. a module-level `let ANIM_SPEED = 1;` in
renderer.js (or an exported setter `window.setAnimSpeed(n)` for later
external control) — that every tween/animation duration in the file is
scaled by (`duration: baseMs / ANIM_SPEED`, so higher = faster). This must
cover: play-to-table animation, discard animation, and the new scoring
animation (item 6). Don't hardcode separate speed variables per animation
type unless there's a good reason — one shared multiplier as the default
ask, called out explicitly if you think a specific animation genuinely
needs its own independent control instead.

## 5. Discard animation: slide right off-screen, sequential

Currently discard cards fade + drop. Change to: each discarded card slides
horizontally off the right edge of the screen, with cards animating in
sequence (staggered start, not all simultaneously) rather than fading in
place — visually like they're being tossed onto a discard pile off-screen
to the right. Respect the global speed multiplier (item 4).

## 6. Scoring animation (research required)

When a hand is played, real Balatro doesn't just jump straight to the final
score — each scoring card individually animates (pops/slides up briefly) in
sequence, and as each one resolves, its chip contribution visibly adds to
the running score display, with the real game exposing a speed control
(commonly described as 0.5x/1x/2x/4x). Research how this actually looks/
works (you have `web_fetch` — look this up rather than guessing, a search
for "Balatro scoring animation" or watching/reading about it via any
accessible source should clarify the sequence). Implement an equivalent:
each scoring card (not just any played card — the actual scoring subset,
same rule the engine already uses for chip calculation) animates in
sequence, running score updates incrementally as each resolves, final
chips×mult lands after. Tie the pacing to the same global speed multiplier
from item 4 (this is likely the "specific animation with its own control"
exception mentioned in item 4 if you decide it needs independent pacing —
your call, but default to the shared multiplier unless you have a good
reason not to).

## 7. Deck pile display (bottom-right)

Add a visual deck-pile indicator in the bottom-right of the play area,
similar to the reference screenshot: a small card-back-style icon/stack with
a count showing cards remaining in the draw pile vs. total deck size (e.g.
"38/52"). Simple is fine — a stacked-card icon (even 2-3 offset rectangles
suggesting a pile) plus the text counter.

## 8. Chips/mult display shape

The blue (chips) and red (mult) containers in the sidebar currently render
as an egg/ellipse shape. Change both to rounded rectangles instead.

## 9. Joker cards should look like playing cards, not dark panels

Jokers currently render as a small square with a dark navy background and a
colored rarity-frame border — doesn't read as a card. Change joker rendering
to match the regular playing card treatment: same white card body, same
CARD_W x CARD_H dimensions as the hand's playing cards, with the joker's
icon/sprite displayed within that white card face (rarity indication can
move to a colored border/corner tag on the white card, or a small colored
strip — your call, but the base card must look like a white playing card,
not a dark tile). Icon design/detail work is explicitly out of scope for
this pass ("we can work on the designs later") — just fix the card
container shape/size/color; keep using whatever icon rendering already
exists inside it.

## 10. Sort order does not persist after play/discard (real bug)

After the player sorts their hand (by rank or by suit) and then plays or
discards, the hand's sort order is lost — presumably because refilled/drawn
cards get appended without re-sorting, or the sort mode isn't remembered
across hand mutations. Fix: track the last-used sort mode in state (e.g.
`state.sortMode`, null until the player sorts once), and automatically
re-apply that sort after any hand mutation that changes card positions
(post-play refill, post-discard refill). If the player hasn't sorted yet
this run, no automatic sorting should happen (preserve current default
behavior). Add a test for this in test-sort.js: sort by rank, play a hand,
confirm the refilled hand is still rank-sorted; same for suit sort +
discard.

## Process

Plan first as usual (how you'll structure the pip-position table, the speed
multiplier mechanism, your scoring-animation research findings and the
sequence you'll implement, the sort-persistence approach) — wait for
sign-off before implementing. This is a bigger batch than usual; if you
think it's cleaner to split into two implementation passes (e.g. card
rendering fixes + sort bug first, animations second), propose that split in
your plan rather than assuming either way.
