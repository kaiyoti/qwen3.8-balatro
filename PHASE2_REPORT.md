# Phase 2 Report — Pixel-Art Redesign + Expanded Joker Roster

## What Was Built

### Rendering Layer Swap: DOM → Phaser 3

- **Vendored** `lib/phaser.min.js` (Phaser 3.85.2, 1.2 MB) — single local file, no CDN at runtime.
- **Vendored** `fonts/PressStart2P-Regular.woff2` (16 KB, OFL license) — pixel display font for headers/numbers.
- **New file** `renderer.js` (424 lines) — Phaser scene that:
  - Renders cards in a **curved arc** (parabolic offset + rotation scaling with distance from center).
  - Selected cards **lift 30px** while maintaining their arc rotation.
  - **Play animation**: cards tween from hand position to play area with `Back.easeOut` + staggered delay, then triggers `onPlayClick()`.
  - **Discard animation**: cards fade + drop, then triggers `onDiscardClick()`.
  - Renders **joker row** at top with rarity-colored frames (blue/purple/gold borders).
  - Polls game state each frame (hash comparison) to detect changes and re-render.
  - Card click → `toggleSelect(i)` callback into game.js.

### Layout Restructure (matches reference)

- **Left sidebar** (25% width, DOM): blind name banner, target, round score, **chips×mult splash blobs** (blue/red rounded shapes with ×), hands/discards/money/ante counters, play/discard/sort buttons.
- **Main area** (75% width, Phaser canvas): dark blue textured background, joker row (top), play area (middle), hand arc (bottom).
- **Overlays** (DOM, absolute positioned): shop, game over, victory.

### Pixel-Art Styling

- `pixelArt: true` in Phaser config (nearest-neighbor upscaling).
- `image-rendering: pixelated` on canvas.
- Hard offset shadows (no blur) on all panels, cards, buttons.
- Thick dark outlines (3-4px borders).
- Press Start 2P for numbers/headers, Courier New for body text.
- Rarity-colored frames on joker icons (common=blue, uncommon=purple, rare=gold).

### Expanded Joker Roster: 12 → 28

| Rarity | Count | Jokers |
|--------|-------|--------|
| Common | 20 | Joker, Greedy, Lusty, Wrathful, Gluttonous, Jolly, Zany, Mad, Crazy, Droll, Sly, Half, **Wily, Clever, Devious, Crafty, Banner, Even Steven, Odd Todd, Gros Michel** |
| Uncommon | 5 | **Showman, Blackboard, Flower Pot, Fibonacci, Arrowhead** |
| Rare | 3 | **The Duo, The Trio, The Order** |

Bold = new in Phase 2. All adapted to our simplified engine (numeric +chips/+mult/xmult with hand-type/suit/card-count/discard conditions).

