/**
 * index.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Entry point for the Discord bot.
 *
 * • Creates the Discord client with the minimum required intents
 * • Registers a prefix-based command router (prefix: x!)
 * • Initializes the Postgres-backed harem/gacha game database
 * • Connects to Discord using the token stored in process.env
 * ─────────────────────────────────────────────────────────────────────────────
 */

const fs   = require('fs');
const path = require('path');

const { Client, GatewayIntentBits, Partials } = require('discord.js');
const { prefix, token } = require('./config/config');
const db = require('./utils/db');

// ── Sanity-check the token ────────────────────────────────────────────────────
if (!token) {
  console.error(
    '[ERROR] DISCORD_TOKEN is missing.\n' +
      '        Set it as an environment variable in your hosting platform.',
  );
  process.exit(1);
}

// ── Create the Discord client ─────────────────────────────────────────────────
// GatewayIntentBits tells Discord which events we want to receive.
// MessageContent is required to read the text of messages (privileged intent —
// you must enable it in the Discord Developer Portal under Bot > Privileged Intents).
// GuildMessageReactions is required for the x!waifu marry-claim reaction flow.
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,             // Access guild (server) data
    GatewayIntentBits.GuildMessages,      // Receive message events in guilds
    GatewayIntentBits.MessageContent,     // Read message content (PRIVILEGED — enable in Dev Portal)
    GatewayIntentBits.GuildMembers,       // Needed for member count / moderation targets
    GatewayIntentBits.GuildMessageReactions, // Needed for the x!waifu 💍 claim reaction
  ],
  partials: [Partials.Message, Partials.Channel, Partials.Reaction],
});

// ── Auto-scan command modules ─────────────────────────────────────────────────
// Every .js file dropped into commands/ is loaded automatically.
// A command file must export { execute }.
// Optional exports:  aliases (string[]), description, usage, category.
const commands = new Map();   // commandName  → module
const aliasMap = new Map();   // aliasName    → module

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

  // Set the bot's activity status
  client.user.setActivity(`${prefix}help | ${commands.size} commands`, { type: 3 /* Watching */ });

  // Initialize the harem/gacha game database (creates tables if missing)
  try {
    await db.init();
  } catch (err) {
    console.error('[ERROR] Database init failed — x!waifu/x!harem will not work:', err.message);
  }
});

// ── Event: Message received ───────────────────────────────────────────────────
client.on('messageCreate', async (message) => {
  // Ignore messages from bots (prevents loops) and messages without the prefix
  if (message.author.bot) return;
  if (!message.content.toLowerCase().startsWith(prefix.toLowerCase())) return;

  // Parse the command name and arguments
  // e.g. "x!Expose Ahad" → commandName = "expose", args = ["Ahad"]
  const withoutPrefix = message.content.slice(prefix.length).trim();
  const [rawCommandName, ...args] = withoutPrefix.split(/\s+/);
  const commandName = rawCommandName.toLowerCase(); // case-insensitive matching

  // Look up the command handler (by name or alias)
  const command = commands.get(commandName) || aliasMap.get(commandName);

  if (!command) {
    // Unknown command — silently ignore (no spam for typos)
    return;
  }

  // Execute the command, passing the commands map so help can read it dynamically
  try {
    await command.execute(message, args, commands);
  } catch (error) {
    console.error(`[ERROR] Command "${commandName}" threw an error:`, error);

    // Attempt to notify the user something went wrong
    try {
      await message.reply('⚠️ Something went wrong while running that command.');
    } catch {
      // If even the error message fails, just log it
    }
  }
});

// ── Global error handling ─────────────────────────────────────────────────────
// Prevents the bot from crashing on unhandled promise rejections
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
    console.error('  6. The workflow will restart automatically.');
  } else {
    console.error('[ERROR] Failed to log in:', err.message);
    console.error('        Make sure your DISCORD_TOKEN is correct and the bot is not banned.');
  }
  process.exit(1);
});
