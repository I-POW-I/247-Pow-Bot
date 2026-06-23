const { ActivityType, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { getVoiceConnection, VoiceConnectionStatus } = require('@discordjs/voice');
const { log }            = require('./logger');
const store              = require('./connectionStore');
const { getGuildConfig, getStats, getLogChannel } = require('./guildConfig');

const PRESENCE_INTERVAL = 60 * 1000;

const HEALTHY = [
  VoiceConnectionStatus.Ready,
  VoiceConnectionStatus.Signalling,
  VoiceConnectionStatus.Connecting,
];

function isConnected(guildId) {
  const conn = getVoiceConnection(guildId);
  return conn && HEALTHY.includes(conn.state.status);
}

// ── Presence ──────────────────────────────────────────────────────────────────

function buildPresence() {
  const active = store.getAllEntries().filter(([guildId]) => isConnected(guildId));

  if (active.length === 0) return { name: 'Sleeping...', status: 'idle' };
  if (active.length === 1) {
    const [, meta] = active[0];
    return { name: `🔊 ${meta.channelName} · ${store.formatUptime(meta.joinedAt)}`, status: 'online' };
  }
  return { name: `🔊 ${active.length} channels`, status: 'online' };
}

function startStatusUpdater(client) {
  const update = async () => {
    const { name, status } = buildPresence();
    client.user.setPresence({ status, activities: [{ name, type: ActivityType.Custom }] });
    await updatePanel(client);
  };

  update();
  setInterval(update, PRESENCE_INTERVAL);
  log('INFO', 'Presence updater started (60s interval)');
}

// ── Panel embed ───────────────────────────────────────────────────────────────

function buildPanelEmbed(guildId) {
  const entry     = store.getEntry(guildId);
  const connected = isConnected(guildId);
  const isGhost   = entry && !getVoiceConnection(guildId);

  let colour, statusLine, channelLine, uptimeLine;

  if (connected && entry) {
    colour      = 0x57F287;
    statusLine  = '🟢 Connected';
    channelLine = `**${entry.channelName}**`;
    uptimeLine  = store.formatUptime(entry.joinedAt);
  } else if (isGhost) {
    colour      = 0xFEE75C;
    statusLine  = '👻 Ghost — Force Leave then Join';
    channelLine = entry.channelName;
    uptimeLine  = '—';
  } else {
    colour      = 0xED4245;
    statusLine  = '🔴 Idle';
    channelLine = '—';
    uptimeLine  = '—';
  }

  return new EmbedBuilder()
    .setTitle('🖤24/7 POW Bot — Control Panel')
    .setColor(colour)
    .addFields(
      { name: 'Status',  value: statusLine,  inline: true },
      { name: 'Channel', value: channelLine, inline: true },
      { name: 'Uptime',  value: uptimeLine,  inline: true },
    )
    .setFooter({ text: 'Last updated' })
    .setTimestamp();
}

// ── Stats embed (for the Stats button) ───────────────────────────────────────

function buildStatsEmbed(guildId, client) {
  const entry     = store.getEntry(guildId);
  const connected = isConnected(guildId);
  const conn      = getVoiceConnection(guildId);
  const saved     = getStats(guildId);

  const STATUS_LABELS = {
    [VoiceConnectionStatus.Ready]:        '🟢 Connected',
    [VoiceConnectionStatus.Connecting]:   '🟡 Connecting...',
    [VoiceConnectionStatus.Signalling]:   '🟡 Signalling...',
    [VoiceConnectionStatus.Disconnected]: '🔴 Disconnected',
    [VoiceConnectionStatus.Destroyed]:    '💀 Destroyed',
  };

  const rawStatus   = conn?.state?.status;
  const statusLabel = rawStatus ? (STATUS_LABELS[rawStatus] || rawStatus) : '⚫ Not connected';

  const totalActive = client.guilds.cache.filter(g => isConnected(g.id)).size;
  const memMB       = (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(1);

  const s = Math.floor(process.uptime());
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const processUptime = h > 0 ? `${h}h ${m}m` : `${m}m`;

  const voiceCh   = getLogChannel(guildId, 'voice')    ? '✅' : '❌';
  const msgCh     = getLogChannel(guildId, 'messages')  ? '✅' : '❌';
  const membersCh = getLogChannel(guildId, 'members')   ? '✅' : '❌';

  const embed = new EmbedBuilder()
    .setTitle('🖤 POW Bot — Stats')
    .setColor(connected ? 0x57F287 : 0xED4245)
    .setTimestamp();

  if (connected && entry) {
    embed.addFields(
      { name: 'Status',         value: statusLabel,                                                      inline: true  },
      { name: 'Channel',        value: `**${entry.channelName}**`,                                       inline: true  },
      { name: 'VC Uptime',      value: store.formatUptime(entry.joinedAt),                               inline: true  },
      { name: 'Reconnects',     value: `${entry.reconnectCount}`,                                        inline: true  },
      { name: 'Active VCs',     value: `${totalActive} server(s)`,                                      inline: true  },
      { name: 'Process Uptime', value: processUptime,                                                    inline: true  },
      { name: 'Memory',         value: `${memMB} MB`,                                                    inline: true  },
      { name: 'Joined At',      value: `<t:${Math.floor(new Date(entry.joinedAt).getTime() / 1000)}:R>`, inline: true  },
      { name: '\u200b',         value: '\u200b',                                                          inline: true  },
      { name: 'Persisted Since', value: saved.joinedAt
          ? `<t:${Math.floor(new Date(saved.joinedAt).getTime() / 1000)}:R> · ${saved.reconnectCount} reconnect(s)`
          : 'None saved yet',                                                                              inline: false },
      { name: 'Log Channels',   value: `Voice ${voiceCh} · Messages ${msgCh} · Members ${membersCh}`,   inline: false },
    );
  } else {
    embed
      .setDescription('Not currently connected to any voice channel.')
      .addFields(
        { name: 'Process Uptime', value: processUptime, inline: true },
        { name: 'Memory',         value: `${memMB} MB`, inline: true },
        { name: 'Active VCs',     value: `${totalActive}`, inline: true },
        { name: 'Log Channels',   value: `Voice ${voiceCh} · Messages ${msgCh} · Members ${membersCh}`, inline: false },
      );
  }

  return embed;
}

// ── Panel buttons ─────────────────────────────────────────────────────────────

function buildPanelButtons() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('bot_join')
      .setLabel('Join')
      .setEmoji('🔊')
      .setStyle(ButtonStyle.Success),

    new ButtonBuilder()
      .setCustomId('bot_leave')
      .setLabel('Leave')
      .setEmoji('👋')
      .setStyle(ButtonStyle.Secondary),

    new ButtonBuilder()
      .setCustomId('bot_forceleave')
      .setLabel('Force Leave')
      .setEmoji('🔌')
      .setStyle(ButtonStyle.Danger),

    new ButtonBuilder()
      .setCustomId('bot_stats')
      .setLabel('Stats')
      .setEmoji('📊')
      .setStyle(ButtonStyle.Primary),

    new ButtonBuilder()
      .setCustomId('bot_refresh')
      .setLabel('Refresh')
      .setEmoji('🔄')
      .setStyle(ButtonStyle.Secondary),
  );
}

