const {
  ActivityType, EmbedBuilder,
  ActionRowBuilder, ButtonBuilder, ButtonStyle,
  ChannelType, UserSelectMenuBuilder,
} = require('discord.js');
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

function getProcessUptime() {
  const s = Math.floor(process.uptime());
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
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

  let colour, statusLine, channelLine, vcUptime, processUp, reconnects;

  if (connected && entry) {
    colour      = 0x57F287;
    statusLine  = '🟢 Connected';
    channelLine = `**${entry.channelName}**`;
    vcUptime    = store.formatUptime(entry.joinedAt);
    processUp   = getProcessUptime();
    reconnects  = `${entry.reconnectCount}`;
  } else if (isGhost) {
    colour      = 0xFEE75C;
    statusLine  = '👻 Ghost — Force Leave then Join';
    channelLine = entry.channelName;
    vcUptime    = '—';
    processUp   = getProcessUptime();
    reconnects  = '—';
  } else {
    colour      = 0xED4245;
    statusLine  = '🔴 Idle';
    channelLine = '—';
    vcUptime    = '—';
    processUp   = getProcessUptime();
    reconnects  = '—';
  }

  return new EmbedBuilder()
    .setTitle('🖤24/7 POW Bot — Control Panel')
    .setColor(colour)
    .addFields(
      { name: 'Status',      value: statusLine,  inline: true },
      { name: 'Channel',     value: channelLine, inline: true },
      { name: 'VC Uptime',   value: vcUptime,    inline: true },
      { name: 'Process Up',  value: processUp,   inline: true },
      { name: 'Reconnects',  value: reconnects,  inline: true },
      { name: '\u200b',      value: '\u200b',    inline: true },
    )
    .setFooter({ text: 'Last updated' })
    .setTimestamp();
}

// ── Stats embed (for /status command) ────────────────────────────────────────

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

  const statusLabel   = conn?.state?.status ? (STATUS_LABELS[conn.state.status] || conn.state.status) : '⚫ Not connected';
  const totalActive   = client.guilds.cache.filter(g => isConnected(g.id)).size;
  const memMB         = (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(1);
  const voiceCh       = getLogChannel(guildId, 'voice')    ? '✅' : '❌';
  const msgCh         = getLogChannel(guildId, 'messages')  ? '✅' : '❌';
  const membersCh     = getLogChannel(guildId, 'members')   ? '✅' : '❌';

  const embed = new EmbedBuilder()
    .setTitle('🖤 POW Bot — Stats')
    .setColor(connected ? 0x57F287 : 0xED4245)
    .setTimestamp();

  if (connected && entry) {
    embed.addFields(
      { name: 'Status',          value: statusLabel,                                                         inline: true  },
      { name: 'Channel',         value: `**${entry.channelName}**`,                                          inline: true  },
      { name: 'VC Uptime',       value: store.formatUptime(entry.joinedAt),                                  inline: true  },
      { name: 'Reconnects',      value: `${entry.reconnectCount}`,                                           inline: true  },
      { name: 'Active VCs',      value: `${totalActive} server(s)`,                                         inline: true  },
      { name: 'Process Uptime',  value: getProcessUptime(),                                                  inline: true  },
      { name: 'Memory',          value: `${memMB} MB`,                                                       inline: true  },
      { name: 'Joined At',       value: `<t:${Math.floor(new Date(entry.joinedAt).getTime() / 1000)}:R>`,   inline: true  },
      { name: '\u200b',          value: '\u200b',                                                             inline: true  },
      { name: 'Persisted Since', value: saved.joinedAt
          ? `<t:${Math.floor(new Date(saved.joinedAt).getTime() / 1000)}:R> · ${saved.reconnectCount} reconnect(s)`
          : 'None saved yet',                                                                                  inline: false },
      { name: 'Log Channels',    value: `Voice ${voiceCh} · Messages ${msgCh} · Members ${membersCh}`,      inline: false },
    );
  } else {
    embed.setDescription('Not currently connected to any voice channel.').addFields(
      { name: 'Process Uptime', value: getProcessUptime(), inline: true },
      { name: 'Memory',         value: `${memMB} MB`,      inline: true },
      { name: 'Active VCs',     value: `${totalActive}`,   inline: true },
      { name: 'Log Channels',   value: `Voice ${voiceCh} · Messages ${msgCh} · Members ${membersCh}`, inline: false },
    );
  }

  return embed;
}

// ── Member profile embed ──────────────────────────────────────────────────────

