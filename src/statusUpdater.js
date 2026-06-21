const { ActivityType, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { getVoiceConnection, VoiceConnectionStatus } = require('@discordjs/voice');
const { log }            = require('./logger');
const store              = require('./connectionStore');
const { getGuildConfig } = require('./guildConfig');

const PRESENCE_INTERVAL = 60 * 1000;

function buildPresence() {
  const entries = store.getAllEntries();
  const active  = entries.filter(([guildId]) => {
    const conn = getVoiceConnection(guildId);
    return conn && [
      VoiceConnectionStatus.Ready,
      VoiceConnectionStatus.Signalling,
      VoiceConnectionStatus.Connecting,
    ].includes(conn.state.status);
  });

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

function buildPanelEmbed(guildId) {
  const entry = store.getEntry(guildId);
  const conn  = getVoiceConnection(guildId);

  const isConnected = conn && [
    VoiceConnectionStatus.Ready,
    VoiceConnectionStatus.Signalling,
    VoiceConnectionStatus.Connecting,
  ].includes(conn.state.status);

  let colour, statusLine, channelLine, uptimeLine;

  if (isConnected && entry) {
    colour      = 0x57F287;
    statusLine  = '🟢 Connected';
    channelLine = `**${entry.channelName}**`;
    uptimeLine  = store.formatUptime(entry.joinedAt);
  } else if (entry && !conn) {
    colour      = 0xFEE75C;
    statusLine  = '👻 Ghost — use Force Leave then Join';
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
      .setCustomId('bot_refresh')
      .setLabel('Refresh')
      .setEmoji('🔄')
      .setStyle(ButtonStyle.Secondary),
  );
}

async function updatePanel(client) {
  for (const guild of client.guilds.cache.values()) {
    const config = getGuildConfig(guild.id);
    if (!config.panelChannelId || !config.panelMessageId) continue;

    try {
      const channel = await guild.channels.fetch(config.panelChannelId);
      if (!channel?.isTextBased()) continue;
      const message = await channel.messages.fetch(config.panelMessageId);
      await message.edit({ embeds: [buildPanelEmbed(guild.id)], components: [buildPanelButtons()] });
    } catch (err) {
      log('WARN', 'Could not update panel message', { guild: guild.name, error: err.message });
    }
  }
}

module.exports = { startStatusUpdater, updatePanel, buildPanelEmbed, buildPanelButtons };
