/**
 * Two jobs in one file:
 *
 * 1. Presence updater — sets the bot's Discord status (the coloured dot + text)
 *    every 60 seconds based on what it's currently connected to.
 *    e.g. "🔊 General · 1h 14m"
 *
 * 2. updatePanel(client) — rebuilds and edits the control panel embed in every
 *    guild that has one set up. Call this whenever the bot joins, leaves,
 *    auto-rejoins, or force-leaves so the panel stays in sync.
 */

const { ActivityType, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { getVoiceConnection, VoiceConnectionStatus } = require('@discordjs/voice');
const { log }           = require('./logger');
const store             = require('./connectionStore');
const { getGuildConfig } = require('./guildConfig');

const PRESENCE_INTERVAL = 60 * 1000; // 1 minute

// ── Presence ──────────────────────────────────────────────────────────────────

/**
 * Build a presence string based on current connections.
 * @returns {{ name: string, status: 'online'|'idle' }}
 */
function buildPresence() {
  const entries = store.getAllEntries();
  const activeEntries = entries.filter(([guildId]) => {
    const conn = getVoiceConnection(guildId);
    return conn && conn.state.status === VoiceConnectionStatus.Ready;
  });

  if (activeEntries.length === 0) {
    return { name: 'Idle — use /join', status: 'idle' };
  }

  if (activeEntries.length === 1) {
    const [guildId, meta] = activeEntries[0];
    const uptime = store.formatUptime(meta.joinedAt);
    return { name: `🔊 ${meta.channelName} · ${uptime}`, status: 'online' };
  }

  // Multiple guilds connected
  return { name: `🔊 ${activeEntries.length} channels`, status: 'online' };
}

/**
 * Start the 60-second presence update loop.
 * @param {import('discord.js').Client} client
 */
function startStatusUpdater(client) {
  const update = () => {
    const { name, status } = buildPresence();
    client.user.setPresence({
      status,
      activities: [{ name, type: ActivityType.Custom }],
    });
  };

  // Run immediately, then every 60s
  update();
  setInterval(update, PRESENCE_INTERVAL);
  log('INFO', 'Presence updater started (60s interval)');
}

// ── Control Panel ─────────────────────────────────────────────────────────────

/**
 * Build the control panel embed reflecting current bot state for a given guild.
 * @param {string} guildId
 * @returns {EmbedBuilder}
 */
function buildPanelEmbed(guildId) {
  const entry = store.getEntry(guildId);
  const conn  = getVoiceConnection(guildId);

  const isConnected = conn && conn.state.status === VoiceConnectionStatus.Ready;
  const isGhost     = entry && !conn;

  let statusLine, channelLine, uptimeLine, colour;

  if (isConnected && entry) {
    colour      = 0x57F287; // green
    statusLine  = '🟢 Connected';
    channelLine = `**${entry.channelName}**`;
    uptimeLine  = store.formatUptime(entry.joinedAt);
  } else if (isGhost) {
    colour      = 0xFEE75C; // yellow
    statusLine  = '👻 Ghost — use Force Leave then Join';
    channelLine = entry.channelName;
    uptimeLine  = '—';
  } else {
    colour      = 0xED4245; // red
    statusLine  = '🔴 Idle';
    channelLine = '—';
    uptimeLine  = '—';
  }

  return new EmbedBuilder()
    .setTitle('🤖 POW Bot — Control Panel')
    .setColor(colour)
    .addFields(
      { name: 'Status',  value: statusLine,  inline: true },
      { name: 'Channel', value: channelLine, inline: true },
      { name: 'Uptime',  value: uptimeLine,  inline: true },
    )
    .setFooter({ text: 'Last updated' })
    .setTimestamp();
}

/**
 * The row of buttons shown on the control panel.
 */
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
      .setEmoji('💀')
      .setStyle(ButtonStyle.Danger),

    new ButtonBuilder()
      .setCustomId('bot_status')
      .setLabel('Status')
      .setEmoji('📊')
      .setStyle(ButtonStyle.Primary),
  );
}

/**
 * Edit the saved panel message for every guild that has one configured.
 * Safe to call after any state change (join, leave, auto-rejoin etc.)
 * @param {import('discord.js').Client} client
 */
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
      // Panel message may have been deleted — not fatal, just log it
      log('WARN', 'Could not update panel message', { guild: guild.name, error: err.message });
    }
  }
}

module.exports = { startStatusUpdater, updatePanel, buildPanelEmbed, buildPanelButtons };
