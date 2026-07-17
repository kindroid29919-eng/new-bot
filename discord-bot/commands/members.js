/**
 * members.js — x!members
 * Shows the member count breakdown for the server.
 *
 * Usage: x!members
 *
 * ── About the "online" count / presence intent ──────────────────────────────
 * Toggling "Presence Intent" ON in the Discord Developer Portal is only half
 * of the requirement. The bot's code must ALSO request the intent when the
 * Client is created, e.g.:
 *
 *   const { Client, GatewayIntentBits } = require('discord.js');
 *   const client = new Client({
 *     intents: [
 *       GatewayIntentBits.Guilds,
 *       GatewayIntentBits.GuildMembers,
 *       GatewayIntentBits.GuildPresences,   // <-- this line was almost certainly missing
 *       GatewayIntentBits.GuildMessages,
 *       GatewayIntentBits.MessageContent,
 *     ],
 *   });
 *
 * Without GatewayIntentBits.GuildPresences in the Client's intents array,
 * discord.js will never populate member.presence, no matter what's toggled
 * in the portal — that's the actual cause of the "no presence intent" message.
 * This file now checks the live intents on the client so the error message
 * always reflects what's really enabled in your index.js.
 */

const { EmbedBuilder, GatewayIntentBits } = require('discord.js');

async function execute(message) {
  const guild = message.guild;
  await guild.members.fetch();

  const total = guild.memberCount;
  const humans = guild.members.cache.filter((m) => !m.user.bot).size;
  const bots = guild.members.cache.filter((m) => m.user.bot).size;

  const hasPresenceIntent = message.client.options.intents.has(GatewayIntentBits.GuildPresences);
  const hasMembersIntent = message.client.options.intents.has(GatewayIntentBits.GuildMembers);

  let onlineValue;
  if (!hasMembersIntent) {
    onlineValue = 'N/A (missing GuildMembers intent)';
  } else if (!hasPresenceIntent) {
    onlineValue = 'N/A (missing GuildPresences intent in client code)';
  } else {
    const online = guild.members.cache.filter(
      (m) => m.presence?.status && m.presence.status !== 'offline',
    ).size;
    onlineValue = online.toLocaleString();
  }

  const embed = new EmbedBuilder()
    .setColor(0x2ecc71)
    .setTitle(`👥  Members — ${guild.name}`)
    .addFields(
      { name: '📊 Total', value: total.toLocaleString(), inline: true },
      { name: '🧑 Humans', value: humans.toLocaleString(), inline: true },
      { name: '🤖 Bots', value: bots.toLocaleString(), inline: true },
      { name: '🟢 Online', value: onlineValue, inline: true },
    )
    .setFooter({ text: `Requested by ${message.author.tag}` })
    .setTimestamp();

  if (!hasPresenceIntent) {
    embed.setDescription(
      '⚠️ The **Presence Intent** toggle in the Developer Portal is only step 1. ' +
      'Your bot\'s `Client` also needs `GatewayIntentBits.GuildPresences` added to its ' +
      '`intents` array in code — see the comment at the top of `members.js` for the exact fix.',
    );
  }

  await message.reply({ embeds: [embed] });
}

module.exports = {
  execute,
  description: 'Show the member count breakdown for this server',
  usage: 'members',
  category: 'Info',
};
