const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const { getVoiceConnection, VoiceConnectionStatus } = require('@discordjs/voice');
const { log } = require('../src/logger');
const store = require('../src/connectionStore');

// Map internal status strings to something readable
const STATUS_LABELS = {
  [VoiceConnectionStatus.Ready]:        '🟢 Connected',
  [VoiceConnectionStatus.Connecting]:   '🟡 Connecting...',
  [VoiceConnectionStatus.Signalling]:   '🟡 Signalling...',
  [VoiceConnectionStatus.Disconnected]: '🔴 Disconnected',
  [VoiceConnectionStatus.Destroyed]:    '💀 Destroyed (ghost)',
};

module.exports = {
  data: new SlashCommandBuilder()
    .setName('status')
    .setDescription('Show the bot\'s current voice connection status'),

  async execute(interaction) {
    const { guild } = interaction;

    const connection = getVoiceConnection(guild.id);
    const entry = store.getEntry(guild.id);

    const isConnected = connection && [
      VoiceConnectionStatus.Ready,
      VoiceConnectionStatus.Signalling,
      VoiceConnectionStatus.Connecting,
    ].includes(connection.state.status);

    const rawStatus = connection?.state?.status;
    const statusLabel = rawStatus
      ? (STATUS_LABELS[rawStatus] || rawStatus)
      : '⚫ Not connected';

    const embed = new EmbedBuilder()
      .setTitle('🤖 POW Bot Status')
      .setColor(isConnected ? 0x57F287 : 0xED4245)
      .setTimestamp()
      .setFooter({ text: `Requested by ${interaction.user.tag}` });

    if (isConnected && entry) {
      embed.addFields(
        { name: 'Status',     value: statusLabel,                              inline: true },
        { name: 'Channel',    value: `**${entry.channelName}**`,               inline: true },
        { name: 'Uptime',     value: store.formatUptime(entry.joinedAt),       inline: true },
        { name: 'Server',     value: entry.guildName,                          inline: true },
        { name: 'Reconnects', value: String(entry.reconnectCount),             inline: true },
        { name: 'Joined At',  value: `<t:${Math.floor(entry.joinedAt.getTime() / 1000)}:R>`, inline: true },
      );
    } else if (entry && !connection) {
      // Store entry exists but no connection — ghost state
      embed
        .setColor(0xFEE75C)
        .addFields(
          { name: 'Status',  value: '👻 Ghost — stored but no active connection', inline: false },
          { name: 'Channel', value: entry.channelName, inline: true },
          { name: 'Tip',     value: 'Run `/forceleave` to clear this, then `/join` again.', inline: false },
        );
    } else {
      embed
        .setDescription('Not currently connected to any voice channel in this server.')
        .addFields({ name: 'Use', value: '`/join` to bring me into a channel', inline: false });
    }

    log('INFO', '/status checked', { guild: guild.name, by: interaction.user.tag, status: statusLabel });

    return interaction.reply({ embeds: [embed], flags: [MessageFlags.Ephemeral] });
  },
};
