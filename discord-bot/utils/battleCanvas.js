/**
 * battleCanvas.js
 * Draws a battle frame image for waifu duels using @napi-rs/canvas.
 * Updated: shows elemental type badge and stance on each fighter panel.
 * Returns a Buffer (PNG) ready to send as a Discord attachment.
 */

const { createCanvas, loadImage } = require('@napi-rs/canvas');

const TIER_COLOR = {
  Legendary: '#ffd700', Epic: '#a855f7', Rare: '#ff4757', Uncommon: '#2ed573', Common: '#95a5a6',
};
const TIER_EMOJI = {
  Legendary: '🌟', Epic: '💎', Rare: '🔥', Uncommon: '✨', Common: '⚪',
};
const TYPE_COLOR = {
  Fire: '#ff4757', Water: '#2e86de', Wind: '#26de81', Light: '#ffd32a', Dark: '#a55eea',
};
const TYPE_EMOJI = {
  Fire: '🔥', Water: '💧', Wind: '🌪', Light: '✨', Dark: '🌑',
};

async function tryLoadImage(url) {
  if (!url) return null;
  try { return await loadImage(url); } catch { return null; }
}

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

function drawHpBar(ctx, x, y, w, h, current, max) {
  const pct = Math.max(0, current / max);
  roundRect(ctx, x, y, w, h, h / 2);
  ctx.fillStyle = '#1a1a2e'; ctx.fill();
  if (pct > 0) {
    const barW = Math.round(w * pct);
    const color = pct > 0.6 ? '#2ed573' : pct > 0.3 ? '#ffa502' : '#ff4757';
    roundRect(ctx, x, y, barW, h, h / 2);
    ctx.fillStyle = color; ctx.fill();
  }
  roundRect(ctx, x, y, w, h, h / 2);
  ctx.strokeStyle = 'rgba(255,255,255,0.15)'; ctx.lineWidth = 1; ctx.stroke();
}

function drawEnergy(ctx, x, y, energy, max) {
  const DOT_R = 6, GAP = 18;
  for (let i = 0; i < max; i++) {
    ctx.beginPath(); ctx.arc(x + i * GAP, y, DOT_R, 0, Math.PI * 2);
    ctx.fillStyle = i < energy ? '#f9ca24' : '#2d3436'; ctx.fill();
    ctx.strokeStyle = '#f9ca24'; ctx.lineWidth = 1.5; ctx.stroke();
  }
}

/** Draw the type badge (coloured pill with type name) in the top corner of the portrait. */
function drawTypeBadge(ctx, x, y, type) {
  const color = TYPE_COLOR[type] || '#95a5a6';
  const label = `${TYPE_EMOJI[type] || ''} ${type || ''}`;
  const BADGE_H = 18;

  ctx.save();
  ctx.font = 'bold 11px sans-serif';
  const tw = ctx.measureText(label).width;
  const BADGE_W = tw + 14;

  roundRect(ctx, x, y, BADGE_W, BADGE_H, BADGE_H / 2);
  ctx.fillStyle = color + 'cc'; ctx.fill();
  ctx.strokeStyle = '#ffffff33'; ctx.lineWidth = 1; ctx.stroke();

  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'left';
  ctx.fillText(label, x + 7, y + BADGE_H - 5);
  ctx.restore();
}

async function drawFighterPanel(ctx, fighter, panelX, flipX, panelW, canvasH) {
  const tierColor  = TIER_COLOR[fighter.tier] || '#95a5a6';
  const PORTRAIT_W = 160, PORTRAIT_H = 190;
  const portraitX  = flipX ? panelX + panelW - PORTRAIT_W - 20 : panelX + 20;
  const portraitY  = 55;

  // Panel background
  ctx.save();
  roundRect(ctx, panelX + 8, 8, panelW - 16, canvasH - 16, 16);
  ctx.fillStyle = 'rgba(255,255,255,0.04)'; ctx.fill();
  ctx.strokeStyle = tierColor + '55'; ctx.lineWidth = 2; ctx.stroke();
  ctx.restore();

  // Portrait glow
  ctx.save();
  ctx.shadowColor = tierColor; ctx.shadowBlur = 20;
  roundRect(ctx, portraitX - 2, portraitY - 2, PORTRAIT_W + 4, PORTRAIT_H + 4, 12);
  ctx.strokeStyle = tierColor; ctx.lineWidth = 2; ctx.stroke();
  ctx.restore();

  // Portrait image or placeholder
  ctx.save();
  roundRect(ctx, portraitX, portraitY, PORTRAIT_W, PORTRAIT_H, 10);
  ctx.clip();
  if (fighter.img) {
    ctx.drawImage(fighter.img, portraitX, portraitY, PORTRAIT_W, PORTRAIT_H);
  } else {
    ctx.fillStyle = tierColor + '33'; ctx.fillRect(portraitX, portraitY, PORTRAIT_W, PORTRAIT_H);
    ctx.fillStyle = tierColor + '99';
    ctx.font = 'bold 48px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('?', portraitX + PORTRAIT_W / 2, portraitY + PORTRAIT_H / 2 + 16);
  }
  ctx.restore();

  // Type badge on portrait
  if (fighter.type) {
    const badgeX = flipX ? portraitX + PORTRAIT_W - 78 : portraitX + 4;
    drawTypeBadge(ctx, badgeX, portraitY + 4, fighter.type);
  }

  // Name + tier
  const infoW  = panelW - 20;
  const nameY  = portraitY + PORTRAIT_H + 22;

  ctx.save();
  ctx.font = 'bold 14px sans-serif';
  ctx.fillStyle = '#ffffff'; ctx.textAlign = 'center';
  let name = fighter.name;
  if (ctx.measureText(name).width > infoW - 10) {
    while (ctx.measureText(name + '…').width > infoW - 10 && name.length > 1) name = name.slice(0, -1);
    name += '…';
  }
  ctx.fillText(name, panelX + panelW / 2, nameY);

  ctx.font = '11px sans-serif'; ctx.fillStyle = tierColor;
  ctx.fillText(`${TIER_EMOJI[fighter.tier] || ''} ${fighter.tier}`, panelX + panelW / 2, nameY + 16);

  // Stance label (if present)
  if (fighter.stance) {
    ctx.font = 'italic 10px sans-serif'; ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.fillText(fighter.stance, panelX + panelW / 2, nameY + 30);
  }
  ctx.restore();

  // HP bar
  const barY = nameY + (fighter.stance ? 44 : 30);
  const barX = panelX + 14;
  const barW = panelW - 28;
  drawHpBar(ctx, barX, barY, barW, 14, fighter.currentHp, fighter.maxHp);

  ctx.save();
  ctx.font = '11px sans-serif'; ctx.fillStyle = '#dfe6e9'; ctx.textAlign = 'center';
  ctx.fillText(`${fighter.currentHp} / ${fighter.maxHp} HP`, panelX + panelW / 2, barY + 25);
  ctx.restore();

  // Energy dots
  const ENERGY_MAX = 3;
  const dotStartX = panelX + panelW / 2 - ((ENERGY_MAX - 1) * 18) / 2;
  drawEnergy(ctx, dotStartX, barY + 46, fighter.energy ?? 0, ENERGY_MAX);
}

