/**
 * rate.js — x!rate
 * Rates someone across 5 categories with random /10 scores.
 * Yapping is always 10 (bad) and is SUBTRACTED from the overall.
 * Overall is used only to determine the level — it is never shown.
 *
 * Usage: x!rate <name | @user>
 */

const { EmbedBuilder } = require('discord.js');

// ── Categories ───────────────────────────────────────────────────────────────
// yapping is random but inversely weighted — high other scores → low yapping, and vice versa.
// yapping is always SUBTRACTED from the overall (high yapping = bad).
const CATEGORIES = [
  { key: 'gameplay', label: '🎮 Gameplay' },
  { key: 'skills',   label: '⚔️  Skills'   },
  { key: 'impact',   label: '💥 Impact'   },
  { key: 'body',     label: '💪 Body'     },
  { key: 'yapping',  label: '🗣️  Yapping', subtract: true },
];

// ── 15 Levels (score range: -6 → 30) ────────────────────────────────────────
const LEVELS = [
  { min: -6,  max: -4,  label: 'Absolute NPC',  emoji: '💀'    },
  { min: -3,  max: -1,  label: 'Noob',           emoji: '🥉'    },
  { min:  0,  max:  2,  label: 'Bronze Bot',     emoji: '🤖'    },
  { min:  3,  max:  5,  label: 'Beginner',        emoji: '📗'    },
  { min:  6,  max:  8,  label: 'Casual',          emoji: '🎮'    },
  { min:  9,  max: 11,  label: 'Average',         emoji: '🌱'    },
  { min: 12,  max: 14,  label: 'Decent',          emoji: '⚡'    },
  { min: 15,  max: 17,  label: 'Solid',           emoji: '🔥'    },
  { min: 18,  max: 20,  label: 'Skilled',         emoji: '🏆'    },
  { min: 21,  max: 22,  label: 'Pro',             emoji: '💎'    },
  { min: 23,  max: 24,  label: 'Elite',           emoji: '🌟'    },
  { min: 25,  max: 26,  label: 'Legend',          emoji: '👑'    },
  { min: 27,  max: 28,  label: 'Mythic',          emoji: '🔱'    },
  { min: 29,  max: 29,  label: 'GOAT',            emoji: '🐐'    },
  { min: 30,  max: 30,  label: 'Ultra GOAT',      emoji: '🐐💥'  },
];

const LEVEL_COLORS = {
  'Absolute NPC':  0x636e72,
  'Noob':          0xb2bec3,
  'Bronze Bot':    0xa29bfe,
  'Beginner':      0x74b9ff,
  'Casual':        0x55efc4,
  'Average':       0xffeaa7,
  'Decent':        0xfdcb6e,
  'Solid':         0xe17055,
  'Skilled':       0xff7675,
  'Pro':           0xfd79a8,
  'Elite':         0xe84393,
  'Legend':        0xf9ca24,
  'Mythic':        0x6c5ce7,
  'GOAT':          0x00cec9,
  'Ultra GOAT':    0xffd32a,
};

/** Filled/empty bar out of 10 */
function bar(score) {
  const filled = Math.max(0, Math.min(10, score));
  return '█'.repeat(filled) + '░'.repeat(10 - filled);
}

function rand(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function getLevel(overall) {
  return LEVELS.find(l => overall >= l.min && overall <= l.max) || LEVELS[0];
}

async function execute(message, args) {
  if (!args.length) {
    return message.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(0xff4757)
          .setTitle('❌  Invalid Usage')
          .setDescription('**Usage:** `x!rate <name | @user>`\n**Example:** `x!rate @Ahad`')
          .setTimestamp(),
      ],
    });
  }

  // Resolve target display name
  const mention = message.mentions.members?.first();
  const target  = mention ? mention.displayName : args.join(' ');

  // Generate scores for the 4 main categories first
  const scores = {};
  let overall  = 0;

  const mainCats = CATEGORIES.filter(c => !c.subtract);
  for (const cat of mainCats) {
    const score = rand(1, 10);
    scores[cat.key] = score;
    overall += score;
  }

  // Yapping is inversely weighted: high main stats → low yapping, low main stats → high yapping.
  // Base = 11 - avg, then add ±2 noise, clamped to 1–10.
  const avgMain     = overall / mainCats.length;
  const yappingBase = 11 - avgMain;
  const yappingNoise = rand(-2, 2);
  const yappingScore = Math.min(10, Math.max(1, Math.round(yappingBase + yappingNoise)));
  scores['yapping']  = yappingScore;
  overall           -= yappingScore; // subtract because high yapping is bad

  const level = getLevel(overall);
  const color = LEVEL_COLORS[level.label] ?? 0x5865f2;

  // Build fields string
  const lines = CATEGORIES.map(cat => {
    const score  = scores[cat.key];
    const barStr = bar(score);
    return `${cat.label}\n\`${barStr}\` **${score}/10**`;
  });

  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle(`📊  Rating: ${target}`)
    .setDescription(lines.join('\n\n'))
    .addFields({
      name: '🏅 Level',
      value: `${level.emoji}  **${level.label}**`,
      inline: false,
    })
    .setFooter({ text: `Rated by ${message.author.tag}` })
    .setTimestamp();

  await message.reply({ embeds: [embed] });
}

module.exports = {
  execute,
  description: 'Rate someone across 5 categories and get their level',
  usage: 'rate <name | @user>',
  category: 'Fun',
};
