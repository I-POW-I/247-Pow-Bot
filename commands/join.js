const { SlashCommandBuilder, ChannelType, MessageFlags, ActivityType } = require('discord.js');
const { joinVoiceChannel, getVoiceConnection, VoiceConnectionStatus } = require('@discordjs/voice');
const { log }                    = require('../src/logger');
const store                      = require('../src/connectionStore');
const { attachDisconnectHandler } = require('../src/heartbeat');
const { updatePanel }            = require('../src/statusUpdater');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('join')
    .setDescription('Bring the bot into a voice channel and keep it there 24/7')
    .addChannelOption(option =>
      option
        .setName('channel')
        .setDescription('Voice channel to join (defaults to your current channel)')
        .addChannelTypes(ChannelType.GuildVoice, ChannelType.GuildStageVoice)
        .setRequired(false)
    ),

  async execute(interaction, client) {
    const { guild, member } = interaction;

    const targetChannel =
      interaction.options.getChannel('channel') || member.voice?.channel;

    if (!targetChannel || !targetChannel.isVoiceBased()) {
      return interaction.reply({
        content: '❌ You need to be in a voice channel, or specify one with `/join channel:`',
        flags: [MessageFlags.Ephemeral],
      });
    }

    // Ghost-aware check
    const existingConn = getVoiceConnection(guild.id);
    if (existingConn) {
      const healthyStatuses = [
        VoiceConnectionStatus.Ready,
        VoiceConnectionStatus.Signalling,
        VoiceConnectionStatus.Connecting,
      ];

      if (healthyStatuses.includes(existingConn.state.status)) {
        const entry = store.getEntry(guild.id);
        return interaction.reply({
          content: `⚠️ Already connected to **${entry?.channelName || 'a voice channel'}**. Use \`/leave\` first, or \`/forceleave\` if something's wrong.`,
          flags: [MessageFlags.Ephemeral],
        });
      }

      log('GHOST', 'Stale connection found during /join — destroying before rejoining', { guild: guild.name });
      try { existingConn.destroy(); } catch (_) {}
      store.clearConnection(guild.id);
    }

    try {
      const connection = joinVoiceChannel({
        channelId:      targetChannel.id,
        guildId:        guild.id,
        adapterCreator: guild.voiceAdapterCreator,
        selfDeaf:       true,
        selfMute:       true,
      });

      attachDisconnectHandler(connection, guild.name, targetChannel.name);
      store.setConnection(guild.id, {
        channelId:   targetChannel.id,
        channelName: targetChannel.name,
        guildName:   guild.name,
      });

      client.user.setPresence({
        status: 'online',
        activities: [{ name: `🔊 ${targetChannel.name}`, type: ActivityType.Custom }],
      });

      log('VOICE', 'Joined voice channel', {
        guild:   guild.name,
        channel: targetChannel.name,
        by:      member.user.tag,
      });

      // Update the control panel embed in this guild
      await updatePanel(client);

      return interaction.reply({
        content: `✅ Joined **${targetChannel.name}**. I'll stay until told to leave.`,
      });

    } catch (err) {
      log('ERROR', 'Failed to join voice channel', { guild: guild.name, channel: targetChannel.name, error: err.message });
      return interaction.reply({
        content: '❌ Failed to join the channel — check I have the **Connect** permission.',
        flags: [MessageFlags.Ephemeral],
      });
    }
  },
};
