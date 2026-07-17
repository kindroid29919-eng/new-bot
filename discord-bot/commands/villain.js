/**
 * villain.js — x!villain
 * Creates a complete supervillain profile for a user.
 * Usage: x!villain <name | @user>
 */

const { EmbedBuilder } = require('discord.js');
const { randomFrom }   = require('../utils/embedBuilder');
const { avoidRepeat }  = require('../utils/recentCache');

const { names, powers, weaknesses, threatLevels } = require('../data/villains.json');

// Threat level → embed colour
function threatColor(level) {
  const l = level.toLowerCase();
  if (/harmless|annoying|mild/i.test(l))        return 0x2ed573;
  if (/persistent|regional|concern/i.test(l))   return 0xfdcb6e;
  if (/national|international|global/i.test(l)) return 0xffa502;
  if (/world|civilisation|reality/i.test(l))    return 0xff4757;
  if (/galactic|universal|cosmic|existential|beyond|infinite|classified|redacted|null/i.test(l)) return 0x6c5ce7;
  return 0xff6348;
}

async function execute(message, args) {
  if (!args.length) {
    return message.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(0xff4757)
          .setTitle('❌  Usage')
          .setDescription('`x!villain <name | @user>`')
          .setTimestamp(),
      ],
    });
  }

  const mention = message.mentions.members?.first();
  const target  = mention ? mention.displayName : args.join(' ');

  const result = avoidRepeat('villain', () => {
    const name      = randomFrom(names);
    const power     = randomFrom(powers);
    const weakness  = randomFrom(weaknesses);
    const threat    = randomFrom(threatLevels);
    return JSON.stringify({ name, power, weakness, threat });
  });

  const { name, power, weakness, threat } = JSON.parse(result);

  const embed = new EmbedBuilder()
    .setColor(threatColor(threat))
    .setTitle('🦹  Villain Profile')
    .setDescription(`The dossier on **${target}** has been declassified.`)
    .addFields(
      { name: '🎭 Villain Name',  value: name,     inline: true },
      { name: '☠️ Threat Level', value: threat,   inline: true },
      { name: '\u200B',          value: '\u200B', inline: false },
      { name: '⚡ Power',        value: power,    inline: false },
      { name: '💧 Weakness',     value: weakness, inline: false },
    )
    .setFooter({ text: `Profiled by ${message.author.tag}  •  Purely fictional` })
    .setTimestamp();

  await message.reply({ embeds: [embed] });
}

module.exports = {
  execute,
  description: 'Generate a supervillain profile for a user',
  usage: 'villain <name | @user>',
  category: 'Fun',
};
