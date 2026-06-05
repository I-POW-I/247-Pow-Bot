# 24/7 POW Bot

Discord bot that stays in voice channels to keep call timers active.

## Features
- `/join` or `/stay` to make the bot join a voice channel and stay there
- `/leave` to make the bot leave the voice channel
- Optional `channel` parameter lets you pick a specific voice channel instead of using your current channel
- Example: `/join channel:#General`

## Setup
- Create a `.env` file with (copy from `.env.example`):
   
   ```
   BOT_TOKEN=your_discord_bot_token
   CLIENT_ID=your_bot_application_client_id
   GUILD_ID=your_test_guild_id
   ```

## Discloud
- Hosted on Discloud. See `discloud.config`.
- Upload this repository to Discloud or connect it to a GitHub repo.
- Set environment variables in Discloud: `BOT_TOKEN`, `CLIENT_ID`, `GUILD_ID`.
- Use `npm install` and `npm start` as the startup command.

## Notes
- The bot joins with or without a user is in a voice channel.
- It will stay until `/leave` is used or the connection to the host (discloud) is down.
- Extra commands / features & more logging can be added if needed.
- Has issues currently I think due to what the current discloud logs show... Unsure why though, Because it's just a very simple discord bot.
- Only keeps the discord voice channel timer going, More to be added to the bot soon.
- Designed for 24/7 hosting using Discloud (For now due to the bot keeps crashing every few days or so)
