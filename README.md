# 247 POW Bot

A Discord bot that sits in a voice channel and stays there. That's basically it.

Built because Discord kicks you out of empty calls — this keeps the channel "active" so timers keep running and the call stays open even with nobody in it.

---

## What it does

- Joins a voice channel and stays connected 24/7
- Auto-rejoins if it gets dropped (checks every 2 minutes)
- Logs all voice activity in the server to a channel of your choice
- Has a live control panel embed with buttons so you don't have to type commands every time
- Updates its Discord status with which channel it's in and how long it's been there

---

## Commands

| Command | What it does | Who can use it |
|---|---|---|
| `/join` | Join a voice channel (or the one you're in) | Everyone |
| `/leave` | Disconnect cleanly | Everyone |
| `/forceleave` | Nuclear option — wipes all state, fixes ghost connection issues | Move Members |
| `/status` | Shows current connection info as an embed | Everyone |
| `/panel` | Posts the live control panel with buttons in the current channel | Manage Server |
| `/setlogchannel` | Sets which channel voice logs get posted to | Manage Server |

---

## Setup

### Requirements

- Node.js v18+
- A bot token from the [Discord Developer Portal](https://discord.com/developers/applications)

### Install

```bash
git clone https://github.com/OhhPOW/247-Pow-Bot
cd 247-Pow-Bot
npm install
```

Copy `.env.example` to `.env` and fill in your values:

```
BOT_TOKEN=your token here
CLIENT_ID=your application id here
```

```bash
node index.js
```

### Developer Portal settings

Make sure **Server Members Intent** is enabled under your bot's settings in the Developer Portal — it's needed for the voice logs to show member names and avatars properly.

---

## First time in a server

Once the bot is running and in your server, do these two things:

1. `/setlogchannel #channel` — pick a channel for voice activity logs
2. `/panel` — post the control panel somewhere like #bot-commands, then pin it

Both are per-server so if it's in multiple servers they're set up independently.

---

## Voice logs

The log channel will show an embed every time someone:

- Joins or leaves a voice channel
- Gets moved between channels
- Gets server muted or deafened by a mod
- Starts or stops a screen share

Self-mute and self-deafen aren't logged — that'd be way too noisy.

---

## Hosting

Currently hosted on [Discloud](https://discloud.com). The `discloud.config` is already set up so you can just zip and upload.

Config is stored in `data/guild-config.json` — this file is gitignored so it won't get wiped when you push updates.

---

## File structure

```
├── index.js               Entry point
├── deploy-commands.js     Run manually to push slash commands
├── commands/              One file per slash command
├── events/                Discord event handlers
├── src/
│   ├── client.js          Discord client setup
│   ├── connectionStore.js Tracks active VC connections + uptime
│   ├── guildConfig.js     Per-guild settings (log channel, panel etc.)
│   ├── heartbeat.js       Ghost detection + auto-rejoin
│   ├── logger.js          Timestamped logging
│   ├── registry.js        Auto-loads commands and events on startup
│   └── statusUpdater.js   Bot presence + live panel updates
└── data/                  Guild config JSON (gitignored)
```

---

## The ghost connection thing

Occasionally Discord drops the bot from a call silently — no disconnect event fires, so the bot thinks it's still connected but it isn't. This used to cause `/join` to error saying it was already in a channel when it wasn't.

The fix: the bot runs a health check every 2 minutes. If a connection is stale it destroys it and rejoins the same channel automatically. If for some reason that doesn't sort it, `/forceleave` clears everything so you can do a fresh `/join`.
