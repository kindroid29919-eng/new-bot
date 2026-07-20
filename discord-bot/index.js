/**
 * index.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Entry point for the Discord bot.
 *
 * • Creates the Discord client with the minimum required intents
 * • Registers a prefix-based command router (prefix: x!)
 * • Handles button/select-menu interactions for duels and trades
 * • Initializes the Postgres-backed database
 * • Connects to Discord using the token stored in process.env
 * ─────────────────────────────────────────────────────────────────────────────
 */

const fs   = require('fs');
const path = require('path');

const { Client, GatewayIntentBits, Partials } = require('discord.js');
const { prefix, token } = require('./config/config');
const db          = require('./utils/db');
const duelEngine  = require('./utils/duelEngine');

// ── Sanity-check the token ────────────────────────────────────────────────────
if (!token) {
  console.error(
    '[ERROR] DISCORD_TOKEN is missing.\n' +
      '        Set it as an environment variable in your hosting platform.',
  );
  process.exit(1);
}

// ── Create the Discord client ─────────────────────────────────────────────────
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,       // Privileged — enable in Dev Portal
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.DirectMessages,       // Needed to send DM-based duel prompts
  ],
  partials: [Partials.Message, Partials.Channel, Partials.Reaction],
});

// ── Auto-scan command modules ─────────────────────────────────────────────────
const commands = new Map();
const aliasMap  = new Map();

const commandsDir = path.join(__dirname, 'commands');
for (const file of fs.readdirSync(commandsDir).filter(f => f.endsWith('.js'))) {
  const mod  = require(path.join(commandsDir, file));
  const name = path.basename(file, '.js');
  commands.set(name, mod);
  if (Array.isArray(mod.aliases)) {
    for (const alias of mod.aliases) aliasMap.set(alias, mod);
  }
}

// ── Event: Bot is ready ───────────────────────────────────────────────────────
client.once('ready', async () => {
  console.log(`✅  Logged in as ${client.user.tag}`);
  console.log(`🔧  Prefix: ${prefix}`);
  console.log(`📦  Commands loaded: ${[...commands.keys()].join(', ')}`);
  if (aliasMap.size) console.log(`🔀  Aliases loaded: ${[...aliasMap.keys()].join(', ')}`);

  client.user.setActivity(`${prefix}help | ${commands.size} commands`, { type: 3 /* Watching */ });

  // Give the duel engine a reference to the client (needed for DMs, channel posts)
  duelEngine.init(client);

  // Initialize the database (creates tables if missing)
  try {
    await db.init();
  } catch (err) {
    console.error('[ERROR] Database init failed:', err.message);
  }
});

// ── Event: Message received ───────────────────────────────────────────────────
client.on('messageCreate', async (message) => {
  if (message.author.bot) return;
  if (!message.content.toLowerCase().startsWith(prefix.toLowerCase())) return;

  const withoutPrefix = message.content.slice(prefix.length).trim();
  const [rawCommandName, ...args] = withoutPrefix.split(/\s+/);
  const commandName = rawCommandName.toLowerCase();

  const command = commands.get(commandName) || aliasMap.get(commandName);
  if (!command) return;

  try {
    await command.execute(message, args, commands);
  } catch (error) {
    console.error(`[ERROR] Command "${commandName}" threw an error:`, error);
    try {
      await message.reply('⚠️ Something went wrong while running that command.');
    } catch {}
  }
});

// ── Event: Button / Select-menu interactions ──────────────────────────────────
// Routes duel and trade component interactions to the appropriate handlers.
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isButton() && !interaction.isStringSelectMenu()) return;

  const { customId } = interaction;

  try {
    if (customId.startsWith('duel_')) {
      await duelEngine.handleInteraction(interaction);
    } else if (customId.startsWith('trade_')) {
      // Trade handler is exported from the trade command module
      const tradeMod = commands.get('trade');
      if (tradeMod?.handleInteraction) {
        await tradeMod.handleInteraction(interaction);
      }
    }
  } catch (err) {
    console.error('[ERROR] Interaction handler threw:', err);
    try {
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({ content: '⚠️ Something went wrong processing that action.', ephemeral: true });
      }
    } catch {}
  }
});

// ── Global error handling ─────────────────────────────────────────────────────
process.on('unhandledRejection', (reason) => {
  console.error('[UNHANDLED REJECTION]', reason);
});

// ── Connect to Discord ────────────────────────────────────────────────────────
client.login(token).catch((err) => {
  if (err.message && err.message.includes('disallowed intents')) {
    console.error('[ERROR] Privileged intent not enabled in the Discord Developer Portal.');
    console.error('');
    console.error('  The bot needs the "Message Content Intent" to read prefix commands.');
    console.error('  Fix it in 30 seconds:');
    console.error('  1. Go to https://discord.com/developers/applications');
    console.error('  2. Select your application → Bot tab');
    console.error('  3. Scroll to "Privileged Gateway Intents"');
    console.error('  4. Toggle ON "Message Content Intent"');
    console.error('  5. Click Save Changes');
  } else {
    console.error('[ERROR] Failed to log in:', err.message);
    console.error('        Make sure your DISCORD_TOKEN is correct and the bot is not banned.');
  }
  process.exit(1);
});
