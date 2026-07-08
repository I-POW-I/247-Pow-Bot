const {
  ActivityType, EmbedBuilder,
  ActionRowBuilder, ButtonBuilder, ButtonStyle,
  ChannelType, ChannelSelectMenuBuilder, UserSelectMenuBuilder,
} = require('discord.js');
const { getVoiceConnection, VoiceConnectionStatus } = require('@discordjs/voice');
const { log }                              = require('./logger');
const store                                = require('./connectionStore');
const { getGuildConfig, getStats, getLogChannel } = require('./guildConfig');
const { getUserStats, getServerTotals, formatMs }  = require('./database');
const { joinTimes, streamTimes }           = require('./memberTracker');

const PRESENCE_INTERVAL = 60 * 1000;

const HEALTHY = [
  VoiceConnectionStatus.Ready,
  VoiceConnectionStatus.Signalling,
  VoiceConnectionStatus.Connecting,
];

// ── Helpers ───────────────────────────────────────────────────────────────────

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

/** Format ms with seconds — for live session durations. */
function formatLive(ms) {
  if (!ms || ms <= 0) return '0s';
  const totalS = Math.floor(ms / 1000);
  const h   = Math.floor(totalS / 3600);
  const m   = Math.floor((totalS % 3600) / 60);
  const sec = totalS % 60;
  if (h > 0) return `${h}h ${m}m ${sec}s`;
  if (m > 0) return `${m}m ${sec}s`;
  return `${sec}s`;
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

/**
 * @param {string} guildId
 * @param {import('discord.js').Guild|null} guild  — pass to show live member count
 */
function buildPanelEmbed(guildId, guild = null) {
  const entry     = store.getEntry(guildId);
  const connected = isConnected(guildId);
  const isGhost   = entry && !getVoiceConnection(guildId);

  const memMB     = (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(1);
  let colour, statusLine, channelLine, vcUptime, processUp, membersInVc;

  if (connected && entry) {
    colour      = 0x57F287;
    statusLine  = '🟢 Connected';
    channelLine = `**${entry.channelName}**`;
    vcUptime    = store.formatUptime(entry.joinedAt);
    processUp   = getProcessUptime();

    // Live member count in the VC (excluding bots)
    if (guild) {
      const ch = guild.channels.cache.get(entry.channelId);
      membersInVc = ch ? `${ch.members.filter(m => !m.user.bot).size}` : '—';
    } else {
      membersInVc = '—';
    }

  } else if (isGhost) {
    colour      = 0xFEE75C;
    statusLine  = '👻 Ghost — Force Leave then Join';
    channelLine = entry.channelName;
    vcUptime    = '—';
    processUp   = getProcessUptime();
    membersInVc = '—';
  } else {
    colour      = 0xED4245;
    statusLine  = '🔴 Idle';
    channelLine = '—';
    vcUptime    = '—';
    processUp   = getProcessUptime();
    membersInVc = '—';
  }

  return new EmbedBuilder()
    .setTitle('🖤 24/7 POW Bot')
    .setDescription('Voice uptime, activity monitoring, and server controls in one place.')
    .setColor(colour)
    .addFields(
      { name: 'Status',      value: statusLine,  inline: true },
      { name: 'Channel',     value: channelLine, inline: true },
      { name: 'VC Uptime',   value: vcUptime,    inline: true },
      { name: 'Members',     value: membersInVc, inline: true },
      { name: 'Process Up',  value: processUp,   inline: true },
      { name: 'Memory',      value: `${memMB} MB`, inline: true },
    )
    .setFooter({ text: '24/7 POW Bot • Live control panel' })
    .setTimestamp();
}

// ── Stats embed (/status command) ─────────────────────────────────────────────

function buildStatsEmbed(guildId, client) {
  const entry     = store.getEntry(guildId);
  const connected = isConnected(guildId);
  const saved     = getStats(guildId);
  const totals    = getServerTotals(guildId);
  const memMB     = (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(1);
  const ping      = client.ws.ping;
  const totalActive = client.guilds.cache.filter(g => isConnected(g.id)).size;

  // Always show 🟢 Connected for any healthy state — don't expose internal state names
  const statusLabel = connected ? '🟢 Connected' : '🔴 Not connected';

  const embed = new EmbedBuilder()
    .setTitle('🖤 24/7 POW Bot — Runtime Status')
    .setDescription(connected ? 'The voice connection is active and healthy.' : 'No active voice connection is currently running.')
    .setColor(connected ? 0x57F287 : 0xED4245)
    .setTimestamp();

  if (connected && entry) {
    // Live member count
    const guild     = client.guilds.cache.get(guildId);
    const ch        = guild?.channels.cache.get(entry.channelId);
    const inVc      = ch ? ch.members.filter(m => !m.user.bot).size : '—';

    embed.addFields(
      { name: 'Connection',     value: statusLabel,                                                         inline: true  },
      { name: 'VC Uptime',      value: store.formatUptime(entry.joinedAt),                                  inline: true  },
      { name: 'Process Uptime', value: getProcessUptime(),                                                  inline: true  },
      { name: 'WebSocket Ping', value: ping >= 0 ? `${ping}ms` : 'Calculating...',                         inline: true  },
      { name: 'Members in VC',  value: `${inVc}`,                                                          inline: true  },
      { name: 'Memory',         value: `${memMB} MB`,                                                      inline: true  },
      {
        name:  'Reconnects',
        value: `${entry.reconnectCount}`,
        inline: true,
      },
      { name: 'Active VCs',    value: `${totalActive} server(s)`,                                          inline: true  },
      { name: 'Sessions Tracked (DB)', value: `${totals.total_sessions.toLocaleString()}`,                 inline: true  },
      {
        name:   'Persisted Stats',
        value:  saved.joinedAt
          ? `Since <t:${Math.floor(new Date(saved.joinedAt).getTime() / 1000)}:R> · ${saved.reconnectCount} reconnect(s)`
          : 'None saved yet',
        inline: false,
      },
    );
  } else {
    embed.setDescription('Not currently connected to any voice channel.').addFields(
      { name: 'Process Uptime', value: getProcessUptime(), inline: true },
      { name: 'Memory',         value: `${memMB} MB`,      inline: true },
      { name: 'WebSocket Ping', value: ping >= 0 ? `${ping}ms` : '—', inline: true },
      { name: 'Sessions Tracked (DB)', value: `${totals.total_sessions.toLocaleString()}`, inline: true },
    );
  }

  return embed;
}

// ── Member profile embed ──────────────────────────────────────────────────────

function buildMemberEmbed(member, guild) {
  const user    = member.user;
  const stats   = getUserStats(user.id, guild.id);

  // ── Account age ──────────────────────────────────────────────────────────
  const ageMs     = Date.now() - user.createdAt.getTime();
  const ageYears  = Math.floor(ageMs / (365.25 * 24 * 3600 * 1000));
  const ageMonths = Math.floor((ageMs % (365.25 * 24 * 3600 * 1000)) / (30.44 * 24 * 3600 * 1000));
  const ageStr    = ageYears > 0 ? `${ageYears}y ${ageMonths}m` : `${ageMonths} month(s)`;

  // ── Nickname ──────────────────────────────────────────────────────────────
  const nickname = member.nickname && member.nickname !== user.username
    ? member.nickname
    : null;

  // ── Boost status ─────────────────────────────────────────────────────────
  const boostSince = member.premiumSince;
  const boostStr   = boostSince
    ? `🚀 Boosting since <t:${Math.floor(boostSince.getTime() / 1000)}:R>`
    : 'Not boosting';

  // ── Current voice state ───────────────────────────────────────────────────
  const vc  = member.voice;
  const vcKey = `${guild.id}_${user.id}`;
  let vcLine;

  if (vc?.channel) {
    const sessionMs = joinTimes.has(vcKey) ? Date.now() - joinTimes.get(vcKey) : null;
    const streaming = streamTimes.has(vcKey);

    const indicators = [
      vc.selfMute   ? '🔇 Muted'       : null,
      vc.selfDeaf   ? '🙉 Deafened'    : null,
      vc.serverMute ? '🔴 Server Muted' : null,
      vc.serverDeaf ? '🚫 Server Deaf'  : null,
      vc.streaming  ? '🖥️ Streaming'   : null,
      vc.selfVideo  ? '📷 Camera'       : null,
    ].filter(Boolean);

    vcLine = `<#${vc.channel.id}> — **${vc.channel.name}**`;
    if (sessionMs) vcLine += ` · ${formatLive(sessionMs)}`;
    if (streaming) {
      const streamMs = Date.now() - streamTimes.get(vcKey);
      vcLine += `\n🖥️ Streaming for ${formatLive(streamMs)}`;
    }
    if (indicators.length > 0) vcLine += `\n${indicators.join(' · ')}`;
  } else {
    vcLine = 'Not in a voice channel';
  }

  // ── Last seen ─────────────────────────────────────────────────────────────
  let lastSeenStr = '—';
  if (vc?.channel) {
    lastSeenStr = 'Currently in VC';
  } else if (stats.last_seen) {
    lastSeenStr = `<t:${Math.floor(stats.last_seen / 1000)}:R>`;
  }

  // ── Roles (exclude @everyone, max 10) ─────────────────────────────────────
  const roles = member.roles.cache
    .filter(r => r.id !== guild.id)
    .sort((a, b) => b.position - a.position)
    .first(10)
    .map(r => `<@&${r.id}>`);

  // ── Build embed ───────────────────────────────────────────────────────────
  const embed = new EmbedBuilder()
    .setColor(member.displayColor || 0x7b8cff)
    .setAuthor({ name: user.tag, iconURL: user.displayAvatarURL({ dynamic: true, size: 256 }) })
    .setThumbnail(user.displayAvatarURL({ dynamic: true, size: 256 }))
    .setTitle('👤 Member Profile')
    .setDescription('Member activity, voice presence, and session history for this user.')
    .addFields(
      { name: 'Joined Server',   value: `<t:${Math.floor(member.joinedAt.getTime() / 1000)}:R>`, inline: true },
      { name: 'Account Created', value: `<t:${Math.floor(user.createdAt.getTime() / 1000)}:R>`,  inline: true },
      { name: 'Account Age',     value: ageStr,                                                    inline: true },
    );

  if (nickname) {
    embed.addFields({ name: 'Nickname', value: nickname, inline: true });
  }

  embed.addFields(
    { name: 'Boost Status', value: boostStr, inline: false },
    { name: 'In Voice',     value: vcLine,   inline: false },
  );

  // ── VC Stats (from SQLite) ────────────────────────────────────────────────
  if (stats.session_count > 0) {
    embed.addFields(
      { name: 'Total VC Time',   value: formatMs(stats.total_ms),                              inline: true },
      { name: 'Sessions',        value: `${stats.session_count}`,                              inline: true },
      { name: 'Avg Session',     value: formatMs(stats.avg_ms),                                inline: true },
      { name: 'Top Channel',     value: stats.top_channel
          ? `**${stats.top_channel}** (${formatMs(stats.top_channel_ms)})`
          : '—',                                                                                 inline: true },
      { name: 'VC Streak',       value: stats.streak > 0 ? `🔥 ${stats.streak} day(s)` : '—', inline: true },
      { name: 'Last Seen in VC', value: lastSeenStr,                                            inline: true },
    );
  } else {
    embed.addFields({ name: 'VC Stats', value: 'No sessions tracked yet for this member.', inline: false });
  }

  if (roles.length > 0) {
    embed.addFields({
      name:  `Roles (${member.roles.cache.size - 1})`,
      value: roles.join(' '),
      inline: false,
    });
  }

  embed.setTimestamp().setFooter({ text: `24/7 POW Bot • User ID ${user.id}` });
  return embed;
}

// ── Panel buttons ─────────────────────────────────────────────────────────────

function buildPanelButtons() {
  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('bot_join')
      .setLabel('Join Voice')
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
  );

  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('bot_myinfo')
      .setLabel('My Info')
      .setEmoji('👤')
      .setStyle(ButtonStyle.Primary),

    new ButtonBuilder()
      .setCustomId('bot_lookup')
      .setLabel('Lookup User')
      .setEmoji('🔍')
      .setStyle(ButtonStyle.Secondary),

    new ButtonBuilder()
      .setCustomId('bot_refresh')
      .setLabel('Refresh')
      .setEmoji('🔄')
      .setStyle(ButtonStyle.Secondary),
  );

  return [row1, row2];
}

// ── Select menus ──────────────────────────────────────────────────────────────

function buildChannelSelectRow() {
  return new ActionRowBuilder().addComponents(
    new ChannelSelectMenuBuilder()
      .setCustomId('bot_join_channel')
      .setPlaceholder('Select a voice channel to join')
      .addChannelTypes(ChannelType.GuildVoice, ChannelType.GuildStageVoice)
  );
}

function buildUserSelectRow() {
  return new ActionRowBuilder().addComponents(
    new UserSelectMenuBuilder()
      .setCustomId('bot_lookup_user')
      .setPlaceholder('Select a member to inspect')
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
        embeds:     [buildPanelEmbed(guild.id, guild)],
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
