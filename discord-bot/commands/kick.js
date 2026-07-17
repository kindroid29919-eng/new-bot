const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { styles, sounds, reactions } = require('../data/kicks.js');
const { getGif } = require('../utils/nekosGif.js');

const recentCache = [];

async function execute(message, args) {
  // --- Permission checks ---
  if (!message.member.permissions.has(PermissionFlagsBits.KickMembers)) {
    return message.reply({
      embeds: [new EmbedBuilder().setColor(0xff4757).setTitle('❌  Missing Permissions').setDescription('You need the **Kick Members** permission to use this.').setTimestamp()],
    });
  }

  if (!message.guild.members.me.permissions.has(PermissionFlagsBits.KickMembers)) {
    return message.reply({
      embeds: [new EmbedBuilder().setColor(0xff4757).setTitle('❌  Missing Permissions').setDescription('I need the **Kick Members** permission to do that.').setTimestamp()],
    });
  }

  // --- Usage / target validation ---
  const target = message.mentions.members?.first();

  if (!args.length || !target) {
    return message.reply({
      embeds: [new EmbedBuilder().setColor(0xff4757).setTitle('❌  Usage Error').setDescription('`x!kick @user [reason]`\nYou need to @mention the user to kick.').setTimestamp()],
    });
  }

  if (target.id === message.author.id) {
    return message.reply({
      embeds: [new EmbedBuilder().setColor(0xff4757).setTitle('❌  Nice Try').setDescription('You can\'t kick yourself.').setTimestamp()],
    });
  }

  if (target.id === message.client.user.id) {
    return message.reply({
      embeds: [new EmbedBuilder().setColor(0xff4757).setTitle('❌  Nice Try').setDescription('I\'m not kicking myself.').setTimestamp()],
    });
  }

  if (!target.kickable) {
    return message.reply({
      embeds: [new EmbedBuilder().setColor(0xff4757).setTitle('❌  Cannot Kick').setDescription('That user has a higher or equal role to me, or I otherwise can\'t kick them.').setTimestamp()],
    });
  }

  if (
    target.roles.highest.position >= message.member.roles.highest.position &&
    message.guild.ownerId !== message.author.id
  ) {
    return message.reply({
      embeds: [new EmbedBuilder().setColor(0xff4757).setTitle('❌  Cannot Kick').setDescription('That user has a higher or equal role to you.').setTimestamp()],
    });
  }

  // reason = everything after the mention
  const reason = args.slice(1).join(' ') || 'No reason provided';
  const targetName = target.user.username;

  // --- Build the fun embed first ---
  let cacheKey, style, sound, reaction, attempts = 0;

  do {
    style = styles[Math.floor(Math.random() * styles.length)];
    sound = sounds[Math.floor(Math.random() * sounds.length)];
    reaction = reactions[Math.floor(Math.random() * reactions.length)];
    cacheKey = `${style}-${reaction}`;
    attempts++;
  } while (recentCache.includes(cacheKey) && attempts < 20);

  recentCache.push(cacheKey);
  if (recentCache.length > 15) recentCache.shift();

  const embed = new EmbedBuilder()
    .setColor(0xf39c12)
    .setTitle('🦵  BOOT! (Kicked from the server)')
    .setDescription(`**${message.author.username}** kicked **${targetName}** with ${style}!`)
    .addFields(
      { name: 'Sound', value: `**${sound}**`, inline: true },
      { name: 'Result', value: reaction, inline: true },
      { name: 'Reason', value: reason, inline: false }
    )
    .setTimestamp();

  const gif = await getGif('kick');
  const footerBase = 'No actual users were harmed in the making of this kick.';
  embed.setFooter({ text: gif?.anime_name ? `${footerBase} · Source: ${gif.anime_name}` : footerBase });
  if (gif) embed.setImage(gif.url);

  // --- Perform the actual kick ---
  try {
    await target.kick(reason);
  } catch (err) {
    return message.reply({
      embeds: [new EmbedBuilder().setColor(0xff4757).setTitle('❌  Kick Failed').setDescription(`Something went wrong: ${err.message}`).setTimestamp()],
    });
  }

  await message.reply({ embeds: [embed] });
}

module.exports = { execute, name: 'kick', aliases: ['boot'], description: 'Kick a member from the server (with a cute farewell GIF).', usage: 'kick <user> [reason]', category: 'Moderation' };
