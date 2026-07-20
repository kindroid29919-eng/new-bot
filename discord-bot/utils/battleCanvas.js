/**
 * battleCanvas.js
 * Draws a battle frame image for waifu duels using @napi-rs/canvas.
 * Returns a Buffer (PNG) ready to send as a Discord attachment.
 */

const { createCanvas, loadImage, GlobalFonts } = require('@napi-rs/canvas');

const TIER_COLOR = {
  Legendary: '#ffd700',
  Epic:      '#a855f7',
  Rare:      '#ff4757',
  Uncommon:  '#2ed573',
  Common:    '#95a5a6',
};

const TIER_EMOJI = {
  Legendary: '🌟',
  Epic:      '💎',
  Rare:      '🔥',
  Uncommon:  '✨',
  Common:    '⚪',
};

// Safely attempt to load an image URL; returns null on failure.
async function tryLoadImage(url) {
  if (!url) return null;
  try {
    return await loadImage(url);
  } catch {
    return null;
  }
}

// Draw a rounded rectangle path (no built-in roundRect in older canvas)
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

// Draw HP bar with colour that shifts green → yellow → red
function drawHpBar(ctx, x, y, w, h, current, max) {
  const pct = Math.max(0, current / max);

  // Background track
  roundRect(ctx, x, y, w, h, h / 2);
  ctx.fillStyle = '#1a1a2e';
  ctx.fill();

  if (pct > 0) {
    const barW = Math.round(w * pct);
    const color = pct > 0.6 ? '#2ed573' : pct > 0.3 ? '#ffa502' : '#ff4757';
    roundRect(ctx, x, y, barW, h, h / 2);
    ctx.fillStyle = color;
    ctx.fill();
  }

  // Border
  roundRect(ctx, x, y, w, h, h / 2);
  ctx.strokeStyle = 'rgba(255,255,255,0.15)';
  ctx.lineWidth = 1;
  ctx.stroke();
}

// Draw energy dots (filled = charged, empty = not)
function drawEnergy(ctx, x, y, energy, max) {
  const DOT_R = 6;
  const GAP = 18;
  for (let i = 0; i < max; i++) {
    ctx.beginPath();
    ctx.arc(x + i * GAP, y, DOT_R, 0, Math.PI * 2);
    ctx.fillStyle = i < energy ? '#f9ca24' : '#2d3436';
    ctx.fill();
    ctx.strokeStyle = '#f9ca24';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }
}

/**
 * Draw a single fighter panel.
 * @param {CanvasRenderingContext2D} ctx
 * @param {object} fighter  - { name, tier, currentHp, maxHp, energy, image? (loaded img) }
 * @param {number} panelX   - left edge of the panel
 * @param {boolean} flipX   - mirror layout for right-side fighter
 * @param {number} panelW
 * @param {number} canvasH
 */
async function drawFighterPanel(ctx, fighter, panelX, flipX, panelW, canvasH) {
  const tierColor  = TIER_COLOR[fighter.tier] || '#95a5a6';
  const PORTRAIT_W = 160;
  const PORTRAIT_H = 200;
  const portraitX  = flipX ? panelX + panelW - PORTRAIT_W - 20 : panelX + 20;
  const portraitY  = 60;

  // Panel bg
  ctx.save();
  roundRect(ctx, panelX + 8, 8, panelW - 16, canvasH - 16, 16);
  ctx.fillStyle = 'rgba(255,255,255,0.04)';
  ctx.fill();
  ctx.strokeStyle = tierColor + '55';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.restore();

  // Portrait frame glow
  ctx.save();
  ctx.shadowColor = tierColor;
  ctx.shadowBlur = 20;
  roundRect(ctx, portraitX - 2, portraitY - 2, PORTRAIT_W + 4, PORTRAIT_H + 4, 12);
  ctx.strokeStyle = tierColor;
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.restore();

  // Portrait image or coloured placeholder
  ctx.save();
  roundRect(ctx, portraitX, portraitY, PORTRAIT_W, PORTRAIT_H, 10);
  ctx.clip();
  if (fighter.img) {
    ctx.drawImage(fighter.img, portraitX, portraitY, PORTRAIT_W, PORTRAIT_H);
  } else {
    ctx.fillStyle = tierColor + '33';
    ctx.fillRect(portraitX, portraitY, PORTRAIT_W, PORTRAIT_H);
    ctx.fillStyle = tierColor + '99';
    ctx.font = 'bold 48px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('?', portraitX + PORTRAIT_W / 2, portraitY + PORTRAIT_H / 2 + 16);
  }
  ctx.restore();

  // Name area below portrait
  const infoX = flipX ? panelX + 10 : panelX + 10;
  const infoW = panelW - 20;
  const nameY = portraitY + PORTRAIT_H + 24;

  ctx.save();
  ctx.font = 'bold 15px sans-serif';
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  // Truncate long names
  let name = fighter.name;
  if (ctx.measureText(name).width > infoW - 10) {
    while (ctx.measureText(name + '…').width > infoW - 10 && name.length > 1) name = name.slice(0, -1);
    name += '…';
  }
  ctx.fillText(name, panelX + panelW / 2, nameY);

  // Tier label
  ctx.font = '12px sans-serif';
  ctx.fillStyle = tierColor;
  ctx.fillText(`${TIER_EMOJI[fighter.tier] || ''} ${fighter.tier}`, panelX + panelW / 2, nameY + 18);
  ctx.restore();

  // HP bar
  const barY = nameY + 32;
  const barX = panelX + 14;
  const barW = panelW - 28;
  drawHpBar(ctx, barX, barY, barW, 14, fighter.currentHp, fighter.maxHp);

  ctx.save();
  ctx.font = '11px sans-serif';
  ctx.fillStyle = '#dfe6e9';
  ctx.textAlign = 'center';
  ctx.fillText(`${fighter.currentHp} / ${fighter.maxHp} HP`, panelX + panelW / 2, barY + 25);
  ctx.restore();

  // Energy dots
  const ENERGY_MAX = 3;
  const dotStartX = panelX + panelW / 2 - ((ENERGY_MAX - 1) * 18) / 2;
  drawEnergy(ctx, dotStartX, barY + 46, fighter.energy, ENERGY_MAX);
}

