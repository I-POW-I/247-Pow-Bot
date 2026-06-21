const { Events } = require('discord.js');
const { joinVoiceChannel } = require('@discordjs/voice');
const { log }                     = require('../src/logger');
const { startHeartbeat, attachDisconnectHandler } = require('../src/heartbeat');
const { startStatusUpdater, updatePanel }         = require('../src/statusUpdater');
const { getGuildConfig, getStats, setStats }      = require('../src/guildConfig');
const store                                        = require('../src/connectionStore');
const { attachSilencePlayer }                      = require('../src/audioPlayer');
const { initGuild }                                = require('../src/memberTracker');

module.exports = {
  name: Events.ClientReady,
  once: true,

  async execute(client) {
    log('INFO', `Logged in as ${client.user.tag}`);
    log('INFO', `Serving ${client.guilds.cache.size} guild(s)`);

    // ── Register slash commands ───────────────────────────────────────────────
    try {
      const { REST, Routes } = require('discord.js');
      const rest = new REST({ version: '10' }).setToken(process.env.BOT_TOKEN);
      const commandData = [...client.commands.values()].map(cmd => cmd.data.toJSON());
      await rest.put(Routes.applicationCommands(process.env.CLIENT_ID), { body: commandData });
      log('INFO', `Registered ${commandData.length} global slash command(s)`);
    } catch (err) {
      log('ERROR', 'Failed to register slash commands', { error: err.message });
    }

    // ── Auto-rejoin last known channels ──────────────────────────────────────
    log('INFO', 'Checking for channels to auto-rejoin...');
    let rejoined = 0;

    for (const guild of client.guilds.cache.values()) {
      const config = getGuildConfig(guild.id);
      if (!config.lastChannelId) continue;

      try {
        const channel = await guild.channels.fetch(config.lastChannelId);
        if (!channel || !channel.isVoiceBased()) {
          log('WARN', 'Saved channel no longer exists — skipping', { guild: guild.name });
          continue;
        }

        const connection = joinVoiceChannel({
          channelId:      channel.id,
          guildId:        guild.id,
          adapterCreator: guild.voiceAdapterCreator,
          selfDeaf:       true,
          selfMute:       false,
        });

        attachDisconnectHandler(connection, guild.name, channel.name);
        attachSilencePlayer(connection, guild.id);

        // Restore persisted stats so uptime survives non-deploy restarts
        const saved = getStats(guild.id);
        const joinedAt       = saved.joinedAt       || new Date();
        const reconnectCount = saved.reconnectCount  || 0;

        store.setConnection(guild.id, {
          channelId:   channel.id,
          channelName: channel.name,
          guildName:   guild.name,
          joinedAt,
          reconnectCount,
        });

        // Re-save stats so they stay current after this restart
        setStats(guild.id, { joinedAt, reconnectCount });

        // Seed join times for members already in the channel
        // so duration tracking works rather than showing Unknown
        initGuild(guild);

        log('VOICE', 'Auto-rejoined on startup', {
          guild:   guild.name,
          channel: channel.name,
          uptime:  store.formatUptime(joinedAt),
        });
        rejoined++;

      } catch (err) {
        log('ERROR', 'Auto-rejoin on startup failed', { guild: guild.name, error: err.message });
      }
    }

    log('INFO', rejoined > 0 ? `Auto-rejoined ${rejoined} channel(s)` : 'No channels to auto-rejoin');

    // ── Start background tasks ────────────────────────────────────────────────
    startHeartbeat(client);
    startStatusUpdater(client);
    await updatePanel(client);

    log('INFO', 'Bot fully ready');
  },
};
