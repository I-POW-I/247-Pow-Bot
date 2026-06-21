const { SlashCommandBuilder, MessageFlags, ActivityType } = require('discord.js');
const { getVoiceConnection } = require('@discordjs/voice');
const { log }              = require('../src/logger');
const store                = require('../src/connectionStore');
const { updatePanel }      = require('../src/statusUpdater');
const { clearLastChannel } = require('../src/guildConfig');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('leave')
    .setDescription('Disconnect the bot from the voice channel'),

  async execute(interaction, client) {
    const { guild, member } = interaction;

    const connection = getVoiceConnection(guild.id);
    const entry      = store.getEntry(guild.id);

    if (!connection && !entry) {
      return interaction.reply({
        content: "❌ I'm not connected to any voice channel in this server.",
        flags: [MessageFlags.Ephemeral],
      });
    }

    if (connection) { try { connection.destroy(); } catch (_) {} }
    store.clearConnection(guild.id);

    // Clear the saved channel so bot doesn't rejoin on next restart
    clearLastChannel(guild.id);

    client.user.setPresence({
      status: 'idle',
      activities: [{ name: 'Idle — use /join', type: ActivityType.Custom }],
    });

    log('VOICE', 'Left voice channel', {
      guild:   guild.name,
      channel: entry?.channelName || 'unknown',
      by:      member.user.tag,
      uptime:  entry ? store.formatUptime(entry.joinedAt) : 'unknown',
    });

    await updatePanel(client);

    const uptime = entry ? ` (was connected for ${store.formatUptime(entry.joinedAt)})` : '';
    return interaction.reply({
      content: `👋 Disconnected from **${entry?.channelName || 'the voice channel'}**${uptime}.`,
    });
  },
};
