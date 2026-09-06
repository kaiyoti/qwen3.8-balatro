/* =====================================================================
   Balatro Clone — renderer.js
   Phaser 3 rendering layer for the main play area.
   Reads game state from game.js, renders cards/jokers, handles input.
   Does NOT duplicate game logic — calls back into game.js functions.
   ===================================================================== */

'use strict';

// Global animation speed multiplier (higher = faster)
let ANIM_SPEED = 1;
function setAnimSpeed(n) { ANIM_SPEED = Math.max(0.1, n); }
// Helper: scale a base duration by speed
function dur(baseMs) { return Math.round(baseMs / ANIM_SPEED); }
// Helper: scale a base delay by speed
function delay(baseMs) { return Math.round(baseMs / ANIM_SPEED); }

// Card dimensions (pixel art style)
const CARD_W = 120;
const CARD_H = 168;
const JOKER_SIZE = 64;
const JOKER_GAP = 8;

// Background color and derived shadow (darker version of BG)
const BG_COLOR = 0x1a1a3e;
const SHADOW_COLOR = ((BG_COLOR >> 16 & 0xff) * 0.4 << 16) |
                     ((BG_COLOR >> 8  & 0xff) * 0.4 << 8)  |
                      (BG_COLOR        & 0xff) * 0.4;
const SHADOW_OFFSET = 8;

// Suit colors
const SUIT_COLORS = {
  spade: 0x222222,
  heart: 0xd92b2b,
  diamond: 0xd92b2b,
  club: 0x222222,
};
const SUIT_SYM = { spade: '\u2660', heart: '\u2665', diamond: '\u2666', club: '\u2663' };

// Rarity colors for joker frame
const RARITY_COLORS = {
  common: 0x4a90d9,
  uncommon: 0x9b6ad6,
  rare: 0xe8a020,
  legendary: 0xd9534f,
};

// Pip positions as fractions of the pip area (0-1 range).
// Pip area is inset from card edges to avoid corner indexes.
// Standard Bicycle-style layouts for number cards 2-10.
// Each entry: { x, y, flip } — flip=true means the pip is rendered upside-down.
// flip:true means "rotate 180deg". Pips must point AWAY from card center:
// bottom-half pips need the flip (their natural glyph orientation points up,
// i.e. toward center, from below), top-half pips are already natural since
// "up" is also "away from center" for them. Center pips (y=0.5, odd ranks)
// stay unflipped - a card's exact center can't satisfy both orientations
// under 180deg rotation, real cards accept this same minor imperfection.
const PIP_LAYOUTS = {
  '2':  [{x:0.5,y:0.25,flip:false},{x:0.5,y:0.75,flip:true}],
  '3':  [{x:0.5,y:0.25,flip:false},{x:0.5,y:0.5,flip:false},{x:0.5,y:0.75,flip:true}],
  '4':  [{x:0.25,y:0.25,flip:false},{x:0.75,y:0.25,flip:false},{x:0.25,y:0.75,flip:true},{x:0.75,y:0.75,flip:true}],
  '5':  [{x:0.25,y:0.25,flip:false},{x:0.75,y:0.25,flip:false},{x:0.5,y:0.5,flip:false},{x:0.25,y:0.75,flip:true},{x:0.75,y:0.75,flip:true}],
  '6':  [{x:0.25,y:0.25,flip:false},{x:0.75,y:0.25,flip:false},{x:0.25,y:0.5,flip:false},{x:0.75,y:0.5,flip:false},{x:0.25,y:0.75,flip:true},{x:0.75,y:0.75,flip:true}],
  '7':  [{x:0.25,y:0.25,flip:false},{x:0.75,y:0.25,flip:false},{x:0.5,y:0.375,flip:false},{x:0.25,y:0.5,flip:false},{x:0.75,y:0.5,flip:false},{x:0.25,y:0.75,flip:true},{x:0.75,y:0.75,flip:true}],
  '8':  [{x:0.25,y:0.25,flip:false},{x:0.75,y:0.25,flip:false},{x:0.5,y:0.375,flip:false},{x:0.25,y:0.5,flip:false},{x:0.75,y:0.5,flip:false},{x:0.5,y:0.625,flip:true},{x:0.25,y:0.75,flip:true},{x:0.75,y:0.75,flip:true}],
  '9':  [{x:0.25,y:0.15,flip:false},{x:0.75,y:0.15,flip:false},{x:0.25,y:0.38,flip:false},{x:0.75,y:0.38,flip:false},{x:0.5,y:0.5,flip:false},{x:0.25,y:0.62,flip:true},{x:0.75,y:0.62,flip:true},{x:0.25,y:0.85,flip:true},{x:0.75,y:0.85,flip:true}],
  '10': [{x:0.25,y:0.15,flip:false},{x:0.75,y:0.15,flip:false},{x:0.5,y:0.25,flip:false},{x:0.25,y:0.42,flip:false},{x:0.75,y:0.42,flip:false},{x:0.25,y:0.62,flip:true},{x:0.75,y:0.62,flip:true},{x:0.5,y:0.75,flip:true},{x:0.25,y:0.85,flip:true},{x:0.75,y:0.85,flip:true}],
};

