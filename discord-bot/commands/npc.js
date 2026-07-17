/**
 * npc.js — x!npc
 * Pretends the user is an NPC in a video game.
 * Usage: x!npc <name | @user>
 */

const { EmbedBuilder } = require('discord.js');
const { randomFrom }   = require('../utils/embedBuilder');
const { avoidRepeat }  = require('../utils/recentCache');

const { dialogues, occupations, locations, rarities } = require('../data/npcs.json');

// Rarity → colour
function rarityColor(rarity) {
  const r = rarity.toLowerCase();
  if (/common/i.test(r))                                  return 0x95a5a6;
  if (/uncommon/i.test(r))                                return 0x2ed573;
  if (/\brave\b/i.test(r))                                return 0x74b9ff;
  if (/epic/i.test(r))                                    return 0x9b59b6;
  if (/legendary/i.test(r))                               return 0xf9ca24;
  if (/mythic/i.test(r))                                  return 0xff6348;
  if (/exotic|ancient|celestial|transcendent/i.test(r))  return 0xff9f43;
  if (/unique|one of a kind/i.test(r))                    return 0xe84393;
  if (/developer|debug|glitch|unreleased|cut/i.test(r))  return 0x2c2c54;
  if (/impossible|null|error|classified/i.test(r))       return 0x000000;
  return 0xa29bfe;
}

// Rarity → badge emoji
function rarityBadge(rarity) {
  const r = rarity.toLowerCase();
  if (/common/i.test(r))                   return '⬜';
  if (/uncommon/i.test(r))                 return '🟩';
  if (/\brave\b/i.test(r))                 return '🟦';
  if (/epic/i.test(r))                     return '🟪';
  if (/legendary/i.test(r))               return '🟨';
  if (/mythic/i.test(r))                   return '🟧';
  if (/exotic|celestial|transcendent/i.test(r)) return '✨';
  if (/unique|one of a kind/i.test(r))    return '💎';
  if (/developer|debug|glitch/i.test(r))  return '🛠️';
  if (/null|error/i.test(r))              return '❌';
  if (/classified|redacted/i.test(r))     return '🔒';
  return '🔮';
}

async function execute(message, args) {
  if (!args.length) {
    return message.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(0xff4757)
          .setTitle('❌  Usage')
          .setDescription('`x!npc <name | @user>`')
          .setTimestamp(),
      ],
    });
  }

  const mention = message.mentions.members?.first();
  const target  = mention ? mention.displayName : args.join(' ');

  const result = avoidRepeat('npc', () => {
    const dialogue   = randomFrom(dialogues);
    const occupation = randomFrom(occupations);
    const location   = randomFrom(locations);
    const rarity     = randomFrom(rarities);
    return JSON.stringify({ dialogue, occupation, location, rarity });
  });

  const { dialogue, occupation, location, rarity } = JSON.parse(result);
  const badge = rarityBadge(rarity);

  const embed = new EmbedBuilder()
    .setColor(rarityColor(rarity))
    .setTitle('🎮  NPC Profile')
    .setDescription(`*Scanning entity: **${target}**...*`)
    .addFields(
      { name: '🧑 Name',        value: target,                       inline: true },
      { name: '⚒️ Occupation',  value: occupation,                   inline: true },
      { name: `${badge} Rarity`, value: rarity,                      inline: true },
      { name: '📍 Location',    value: location,                     inline: false },
      { name: '💬 Dialogue',    value: `*"${dialogue}"*`,            inline: false },
    )
    .setFooter({ text: `Scanned by ${message.author.tag}  •  Press [E] to interact` })
    .setTimestamp();

  await message.reply({ embeds: [embed] });
}

module.exports = {
  execute,
  description: 'Generate an NPC profile for a user',
  usage: 'npc <name | @user>',
  category: 'Fun',
};