/**
 * Build a battle frame image.
 * @param {object} opts
 * @param {object} opts.fighterA   { name, tier, type?, stance?, currentHp, maxHp, energy, imageUrl }
 * @param {object} opts.fighterB
 * @param {number} opts.turn
 * @param {string} opts.lastResult
 * @param {boolean} opts.ended
 * @param {string|null} opts.winnerName
 * @returns {Promise<Buffer>}
 */
async function drawBattleFrame({ fighterA, fighterB, turn, lastResult, ended = false, winnerName = null }) {
  const W = 880, H = 400;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');

  // Background gradient
  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, '#0f0c29'); bg.addColorStop(0.5, '#302b63'); bg.addColorStop(1, '#24243e');
  ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);

  // Grid overlay
  ctx.save(); ctx.strokeStyle = 'rgba(255,255,255,0.025)'; ctx.lineWidth = 1;
  for (let x = 0; x < W; x += 40) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
  for (let y = 0; y < H; y += 40) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
  ctx.restore();

  const [imgA, imgB] = await Promise.all([tryLoadImage(fighterA.imageUrl), tryLoadImage(fighterB.imageUrl)]);

  const PANEL_W = 300;
  await drawFighterPanel(ctx, { ...fighterA, img: imgA }, 0, false, PANEL_W, H);
  await drawFighterPanel(ctx, { ...fighterB, img: imgB }, W - PANEL_W, true, PANEL_W, H);

  // Center area
  const centerX = PANEL_W, centerW = W - PANEL_W * 2;

  ctx.save();
  if (ended) {
    ctx.font = 'bold 26px sans-serif'; ctx.fillStyle = '#ffd700'; ctx.textAlign = 'center';
    ctx.shadowColor = '#ffd700'; ctx.shadowBlur = 14;
    ctx.fillText('⚔️  BATTLE OVER', centerX + centerW / 2, 52); ctx.shadowBlur = 0;
    if (winnerName) {
      ctx.font = '15px sans-serif'; ctx.fillStyle = '#ffffff';
      ctx.fillText(`🏆 ${winnerName} wins!`, centerX + centerW / 2, 76);
    }
  } else {
    ctx.font = 'bold 20px sans-serif'; ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.textAlign = 'center';
    ctx.fillText(turn === 0 ? '⚔️  VS' : `⚔️  Turn ${turn}`, centerX + centerW / 2, 52);
  }
  ctx.restore();

  if (!ended && turn === 0) {
    ctx.save();
    ctx.shadowColor = '#ff4757'; ctx.shadowBlur = 30;
    ctx.font = 'bold 52px sans-serif'; ctx.fillStyle = '#ff4757'; ctx.textAlign = 'center';
    ctx.fillText('VS', centerX + centerW / 2, H / 2 + 18);
    ctx.restore();
  }

  // Last result caption
  if (lastResult) {
    const resultY = H - 22;
    roundRect(ctx, centerX + 8, resultY - 22, centerW - 16, 30, 8);
    ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fill();
    ctx.save();
    ctx.font = '12px sans-serif'; ctx.fillStyle = '#dfe6e9'; ctx.textAlign = 'center';
    let txt = lastResult;
    if (ctx.measureText(txt).width > centerW - 28) {
      while (ctx.measureText(txt + '…').width > centerW - 28 && txt.length > 1) txt = txt.slice(0, -1);
      txt += '…';
    }
    ctx.fillText(txt, centerX + centerW / 2, resultY - 2);
    ctx.restore();
  }

  return canvas.toBuffer('image/png');
}

module.exports = { drawBattleFrame };
