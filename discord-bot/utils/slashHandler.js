/**
 * slashHandler.js — Slash command deployment and bridge for Xoul.
 * ─────────────────────────────────────────────────────────────────────────────
 * Provides a small set of polished slash commands and a catch-all `/x` command
 * that lets users run any existing prefix command from a slash interaction.
 * Also hosts a lightweight HTTP listener for top.gg vote webhooks.
 */

const {
  REST, Routes, SlashCommandBuilder, Collection, EmbedBuilder,
} = require('discord.js');
const http = require('http');
const db = require('./db');
const { prefix, token } = require('../config/config');

const VOTE_REWARD = db.VOTE_REWARD;

// ── Slash command definitions ─────────────────────────────────────────────────
const slashCommands = [
  new SlashCommandBuilder()
    .setName('x')
    .setDescription('Run any Xoul command using x! syntax')
    .addStringOption(o =>
      o.setName('command')
        .setDescription('Command name, e.g. daily, waifu, leaderboard')
        .setRequired(true))
    .addUserOption(o =>
      o.setName('user')
        .setDescription('Target user for commands like duel or trade')
        .setRequired(false))
    .addStringOption(o =>
      o.setName('args')
        .setDescription('Extra arguments, e.g. "10" or "richest global"')
        .setRequired(false)),
  new SlashCommandBuilder()
    .setName('vote')
    .setDescription('Get the top.gg vote link and reward info for Xoul'),
  new SlashCommandBuilder()
    .setName('voteclaim')
    .setDescription('Claim your Petal reward for voting on top.gg'),
  new SlashCommandBuilder()
    .setName('daily')
    .setDescription('Claim your daily Petals'),
  new SlashCommandBuilder()
    .setName('weekly')
    .setDescription('Claim your weekly Petals'),
  new SlashCommandBuilder()
    .setName('balance')
    .setDescription('Check your Petal balance')
    .addUserOption(o => o.setName('user').setDescription('Optional user to check').setRequired(false)),
  new SlashCommandBuilder()
    .setName('leaderboard')
    .setDescription('View a server or global leaderboard')
    .addStringOption(o =>
      o.setName('category')
        .setDescription('Leaderboard category')
        .setRequired(false)
        .addChoices(
          { name: 'Richest', value: 'richest' },
          { name: 'Biggest Harem', value: 'harem' },
          { name: 'Duel Wins', value: 'duel' },
          { name: 'Warfare Wins', value: 'warfare' },
          { name: 'Total Pulls', value: 'pulls' },
        ))
    .addStringOption(o =>
      o.setName('scope')
        .setDescription('Server or global ranking')
        .setRequired(false)
        .addChoices({ name: 'Server', value: 'server' }, { name: 'Global', value: 'global' })),
  new SlashCommandBuilder()
    .setName('achievements')
    .setDescription('View your achievements')
    .addUserOption(o => o.setName('user').setDescription('Optional user to view').setRequired(false)),
];

// ── Deploy slash commands and start webhook listener ───────────────────────────
async function init(client, commands) {
  const rest = new REST({ version: '10' }).setToken(token);
  await rest.put(
    Routes.applicationCommands(client.user.id),
    { body: slashCommands.map(c => c.toJSON()) },
  );
  console.log(`⚡ Deployed ${slashCommands.length} slash commands for Xoul`);

  // Start the top.gg webhook listener
  const port = process.env.PORT || 3000;
  const server = http.createServer((req, res) => {
    if (req.method !== 'POST' || req.url !== '/webhook/topgg') {
      res.writeHead(404).end();
      return;
    }
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const secret = process.env.TOPGG_WEBHOOK_SECRET;
        if (secret && req.headers.authorization !== secret) {
          res.writeHead(401).end('Unauthorized');
          return;
        }
        const payload = JSON.parse(body);
        if (payload.user) {
          await db.recordVote(String(payload.user), VOTE_REWARD);
          console.log(`[top.gg] Vote recorded for ${payload.user}`);
        }
        res.writeHead(200).end('OK');
      } catch (err) {
        console.error('[top.gg webhook]', err);
        res.writeHead(400).end('Bad Request');
      }
    });
  });
  server.listen(port, () => {
    console.log(`🌐 Top.gg webhook listener ready on port ${port}`);
    if (!process.env.TOPGG_WEBHOOK_SECRET) {
      console.log('⚠️ Set TOPGG_WEBHOOK_SECRET to secure the webhook endpoint');
    }
  });
}

// ── Route incoming slash interactions ─────────────────────────────────────────
async function handle(interaction, commands) {
  const { commandName } = interaction;
  if (commandName === 'x') return handleX(interaction, commands);
  if (commandName === 'vote') return handleVote(interaction);
  if (commandName === 'voteclaim') return handleVoteClaim(interaction);
  if (commandName === 'daily') return runPrefix('daily', interaction, commands, []);
  if (commandName === 'weekly') return runPrefix('weekly', interaction, commands, []);
  if (commandName === 'balance') return runBalance(interaction, commands);
  if (commandName === 'leaderboard') return runLeaderboard(interaction, commands);
  if (commandName === 'achievements') return runAchievements(interaction, commands);
}

