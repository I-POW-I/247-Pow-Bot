# 24/7 POW Bot

24/7 POW Bot is a polished Discord companion built to stay connected in a voice channel around the clock, preserve uptime visibility, log activity intelligently, and provide a live control panel for server management.

> A reliable voice-staying bot with moderation support, activity tracking, verification flows, and live alerts for streamers.

---

## Core capabilities

- Maintains a stable 24/7 voice connection with silent audio playback
- Auto-rejoins the last known channel after reconnects or restarts
- Tracks voice session stats and member activity over time
- Logs voice joins, leaves, moves, mutes, deafens, streams, and camera changes
- Logs deleted and edited messages for moderation visibility
- Posts a live control panel with action buttons for management tasks
- Supports streamer alerts for Kick, Twitch, and YouTube
- Persists guild configuration and session data between restarts

---

## Slash commands

| Command | What it does | Permission |
|---|---|---|
| `/panel` | Post the live control panel in the current channel | Manage Server |
| `/setlogchannel` | Route a specific log type to a chosen channel | Manage Server |
| `/status` | Show 24/7 POW Bot's current connection and uptime stats | Everyone |
| `/verify setup` | Post a verification button and assign a role | Manage Roles |
| `/addstreamer` | Add a streamer to watch and send live alerts | Manage Server |
| `/streamers` | List all watched streamers in the server | Everyone |
| `/removestreamer` | Remove a watched streamer | Manage Server |
| `/setbotrole` | Choose who can use Leave and Force Leave from the panel | Administrator |
| `/purge` | Delete a batch of messages from the current channel | Manage Messages |
| `/clearcommands` | Clear and re-register slash commands | Administrator |
| `/help` | Show a quick overview of 24/7 POW Bot and its commands | Everyone |

---

## Control panel buttons

| Button | What it does | Permission |
|---|---|---|
| 🔊 Join | Join your current VC or pick one from a dropdown | Manage Server |
| 👋 Leave | Disconnect cleanly | 24/7 POW Bot control role or server owner |
| 🔌 Force Leave | Wipe ghost state and disconnect | 24/7 POW Bot control role or server owner |
| 👤 My Info | Show your member profile and VC activity | Everyone |
| 🔍 Lookup User | Look up another member's profile | Everyone |
| 🔄 Refresh | Refresh the panel embed | Everyone |

---

## First-time setup in a server

1. `/setlogchannel type:🔊 Voice Activity channel:#your-log-channel`
2. `/setlogchannel type:🗑️ Message Deletes channel:#your-log-channel`
3. `/setlogchannel type:👥 Member Join/Leave channel:#your-log-channel`
4. `/panel` in a channel like `#bot-controls`, then pin the message for easy access
5. Optional: `/verify setup role:@Verified` to add a verification flow
6. Optional: `/setbotrole role:@Staff` to let a specific role use Leave and Force Leave

---

## Environment variables

Copy `.env.example` to `.env` and fill in your values.

```env
BOT_TOKEN=your bot token here
CLIENT_ID=your application id here
TWITCH_CLIENT_ID=
TWITCH_CLIENT_SECRET=
YOUTUBE_API_KEY=
```

The Twitch and YouTube values are optional. Kick does not require extra credentials.

---

## Hosting and persistence

Hosted on [Discloud](https://discloud.com). The `discloud.config` file handles deployment setup.

Per-guild settings are stored in `data/guild-config.json`, and SQLite tracking data is stored in `data/pow-bot.db`. These files are intended to persist between restarts, though a full redeploy can still reset runtime data depending on the host environment.

---

## File structure

```text
├── index.js                  Entry point
├── deploy-commands.js        Utility to register slash commands manually
├── commands/                 Slash commands
├── events/                   Discord event handlers
├── src/
│   ├── audioPlayer.js        Silent audio player to keep the VC alive
│   ├── client.js             Discord client and intents
│   ├── connectionStore.js    Tracks active VC connections and uptime
│   ├── guildConfig.js        Per-guild JSON config
│   ├── heartbeat.js          Ghost detection and auto-rejoin logic
│   ├── logger.js             Timestamped logging
│   ├── memberTracker.js      Tracks VC session timing for logs
│   ├── registry.js           Auto-loads commands and events
│   ├── statusUpdater.js      Presence updates and live panel rendering
│   └── streamerPoller.js     Polls Kick/Twitch/YouTube for live alerts
└── data/                     Runtime config and database files
```
