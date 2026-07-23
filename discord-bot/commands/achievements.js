/**
 * achievements.js — x!achievements [@user]
 * View progress and unlocks for gacha/battle/economy milestones.
 */

const { EmbedBuilder } = require('discord.js');
const db = require('../utils/db.js');

const ACHIEVEMENTS = [
  { id: 'first_pull',    name: 'First Pull',       desc: 'Pull your first character',        stat: 'pulls',       goal: 1 },
  { id: 'gacha_enjoyer', name: 'Gacha Enjoyer',    desc: 'Pull 100 characters',              stat: 'pulls',       goal: 100 },
  { id: 'gacha_addict',  name: 'Gacha Addict',     desc: 'Pull 1,000 characters',            stat: 'pulls',       goal: 1000 },
  { id: 'legendary_hunter', name: 'Legendary Hunter', desc: 'Collect 5 Legendaries',         stat: 'legendaries', goal: 5 },
  { id: 'epic_collector',   name: 'Epic Collector',   desc: 'Collect 10 Epics',              stat: 'epics',       goal: 10 },
  { id: 'harem_starter', name: 'Harem Starter',    desc: 'Marry 5 characters',               stat: 'harem',       goal: 5 },
  { id: 'harem_devotee', name: 'Harem Devotee',    desc: 'Marry 25 characters',              stat: 'harem',       goal: 25 },
  { id: 'duelist',       name: 'Duelist',          desc: 'Win 10 duels',                     stat: 'duel_wins',   goal: 10 },
  { id: 'duel_champion', name: 'Duel Champion',    desc: 'Win 50 duels',                     stat: 'duel_wins',   goal: 50 },
  { id: 'warlord',       name: 'Warlord',          desc: 'Win 10 warfares',                  stat: 'warfare_wins', goal: 10 },
  { id: 'warlord_king',  name: 'Warlord King',     desc: 'Win 50 warfares',                  stat: 'warfare_wins', goal: 50 },
  { id: 'rich',          name: 'Rich',             desc: 'Hold 10,000 Petals',               stat: 'balance',     goal: 10000 },
  { id: 'wealthy',       name: 'Wealthy',          desc: 'Hold 100,000 Petals',              stat: 'balance',     goal: 100000 },
];

async function execute(message, args) {
  const target = message.mentions.users.first() || message.author;

  const [balance, haremCount, pullStats, duelWins, warfareWins, haremTiers] = await Promise.all([
    db.getBalance(target.id),
    db.countHarem(target.id),
    db.getPullStats(target.id),
    db.getDuelWinCount(target.id),
    db.getWarfareWinCount(target.id),
    db.getHaremTierCounts(target.id),
  ]);

  const stats = {
    pulls:       pullStats.total,
    legendaries: haremTiers.Legendary || 0,
    epics:       haremTiers.Epic || 0,
    harem:       haremCount,
    duel_wins:   duelWins,
    warfare_wins: warfareWins,
    balance:     balance,
  };

  let unlocked = 0;
  const lines = ACHIEVEMENTS.map(a => {
    const current = stats[a.stat] ?? 0;
    const done = current >= a.goal;
    if (done) unlocked++;
    const pct = Math.min(100, Math.round((current / a.goal) * 100));
    const bar = '█'.repeat(Math.floor(pct / 10)) + '░'.repeat(10 - Math.floor(pct / 10));
    return `${done ? '✅' : '🔒'} **${a.name}** — ${a.desc}\n` +
           `　　${bar} ${current.toLocaleString()}/${a.goal.toLocaleString()} (${pct}%)`;
  });

  const embed = new EmbedBuilder()
    .setColor(0xff85c0)
    .setTitle(`🏆 ${target.username}'s Achievements`)
    .setDescription(
      `**${unlocked} / ${ACHIEVEMENTS.length} unlocked**\n\n` +
      lines.join('\n\n'),
    )
    .setFooter({ text: 'Keep pulling, dueling, and collecting to unlock more!' })
    .setTimestamp();

  await message.reply({ embeds: [embed] });
}

module.exports = {
  execute,
  name: 'achievements',
  aliases: ['achieve', 'badges'],
  description: 'View your gacha, battle, and economy achievements.',
  usage: 'achievements [@user]',
  category: 'Game',
};
