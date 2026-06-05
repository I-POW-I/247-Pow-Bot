# 24/7 POW Bot

A simple Discord bot designed to stay in voice channels indefinitely, keeping call timers active even when no users are present. Perfect for maintaining continuous voice channel sessions.

## ✨ Features
- **`/join`** — Bot joins your current voice channel (or specified channel)
- **`/stay`** — Same as join, keeps the bot persistent in the channel
- **`/leave`** — Bot disconnects from the voice channel
- **Channel Selection** — Optional parameter to specify a different voice channel
- **Auto-Reconnect** — Attempts to reconnect if disconnected unexpectedly
- **Persistent Presence** — Remains active 24/7 when hosted on Discloud

## 🚀 Quick Start
### Prerequisites
- [Node.js](https://nodejs.org/) v18+ 
- A Discord bot token ([Create bot](https://discord.com/developers/applications))
- Discord server to test in

### Installation (For Local Development/Testing)

1. **Clone or download this repository**
   ```bash
   git clone https://github.com/I-POW-I/247-Pow-Bot.git
   cd 247-Pow-Bot
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   - Copy `.env.example` to `.env`
   - Fill in your values:
   ```
   BOT_TOKEN=your_discord_bot_token
   CLIENT_ID=your_bot_application_client_id
   GUILD_ID=your_test_guild_id
   ```

4. **Run locally (optional)**
   ```bash
   npm start
   ```

> **Note:** For 24/7 hosting, deploy to Discloud instead (see section below)

## 🌐 Hosting on Discloud

This bot is hosted on [Discloud](https://discloud.com/)

1. Connect your GitHub repository to Discloud
2. Set environment variables in Discloud dashboard:
   - `BOT_TOKEN`
   - `CLIENT_ID`
   - `GUILD_ID`
3. Discloud will auto-run `npm install` and `npm start`
4. Bot runs 24/7 with automatic restarts

See `discloud.config` for hosting configuration.

## 📝 Current / Commands

```
/join                          # Join your current voice channel
/join channel: #Voice-Channel-1  # Join a specific channel
/stay                          # Same as /join (needs reworking)
/leave                         # Disconnect the bot
```

## 🔧 Development:
### Planned Features
- Voice activity tracking
- Soundboard integration
- Mod commands (kick, ban, warn)
- User statistics dashboard
- Auto-role assignment
- Streaming notifications


## ⚙️ Troubleshooting:
**Bot won't join:**
- Ensure `BOT_TOKEN`, `CLIENT_ID`, and `GUILD_ID` are correct
- Check bot has "Connect" permission in voice channels
- Verify bot is invited to your Discord server

**Bot keeps disconnecting:**
- Check Discloud uptime/logs
- Ensure environment variables are set correctly
- Bot will auto-reconnect on network issues

**Commands not showing:**
- Wait 1-2 minutes for slash commands to sync
- Try right-clicking bot and selecting "Resync"

## 📜 License
MIT License - Feel free to use and modify

## 🤝 Support
For issues or questions, check the [GitHub Issues](https://github.com/I-POW-I/247-Pow-Bot/issues)
