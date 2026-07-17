/**
 * lovecount.js — x!lovecount (alias: x!lc)
 * Generates a cute love-compatibility image for two people/names.
 *
 * Usage: x!lovecount <name/@user> <name/@user>
 *        x!lc        <name/@user> <name/@user>
 */

const { AttachmentBuilder, EmbedBuilder } = require('discord.js');
const { createCanvas } = require('@napi-rs/canvas');

// ── Love messages keyed by range ────────────────────────────────────────────
function loveMessage(pct) {
  if (pct >= 95) return { text: '💘 Soulmates. It\'s written in the stars.', color: '#ff1744' };
  if (pct >= 85) return { text: '💖 Perfect match energy — don\'t let go.', color: '#e91e8c' };
  if (pct >= 75) return { text: '💕 Strong connection. This could be something real.', color: '#f06292' };
  if (pct >= 65) return { text: '💗 Good vibes. Worth exploring.', color: '#f48fb1' };
  if (pct >= 55) return { text: '💞 More than friends? The universe is hinting.', color: '#ff80ab' };
  if (pct >= 45) return { text: '💓 Decent chemistry. Could go either way.', color: '#ff8a80' };
  if (pct >= 35) return { text: '💛 Friendly energy. No spark… yet.', color: '#ffcc02' };
  if (pct >= 25) return { text: '🤍 It\'s giving acquaintances. Try harder.', color: '#b0bec5' };
  if (pct >= 15) return { text: '💔 Barely compatible. Yikes.', color: '#90a4ae' };
  return          { text: '💔 Complete opposites. Astronomically bad match.', color: '#607d8b' };
}

/** Wrap text to fit within maxWidth, returns array of lines */
function wrapText(ctx, text, maxWidth) {
  const words = text.split(' ');
  const lines = [];
  let line    = '';
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  return lines;
}

async function execute(message, args) {
  // ── Parse two targets ──────────────────────────────────────────────────────
  const members  = message.mentions.members;
  const rawArgs  = args.filter(a => a.trim());

  let nameA, nameB;

  if (members && members.size >= 2) {
    const [mA, mB] = [...members.values()];
    nameA = mA.displayName;
    nameB = mB.displayName;
  } else if (members && members.size === 1) {
    const [mA] = [...members.values()];
    nameA = mA.displayName;
    // Second target is a plain text name (the non-mention arg)
    const plainArgs = rawArgs.filter(a => !a.match(/^<@!?\d+>$/));
    nameB = plainArgs.join(' ') || 'Unknown';
  } else {
    // Both are plain text — split at first space or mid-point
    if (rawArgs.length >= 2) {
      // Two separate args → first word is person A, rest is person B
      nameA = rawArgs[0];
      nameB = rawArgs.slice(1).join(' ');
    } else {
      return message.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(0xff4757)
            .setTitle('❌  Invalid Usage')
            .setDescription(
              '**Usage:** `x!lc <person1> <person2>`\n' +
              '**Examples:**\n`x!lc @Ahad @replit`\n`x!lc Ahad replit`',
            )
            .setTimestamp(),
        ],
      });
    }
  }

  const pct   = Math.floor(Math.random() * 101);
  const msg   = loveMessage(pct);

  // ── Draw the image ─────────────────────────────────────────────────────────
  const W = 520, H = 200;
  const canvas = createCanvas(W, H);
  const ctx    = canvas.getContext('2d');

  // Background gradient (pink → purple → pink)
  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0,    '#ff6b9d');
  bg.addColorStop(0.5,  '#c44dff');
  bg.addColorStop(1,    '#ff6b9d');
  ctx.fillStyle = bg;
  ctx.roundRect(0, 0, W, H, 18);
  ctx.fill();

  // Subtle inner glow overlay
  const glow = ctx.createRadialGradient(W / 2, H / 2, 20, W / 2, H / 2, W * 0.6);
  glow.addColorStop(0,   'rgba(255,255,255,0.12)');
  glow.addColorStop(1,   'rgba(255,255,255,0)');
  ctx.fillStyle = glow;
  ctx.roundRect(0, 0, W, H, 18);
  ctx.fill();

  // ── Name A ─────────────────────────────────────────────────────────────────
  ctx.fillStyle    = '#ffffff';
  ctx.font         = 'bold 22px sans-serif';
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor  = 'rgba(0,0,0,0.4)';
  ctx.shadowBlur   = 6;
  // Truncate long names
  const maxNameW = 140;
  let displayA   = nameA;
  while (ctx.measureText(displayA).width > maxNameW && displayA.length > 3) {
    displayA = displayA.slice(0, -1);
  }
  if (displayA !== nameA) displayA += '…';
  ctx.fillText(displayA, 100, 52);

  // ── Heart ──────────────────────────────────────────────────────────────────
  ctx.font      = '36px sans-serif';
  ctx.shadowBlur = 12;
  ctx.fillText('❤️', W / 2, 52);

  // ── Name B ─────────────────────────────────────────────────────────────────
  ctx.font      = 'bold 22px sans-serif';
  ctx.shadowBlur = 6;
  let displayB  = nameB;
  while (ctx.measureText(displayB).width > maxNameW && displayB.length > 3) {
    displayB = displayB.slice(0, -1);
  }
  if (displayB !== nameB) displayB += '…';
  ctx.fillText(displayB, W - 100, 52);

  // ── Percentage ────────────────────────────────────────────────────────────
  ctx.shadowBlur = 10;
  ctx.font       = 'bold 42px sans-serif';
  ctx.fillText(`${pct}%`, W / 2, 108);

  // ── Progress bar ──────────────────────────────────────────────────────────
  ctx.shadowBlur = 0;
  const barX = 40, barY = 135, barW = W - 80, barH = 18, barR = 9;

  // Track
  ctx.fillStyle = 'rgba(255,255,255,0.25)';
  ctx.beginPath();
  ctx.roundRect(barX, barY, barW, barH, barR);
  ctx.fill();

  // Fill
  if (pct > 0) {
    const fillW = Math.max(barR * 2, (pct / 100) * barW);
    const fillGrad = ctx.createLinearGradient(barX, 0, barX + fillW, 0);
    fillGrad.addColorStop(0, '#fff0f6');
    fillGrad.addColorStop(1, '#ff1744');
    ctx.fillStyle = fillGrad;
    ctx.beginPath();
    ctx.roundRect(barX, barY, fillW, barH, barR);
    ctx.fill();
  }

  // ── Love message ──────────────────────────────────────────────────────────
  ctx.shadowBlur   = 4;
  ctx.fillStyle    = 'rgba(255,255,255,0.92)';
  ctx.font         = '14px sans-serif';
  ctx.textBaseline = 'top';
  const msgLines   = wrapText(ctx, msg.text, W - 60);
  msgLines.forEach((line, i) => ctx.fillText(line, W / 2, 163 + i * 18));

  // ── Send ──────────────────────────────────────────────────────────────────
  const buffer     = canvas.toBuffer('image/png');
  const attachment = new AttachmentBuilder(buffer, { name: 'lovecount.png' });

  const embed = new EmbedBuilder()
    .setColor(0xff6b9d)
    .setTitle('💘  Love Compatibility')
    .setImage('attachment://lovecount.png')
    .setFooter({ text: `Requested by ${message.author.tag}` })
    .setTimestamp();

  await message.reply({ embeds: [embed], files: [attachment] });
}

module.exports = {
  execute,
  description: 'Check love compatibility between two people with a cute image',
  usage: 'lovecount <person1> <person2>',
  category: 'Fun',
  aliases: ['lc'],
};
