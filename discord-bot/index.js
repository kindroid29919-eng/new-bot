/**
 * index.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Entry point for the Discord bot.
 *
 * • Loads environment variables from .env via dotenv
 * • Creates the Discord client with the minimum required intents
 * • Registers a prefix-based command router (prefix: x!)
 * • Connects to Discord using the token stored in .env
 * ─────────────────────────────────────────────────────────────────────────────
 */

// Load .env variables when running locally (no-op if .env doesn't exist,
// e.g. on Replit where secrets are already in process.env via the vault).
require('dotenv').config({ override: false });

const { Client, GatewayIntentBits, Partials } = require('discord.js');
const { prefix, token } = require('./config/config');

// ── Sanity-check the token ────────────────────────────────────────────────────
if (!token) {
  console.error(
    '[ERROR] DISCORD_TOKEN is missing from your .env file.\n' +
      '        Copy .env.example to .env and paste your bot token.',
  );
  process.exit(1);
}

// ── Create the Discord client ─────────────────────────────────────────────────
// GatewayIntentBits tells Discord which events we want to receive.
// MessageContent is required to read the text of messages (privileged intent —
// you must enable it in the Discord Developer Portal under Bot > Privileged Intents).
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,          // Access guild (server) data
    GatewayIntentBits.GuildMessages,   // Receive message events in guilds
    GatewayIntentBits.MessageContent,  // Read message content (PRIVILEGED — enable in Dev Portal)
  ],
  partials: [Partials.Message, Partials.Channel],
});

// ── Load command modules ──────────────────────────────────────────────────────
// Each command lives in commands/<name>.js and exports an execute() function.
const commands = {
  expose: require('./commands/expose'),
};

// ── Event: Bot is ready ───────────────────────────────────────────────────────
client.once('ready', () => {
  console.log(`✅  Logged in as ${client.user.tag}`);
  console.log(`🔧  Prefix: ${prefix}`);
  console.log(`📦  Commands loaded: ${Object.keys(commands).join(', ')}`);

  // Set the bot's activity status
  client.user.setActivity(`${prefix}expose | Watching 👀`, { type: 3 /* Watching */ });
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

  // Look up the command handler
  const command = commands[commandName];

  if (!command) {
    // Unknown command — silently ignore (no spam for typos)
    return;
  }

  // Execute the command, catching any unexpected errors
  try {
    await command.execute(message, args);
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
  console.error('[ERROR] Failed to log in:', err.message);
  console.error(
    '        Make sure your DISCORD_TOKEN in .env is correct and the bot is not banned.',
  );
  process.exit(1);
});
