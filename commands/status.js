const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const { getVoiceConnection, VoiceConnectionStatus }       = require('@discordjs/voice');
const { log }      = require('../src/logger');
const store        = require('../src/connectionStore');
const { getStats, getLogChannel, getGuildConfig } = require('../src/guildConfig');

const STATUS_LABELS = {
  [VoiceConnectionStatus.Ready]:        '🟢 Connected',
  [VoiceConnectionStatus.Connecting]:   '🟡 Connecting...',
  [VoiceConnectionStatus.Signalling]:   '🟡 Signalling...',
  [VoiceConnectionStatus.Disconnected]: '🔴 Disconnected',
  [VoiceConnectionStatus.Destroyed]:    '💀 Destroyed',
};

function formatProcessUptime() {
  const s = Math.floor(process.uptime());
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('status')
    .setDescription("Show the bot's current voice connection status"),

  async execute(interaction, client) {
    const { guild } = interaction;

    const connection = getVoiceConnection(guild.id);
    const entry      = store.getEntry(guild.id);
    const saved      = getStats(guild.id);
    const config     = getGuildConfig(guild.id);

    const isConnected = connection && [
      VoiceConnectionStatus.Ready,
      VoiceConnectionStatus.Signalling,
      VoiceConnectionStatus.Connecting,
    ].includes(connection.state.status);

    const rawStatus   = connection?.state?.status;
    const statusLabel = rawStatus ? (STATUS_LABELS[rawStatus] || rawStatus) : '⚫ Not connected';

    // Count active VCs across all guilds
    const totalActive = client.guilds.cache.filter(g => {
      const c = getVoiceConnection(g.id);
      return c && [VoiceConnectionStatus.Ready, VoiceConnectionStatus.Signalling, VoiceConnectionStatus.Connecting].includes(c.state.status);
    }).size;

    // Memory
    const memMB = (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(1);

    // Log channels configured
    const voiceCh   = getLogChannel(guild.id, 'voice')    ? '✅' : '❌';
    const msgCh     = getLogChannel(guild.id, 'messages')  ? '✅' : '❌';
    const membersCh = getLogChannel(guild.id, 'members')   ? '✅' : '❌';

    const embed = new EmbedBuilder()
      .setTitle('🖤 POW Bot Status')
      .setColor(isConnected ? 0x57F287 : 0xED4245)
      .setTimestamp()
      .setFooter({ text: `Requested by ${interaction.user.tag}` });

    if (isConnected && entry) {
      embed.addFields(
        { name: 'Status',          value: statusLabel,                                                    inline: true  },
        { name: 'Channel',         value: `**${entry.channelName}**`,                                     inline: true  },
        { name: 'VC Uptime',       value: store.formatUptime(entry.joinedAt),                             inline: true  },
        { name: 'Reconnects',      value: `${entry.reconnectCount}`,                                      inline: true  },
        { name: 'Active VCs',      value: `${totalActive} server(s)`,                                    inline: true  },
        { name: 'Process Uptime',  value: formatProcessUptime(),                                          inline: true  },
        { name: 'Memory',          value: `${memMB} MB`,                                                  inline: true  },
        { name: 'Joined At',       value: `<t:${Math.floor(new Date(entry.joinedAt).getTime() / 1000)}:R>`, inline: true },
        { name: 'Persisted Stats', value: saved.joinedAt
            ? `Since <t:${Math.floor(new Date(saved.joinedAt).getTime() / 1000)}:R> · ${saved.reconnectCount} reconnect(s)`
            : 'None saved yet',                                                                            inline: false },
        { name: 'Log Channels',    value: `Voice ${voiceCh} · Messages ${msgCh} · Members ${membersCh}`, inline: false },
      );
    } else if (entry && !connection) {
      embed.setColor(0xFEE75C).addFields(
        { name: 'Status',  value: '👻 Ghost — stored but no active connection', inline: false },
        { name: 'Channel', value: entry.channelName,                            inline: true  },
        { name: 'Tip',     value: 'Use Force Leave on the panel, then Join.',   inline: false },
      );
    } else {
      embed
        .setDescription('Not currently connected to any voice channel.')
        .addFields(
          { name: 'Process Uptime', value: formatProcessUptime(), inline: true },
          { name: 'Memory',         value: `${memMB} MB`,         inline: true },
          { name: 'Active VCs',     value: `${totalActive}`,      inline: true },
          { name: 'Log Channels',   value: `Voice ${voiceCh} · Messages ${msgCh} · Members ${membersCh}`, inline: false },
        );
    }

    log('INFO', '/status checked', { guild: guild.name, by: interaction.user.tag, status: statusLabel });

    return interaction.reply({ embeds: [embed], flags: [MessageFlags.Ephemeral] });
  },
};
