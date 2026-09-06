# GUI Redesign Brief — mimic real Balatro's visual style

The game logic (game.js) is done and tested (240 passing tests) — **do not change
scoring/economy/flow logic**. This is a presentation-layer pass: `style.css`,
plus whatever DOM structure changes in game.js's render functions are needed to
support the new visuals (e.g. adding icon elements to joker chips). If a render
function's DOM changes affect anything the test harness reads via `getState()`
or the exported flow functions, keep that contract intact — rerun all 5 test
files after and confirm 240/240 still passes.

**Constraint carried over from the original spec: no build step, no external
CDNs/fonts/images.** Must still work opening `index.html` directly via `file://`.
Any icons/illustrations must be inline SVG or pure CSS — no `<img src="http...">`,
no Google Fonts `<link>`. Use a system font stack that leans into a chunky,
rounded, playful look (e.g. `ui-rounded, "Segoe UI Rounded", "Nunito", "Comic Sans MS", sans-serif` —
whatever's actually available will fall back gracefully, this isn't pixel-perfect
territory).

## Reference aesthetic (real Balatro)

Cartoonish and chunky, not flat/corporate: thick black outlines on every panel
and card, saturated poster-paint colors, heavy drop shadows for depth, rounded
corners everywhere, big bold rounded typography, playful "juice" (cards lift/
tilt/glow on hover and select). The current plain bordered `<div>` boxes should
be replaced entirely — nothing should look like a default HTML form control.

## Specific areas to redesign

1. **Table background** — dark felt-green (or a subtle radial gradient
   simulating a casino table), not flat dark gray. Keep good contrast for
   dark-theme accessibility but make it feel like a game table, not a webpage.

2. **Playing cards** — proper card proportions (taller than wide, ~2.5:3.5),
   white face, thick black border, rounded corners, drop shadow. Rank+suit in
   corners with a larger center suit pip. Red suits genuinely red, black suits
   genuinely black/near-black. On hover: slight lift + scale. When selected:
   lift further, add a colored glow/outline (not just the current flat
   "selected" class with no visual distinction beyond a class name toggle —
   check what selection currently looks like and make it obviously game-like).

3. **HUD** — replace the plain label/value boxes with chunky rounded panels,
   each with a bold border and drop shadow, color-coded by meaning (e.g. blind
   info panel, score panel in one color, money in gold/yellow, plays/discards
   each distinct). This is the top bar the player looks at constantly — it
   should read instantly, Balatro-style.

4. **Jokers** — this is the one you flagged as maybe-not-fully-possible, and
   that's fine: we're not asking for hand-drawn art. Instead, give each of the
   12 jokers a small **inline-SVG or CSS-drawn icon** distinct enough to
   recognize at a glance (e.g. the four suit jokers get a colored suit-pip
   icon in their color; the base Joker gets a simple jester-hat or star shape;
   Jolly/Zany/Crazy/Droll/Sly/Mad/Half get simple shape-based icons of your
   choice — a die, a chip stack, a lightning bolt, whatever reads clearly at
   small size). Render each joker as a small card (not a plain div box) with
   a colored frame/background distinct per joker, its icon, and its name —
   full effect text stays as a hover tooltip (`title` attr is fine to keep).
   Use your own judgment on the specific icon-per-joker mapping; it doesn't
   need to match real Balatro's actual art, just needs to look designed
   rather than like a bare text label.

5. **Buttons** — chunky 3D game-UI buttons: thick border, rounded corners,
   drop shadow that compresses on `:active` (press-down feel), bold color per
   action (Play Hand vs Discard vs shop actions should be visually distinct,
   not identical gray buttons).

6. **Shop screen** — joker offers should look like a card shop shelf, not a
   list. Owned jokers and sell-mode should be visually distinct (e.g. a red
   tint/overlay when sell-mode is active).

7. **Screen transitions** — a simple CSS fade/scale transition between
   play/shop/game-over/victory screens is enough; don't over-engineer this.

## Process

Same as before: reply with a short implementation plan first (what you're
changing in style.css structurally — e.g. design tokens/CSS variables for the
palette, the joker-icon approach you'll take, any DOM changes needed in
game.js render functions) before writing code. Then implement, rerun all 5
test files, and report back with what changed and the confirmed pass count.