// Pip area margins (fraction of card size) to keep pips away from corners
const PIP_MARGIN_X = 0.22;
const PIP_MARGIN_Y = 0.18;

class PlayScene extends Phaser.Scene {
  constructor() {
    super({ key: 'PlayScene' });
    this.cardSprites = [];
    this.jokerSprites = [];
    this.playAreaCards = [];
    this.isAnimating = false;
    this.lastStateHash = '';
  }

  // Build a data-URI from SVG icon data with a fill color.
  // Two things Phaser's loader needs that a plain <img> tag is more lenient
  // about: (1) base64, not percent-encoded - percent-encoded
  // `data:image/svg+xml,...` silently rasterizes to a 0x0 image in Chromium
  // for an <img>-style load (naturalWidth/Height stay 0, no error event);
  // (2) an explicit xmlns - without it Phaser's loader fires `loaderror` for
  // every single icon (verified: identical SVG content loads fine with
  // xmlns, fails without it). JOKER_ICONS entries have neither by default.
  makeIconDataURI(svgContent, fillColor, size) {
    // Inject xmlns + width/height + default fill into the SVG root
    const svg = svgContent
      .replace('<svg ', `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" fill="${fillColor}" `);
    return 'data:image/svg+xml;base64,' + btoa(svg);
  }

  preload() {
    // Load all joker SVG icons as textures (data-URI, no network requests)
    const icons = window.JOKER_ICONS;
    const colors = window.JOKER_ICON;
    if (!icons || !colors) return;

    const SIZE = 48; // render at 48x48 for crisp pixel-art look in 64px frame
    for (const id of Object.keys(icons)) {
      const uri = this.makeIconDataURI(icons[id], colors[id] || '#888888', SIZE);
      this.load.image(`joker-${id}`, uri);
    }
  }

  create() {
    // Background: dark blue gradient
    const w = this.scale.width;
    const h = this.scale.height;
    const bg = this.add.rectangle(w / 2, h / 2, w, h, BG_COLOR);
    bg.setDepth(-10);

    // Subtle grid pattern for texture
    for (let x = 0; x < w; x += 32) {
      for (let y = 0; y < h; y += 32) {
        this.add.rectangle(x, y, 1, 1, 0x2a2a5e).setDepth(-9);
      }
    }

    // Play area zone (subtle border)
    this.playAreaY = h * 0.45;
    this.playArea = this.add.rectangle(w / 2, this.playAreaY, w * 0.7, 140, 0x0a0a20, 0.3);
    this.playArea.setStrokeStyle(2, 0x3a3a6e);
    this.playArea.setDepth(-5);

    // Joker row zone (top)
    this.jokerY = 60;

    // Hand zone (bottom)
    this.handY = h - 110;

    // Initial render
    this.renderState();
  }

