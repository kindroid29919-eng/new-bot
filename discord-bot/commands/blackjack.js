/**
 * blackjack.js — x!blackjack [amount]
 * Standard Blackjack vs the house. Max bet: 60 Petals.
 * Hit or Stand via buttons (collector on the message — no global routing needed).
 * Blackjack (21 in 2 cards) pays 1.5×. Regular win pays 1×. Tie = refund.
 */

const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const db = require('../utils/db.js');

const MAX_BET = 60;
const SUITS   = ['♠', '♥', '♦', '♣'];
const RANKS   = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

function drawCard() {
  return {
    rank: RANKS[Math.floor(Math.random() * RANKS.length)],
    suit: SUITS[Math.floor(Math.random() * SUITS.length)],
  };
}

function cardValue(rank) {
  if (['J', 'Q', 'K'].includes(rank)) return 10;
  if (rank === 'A') return 11;
  return parseInt(rank, 10);
}

function handTotal(hand) {
  let total = hand.reduce((s, c) => s + cardValue(c.rank), 0);
  let aces  = hand.filter(c => c.rank === 'A').length;
  while (total > 21 && aces > 0) { total -= 10; aces--; }
  return total;
}

function handStr(hand, hideSecond = false) {
  return hand.map((c, i) => (i === 1 && hideSecond) ? '🂠' : `${c.rank}${c.suit}`).join('  ');
}

function buildButtons(disabled = false) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('bj_hit').setLabel('👊 Hit').setStyle(ButtonStyle.Danger).setDisabled(disabled),
    new ButtonBuilder().setCustomId('bj_stand').setLabel('🤚 Stand').setStyle(ButtonStyle.Primary).setDisabled(disabled),
  );
}

