const { Events } = require('discord.js');
const { joinVoiceChannel } = require('@discordjs/voice');
const { log, logStep, logDivider } = require('../src/logger');
const { startHeartbeat, attachDisconnectHandler } = require('../src/heartbeat');
const { startStatusUpdater, updatePanel }         = require('../src/statusUpdater');
const { getGuildConfig, getStats, setStats }      = require('../src/guildConfig');
const store                                        = require('../src/connectionStore');
const { attachSilencePlayer }                      = require('../src/audioPlayer');
const { initGuild }                                = require('../src/memberTracker');
const { init: initDatabase }                       = require('../src/database');
const { startStreamerPoller }                      = require('../src/streamerPoller');

module.exports = {
  name: Events.ClientReady,
  once: true,

  async execute(client) {
    // ── Database + Discord identity ───────────────────────────────────────────
    await initDatabase();
    logStep('Database', 'SQLite ready');
    logStep('Discord', client.user.tag);
    logStep('Guilds', `${client.guilds.cache.size} server${client.guilds.cache.size !== 1 ? 's' : ''}`);

    // ── Slash commands ────────────────────────────────────────────────────────
    try {
      const { REST, Routes } = require('discord.js');
      const rest = new REST({ version: '10' }).setToken(process.env.BOT_TOKEN);
      const commandData = [...client.commands.values()].map(cmd => cmd.data.toJSON());
      await rest.put(Routes.applicationCommands(process.env.CLIENT_ID), { body: commandData });
      logStep('Slash cmds', `${commandData.length} registered globally`);
    } catch (err) {
      log('ERROR', 'Failed to register slash commands', { error: err.message });
    }

    // ── Auto-rejoin ───────────────────────────────────────────────────────────
    let rejoined = 0;

    for (const guild of client.guilds.cache.values()) {
      const config = getGuildConfig(guild.id);
      if (!config.lastChannelId) continue;

      try {
        const channel = await guild.channels.fetch(config.lastChannelId);
        if (!channel?.isVoiceBased()) {
          log('WARN', 'Saved channel gone — skipping', { guild: guild.name });
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

        const saved          = getStats(guild.id);
        const joinedAt       = saved.joinedAt      || new Date();
        const reconnectCount = saved.reconnectCount || 0;

        store.setConnection(guild.id, {
          channelId:   channel.id,
          channelName: channel.name,
          guildName:   guild.name,
          joinedAt,
          reconnectCount,
        });
        setStats(guild.id, { joinedAt, reconnectCount });

        await guild.members.fetch();
        initGuild(guild);

        log('VOICE', 'Auto-rejoined on startup', {
          guild:   guild.name,
          channel: channel.name,
          uptime:  store.formatUptime(joinedAt),
        });
        rejoined++;
      } catch (err) {
        log('ERROR', 'Auto-rejoin failed', { guild: guild.name, error: err.message });
      }
    }

    logStep('Voice', rejoined > 0 ? `Auto-rejoined ${rejoined} channel${rejoined !== 1 ? 's' : ''}` : 'No channels to resume');

    // ── Background tasks ──────────────────────────────────────────────────────
    startHeartbeat(client);
    startStatusUpdater(client);
    startStreamerPoller(client);
    await updatePanel(client);

    logStep('Services', 'Heartbeat · Presence · Streamers');
    logDivider();
    logDivider('24/7 POW Bot is fully ready');
    logDivider();
  },
};