  update() {
    // Poll for state changes (simple approach: hash check)
    const G = window; // game.js is a classic script, its functions are global
    const state = G.getState && G.getState();
    if (!state) return;

    const hash = this.stateHash(state);
    if (hash !== this.lastStateHash) {
      this.lastStateHash = hash;
      if (!this.isAnimating) {
        this.renderState();
      }
    }
  }

  stateHash(s) {
    return s.hand.map(c => c.rank + c.suit).join(',') + '|' +
      s.selected.join(',') + '|' +
      s.jokers.map(j => j.id).join(',') + '|' +
      s.screen + '|' + s.playsLeft + '|' + s.discardsLeft + '|' +
      s.deck.length;
  }

  renderState() {
    const G = window;
    const state = G.getState();
    if (!state) return;

    if (state.screen !== 'play') {
      this.clearCards();
      return;
    }

    this.renderJokers(state);
    this.renderHand(state);
    this.renderDeckPile(state);
  }

  renderDeckPile(state) {
    // Clear existing
    if (this.deckPileSprites) {
      this.deckPileSprites.forEach(s => s.destroy());
      this.deckPileSprites = [];
    }
    this.deckPileSprites = [];

    const w = this.scale.width;
    const h = this.scale.height;
    const px = w - 50;
    const py = h - 60;

    // Stacked card-back rectangles (3 offset for depth)
    for (let i = 2; i >= 0; i--) {
      const rect = this.add.rectangle(px + i * 2, py + i * 2, 32, 44, 0x1a2a4e)
        .setStrokeStyle(2, 0x3a5a8e).setDepth(3);
      this.deckPileSprites.push(rect);
    }

    // Count text
    const countTxt = this.add.text(px, py + 28, `${state.deck.length}/52`, {
      fontFamily: 'monospace', fontSize: '10px', fontStyle: 'bold', color: '#aabbcc',
    }).setOrigin(0.5).setDepth(4);
    this.deckPileSprites.push(countTxt);
  }

  renderJokers(state) {
    const G = window; // game.js is a classic script, its functions/data are global
    // Clear existing
    this.jokerSprites.forEach(s => s.destroy());
    this.jokerSprites = [];

    const w = this.scale.width;
    const count = Math.min(state.jokers.length, 5);
    if (count === 0) return;

    // Jokers are rendered as mini playing cards (same aspect as hand cards)
    const jw = CARD_W, jh = CARD_H, gap = 6;
    const totalW = count * (jw + gap) - gap;
    const startX = w / 2 - totalW / 2;

    state.jokers.forEach((j, i) => {
      const x = Math.round(startX + i * (jw + gap) + jw / 2);
      const y = this.jokerY + jh / 2;

      // Card body (white, like playing cards)
      const body = this.add.graphics().setDepth(5);
      body.fillStyle(0xf5f0e8, 1);
      body.fillRoundedRect(x - jw / 2, y - jh / 2, jw, jh, 5);
      body.lineStyle(3, 0x222222, 1);
      body.strokeRoundedRect(x - jw / 2, y - jh / 2, jw, jh, 5);

      // Rarity strip (colored bar at top of card)
      const rarityColor = RARITY_COLORS[j.rarity] || 0x555555;
      const strip = this.add.rectangle(x, y - jh / 2 + 4, jw - 8, 6, rarityColor)
        .setDepth(6);

      // Icon: loaded SVG texture (centered in card)
      const texKey = `joker-${j.id}`;
      if (this.textures.exists(texKey)) {
        const icon = this.add.image(x, y + 4, texKey).setDisplaySize(40, 40).setDepth(7);
        this.jokerSprites.push(body, strip, icon);
      } else {
        const iconColor = this.hexToNum(G.JOKER_ICON[j.id] || '#888888');
        const icon = this.add.circle(x, y + 4, 20, iconColor).setDepth(7);
        this.jokerSprites.push(body, strip, icon);
      }

      // Name label at bottom of card
      const txt = this.add.text(x, y + jh / 2 - 10, j.name, {
        fontFamily: 'monospace', fontSize: '9px', fontStyle: 'bold',
        color: '#333333',
      }).setOrigin(0.5, 1).setDepth(8);

      this.jokerSprites.push(txt);
    });

    // Count indicator
    const countTxt = this.add.text(w - 30, this.jokerY,
      `${count}/5`, {
        fontFamily: 'Press Start 2P, monospace',
        fontSize: '10px',
        color: '#8899aa',
      }).setOrigin(1, 0.5).setDepth(5);
    this.jokerSprites.push(countTxt);
  }