/**
 * Build a battle frame image.
 * @param {object} opts
 * @param {object} opts.fighterA   { name, tier, currentHp, maxHp, energy, imageUrl }
 * @param {object} opts.fighterB   { name, tier, currentHp, maxHp, energy, imageUrl }
 * @param {number} opts.turn
 * @param {string} opts.lastResult  Short text describing the last turn's action
 * @param {boolean} opts.ended
 * @param {string|null} opts.winnerName
 * @returns {Promise<Buffer>}  PNG buffer
 */
async function drawBattleFrame({ fighterA, fighterB, turn, lastResult, ended = false, winnerName = null }) {
  const W = 880;
  const H = 380;

  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');

  // Background gradient
  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, '#0f0c29');
  bg.addColorStop(0.5, '#302b63');
  bg.addColorStop(1, '#24243e');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // Subtle grid overlay
  ctx.save();
  ctx.strokeStyle = 'rgba(255,255,255,0.025)';
  ctx.lineWidth = 1;
  for (let x = 0; x < W; x += 40) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
  }
  for (let y = 0; y < H; y += 40) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
  }
  ctx.restore();

  // Load portrait images in parallel
  const [imgA, imgB] = await Promise.all([
    tryLoadImage(fighterA.imageUrl),
    tryLoadImage(fighterB.imageUrl),
  ]);

  const PANEL_W = 300;
  await drawFighterPanel(ctx, { ...fighterA, img: imgA }, 0, false, PANEL_W, H);
  await drawFighterPanel(ctx, { ...fighterB, img: imgB }, W - PANEL_W, true, PANEL_W, H);

  // Center area
  const centerX = PANEL_W;
  const centerW = W - PANEL_W * 2;

  // VS / Turn display
  ctx.save();
  if (ended) {
    ctx.font = 'bold 28px sans-serif';
    ctx.fillStyle = '#ffd700';
    ctx.textAlign = 'center';
    ctx.shadowColor = '#ffd700';
    ctx.shadowBlur = 12;
    ctx.fillText('⚔️  BATTLE OVER', centerX + centerW / 2, 52);
    ctx.shadowBlur = 0;
    if (winnerName) {
      ctx.font = '16px sans-serif';
      ctx.fillStyle = '#ffffff';
      ctx.fillText(`🏆 ${winnerName} wins!`, centerX + centerW / 2, 80);
    }
  } else {
    ctx.font = 'bold 22px sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.textAlign = 'center';
    ctx.fillText(`⚔️  Turn ${turn}`, centerX + centerW / 2, 52);
  }
  ctx.restore();

  // VS badge
  if (!ended) {
    ctx.save();
    const vsX = centerX + centerW / 2;
    const vsY = H / 2 - 10;
    ctx.shadowColor = '#ff4757';
    ctx.shadowBlur = 30;
    ctx.font = 'bold 48px sans-serif';
    ctx.fillStyle = '#ff4757';
    ctx.textAlign = 'center';
    ctx.fillText('VS', vsX, vsY + 16);
    ctx.restore();
  }

  // Last result text at bottom center
  if (lastResult) {
    ctx.save();
    const resultY = H - 24;
    roundRect(ctx, centerX + 8, resultY - 22, centerW - 16, 30, 8);
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fill();
    ctx.font = '13px sans-serif';
    ctx.fillStyle = '#dfe6e9';
    ctx.textAlign = 'center';
    // Clip long result text
    let txt = lastResult;
    if (ctx.measureText(txt).width > centerW - 24) {
      while (ctx.measureText(txt + '…').width > centerW - 24 && txt.length > 1) txt = txt.slice(0, -1);
      txt += '…';
    }
    ctx.fillText(txt, centerX + centerW / 2, resultY - 2);
    ctx.restore();
  }

  return canvas.toBuffer('image/png');
}

module.exports = { drawBattleFrame };