async function execute(message, args) {
  const bet = parseInt(args[0], 10);

  // No-bet version
  if (!bet || isNaN(bet)) {
    return message.reply(`🃏 **Blackjack** — bet up to **${MAX_BET} 🌸 Petals**!\nUsage: \`x!blackjack 30\``);
  }

  if (bet < 1 || bet > MAX_BET) return message.reply(`🚫 Bet must be between **1** and **${MAX_BET} Petals**.`);

  const balance = await db.getBalance(message.author.id);
  if (balance < bet) {
    return message.reply(`💸 You only have **${balance} 🌸 Petals**. Use \`x!daily\` to earn more!`);
  }

  // Deal initial hands
  const playerHand = [drawCard(), drawCard()];
  const dealerHand = [drawCard(), drawCard()];

  const playerTotal  = handTotal(playerHand);
  const isBlackjack  = playerTotal === 21 && playerHand.length === 2;

  // Check immediate blackjack
  if (isBlackjack) {
    const dealerTotal = handTotal(dealerHand);
    const dealerBJ    = dealerTotal === 21 && dealerHand.length === 2;

    if (dealerBJ) {
      // Push (tie — both blackjack)
      const embed = new EmbedBuilder()
        .setColor(0xffa502)
        .setTitle('🃏 Blackjack — Push!')
        .setDescription(
          `**Your hand:** ${handStr(playerHand)} = **21** 🎉\n` +
          `**Dealer:** ${handStr(dealerHand)} = **21**\n\n` +
          `Both got Blackjack — your bet is returned.`,
        ).setTimestamp();
      return message.reply({ embeds: [embed] });
    }

    // Player blackjack wins 1.5×
    const winnings = Math.ceil(bet * 1.5);
    await db.addBalance(message.author.id, winnings);
    const newBal = await db.getBalance(message.author.id);
    const embed = new EmbedBuilder()
      .setColor(0xffd700)
      .setTitle('🃏 Blackjack — BLACKJACK! 🎉')
      .setDescription(
        `**Your hand:** ${handStr(playerHand)} = **21** ⭐\n` +
        `**Dealer:** ${handStr(dealerHand)} = **${dealerTotal}**\n\n` +
        `**+${winnings} 🌸 Petals** (1.5× payout)\n💰 Balance: **${newBal.toLocaleString()} Petals**`,
      ).setTimestamp();
    return message.reply({ embeds: [embed] });
  }

  // Build the game message with buttons
  const gameEmbed = () => new EmbedBuilder()
    .setColor(0x2e86de)
    .setTitle('🃏 Blackjack')
    .setDescription(
      `**Your hand:** ${handStr(playerHand)} = **${handTotal(playerHand)}**\n` +
      `**Dealer:** ${handStr(dealerHand, true)} = **${cardValue(dealerHand[0].rank)}+?**\n\n` +
      `Bet: **${bet} 🌸 Petals** | Hit to draw, Stand to end.`,
    )
    .setFooter({ text: 'You have 30 seconds to decide.' });

  const sent = await message.reply({ embeds: [gameEmbed()], components: [buildButtons()] });

  const collector = sent.createMessageComponentCollector({
    filter: i => i.user.id === message.author.id && (i.customId === 'bj_hit' || i.customId === 'bj_stand'),
    time: 30_000,
  });

  let playerBust = false;

  collector.on('collect', async (interaction) => {
    await interaction.deferUpdate();

    if (interaction.customId === 'bj_hit') {
      playerHand.push(drawCard());
      const total = handTotal(playerHand);

      if (total > 21) {
        playerBust = true;
        collector.stop('bust');
      } else if (total === 21) {
        collector.stop('stand');
      } else {
        await sent.edit({ embeds: [gameEmbed()], components: [buildButtons()] }).catch(() => {});
      }
    } else {
      collector.stop('stand');
    }
  });

  collector.on('end', async (_, reason) => {
    const playerTotal = handTotal(playerHand);

    // Dealer draws (hits until ≥17)
    while (handTotal(dealerHand) < 17) dealerHand.push(drawCard());
    const dealerTotal = handTotal(dealerHand);
    const dealerBust  = dealerTotal > 21;

    let resultTitle, resultColor, net;

    if (playerBust || reason === 'bust') {
      resultTitle = '💀 Bust! You lose.';
      resultColor = 0xff4757;
      net = -bet;
    } else if (dealerBust || playerTotal > dealerTotal) {
      resultTitle = '🎉 You Win!';
      resultColor = 0x2ed573;
      net = bet;
    } else if (playerTotal === dealerTotal) {
      resultTitle = '🤝 Push — Tie!';
      resultColor = 0xffa502;
      net = 0;
    } else {
      resultTitle = '💔 Dealer Wins';
      resultColor = 0xff4757;
      net = -bet;
    }

    if (net > 0) await db.addBalance(message.author.id, net).catch(() => {});
    else if (net < 0) await db.deductBalance(message.author.id, Math.abs(net)).catch(() => {});

    const newBal = await db.getBalance(message.author.id);
    const changeStr = net > 0 ? `**+${net}** 🌸 Petals` : net < 0 ? `**${net}** 🌸 Petals` : 'Bet returned';

    const finalEmbed = new EmbedBuilder()
      .setColor(resultColor)
      .setTitle(`🃏 Blackjack — ${resultTitle}`)
      .setDescription(
        `**Your hand:** ${handStr(playerHand)} = **${playerTotal}${playerTotal > 21 ? ' 💥 BUST' : ''}**\n` +
        `**Dealer:** ${handStr(dealerHand)} = **${dealerTotal}${dealerBust ? ' 💥 BUST' : ''}**\n\n` +
        `${changeStr}\n💰 Balance: **${newBal.toLocaleString()} Petals**`,
      )
      .setTimestamp();

    await sent.edit({ embeds: [finalEmbed], components: [buildButtons(true)] }).catch(() => {});
  });
}

module.exports = {
  execute,
  name: 'blackjack',
  aliases: ['bj', '21'],
  description: `Bet up to ${MAX_BET} Petals in Blackjack vs the house. Blackjack pays 1.5×!`,
  usage: 'blackjack [amount]',
  category: 'Economy',
};