  renderHand(state) {
    this.clearCards();

    const hand = state.hand;
    const n = hand.length;
    if (n === 0) return;

    const w = this.scale.width;
    const cx = w / 2;

    // Arc parameters
    const arcWidth = Math.min(n * (CARD_W * 0.7), w * 0.85);
    const arcHeight = 30; // how much the arc curves
    const totalAngle = Math.min(n * 0.08, 0.5); // total fan angle in radians

    // Track which cards were selected on the previous render so we only
    // animate newly-selected cards (not re-animate already-selected ones)
    const prevSelected = this._prevSelected || [];
    this._prevSelected = state.selected ? [...state.selected] : [];

    hand.forEach((card, i) => {
      const isSelected = state.selected.includes(i);
      const t = n > 1 ? i / (n - 1) : 0.5; // 0 to 1
      const offset = t - 0.5; // -0.5 to 0.5

      // Position along arc
      const x = cx + offset * arcWidth;
      const arcOffset = (offset * offset) * 4 * arcHeight; // parabolic curve
      let y = this.handY + arcOffset;

      // Rotation: outer cards rotate more
      const angle = offset * totalAngle;

      const slideY = isSelected ? y - 40 : y;
      const isNewlySelected = isSelected && !prevSelected.includes(i);

      const sprite = this.createCardSprite(card, x, y, angle, isSelected);
      sprite.setDepth(isSelected ? 15 : 10);
      sprite.setInteractive({ useHandCursor: true });
      sprite.on('pointerdown', () => {
        if (!this.isAnimating) {
          window.toggleSelect(i);
          this.lastStateHash = ''; // force re-render
        }
      });
      this.cardSprites.push(sprite);

      if (isSelected) {
        if (isNewlySelected) {
          this.tweens.add({
            targets: sprite,
            y: slideY,
            duration: dur(150),
            ease: 'Quad.easeOut',
          });
        } else {
          sprite.setY(slideY);
        }
      } else if (prevSelected.includes(i)) {
        // Was selected, now deselected — animate back down (faster)
        sprite.setY(y - 40);
        this.tweens.add({
          targets: sprite,
          y: y,
          duration: dur(90),
          ease: 'Quad.easeIn',
        });
      }
    });
  }

