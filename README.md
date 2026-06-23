# 24/7 POW Bot

A Discord bot that sits in a voice channel and stays there 24/7. Keeps call timers running, logs all voice activity, and manages itself through a live control panel.

---

## What it does

- Joins a voice channel and stays connected permanently
- Plays a silent audio stream to prevent Discord from dropping the connection
- Auto-rejoins if dropped — heartbeat checks every 2 minutes
- Auto-rejoins the last known channel on restart
- Logs all voice activity to a chosen channel
- Logs deleted messages
- Live control panel embed with buttons — no commands needed day-to-day
- Updates its Discord status with the channel name and uptime
- Persists uptime stats across restarts

---

## Commands

| Command | What it does | Permission |
|---|---|---|
| `/panel` | Post the live control panel in this channel | Manage Server |
| `/setlogchannel` | Set which channel a log type posts to | Manage Server |
| `/status` | Show current connection stats | Everyone |
| `/clearcommands` | Force clear and re-register all slash commands | Administrator |

---

## Control Panel Buttons

| Button | What it does | Permission |
|---|---|---|
| 🔊 Join | Join your current VC, or pick one from a dropdown | Manage Server |
| 👋 Leave | Clean disconnect | Manage Server |
| 🔌 Force Leave | Wipes all state — fixes ghost connection issues | Manage Server |
| 📊 Stats | Shows detailed bot stats | Everyone |
| 🔄 Refresh | Refreshes the panel embed | Everyone |

---

## First time setup in a server

1. `/setlogchannel type:🔊 Voice Activity channel:#your-log-channel`
2. `/setlogchannel type:🗑️ Message Deletes channel:#your-log-channel`
3. `/setlogchannel type:👥 Member Join/Leave channel:#your-log-channel`
4. `/panel` — run this in a channel like #bot-controls, then pin the message

Each server is configured independently.

---

## Voice logs

Posts a coloured embed when someone:

- Joins or leaves a voice channel (shows how long they were in)
- Gets moved between channels (shows if a mod did it)
- Gets server muted or deafened (shows who did it)
- Starts or stops a screen share (shows how long they streamed)

Self-mute and self-deafen are not logged.

---

## Developer Portal — required intents

Under **Bot → Privileged Gateway Intents**, enable:
- **Server Members Intent** — member info in voice logs
- **Message Content Intent** — read content of deleted messages

---

## Environment variables

```
BOT_TOKEN=your bot token here
CLIENT_ID=your application id here
```

---

## Hosting

Hosted on [Discloud](https://discloud.com). The `discloud.config` handles the setup.

Per-guild config is stored in `data/guild-config.json` — this folder is gitignored and persists on Discloud between restarts. A full GitHub redeploy will reset it.

---

## File structure

```
├── index.js                  Entry point
├── deploy-commands.js        Utility — register commands manually if needed
├── commands/                 One file per slash command
├── events/                   Discord event handlers
├── src/
│   ├── audioPlayer.js        Silent PCM stream — keeps connection alive
│   ├── client.js             Discord client + intents
│   ├── connectionStore.js    Tracks active VC connections and uptime
│   ├── guildConfig.js        Per-guild JSON config (log channels, panel, stats)
│   ├── heartbeat.js          Ghost detection and auto-rejoin
│   ├── logger.js             Timestamped logging
│   ├── memberTracker.js      Tracks member VC join times for duration logs
│   ├── registry.js           Auto-loads commands and events
│   └── statusUpdater.js      Discord presence + live panel updates
└── data/                     Runtime config — gitignored, persists on host
```