function buildMemberEmbed(member, guild, joinTimes) {
  const user      = member.user;
  const joinedAt  = member.joinedAt;
  const createdAt = user.createdAt;

  // Account age in years/months
  const ageMs      = Date.now() - createdAt.getTime();
  const ageYears   = Math.floor(ageMs / (365.25 * 24 * 3600 * 1000));
  const ageMonths  = Math.floor((ageMs % (365.25 * 24 * 3600 * 1000)) / (30.44 * 24 * 3600 * 1000));
  const ageStr     = ageYears > 0 ? `${ageYears}y ${ageMonths}m` : `${ageMonths} month(s)`;

  // Current VC session
  const vcKey     = `${guild.id}_${user.id}`;
  const sessionMs = joinTimes.has(vcKey) ? Date.now() - joinTimes.get(vcKey) : null;
  const inVc      = member.voice?.channel;

  // Roles (exclude @everyone, cap at 10)
  const roles = member.roles.cache
    .filter(r => r.id !== guild.id)
    .sort((a, b) => b.position - a.position)
    .first(10)
    .map(r => `<@&${r.id}>`);

  const embed = new EmbedBuilder()
    .setColor(member.displayColor || 0x5865F2)
    .setAuthor({ name: `${user.tag}`, iconURL: user.displayAvatarURL({ dynamic: true, size: 256 }) })
    .setThumbnail(user.displayAvatarURL({ dynamic: true, size: 256 }))
    .setTitle('👤  Member Profile')
    .addFields(
      { name: 'Joined Server',   value: `<t:${Math.floor(joinedAt.getTime() / 1000)}:R>`,   inline: true  },
      { name: 'Account Created', value: `<t:${Math.floor(createdAt.getTime() / 1000)}:R>`,  inline: true  },
      { name: 'Account Age',     value: ageStr,                                               inline: true  },
      {
        name:   'In Voice',
        value:  inVc
          ? `<#${inVc.id}> — **${inVc.name}**${sessionMs ? ` · ${formatDuration(sessionMs)}` : ''}`
          : 'Not in a voice channel',
        inline: false,
      },
    )
    .setTimestamp()
    .setFooter({ text: `User ID: ${user.id}` });

  if (roles.length > 0) {
    embed.addFields({ name: `Roles (${member.roles.cache.size - 1})`, value: roles.join(' '), inline: false });
  }

  return embed;
}

function formatDuration(ms) {
  const s   = Math.floor(ms / 1000);
  const h   = Math.floor(s / 3600);
  const m   = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}h ${m}m ${sec}s`;
  if (m > 0) return `${m}m ${sec}s`;
  return `${sec}s`;
}

// ── Panel buttons ─────────────────────────────────────────────────────────────

function buildPanelButtons() {
  const row1 = new ActionRowBuilder().addComponents(
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
      .setCustomId('bot_myinfo')
      .setLabel('My Info')
      .setEmoji('👤')
      .setStyle(ButtonStyle.Primary),

    new ButtonBuilder()
      .setCustomId('bot_refresh')
      .setLabel('Refresh')
      .setEmoji('🔄')
      .setStyle(ButtonStyle.Secondary),
  );

  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('bot_lookup')
      .setLabel('Lookup User')
      .setEmoji('🔍')
      .setStyle(ButtonStyle.Secondary),
  );

  return [row1, row2];
}

// ── Channel select row ────────────────────────────────────────────────────────

function buildChannelSelectRow() {
  return new ActionRowBuilder().addComponents(
    new (require('discord.js').ChannelSelectMenuBuilder)()
      .setCustomId('bot_join_channel')
      .setPlaceholder('Pick a voice channel to join...')
      .addChannelTypes(ChannelType.GuildVoice, ChannelType.GuildStageVoice)
  );
}

// ── User select row ───────────────────────────────────────────────────────────

function buildUserSelectRow() {
  return new ActionRowBuilder().addComponents(
    new UserSelectMenuBuilder()
      .setCustomId('bot_lookup_user')
      .setPlaceholder('Select a member to look up...')
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
        components: buildPanelButtons(),
      });
    } catch (err) {
      log('WARN', 'Could not update panel', { guild: guild.name, error: err.message });
    }
  }
}

module.exports = {
  startStatusUpdater,
  updatePanel,
  buildPanelEmbed,
  buildPanelButtons,
  buildStatsEmbed,
  buildMemberEmbed,
  buildChannelSelectRow,
  buildUserSelectRow,
};