  createCardSprite(card, x, y, angle, isSelected) {
    const container = this.add.container(x, y);
    container.setRotation(angle);

    // Card shadow (hard offset) - must stay the bottommost layer so the
    // selection highlight (added next) renders on top of it, not the other
    // way around. Previously the highlight was inserted first and the
    // shadow was appended after, so the opaque shadow covered part of the
    // highlight ring on its offset side, making the shadow look like it was
    // cutting *into* the highlight instead of sitting outside/behind it.
    const R = 5;
    const shadow = this.add.graphics();
    shadow.fillStyle(Math.round(SHADOW_COLOR), 1);
    shadow.fillRoundedRect(SHADOW_OFFSET - CARD_W / 2, SHADOW_OFFSET - CARD_H / 2, CARD_W, CARD_H, R);
    shadow.setDepth(0);

    const highlightObjs = [];
    if (isSelected) {
      const highlight = this.add.graphics();
      highlight.fillStyle(0xffffff, 0.3);
      highlight.fillRoundedRect(-CARD_W / 2 - 3, -CARD_H / 2 - 3, CARD_W + 6, CARD_H + 6, R + 2);
      highlight.lineStyle(3, 0x4a90d9, 1);
      highlight.strokeRoundedRect(-CARD_W / 2 - 3, -CARD_H / 2 - 3, CARD_W + 6, CARD_H + 6, R + 2);
      highlightObjs.push(highlight);
    }

    // Card body
    const body = this.add.graphics();
    body.fillStyle(0xf5f0e8, 1);
    body.fillRoundedRect(-CARD_W / 2, -CARD_H / 2, CARD_W, CARD_H, R);
    body.lineStyle(3, 0x222222, 1);
    body.strokeRoundedRect(-CARD_W / 2, -CARD_H / 2, CARD_W, CARD_H, R);
    body.setDepth(1);

    const suitColor = SUIT_COLORS[card.suit];
    const colorStr = '#' + suitColor.toString(16).padStart(6, '0');
    const sym = SUIT_SYM[card.suit];

    // Corner index (top-left): rank + suit stacked
    const cornerTL_rank = this.add.text(-CARD_W / 2 + 8, -CARD_H / 2 + 5, card.rank, {
      fontFamily: 'monospace', fontSize: '30px', fontStyle: 'bold', color: colorStr, resolution: 2,
    }).setOrigin(0, 0);
    const cornerTL_suit = this.add.text(-CARD_W / 2 + 9, -CARD_H / 2 + 35, sym, {
      fontFamily: 'monospace', fontSize: '25px', color: colorStr, resolution: 2,
    }).setOrigin(0, 0);

    // Corner index (bottom-right): rank + suit stacked (flipped)
    const cornerBR_rank = this.add.text(CARD_W / 2 - 8, CARD_H / 2 - 5, card.rank, {
      fontFamily: 'monospace', fontSize: '30px', fontStyle: 'bold', color: colorStr, resolution: 2,
    }).setOrigin(1, 1);
    const cornerBR_suit = this.add.text(CARD_W / 2 - 9, CARD_H / 2 - 35, sym, {
      fontFamily: 'monospace', fontSize: '25px', color: colorStr, resolution: 2,
    }).setOrigin(1, 1);

    // Pips: number cards 2-10 use layout, Ace/J/Q/K use single center
    const pips = [];
    if (PIP_LAYOUTS[card.rank]) {
      // Pip area bounds (inset from card center)
      const pipW = CARD_W * (1 - 2 * PIP_MARGIN_X);
      const pipH = CARD_H * (1 - 2 * PIP_MARGIN_Y);
      PIP_LAYOUTS[card.rank].forEach(p => {
        const px = Math.round(-pipW / 2 + p.x * pipW);
        const py = Math.round(-pipH / 2 + p.y * pipH);
        const pip = this.add.text(px, py, sym, {
          fontSize: '36px', color: colorStr, resolution: 2,
        }).setOrigin(0.5);
        if (p.flip) pip.setScale(1, -1);
        pips.push(pip);
      });
    } else {
      // Single large center pip for A/J/Q/K
      const centerPip = this.add.text(0, 0, sym, {
        fontSize: '72px', color: colorStr, resolution: 2,
      }).setOrigin(0.5);
      pips.push(centerPip);
    }

    container.add([shadow, ...highlightObjs, body, ...pips, cornerTL_rank, cornerTL_suit, cornerBR_rank, cornerBR_suit]);
    container.setSize(CARD_W, CARD_H);

    return container;
  }

  clearCards() {
    this.cardSprites.forEach(s => s.destroy());
    this.cardSprites = [];
    this.playAreaCards.forEach(s => s.destroy());
    this.playAreaCards = [];
  }

