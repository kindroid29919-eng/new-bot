# 🚨 Expose Bot

A Discord bot with the `x!expose` command — pick a random expose message, drop it on anyone in your server, and watch the chaos unfold.

---

## 📁 Project Structure

```
discord-bot/
├── index.js               # Entry point — client setup & command router
├── package.json           # npm project config
├── .env                   # Your secrets (never commit this!)
├── .env.example           # Template for .env
│
├── commands/
│   └── expose.js          # The x!expose command handler
│
├── config/
│   └── config.js          # Colors, footers, prefix, token
│
├── data/
│   └── exposes.js         # 180+ original expose messages
│
└── utils/
    └── embedBuilder.js    # Shared embed construction helpers
```

---

## 🚀 Setup & Running

### 1. Put the Bot Token in `.env`

Copy the example file:

```bash
cp .env.example .env
```

Open `.env` and paste your token:

```env
DISCORD_TOKEN=your_real_bot_token_here
PREFIX=x!
```

> **Where do I get a token?**  
> Go to [https://discord.com/developers/applications](https://discord.com/developers/applications), open your application → **Bot** → **Reset Token**, copy it.

> ⚠️ **Enable Privileged Intents** — still in the Bot tab, scroll down to **Privileged Gateway Intents** and turn on **Message Content Intent**. Without this, the bot cannot read command messages.

---

### 2. Install Dependencies

```bash
cd discord-bot
npm install
```

---

### 3. Run the Bot

```bash
npm start
```

You should see:

```
✅  Logged in as YourBot#1234
🔧  Prefix: x!
📦  Commands loaded: expose
```

For development with auto-restart on file changes:

```bash
npm run dev
```

---

### 4. Invite the Bot to Your Server

1. Go to [https://discord.com/developers/applications](https://discord.com/developers/applications)
2. Select your application → **OAuth2** → **URL Generator**
3. Check the scopes: `bot`
4. Check the bot permissions:
   - **Read Messages / View Channels**
   - **Send Messages**
   - **Embed Links**
   - **Read Message History**
5. Copy the generated URL, open it in your browser, and invite the bot.

---

## 💬 Command Reference

| Command | Description |
|--------|-------------|
| `x!expose <name>` | Exposes a person by name |
| `x!expose @user` | Exposes a mentioned Discord user |
| `x!expose` | Returns an error asking for a target |

**The command is case-insensitive:**  
`x!expose`, `x!Expose`, `x!EXPOSE`, `x!eXpOsE` — all work.

---

## ➕ Adding More Expose Messages

1. Open `data/exposes.js`
2. Add your new message to the `exposes` array
3. Use `{target}` as the placeholder for the person's name:

```js
"{target} really watched a 30-second ad for 5 gems 💀",
"{target} says 'trust me bro' before every bad idea.",
```

4. Save the file — no restart needed if you're using `npm run dev` (nodemon).

---

## 🛡️ Security Notes

- **Never commit your `.env` file.** It's in `.gitignore` if you have one.
- If your token is ever exposed publicly, go to the Developer Portal and **regenerate it immediately**.
- The bot only requests the minimum intents it needs to function.

---

## 📝 License

MIT — do whatever you want with it.
