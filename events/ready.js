const { Events } = require('discord.js');
const { joinVoiceChannel } = require('@discordjs/voice');
const { log }                    = require('../src/logger');
const { startHeartbeat, attachDisconnectHandler } = require('../src/heartbeat');
const { startStatusUpdater, updatePanel } = require('../src/statusUpdater');
const { getGuildConfig }         = require('../src/guildConfig');
const store                      = require('../src/connectionStore');

module.exports = {
  name: Events.ClientReady,
  once: true,

  async execute(client) {
    log('INFO', `Logged in as ${client.user.tag}`);
    log('INFO', `Serving ${client.guilds.cache.size} guild(s)`);

    // ── Register slash commands globally ──────────────────────────────────────
    try {
      const { REST, Routes } = require('discord.js');
      const rest = new REST({ version: '10' }).setToken(process.env.BOT_TOKEN);
      const commandData = [...client.commands.values()].map(cmd => cmd.data.toJSON());
      await rest.put(Routes.applicationCommands(process.env.CLIENT_ID), { body: commandData });
      log('INFO', `Registered ${commandData.length} global slash command(s)`);
    } catch (err) {
      log('ERROR', 'Failed to register slash commands', { error: err.message });
    }

    // ── Auto-rejoin last known channels ───────────────────────────────────────
    // Loops every guild the bot is in, checks guild-config.json for a saved
    // lastChannelId, and rejoins it automatically if found.
    log('INFO', 'Checking for channels to auto-rejoin...');
    let rejoined = 0;

    for (const guild of client.guilds.cache.values()) {
      const config = getGuildConfig(guild.id);
      if (!config.lastChannelId) continue;

      try {
        const channel = await guild.channels.fetch(config.lastChannelId);

        if (!channel || !channel.isVoiceBased()) {
          log('WARN', 'Saved channel no longer exists — skipping auto-rejoin', { guild: guild.name });
          continue;
        }

        const connection = joinVoiceChannel({
          channelId:      channel.id,
          guildId:        guild.id,
          adapterCreator: guild.voiceAdapterCreator,
          selfDeaf:       true,
          selfMute:       true,
        });

        attachDisconnectHandler(connection, guild.name, channel.name);
        store.setConnection(guild.id, {
          channelId:   channel.id,
          channelName: channel.name,
          guildName:   guild.name,
        });

        log('VOICE', 'Auto-rejoined on startup', { guild: guild.name, channel: channel.name });
        rejoined++;

      } catch (err) {
        log('ERROR', 'Auto-rejoin on startup failed', { guild: guild.name, error: err.message });
      }
    }

    if (rejoined > 0) {
      log('INFO', `Auto-rejoined ${rejoined} channel(s)`);
    } else {
      log('INFO', 'No channels to auto-rejoin');
    }

    // ── Start background tasks ─────────────────────────────────────────────────
    startHeartbeat(client);
    startStatusUpdater(client);

    // Refresh all panel embeds now that we may have rejoined channels
    await updatePanel(client);

    log('INFO', 'Bot fully ready');
  },
};