// ── Dedicated slash handlers ───────────────────────────────────────────────────
async function handleVote(interaction) {
  const clientId = interaction.client.user.id;
  const avatar = interaction.client.user.avatar;
  const avatarUrl = avatar
    ? `https://cdn.discordapp.com/avatars/${clientId}/${avatar}.png?size=256`
    : null;

  const embed = new EmbedBuilder()
    .setColor(0xff85c0)
    .setTitle('🗳️ Vote for Xoul on top.gg')
    .setDescription(
      `Vote every **${db.VOTE_COOLDOWN_HOURS} hours** to earn **${VOTE_REWARD} 🌸 Petals**!\n\n` +
      `👉 [Click here to vote](https://top.gg/bot/${clientId}/vote)\n\n` +
      `After voting, run \`/voteclaim\` or \`${prefix}voteclaim\` to collect your reward.`,
    )
    .setTimestamp();
  if (avatarUrl) embed.setThumbnail(avatarUrl);

  await interaction.reply({ embeds: [embed] });
}

async function handleVoteClaim(interaction) {
  const result = await db.claimVoteReward(interaction.user.id);
  const clientId = interaction.client.user.id;
  const embed = new EmbedBuilder();

  if (result.error === 'no_vote') {
    embed
      .setColor(0xff4757)
      .setTitle('🗳️ No vote found')
      .setDescription(
        `No recent vote found. [Vote for Xoul](https://top.gg/bot/${clientId}/vote) and then claim your reward!`,
      );
  } else if (result.error === 'cooldown') {
    embed
      .setColor(0xff4757)
      .setTitle('⏳ Already claimed')
      .setDescription(`You already claimed your vote reward. Come back in **${result.hoursLeft} hours**.`);
  } else {
    const balance = await db.getBalance(interaction.user.id);
    embed
      .setColor(0xff85c0)
      .setTitle('🌸 Vote Reward Claimed!')
      .setDescription(
        `You received **${result.reward} 🌸 Petals**!\n\n` +
        `💰 **Balance:** ${balance.toLocaleString()} Petals`,
      );
  }

  await interaction.reply({ embeds: [embed] });
}

async function runBalance(interaction, commands) {
  const target = interaction.options.getUser('user') || interaction.user;
  return runPrefix('balance', interaction, commands, [], { targetUser: target });
}

async function runLeaderboard(interaction, commands) {
  const category = interaction.options.getString('category') || 'richest';
  const scope = interaction.options.getString('scope') || 'server';
  return runPrefix('leaderboard', interaction, commands, [category, scope]);
}

async function runAchievements(interaction, commands) {
  const target = interaction.options.getUser('user');
  const args = target ? [`<@${target.id}>`] : [];
  return runPrefix('achievements', interaction, commands, args, { targetUser: target });
}

// ── /x catch-all ───────────────────────────────────────────────────────────────
async function handleX(interaction, commands) {
  const commandName = interaction.options.getString('command').toLowerCase().trim();
  const target = interaction.options.getUser('user');
  const argsStr = interaction.options.getString('args') || '';

  const command = commands.get(commandName) || getAlias(commandName, commands);
  if (!command || typeof command.execute !== 'function') {
    return interaction.reply({ content: `❌ Unknown command: \`${commandName}\``, ephemeral: true });
  }

  const args = [];
  if (argsStr.trim()) args.push(...argsStr.trim().split(/\s+/));
  if (target) args.push(`<@${target.id}>`);

  return runPrefix(commandName, interaction, commands, args, { targetUser: target });
}

// ── Shared prefix-to-slash bridge ──────────────────────────────────────────────
async function runPrefix(commandName, interaction, commands, args, { targetUser } = {}) {
  const command = commands.get(commandName) || getAlias(commandName, commands);
  if (!command || typeof command.execute !== 'function') {
    return interaction.reply({ content: `❌ Command \`${commandName}\` is not available.`, ephemeral: true });
  }

  await interaction.deferReply({ fetchReply: false });
  let replied = false;

  const mentionsUsers = new Collection();
  if (targetUser) mentionsUsers.set(targetUser.id, targetUser);
  const mentions = {
    users: mentionsUsers,
    members: new Collection(),
    channels: new Collection(),
    roles: new Collection(),
    has: (id, type) => type === 'users' && mentionsUsers.has(id),
  };
  mentions.users.first = () => mentionsUsers.first();
  mentions.users.get = id => mentionsUsers.get(id);

  const fakeMessage = {
    author: interaction.user,
    member: interaction.member,
    guild: interaction.guild,
    channel: interaction.channel,
    client: interaction.client,
    content: `${prefix}${commandName}${args.length ? ' ' + args.join(' ') : ''}`,
    mentions,
    async reply(options) {
      if (!replied) {
        replied = true;
        return interaction.editReply(options);
      }
      return interaction.followUp(options);
    },
    async channelSend(options) {
      return interaction.channel.send(options);
    },
  };

  try {
    await command.execute(fakeMessage, args, commands);
  } catch (err) {
    console.error(`[slash] ${commandName} failed:`, err);
    if (!replied) {
      await interaction.editReply({ content: '⚠️ Something went wrong running that command.' });
    } else {
      await interaction.followUp({ content: '⚠️ Something went wrong running that command.' });
    }
  }
}

function getAlias(name, commands) {
  for (const mod of commands.values()) {
    if (Array.isArray(mod.aliases) && mod.aliases.includes(name)) return mod;
  }
  return null;
}

module.exports = { init, handle };
