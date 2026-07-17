/**
 * afk.js — x!afk
 * Toggles an AFK status for the caller.
 * NOTE: to auto-reply when someone mentions an AFK user, and to auto-clear
 * AFK when that user speaks again, your messageCreate listener needs a
 * small hook using the exported `afkUsers` Map — see bottom of this file.
 * Usage: x!afk [reason]
 */

const { EmbedBuilder } = require('discord.js');

const afkUsers = new Map(); // userId -> { reason, since }

async function execute(message, args) {
  const reason = args.join(' ') || 'AFK';

  if (afkUsers.has(message.author.id)) {
    afkUsers.delete(message.author.id);
    return message.reply({
      embeds: [new EmbedBuilder().setColor(0x2ed573).setTitle('👋  Welcome back').setDescription('Your AFK status has been removed.').setTimestamp()],
    });
  }

  afkUsers.set(message.author.id, { reason, since: Date.now() });

  const embed = new EmbedBuilder()
    .setColor(0x74b9ff)
    .setTitle('💤  AFK Set')
    .setDescription(`${message.author} is now AFK: **${reason}**`)
    .setTimestamp();

  await message.reply({ embeds: [embed] });
}

module.exports = {
  execute,
  name: 'afk',
  aliases: [],
  description: 'Sets your AFK status',
  usage: 'afk [reason]',
  category: 'Utility',
  afkUsers, // exported Map so your messageCreate listener can read/clear it
};

/*
Optional hook for your main messageCreate listener (not required for the
command itself to load/run, only for auto-reply-on-mention behavior):

const { afkUsers } = require('./commands/afk');

// at top of messageCreate, before command parsing:
if (afkUsers.has(message.author.id) && !message.content.startsWith(PREFIX)) {
  afkUsers.delete(message.author.id);
  message.reply('Welcome back, your AFK status was removed.');
}

for (const [id] of message.mentions.users) {
  if (afkUsers.has(id)) {
    const { reason, since } = afkUsers.get(id);
    message.reply(`That user is AFK: ${reason} (<t:${Math.floor(since / 1000)}:R>)`);
  }
}
*/
