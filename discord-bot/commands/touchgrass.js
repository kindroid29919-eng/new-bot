/**
 * touchgrass.js — x!touchgrass
 * Sends a funny "go outside" message for the target.
 * Usage: x!touchgrass <name | @user>
 */

const { EmbedBuilder } = require('discord.js');
const { embedColors }  = require('../config/config');
const { randomFrom }   = require('../utils/embedBuilder');

const MESSAGES = [
  "{target} has not seen the sun since the last software update.",
  "{target}'s WiFi signal is stronger than their will to go outside.",
  "{target} once confused a park for a loading screen.",
  "{target} types faster than they walk and that's the whole problem.",
  "{target} calls natural light a 'graphics glitch'.",
  "{target} thinks 'going outside' is when the delivery arrives.",
  "{target} looked up 'grass' once and closed the tab.",
  "{target}'s longest outdoor streak was checking the mailbox.",
  "{target} heard birds outside and turned up their headphones.",
  "{target} opened the window once. The fresh air buffered.",
  "{target}'s step count peaked at the fridge and back.",
  "{target} considers scrolling to be cardio.",
  "{target} saw a butterfly once and thought it was a bug.",
  "{target} last touched grass in a loading screen tutorial.",
  "{target}'s skin tone can now be described as 'monitor glow'.",
  "{target} went outside once. It had too much lag. Uninstalled.",
  "{target} thinks trees are just nature's loading assets.",
  "{target} opened the curtains once and rated the sun 1 star for being too bright.",
  "{target}'s idea of a nature walk is switching desktop wallpapers.",
  "{target} saw a cloud and wondered what server it was connected to.",
  "{target} was invited to a picnic and asked for the IP address.",
  "{target} thought 'going for a walk' was a mobile game.",
  "{target} looked outside once and said 'the resolution is mid'.",
  "{target} heard wind and asked if there was packet loss.",
  "{target} has more hours in games than most people have spent outdoors.",
  "{target} knows every shortcut in their games but doesn't know their own street.",
  "{target} once confused a real dog for a pet in a simulation.",
  "{target} paused their game to 'go outside' and tabbed back in 30 seconds.",
  "{target} reported a squirrel for suspicious behavior.",
  "{target} thought the park had bad graphics and left.",
  "{target}'s emergency contact is their router.",
  "{target} called a campfire 'a warmth exploit'.",
  "{target} opened the door to get the package and briefly rendered the outside world.",
  "{target} has the blinds on 24/7 as a performance optimization.",
  "{target} asked if the outdoors has a dark mode.",
  "{target} went to the beach once. Called the ocean 'a big texture pool'.",
  "{target}'s 'outdoor experience' is playing games with nature sounds on.",
  "{target} went camping in a survival game and called it a vacation.",
  "{target} stood outside for 4 minutes and wrote it off as skill issue weather.",
  "{target} thought rain was a server-side event.",
  "{target} bought plants to bring nature indoors and forgot to water them.",
  "{target} asked if the park supported cross-platform.",
  "{target} once went on a walk and described it as 'unoptimized movement'.",
  "{target} opened the window for fresh air and immediately got distracted by a notification.",
  "{target}'s circadian rhythm has been reset to 'gaming hours'.",
  "{target} scheduled 'outdoor time' in their Google Calendar and then cancelled it.",
  "{target} heard kids playing outside and muted the tab.",
  "{target} owns hiking boots that have never left the box.",
  "{target} looked at a forest and calculated the render distance.",
  "{target} saw a sunset and asked if it was a limited-time event.",
  "{target} described their balcony as 'a loading zone with no content'.",
  "{target} went outside in a dream once. Logged off immediately.",
  "{target}'s allergies are almost as made-up as their reason to stay inside.",
  "{target} genuinely cannot tell if it's raining without checking an app.",
  "{target} treats the outdoors like a game they never got around to trying.",
  "{target} called a hiking trail 'unbalanced terrain with no fast travel'.",
  "{target} thought fresh air was overrated after 10 seconds of exposure.",
  "{target} set a reminder to go outside and snoozed it eleven times.",
  "{target} went to a rooftop once and said the skybox was decent.",
  "{target} has scheduled maintenance for their social battery but keeps delaying the outdoor patch.",
];

async function execute(message, args) {
  if (!args.length) {
    return message.reply({
      embeds: [new EmbedBuilder().setColor(0xff4757).setTitle('❌  Usage').setDescription('`x!touchgrass <name | @user>`').setTimestamp()],
    });
  }

  const mention = message.mentions.members?.first();
  const target  = mention ? mention.displayName : args.join(' ');

  const template = randomFrom(MESSAGES);
  const text     = template.replace(/{target}/g, target);
  const color    = randomFrom(embedColors);

  const embed = new EmbedBuilder()
    .setColor(0x2ed573)
    .setTitle('🌿  Touch Grass Advisory')
    .setDescription(`> ${text}`)
    .addFields({ name: '📋 Official Recommendation', value: 'Please step outside. Even briefly. For everyone\'s sake.' })
    .setFooter({ text: `Reported by ${message.author.tag}  •  Touch. The. Grass.` })
    .setTimestamp();

  await message.reply({ embeds: [embed] });
}

module.exports = {
  execute,
  description: 'Send a funny "go touch grass" message at someone',
  usage: 'touchgrass <name | @user>',
  category: 'Fun',
};