  // Animate selected cards flying to the play area, then run scoring sequence
  animatePlay(state) {
    if (this.isAnimating) return;
    this.isAnimating = true;

    const selected = state.selected;
    if (selected.length === 0) { this.isAnimating = false; return; }

    const w = this.scale.width;
    const targets = [];

    selected.forEach((handIdx, i) => {
      const sprite = this.cardSprites[handIdx];
      if (!sprite) return;

      const n = selected.length;
      const t = n > 1 ? i / (n - 1) : 0.5;
      const offset = t - 0.5;
      const targetX = w / 2 + offset * (n * 60);
      const targetY = this.playAreaY;

      targets.push({ sprite, targetX, targetY });
    });

    let completed = 0;
    const total = targets.length;

    targets.forEach(({ sprite, targetX, targetY }, i) => {
      this.tweens.add({
        targets: sprite,
        x: targetX,
        y: targetY,
        angle: 0,
        rotation: 0,
        duration: dur(350),
        delay: delay(i * 60),
        ease: 'Back.easeOut',
        onComplete: () => {
          sprite.setDepth(8);
          completed++;
          if (completed >= total) {
            // Move to play area group
            targets.forEach(t => this.playAreaCards.push(t.sprite));
            this.cardSprites = this.cardSprites.filter(s => !this.playAreaCards.includes(s));

            // Start scoring animation, then call onPlayClick after
            this.animateScoring(state, targets);
          }
        }
      });
    });
  }

  // Scoring animation: each scoring card pops in sequence, chip values float up.
  // Splash blobs start at base and count up as each card contributes.
  animateScoring(state, landedTargets) {
    const G = window;
    const cards = state.selected.map(i => state.hand[i]).filter(Boolean);
    const result = G.computePlayScore(cards, state.jokers, state.discardsLeft);
    const scoringCards = result.eval.scoring;
    const chipValues = G.CHIP_VALUE;

    // Splash display: start at base, increment as cards resolve
    const baseChips = result.eval.base.chips;
    const baseMult = result.eval.base.mult;
    let dispChips = baseChips;
    let dispMult = baseMult;
    G.setSplashDisplay(dispChips, dispMult);

    if (scoringCards.length === 0) {
      // No scoring cards — jump to final immediately, then slide out
      G.setSplashDisplay(result.chips, result.mult);
      setTimeout(() => this.slidePlayedCardsOut(landedTargets, () => {
        G.onPlayClick();
        this.lastStateHash = '';
        this.isAnimating = false;
      }), dur(200));
      return;
    }

    // Map scoring cards to their landed sprites (by card identity)
    const spriteByCard = new Map();
    landedTargets.forEach((t, i) => {
      const origIdx = state.selected[i];
      if (origIdx !== undefined) spriteByCard.set(state.hand[origIdx], t.sprite);
    });

    let idx = 0;
    const runNext = () => {
      if (idx >= scoringCards.length) {
        // All cards scored — show final total (includes joker effects),
        // brief pause, then slide out and commit
        G.setSplashDisplay(result.chips, result.mult);
        setTimeout(() => this.slidePlayedCardsOut(landedTargets, () => {
          G.onPlayClick();
          this.lastStateHash = '';
          this.isAnimating = false;
        }), dur(300));
        return;
      }

      const card = scoringCards[idx];
      const sprite = spriteByCard.get(card);
      const chips = chipValues[card.rank] || 0;

      // Increment splash chips as this card resolves
      dispChips += chips;
      G.setSplashDisplay(dispChips, dispMult);

      if (sprite) {
        // Pop up
        const origY = sprite.y;
        this.tweens.add({
          targets: sprite,
          y: origY - 16,
          duration: dur(120),
          ease: 'Quad.easeOut',
          onComplete: () => {
            this.tweens.add({
              targets: sprite,
              y: origY,
              duration: dur(120),
              ease: 'Quad.easeIn',
            });
          }
        });

        // Floating chip text
        const chipTxt = this.add.text(sprite.x, sprite.y - 40, `+${chips}`, {
          fontFamily: 'monospace', fontSize: '18px', fontStyle: 'bold', color: '#4a90d9',
        }).setOrigin(0.5).setDepth(20);
        this.tweens.add({
          targets: chipTxt,
          y: chipTxt.y - 30,
          alpha: 0,
          duration: dur(500),
          delay: dur(100),
          ease: 'Quad.easeOut',
          onComplete: () => chipTxt.destroy(),
        });
      }

      idx++;
      setTimeout(runNext, dur(200));
    };

    // Start after a brief pause
    setTimeout(runNext, dur(200));
  }

