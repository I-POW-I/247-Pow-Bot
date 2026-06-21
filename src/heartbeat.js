const { getVoiceConnection, joinVoiceChannel, VoiceConnectionStatus } = require('@discordjs/voice');
const { log }                   = require('./logger');
const store                     = require('./connectionStore');
const { setStats }              = require('./guildConfig');
const { attachSilencePlayer }   = require('./audioPlayer');

const HEARTBEAT_INTERVAL = 2 * 60 * 1000; // 2 minutes

function startHeartbeat(client) {
  log('HEART', 'Heartbeat started — checking every 2 minutes');

  setInterval(async () => {
    const entries = store.getAllEntries();
    if (entries.length === 0) return;

    log('HEART', `Checking ${entries.length} connection(s)`);

    for (const [guildId, meta] of entries) {
      const conn = getVoiceConnection(guildId);
      const healthyStatuses = [
        VoiceConnectionStatus.Ready,
        VoiceConnectionStatus.Signalling,
        VoiceConnectionStatus.Connecting,
      ];

      if (conn && healthyStatuses.includes(conn.state.status)) {
        log('HEART', 'Connection healthy', {
          guild:      meta.guildName,
          channel:    meta.channelName,
          uptime:     store.formatUptime(meta.joinedAt),
          reconnects: meta.reconnectCount,
        });
        continue;
      }

      // Ghost detected
      log('GHOST', 'Ghost connection detected — attempting auto-rejoin', {
        guild: meta.guildName, channel: meta.channelName,
      });

      if (conn) { try { conn.destroy(); } catch (_) {} }

      try {
        const guild   = await client.guilds.fetch(guildId);
        const channel = await guild.channels.fetch(meta.channelId);

        if (!channel || !channel.isVoiceBased()) {
          log('GHOST', 'Target channel gone — clearing entry', { guild: meta.guildName });
          store.clearConnection(guildId);
          continue;
        }

        const newConn = joinVoiceChannel({
          channelId:      channel.id,
          guildId:        guild.id,
          adapterCreator: guild.voiceAdapterCreator,
          selfDeaf:       true,
          selfMute:       false,
        });

        attachDisconnectHandler(newConn, guild.name, channel.name);
        attachSilencePlayer(newConn, guild.id);
        store.incrementReconnect(guildId);

        // Persist updated stats
        const entry = store.getEntry(guildId);
        if (entry) setStats(guildId, { joinedAt: entry.joinedAt, reconnectCount: entry.reconnectCount });

        log('VOICE', 'Auto-rejoined after ghost', {
          guild: guild.name, channel: channel.name, reconnects: store.getEntry(guildId)?.reconnectCount,
        });

        const { updatePanel } = require('./statusUpdater');
        await updatePanel(client);

      } catch (err) {
        log('ERROR', 'Auto-rejoin failed — clearing entry', { guild: meta.guildName, error: err.message });
        store.clearConnection(guildId);
      }
    }
  }, HEARTBEAT_INTERVAL);
}

function attachDisconnectHandler(connection, guildName, channelName) {
  connection.on(VoiceConnectionStatus.Disconnected, async () => {
    log('VOICE', 'Disconnected — attempting quick reconnect', { guild: guildName, channel: channelName });

    try {
      const { entersState } = require('@discordjs/voice');
      await Promise.race([
        entersState(connection, VoiceConnectionStatus.Signalling, 15_000),
        entersState(connection, VoiceConnectionStatus.Connecting, 15_000),
      ]);
      log('VOICE', 'Quick reconnect succeeded', { guild: guildName, channel: channelName });
    } catch {
      log('WARN', 'Quick reconnect timed out — heartbeat will handle it', { guild: guildName, channel: channelName });
      try { connection.destroy(); } catch (_) {}
    }
  });

  connection.on('error', (err) => {
    log('ERROR', 'Voice connection error', { guild: guildName, channel: channelName, error: err.message });
  });
}

module.exports = { startHeartbeat, attachDisconnectHandler };