// ── Channel select row (shown when user is not in a VC) ───────────────────────

function buildChannelSelectRow() {
  const { ChannelSelectMenuBuilder, ChannelType } = require('discord.js');
  return new ActionRowBuilder().addComponents(
    new ChannelSelectMenuBuilder()
      .setCustomId('bot_join_channel')
      .setPlaceholder('Pick a voice channel to join...')
      .addChannelTypes(ChannelType.GuildVoice, ChannelType.GuildStageVoice)
  );
}

// ── Update panel ──────────────────────────────────────────────────────────────

async function updatePanel(client) {
  for (const guild of client.guilds.cache.values()) {
    const config = getGuildConfig(guild.id);
    if (!config.panelChannelId || !config.panelMessageId) continue;

    try {
      const channel = await guild.channels.fetch(config.panelChannelId);
      if (!channel?.isTextBased()) continue;
      const message = await channel.messages.fetch(config.panelMessageId);
      await message.edit({
        embeds:     [buildPanelEmbed(guild.id)],
        components: [buildPanelButtons()],
      });
    } catch (err) {
      log('WARN', 'Could not update panel message', { guild: guild.name, error: err.message });
    }
  }
}

module.exports = {
  startStatusUpdater,
  updatePanel,
  buildPanelEmbed,
  buildPanelButtons,
  buildStatsEmbed,
  buildChannelSelectRow,
};