  // Slide played/scored cards off to the right, same treatment as discard.
  // landedTargets are the {sprite, ...} entries from the fly-to-table step.
  slidePlayedCardsOut(landedTargets, onDone) {
    const total = landedTargets.length;
    if (total === 0) { onDone(); return; }

    const w = this.scale.width;
    const offScreenX = w + CARD_W;
    let completed = 0;

    landedTargets.forEach(({ sprite }, i) => {
      if (!sprite) { completed++; if (completed >= total) onDone(); return; }
      this.tweens.add({
        targets: sprite,
        x: offScreenX,
        duration: dur(300),
        delay: delay(i * 80),
        ease: 'Quad.easeIn',
        onComplete: () => {
          this.playAreaCards = this.playAreaCards.filter(s => s !== sprite);
          sprite.destroy();
          completed++;
          if (completed >= total) onDone();
        }
      });
    });
  }

  // Discard animation: slide right off-screen, sequential
  animateDiscard(state) {
    if (this.isAnimating) return;
    this.isAnimating = true;

    const selected = state.selected;
    let completed = 0;
    const total = selected.length;
    if (total === 0) { this.isAnimating = false; return; }

    const w = this.scale.width;
    const offScreenX = w + CARD_W;

    selected.forEach((handIdx, i) => {
      const sprite = this.cardSprites[handIdx];
      if (!sprite) return;
      this.tweens.add({
        targets: sprite,
        x: offScreenX,
        duration: dur(300),
        delay: delay(i * 80),
        ease: 'Quad.easeIn',
        onComplete: () => {
          completed++;
          if (completed >= total) {
            setTimeout(() => {
              window.onDiscardClick();
              this.lastStateHash = '';
              this.isAnimating = false;
            }, dur(100));
          }
        }
      });
    });
  }

  // Clear play area (called when new hand is dealt)
  clearPlayArea() {
    this.playAreaCards.forEach(s => s.destroy());
    this.playAreaCards = [];
  }

  hexToNum(hex) {
    if (typeof hex === 'number') return hex;
    if (hex.startsWith('#')) return parseInt(hex.slice(1), 16);
    return 0x888888;
  }
}

// Boot the Phaser game
function initRenderer() {
  const container = document.getElementById('game-container');
  const w = container.clientWidth;
  const h = container.clientHeight;

  const config = {
    type: Phaser.AUTO,
    parent: 'game-container',
    width: w,
    height: h,
    pixelArt: true,
    antialias: false,
    roundPixels: true,
    backgroundColor: '#' + BG_COLOR.toString(16).padStart(6, '0'),
    scene: PlayScene,
    scale: {
      mode: Phaser.Scale.RESIZE,
      autoCenter: Phaser.Scale.CENTER_BOTH,
    },
  };

  const game = new Phaser.Game(config);
  window.__phaserGame = game;
  window.setAnimSpeed = setAnimSpeed;

  // Override the Play/Discard button handlers to use animations
  const btnPlay = document.getElementById('btn-play');
  const btnDiscard = document.getElementById('btn-discard');

  btnPlay.addEventListener('click', (e) => {
    e.preventDefault();
    const scene = game.scene.getScene('PlayScene');
    const state = window.getState();
    if (state && state.selected.length > 0 && state.playsLeft > 0) {
      scene.animatePlay(state);
    }
  });

  btnDiscard.addEventListener('click', (e) => {
    e.preventDefault();
    const scene = game.scene.getScene('PlayScene');
    const state = window.getState();
    if (state && state.selected.length > 0 && state.discardsLeft > 0) {
      scene.animateDiscard(state);
    }
  });

  // Clear play area cards when hand changes significantly (new blind)
  let lastScreen = '';
  let lastHandLen = -1;
  setInterval(() => {
    const state = window.getState();
    if (!state) return;
    if (state.screen === 'play' && lastScreen === 'shop') {
      const scene = game.scene.getScene('PlayScene');
      scene.clearPlayArea();
    }
    lastScreen = state.screen;
  }, 500);
}

// Auto-init when DOM is ready
if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initRenderer);
  } else {
    initRenderer();
  }
}
