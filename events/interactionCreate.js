const { Events, PermissionFlagsBits, MessageFlags, ActivityType } = require('discord.js');
const { joinVoiceChannel, getVoiceConnection, VoiceConnectionStatus } = require('@discordjs/voice');
const { log }                     = require('../src/logger');
const store                       = require('../src/connectionStore');
const { attachDisconnectHandler } = require('../src/heartbeat');
const { updatePanel }             = require('../src/statusUpdater');
const { setLastChannel, clearLastChannel } = require('../src/guildConfig');

module.exports = {
  name: Events.InteractionCreate,
  once: false,

  async execute(interaction, client) {

    // ── Slash commands ────────────────────────────────────────────────────────
    if (interaction.isChatInputCommand()) {
      const command = client.commands.get(interaction.commandName);

      if (!command) {
        log('WARN', `No handler found for command: /${interaction.commandName}`);
        return;
      }

      try {
        await command.execute(interaction, client);
      } catch (err) {
        log('ERROR', `Error executing /${interaction.commandName}`, {
          guild: interaction.guild?.name,
          user:  interaction.user.tag,
          error: err.message,
        });

        const errorReply = { content: '❌ Something went wrong running that command.', flags: [MessageFlags.Ephemeral] };
        if (interaction.replied || interaction.deferred) {
          await interaction.followUp(errorReply);
        } else {
          await interaction.reply(errorReply);
        }
      }

      return;
    }

    // ── Button interactions (control panel) ───────────────────────────────────
    if (interaction.isButton()) {
      const { guild, member } = interaction;

      // ── Join button ──────────────────────────────────────────────────────
      if (interaction.customId === 'bot_join') {
        const targetChannel = member.voice?.channel;

        if (!targetChannel || !targetChannel.isVoiceBased()) {
          return interaction.reply({
            content: '❌ You need to be in a voice channel first for the Join button to work.',
            flags: [MessageFlags.Ephemeral],
          });
        }

        const existingConn = getVoiceConnection(guild.id);
        if (existingConn) {
          const healthyStatuses = [VoiceConnectionStatus.Ready, VoiceConnectionStatus.Signalling, VoiceConnectionStatus.Connecting];
          if (healthyStatuses.includes(existingConn.state.status)) {
            const entry = store.getEntry(guild.id);
            return interaction.reply({
              content: `⚠️ Already connected to **${entry?.channelName || 'a voice channel'}**. Use Leave first.`,
              flags: [MessageFlags.Ephemeral],
            });
          }
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

          // Save so bot can rejoin this channel after a restart
          setLastChannel(guild.id, targetChannel.id);

          client.user.setPresence({
            status: 'online',
            activities: [{ name: `🔊 ${targetChannel.name}`, type: ActivityType.Custom }],
          });

          log('VOICE', 'Joined via panel button', { guild: guild.name, channel: targetChannel.name, by: member.user.tag });
          await updatePanel(client);

          return interaction.reply({
            content: `✅ Joined **${targetChannel.name}**.`,
            flags: [MessageFlags.Ephemeral],
          });
        } catch (err) {
          return interaction.reply({
            content: '❌ Failed to join — check I have the **Connect** permission.',
            flags: [MessageFlags.Ephemeral],
          });
        }
      }

      // ── Leave button ─────────────────────────────────────────────────────
      if (interaction.customId === 'bot_leave') {
        const conn  = getVoiceConnection(guild.id);
        const entry = store.getEntry(guild.id);

        if (!conn && !entry) {
          return interaction.reply({
            content: "❌ I'm not connected to any voice channel.",
            flags: [MessageFlags.Ephemeral],
          });
        }

        if (conn) { try { conn.destroy(); } catch (_) {} }
        store.clearConnection(guild.id);
        clearLastChannel(guild.id);

        client.user.setPresence({
          status: 'idle',
          activities: [{ name: 'Idle — use /join', type: ActivityType.Custom }],
        });

        log('VOICE', 'Left via panel button', { guild: guild.name, by: member.user.tag });
        await updatePanel(client);

        return interaction.reply({
          content: `👋 Disconnected from **${entry?.channelName || 'the voice channel'}**.`,
          flags: [MessageFlags.Ephemeral],
        });
      }

      // ── Force Leave button ────────────────────────────────────────────────
      if (interaction.customId === 'bot_forceleave') {
        if (!member.permissions.has(PermissionFlagsBits.MoveMembers)) {
          return interaction.reply({
            content: '🚫 You need the **Move Members** permission to use Force Leave.',
            flags: [MessageFlags.Ephemeral],
          });
        }

        const conn     = getVoiceConnection(guild.id);
        const hadEntry = store.getEntry(guild.id);
        if (conn) { try { conn.destroy(); } catch (_) {} }
        store.clearConnection(guild.id);
        clearLastChannel(guild.id);

        client.user.setPresence({
          status: 'idle',
          activities: [{ name: 'Idle — use /join', type: ActivityType.Custom }],
        });

        log('VOICE', 'Force leave via panel button', { guild: guild.name, by: member.user.tag });
        await updatePanel(client);

        const wasGhost = !conn && hadEntry;
        return interaction.reply({
          content: wasGhost
            ? '👻 Ghost cleared. All state wiped. You can now use Join again.'
            : '🔴 Force disconnected. All state cleared.',
          flags: [MessageFlags.Ephemeral],
        });
      }
    }
  },
};