**Skipped jokers** (require systems we don't have): tarot/planet/spectral creators, retrigger mechanics, deck modification, hand/discard size changes, economy-only effects, probability-based triggers, multi-round persistent state, card editions/seals/enhancements, boss blind interactions.

### Rarity System + Weighted Shop

- Every joker tagged with `rarity: 'common' | 'uncommon' | 'rare'`.
- Shop offers use **weighted random selection** by rarity:
  - Common: weight 100
  - Uncommon: weight 55
  - Rare: weight 25
- With our 20/5/3 pool, observed distribution over 10,000 simulated offers: **84.5% Common / 12.0% Uncommon / 3.5% Rare**.
- **Legendaries excluded** from the normal shop pool (matching real Balatro where they have no shop cost).

### Showman Duplicate Rule (design correction)

- **Without Showman**: owned jokers are excluded from the candidate pool for future shop offers.
- **With Showman owned**: full pool available (duplicates allowed, including a second Showman).
- Showman itself has `kind: 'none'` — zero scoring effect, purely a shop modifier.

## Joker Roster Source

Roster and rarity data from **tiereditems.com/003** (Balatro Joker & Voucher Cheat Sheet, 149 jokers with id/name/cost/rarity/effect). This page is a reference sheet (not a tier list), but it provides the authoritative rarity assignments and effect descriptions.

**Rarity weights** (Common:100, Uncommon:55, Rare:25) are from community reverse-engineering of Balatro's shop system, widely cited in Balatro community discussions. I was unable to verify these against a live authoritative wiki (multiple wiki domains were inaccessible: 401/403/SSL errors). The weights produce a distribution where commons dominate, which matches the documented game behavior. **Flag for review**: if you have access to the actual game data files, the exact weight values may differ slightly.

## Test Results

```
node test-hands.js    →  63 passed, 0 failed
node test-jokers.js   →  39 passed, 0 failed
node test-rarity.js   →  36 passed, 0 failed  [NEW]
node test-run.js      →  49 passed, 0 failed
node test-scoring.js  →  43 passed, 0 failed
node test-shop.js     →  46 passed, 0 failed
node test-sort.js     →  12 passed, 0 failed
─────────────────────────────────────────────
TOTAL:                288 passed, 0 failed
```

`node --check game.js` → clean
`node --check renderer.js` → clean

### New tests (test-rarity.js, 36 checks):
- Rarity validation: every joker has exactly one valid rarity tag
- Pool counts: 20 common, 5 uncommon, 3 rare
- Weight ordering: common > uncommon > rare
- Weighted distribution sanity (10,000 simulated offers)
- Showman: owned jokers excluded without it (500 rolls, zero duplicates)
- Showman: duplicates allowed with it (2,000 rolls, target appears)
- Showman: zero scoring effect (chips and mult unchanged)
- New joker effect verification (Wily, Even Steven, Blackboard, Flower Pot, The Duo, Arrowhead, Banner)

### Self-caught test bug:
Initial test expected 20-40% uncommon distribution, but with only 5 uncommons in a 28-joker pool, the maximum possible is ~18%. Fixed the test expectation to match the actual pool composition (observed: 12%).

## File Inventory

| File | Lines | Purpose |
|------|-------|---------|
| `game.js` | 810 | Core game logic (pure, DOM-free) + sidebar DOM render + Node exports |
| `renderer.js` | 424 | Phaser 3 scene: cards, arc, jokers, animations, input |
| `index.html` | 109 | Layout: sidebar + game container + overlays |
| `style.css` | 321 | Pixel-art styling, sidebar panels, splash blobs, shop UI |
| `lib/phaser.min.js` | — | Phaser 3.85.2 (vendored, 1.2 MB) |
| `fonts/PressStart2P-Regular.woff2` | — | Pixel display font (16 KB) |
| `test-hands.js` | 129 | Hand evaluation tests |
| `test-jokers.js` | 157 | Joker pool + individual joker behavior |
| `test-rarity.js` | 216 | **NEW** Rarity, weighted distribution, Showman, new joker effects |
| `test-run.js` | 181 | Full run flow tests |
| `test-scoring.js` | 163 | Scoring pipeline tests |
| `test-shop.js` | 189 | Shop offer/buy/sell/reroll/skip tests |
| `test-sort.js` | 103 | Hand sorting tests |

## Deviations from Plan / Decisions Made

1. **Rarity weight values**: Could not verify exact weights from an authoritative live source (all wiki attempts failed). Used community-cited values (100/55/25). The relative ordering and dominance behavior are correct regardless of exact values.

2. **"Per scored card" effects simplified**: Even Steven, Odd Todd, Arrowhead, Fibonacci check ALL played cards (not just scoring cards), consistent with how the existing suit jokers (Greedy, etc.) work in our engine. This is slightly more generous than real Balatro but matches our established simplification pattern.

3. **Banner joker**: Uses `discardsLeft` from the scoring context (new field added to `computePlayScore`). This is backward-compatible — existing jokers don't use it.

4. **No card images downloaded**: The spec allowed downloading joker images from tiereditems.com, but I used the existing SVG icon approach (expanded with new icons for the 16 new jokers). This keeps the project self-contained and avoids copyright concerns with game art.

5. **Play/Discard button handling**: The buttons in the sidebar are bound by `renderer.js` (which adds the fly-to-table animation before calling the game logic). `game.js`'s `init()` does NOT bind these buttons — if Phaser fails to load, the buttons won't work (acceptable failure mode for a rendering-layer dependency).

## Flag for Human Review

- **Rarity weights**: The 100/55/25 values are from community data-mining, not verified against a live wiki. If you have access to the game's decompiled data, double-check these. The game is playable and balanced with any reasonable weighting where common > uncommon > rare.
- **Phaser dependency**: The game now requires `lib/phaser.min.js` to render. If that file is missing, the sidebar will update but the card area will be blank. No fallback to the old DOM card rendering was implemented (the spec called for a full rendering-layer swap).
- **Phaser scene polling**: The renderer polls game state every frame via hash comparison. For a single-player local game this is fine, but it's not a formal event system. If performance ever becomes an issue (it won't at this scale), a dirty-flag or event emitter would be the fix.

