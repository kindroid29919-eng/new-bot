const { EmbedBuilder } = require('discord.js');
const { getRandomCharacter } = require('../utils/anilist.js');
const db = require('../utils/db.js');

const MARRY_EMOJI = '💍';
const CLAIM_WINDOW_MS = 60_000;
const MAX_PULLS_PER_HOUR = 10;

const tierColor = {
  Legendary: 0xffd700,
  Epic:      0xa855f7,
  Rare:      0xff4757,
  Uncommon:  0x2ed573,
  Common:    0x95a5a6,
};

async function execute(message) {
  const userId = message.author.id;

  const pulls = await db.pullsInLastHour(userId);
  if (pulls >= MAX_PULLS_PER_HOUR) {
    const mins = await db.minutesUntilNextSlot(userId);
    return message.reply(
      `💔 You've used all **${MAX_PULLS_PER_HOUR}** pulls this hour. ` +
        `Try again in **${mins}m**.`,
    );
  }

  const character = await getRandomCharacter();
  if (!character) {
    return message.reply("⚠️ Couldn't reach the character database right now — try again in a bit.");
  }

  // Count the pull immediately (whether or not they end up claiming it) —
  // that's what actually limits the 10/hour rate, matching a real gacha pull.
  await db.logPull(userId);

  const embed = new EmbedBuilder()
    .setColor(tierColor[character.tier.name] || 0xff85c0)
    .setTitle(`${character.tier.emoji} ${character.name}`)
    .setDescription(
      `**From:** ${character.source}\n` +
        `**Tier:** ${character.tier.emoji} ${character.tier.name}\n\n` +
        `React with ${MARRY_EMOJI} within **60 seconds** to marry them!`,
    )
    .setFooter({ text: `${pulls + 1}/${MAX_PULLS_PER_HOUR} pulls used this hour` })
    .setTimestamp();

  if (character.image) embed.setImage(character.image);

  const sent = await message.reply({ embeds: [embed] });
  await sent.react(MARRY_EMOJI);

  const collector = sent.createReactionCollector({
    filter: (reaction, user) =>
      reaction.emoji.name === MARRY_EMOJI && user.id === userId,
    time: CLAIM_WINDOW_MS,
    max: 1,
  });

  collector.on('collect', async () => {
    await db.addToHarem(userId, character);

    const marriedEmbed = EmbedBuilder.from(embed)
      .setDescription(
        `**From:** ${character.source}\n` +
          `**Tier:** ${character.tier.emoji} ${character.tier.name}\n\n` +
          `💍 Married to <@${userId}>! Check \`x!harem\` to see your collection.`,
      )
      .setColor(0x2ed573);

    await sent.edit({ embeds: [marriedEmbed] }).catch(() => {});
  });

  collector.on('end', async (collected) => {
    if (collected.size === 0) {
      const escapedEmbed = EmbedBuilder.from(embed)
        .setDescription(
          `**From:** ${character.source}\n` +
            `**Tier:** ${character.tier.emoji} ${character.tier.name}\n\n` +
            `💨 ${character.name} got away — too slow!`,
        )
        .setColor(0x636e72);
      await sent.edit({ embeds: [escapedEmbed] }).catch(() => {});
    }
    // Clean up the reaction prompt either way
    await sent.reactions.removeAll().catch(() => {});
  });
}

module.exports = {
  execute,
  name: 'waifu',
  aliases: [],
  description: 'Pull a random anime/manga character — react 💍 within 60s to marry them!',
  usage: 'waifu',
  category: 'Game',
};
