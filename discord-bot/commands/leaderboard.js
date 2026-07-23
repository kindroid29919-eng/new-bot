/**
 * leaderboard.js — x!leaderboard [richest|harem|duel|warfare|pulls] [server|global]
 * Server-wide leaderboards by default; add "global" to rank across all servers.
 */

const { EmbedBuilder } = require('discord.js');
const db = require('../utils/db.js');

const CATEGORIES = {
  richest: {
    fn: db.leaderboardByBalance,
    label: '💰 Richest Users',
    format: r => `${r.balance.toLocaleString()} 🌸 Petals`,
  },
  harem: {
    fn: db.leaderboardByHarem,
    label: '💍 Biggest Harems',
    format: r => `${r.count} character${r.count === 1 ? '' : 's'}`,
  },
  duel: {
    fn: db.leaderboardByDuelWins,
    label: '⚔️ Duel Wins',
    format: r => `${r.wins} win${r.wins === 1 ? '' : 's'}`,
  },
  warfare: {
    fn: db.leaderboardByWarfareWins,
    label: '🔥 Warfare Wins',
    format: r => `${r.wins} win${r.wins === 1 ? '' : 's'}`,
  },
  pulls: {
    fn: db.leaderboardByPulls,
    label: '🎰 Total Pulls',
    format: r => `${r.pulls} pull${r.pulls === 1 ? '' : 's'}`,
  },
};
const DEFAULT_CATEGORY = 'richest';
const LIMIT = 10;

async function execute(message, args) {
  let category = DEFAULT_CATEGORY;
  let scope = 'server';

  for (const arg of args) {
    const a = arg.toLowerCase();
    if (CATEGORIES[a]) category = a;
    else if (a === 'server' || a === 'global') scope = a;
  }

  const meta = CATEGORIES[category];

  let userIds = null;
  if (scope === 'server' && message.guild) {
    try {
      const members = await message.guild.members.fetch();
      userIds = [...members.keys()];
    } catch {
      userIds = null;
    }
  }

  let rows;
  try {
    rows = await meta.fn(LIMIT, userIds);
  } catch (err) {
    console.error('[leaderboard]', err);
    return message.reply('⚠️ Couldn\'t load the leaderboard right now. Try again in a bit.');
  }

  if (!rows.length) {
    return message.reply(`📭 No data for the **${meta.label}** leaderboard yet — be the first to make it!`);
  }

  // Resolve names
  const names = new Map();
  await Promise.all(
    rows.map(async (row) => {
      const id = row.user_id;
      try {
        let user;
        if (scope === 'server' && message.guild) {
          const member = await message.guild.members.fetch(id).catch(() => null);
          user = member?.user;
        } else {
          user = await message.client.users.fetch(id).catch(() => null);
        }
        names.set(id, user ? `**${user.username}**` : `<@${id}>`);
      } catch {
        names.set(id, `<@${id}>`);
      }
    }),
  );

  const lines = rows.map((row, i) => {
    const rank = ['🥇', '🥈', '🥉'][i] || `**${i + 1}.**`;
    return `${rank} ${names.get(row.user_id) ?? `<@${row.user_id}>`} — ${meta.format(row)}`;
  });

  const embed = new EmbedBuilder()
    .setColor(0xff85c0)
    .setTitle(`${meta.label} — ${scope === 'global' ? 'Global' : 'Server'}`)
    .setDescription(lines.join('\n'))
    .setFooter({ text: `x!leaderboard [${Object.keys(CATEGORIES).join('|')}] [server|global]` })
    .setTimestamp();

  await message.reply({ embeds: [embed] });
}

module.exports = {
  execute,
  name: 'leaderboard',
  aliases: ['lb', 'top'],
  description: 'Show server or global leaderboards: richest, biggest harem, duel wins, warfare wins, or pulls.',
  usage: 'leaderboard [category] [server|global]',
  category: 'Economy',
};
