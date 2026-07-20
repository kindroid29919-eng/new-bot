/**
 * send.js — x!send @user <amount>
 * Transfer Petals to another user.
 */

const { EmbedBuilder } = require('discord.js');
const db = require('../utils/db.js');

async function execute(message, args) {
  const target = message.mentions.users.first();
  if (!target) {
    return message.reply('Usage: `x!send @user <amount>`');
  }
  if (target.id === message.author.id) {
    return message.reply("💸 You can't send Petals to yourself.");
  }
  if (target.bot) {
    return message.reply("🤖 Bots don't need Petals.");
  }

  const amount = parseInt(args[1], 10);
  if (!amount || amount < 1 || isNaN(amount)) {
    return message.reply('❌ Please enter a valid amount. Usage: `x!send @user <amount>`');
  }

  const senderBalance = await db.getBalance(message.author.id);
  if (senderBalance < amount) {
    return message.reply(
      `💸 You only have **${senderBalance.toLocaleString()} 🌸 Petals** — not enough to send **${amount}**.`,
    );
  }

  const ok = await db.transferBalance(message.author.id, target.id, amount);
  if (!ok) {
    return message.reply('❌ Transfer failed — please try again.');
  }

  const newBalance = await db.getBalance(message.author.id);

  const embed = new EmbedBuilder()
    .setColor(0x2ed573)
    .setTitle('🌸 Petals Sent!')
    .setDescription(
      `**${message.author.username}** sent **${amount.toLocaleString()} 🌸 Petals** to <@${target.id}>!\n\n` +
      `💰 Your new balance: **${newBalance.toLocaleString()} Petals**`,
    )
    .setTimestamp();

  await message.reply({ embeds: [embed] });
}

module.exports = {
  execute,
  name: 'send',
  aliases: ['give', 'gift'],
  description: 'Send Petals to another user.',
  usage: 'send @user <amount>',
  category: 'Economy',
};