## Post-Verification Pass (2026-09-05, after Playwright browser testing)

### Bugs found and fixed by PM (applied to disk before this agent pass):
1. **`parent: "game-container"` missing** from Phaser.Game config — canvas mounted on `<body>` instead of the layout container, rendering off-screen. Fixed.
2. **`G is not defined` in `renderJokers()`** — the method used `G.JOKER_ICON` but never declared `const G = window` locally (other methods did). Additionally, `JOKER_ICON` was never attached to `window` in game.js's browser-boot block (top-level `const` in a classic script does NOT auto-attach to window unlike function declarations). Fixed both: added local `G` declaration + added `window.JOKER_ICON = JOKER_ICON`.

### Self-audit (same bug class — identifiers expected from game.js but not actually exposed):
- Checked every cross-file reference in renderer.js:
  - `window.getState` ✓ (exposed)
  - `window.JOKER_ICON` ✓ (exposed, PM's fix)
  - `window.toggleSelect` ✓ (function declaration, auto-global)
  - `window.onPlayClick` ✓ (function declaration, auto-global)
  - `window.onDiscardClick` ✓ (function declaration, auto-global)
  - `window.JOKER_ICONS` ✗ → **Fixed**: added `window.JOKER_ICONS = JOKER_ICONS` to browser-boot block (needed for the icon texture loading below)

### Joker icon upgrade (circles → SVG textures):
- Added `preload()` phase to PlayScene that loads all 28 joker SVG icons as Phaser textures via data-URI (no network requests, no external files).
- Each SVG from `JOKER_ICONS` is wrapped with explicit `width`/`height`/`fill` attributes (colored from `JOKER_ICON` per-joker palette) and encoded as `data:image/svg+xml,...`.
- `renderJokers()` now uses `this.add.image()` with the loaded texture (displayed at 44×44px inside the 64px frame). Falls back to the old colored circle if the texture key doesn't exist.
- With `pixelArt: true`, the 48px rasterized SVGs display with nearest-neighbor scaling for a chunky pixel-art look.

### Test results (post-pass):
```
node test-hands.js    →  63 passed, 0 failed
node test-jokers.js   →  39 passed, 0 failed
node test-rarity.js   →  36 passed, 0 failed
node test-run.js      →  49 passed, 0 failed
node test-scoring.js  →  43 passed, 0 failed
node test-shop.js     →  46 passed, 0 failed
node test-sort.js     →  12 passed, 0 failed
─────────────────────────────────────────────
TOTAL:                288 passed, 0 failed
```
`node --check game.js` → clean
`node --check renderer.js` → clean

## Post-implementation QA (PM, real browser testing)

Node tests never touch Phaser/DOM/browser APIs at all, so three real bugs
made it through 288/288 green and had to be found by actually running the
game in a browser (Playwright + Chromium):

1. **Canvas rendered fully off-screen.** `Phaser.Game` config was missing
   `parent: 'game-container'` — Phaser defaulted to appending the canvas
   directly to `<body>`, bypassing the sidebar/game-container flex layout
   entirely (canvas ended up sized correctly but positioned at `y: 800`,
   right after the sidebar in document flow). Fixed by adding
   `parent: 'game-container'` to the config.

2. **`G is not defined` crash the moment any joker was owned.**
   `renderJokers()` referenced `G.JOKER_ICON` without declaring `const G =
   window` in that method's scope (unlike the other two methods using `G`).
   Compounding bug: `JOKER_ICON`/`JOKER_ICONS` were never actually attached
   to `window` in the first place — top-level `const` in a classic script
   does not auto-attach to `window` the way a `function` declaration does,
   which is why `toggleSelect`/`onPlayClick`/`onDiscardClick` worked fine as
   bare globals but the data objects did not. Fixed both.

3. **Joker icons silently fell back to plain colored circles** even after
   the texture-loading code was added — `this.textures.exists()` was always
   false. Root cause (isolated via direct Phaser loader event listeners):
   Phaser's loader fires `loaderror` for every single SVG data URI built by
   `makeIconDataURI()`, for two compounding reasons verified independently:
   - Percent-encoded `data:image/svg+xml,...` URIs rasterize to a 0x0 image
     in this Chromium build for `<img>`-style loads (`naturalWidth`/`Height`
     stay 0, no error event) — base64 (`;base64,`) is the reliable form.
   - Even with base64, Phaser's loader rejects the SVG without an explicit
     `xmlns="http://www.w3.org/2000/svg"` on the root element — confirmed by
     loading byte-identical content with and without it (`loaderror` vs.
     `filecomplete`). `JOKER_ICONS` entries have neither by default.

   Fixed by injecting both into `makeIconDataURI()`. Verified visually in a
   real browser afterward: icons now render as their actual distinct shapes
   (e.g. Half Joker's crescent moon, Gros Michel's banana), not circles.

All three fixes are presentation-layer only; the 288 passing tests were
unaffected by any of them (confirmed by rerunning the full suite after each
fix). Full end-to-end browser verification after all three fixes: card
selection, live chips x mult preview, play animation, hand refill, blind
progression, shop (offers/buy/rarity frames/icons), and money/counters all
confirmed working with zero console errors.

---

# Phase 3 — Card rendering, animation polish, sort persistence (2026-09-05)

## Pass 1: Card rendering fixes + sort bug

### Item 1 — Proper card pip layout (2–10)
Added `PIP_LAYOUTS` lookup table with standard Bicycle-style pip positions (fractional x/y within the pip area). Number cards 2–10 now render the correct number of suit-colored pip glyphs at proper positions. Top-half pips are flipped (scaleY(-1)) for the standard inverted convention. Ace/J/Q/K keep a single large center pip.

### Item 2 — Corner index: rank + suit stacked
Each card corner (top-left, bottom-right) now shows the rank (20px bold) with the suit symbol (14px) directly below, matching real card corner indexes.

### Item 3 — Anti-aliasing / readability
- Added explicit `antialias: false` and `roundPixels: true` to Phaser config (in addition to `pixelArt: true`)
- All pip positions rounded to integer pixels via `Math.round()`
- Font switched from Press Start 2P (which wasn't loading in the canvas context) to system `monospace` bold — reliable and crisp at the sizes used

### Item 7 — Deck pile display (bottom-right)
3 stacked offset card-back rectangles (dark blue) + "X/52" counter text. Updates as cards are drawn. `state.deck` was already exposed; added `s.deck.length` to the state hash for re-render triggers.

### Item 8 — Chips/mult display shape
`.splash-blob` border-radius changed from egg/ellipse to `12px` (rounded rectangle).

### Item 9 — Joker cards as playing cards
Jokers now render as white cards (same 80×112 dimensions as hand cards) with a dark border. Rarity indicated by a colored strip along the top edge (blue/purple/gold). Icon renders inside the white card face. Name label at the bottom.

### Item 10 — Sort persistence (logic bug)
- Added `state.sortMode` (null | 'rank' | 'suit') to `createRunState()`
- `sortHand(mode)` now sets `state.sortMode = mode`
- Both `onPlayClick()` and `onDiscardClick()` call `sortHand(state.sortMode)` after `drawUp()` if sortMode is set
- 10 new tests in test-sort.js: sortMode tracking, rank sort surviving play, suit sort surviving discard, no auto-sort without prior sort

## Pass 2: Animation system

### Item 4 — Global animation speed multiplier
- `let ANIM_SPEED = 1` at module level, exposed as `window.setAnimSpeed(n)`
- Helper functions: `dur(baseMs)` and `delay(baseMs)` scale by `1/ANIM_SPEED`
- All tween durations and delays in play/discard/scoring animations use these helpers

### Item 5 — Discard: slide right off-screen
Changed from fade+drop to: each card slides horizontally to the right edge of the screen with `Quad.easeIn`, staggered start (80ms between cards). No alpha change — just positional.

### Item 6 — Scoring animation
After cards land in the play area, a scoring sequence plays:
1. Each scoring card (from `computePlayScore().scoring`) pops up 16px and back
2. A floating "+X" chip value text appears above each card and fades upward
3. Cards animate in sequence (200ms apart at 1x speed)
4. After all scoring cards resolve, a 300ms pause, then `onPlayClick()` commits the state

The scoring animation calls `computePlayScore` locally (before the state mutation) to determine which cards score and their individual chip values, using the newly exposed `window.CHIP_VALUE` lookup.

## Test results (post Phase 3)

```
node test-hands.js    →  63 passed, 0 failed
node test-jokers.js   →  39 passed, 0 failed
node test-rarity.js   →  36 passed, 0 failed
node test-run.js      →  49 passed, 0 failed
node test-scoring.js  →  43 passed, 0 failed
node test-shop.js     →  46 passed, 0 failed
node test-sort.js     →  22 passed, 0 failed  (10 new)
─────────────────────────────────────────────
TOTAL:                298 passed, 0 failed
```

`node --check game.js` → clean
`node --check renderer.js` → clean

## New window exposures (Phase 3)
- `window.CHIP_VALUE` — per-rank chip values, needed by the scoring animation

## Post-Verification Fix (Phase 3, after Playwright browser testing)

### Bug: `animateScoring()` accessed wrong property on score result
`animateScoring()` read `result.scoring` to get the scoring-cards array, but `computePlayScore()` returns `{ chips, mult, total, eval }` — the scoring cards are at `result.eval.scoring`. This threw `TypeError: Cannot read properties of undefined (reading 'length')` on every Play Hand click, silently breaking the entire play flow (discard also appeared broken as downstream fallout from the crash leaving `isAnimating` stuck true).

Fixed: one-line change to `result.eval.scoring`.

**Why Node tests didn't catch it:** The scoring animation is pure presentation-layer code in renderer.js (a Phaser scene method). Node tests exercise the game logic (game.js) which is correct — `computePlayScore` returns the right shape. The bug was in how renderer.js *consumed* that return value, which only executes in a browser with Phaser running. This is the same class of bug as the Phase 2 post-verification findings (Phaser config `parent`, `G` not defined, `JOKER_ICON` not on window) — headless tests cannot exercise the Phaser rendering layer.

### Bug: Card shadow rendered on top of selection highlight
Container child order was `[highlight, shadow, body, ...]` — since `container.addAt(highlight, 0)` placed the highlight first, the shadow (added later via `container.add([shadow, body, ...])`) rendered on top of it. The opaque offset shadow rectangle covered part of the highlight ring, making it look cut into.

Fixed: reordered to `[shadow, highlight, body, ...]` so the highlight renders above the shadow.

### Bug: Pip orientation inverted on all number cards
`PIP_LAYOUTS` had `flip: true` on top-half pips and `flip: false` on bottom-half pips — the reverse of the correct convention. On real cards, the suit glyph's natural orientation points "up" (away from center for top pips). Bottom pips need the 180° flip because their natural orientation would point toward center from below.

Fixed: swapped `flip` values for all non-center entries across PIP_LAYOUTS (ranks 2–10). Center pips (y=0.5 on odd ranks) left unflipped since a card's exact center can't satisfy both orientations simultaneously.

### Bug: Played cards vanished instantly after scoring animation
After the scoring pop sequence completed, played cards in the play area were destroyed immediately (on next state re-render) with no exit animation — jarring compared to the discard slide.

Fixed: added `slidePlayedCardsOut()` method (same tween pattern as discard: slide to `x = canvasWidth + CARD_W`, 300ms, 80ms stagger, `Quad.easeIn`), called from both completion branches of `animateScoring()` before `onPlayClick()`. Cards now slide off to the right after scoring resolves, then state updates and play area clears.
