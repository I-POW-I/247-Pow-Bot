const { Events, PermissionFlagsBits, MessageFlags, ActivityType } = require('discord.js');
const { joinVoiceChannel, getVoiceConnection, VoiceConnectionStatus } = require('@discordjs/voice');
const { log }                       = require('../src/logger');
const store                         = require('../src/connectionStore');
const { attachDisconnectHandler }   = require('../src/heartbeat');
const { updatePanel }               = require('../src/statusUpdater');
const { setLastChannel, clearLastChannel, setStats } = require('../src/guildConfig');
const { attachSilencePlayer, stopSilencePlayer }     = require('../src/audioPlayer');

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
          guild: interaction.guild?.name, user: interaction.user.tag, error: err.message,
        });
        const reply = { content: '❌ Something went wrong.', flags: [MessageFlags.Ephemeral] };
        interaction.replied || interaction.deferred ? await interaction.followUp(reply) : await interaction.reply(reply);
      }
      return;
    }

    // ── Panel buttons ─────────────────────────────────────────────────────────
    if (!interaction.isButton()) return;

    const { guild, member } = interaction;

    // ── Permission check (Join / Leave / Force Leave require Manage Server) ──
    const isAdmin = member.permissions.has(PermissionFlagsBits.ManageGuild);

    // ── Refresh — open to everyone ────────────────────────────────────────────
    if (interaction.customId === 'bot_refresh') {
      await updatePanel(client);
      return interaction.reply({ content: '🔄 Panel refreshed.', flags: [MessageFlags.Ephemeral] });
    }

    // All other buttons: Manage Server required
    if (!isAdmin) {
      return interaction.reply({
        content: '🚫 You need the **Manage Server** permission to use this.',
        flags: [MessageFlags.Ephemeral],
      });
    }

    // ── Join ──────────────────────────────────────────────────────────────────
    if (interaction.customId === 'bot_join') {
      const targetChannel = member.voice?.channel;

      if (!targetChannel?.isVoiceBased()) {
        return interaction.reply({
          content: '❌ You need to be in a voice channel first.',
          flags: [MessageFlags.Ephemeral],
        });
      }

      const existingConn = getVoiceConnection(guild.id);
      if (existingConn) {
        const alive = [VoiceConnectionStatus.Ready, VoiceConnectionStatus.Signalling, VoiceConnectionStatus.Connecting];
        if (alive.includes(existingConn.state.status)) {
          const entry = store.getEntry(guild.id);
          return interaction.reply({
            content: `⚠️ Already connected to **${entry?.channelName || 'a voice channel'}**. Use Leave first.`,
            flags: [MessageFlags.Ephemeral],
          });
        }
        try { existingConn.destroy(); } catch (_) {}
        store.clearConnection(guild.id);
        stopSilencePlayer(guild.id);
      }

      try {
        const connection = joinVoiceChannel({
          channelId:      targetChannel.id,
          guildId:        guild.id,
          adapterCreator: guild.voiceAdapterCreator,
          selfDeaf:       true,
          selfMute:       false,
        });

        attachDisconnectHandler(connection, guild.name, targetChannel.name);
        attachSilencePlayer(connection, guild.id);

        store.setConnection(guild.id, { channelId: targetChannel.id, channelName: targetChannel.name, guildName: guild.name });
        setLastChannel(guild.id, targetChannel.id);

        // Persist initial stats
        const entry = store.getEntry(guild.id);
        setStats(guild.id, { joinedAt: entry.joinedAt, reconnectCount: 0 });

        client.user.setPresence({ status: 'online', activities: [{ name: `🔊 ${targetChannel.name}`, type: ActivityType.Custom }] });

        log('VOICE', 'Joined via panel', { guild: guild.name, channel: targetChannel.name, by: member.user.tag });
        await updatePanel(client);

        return interaction.reply({ content: `✅ Joined **${targetChannel.name}**.`, flags: [MessageFlags.Ephemeral] });

      } catch {
        return interaction.reply({ content: '❌ Failed to join — check I have the **Connect** permission.', flags: [MessageFlags.Ephemeral] });
      }
    }

    // ── Leave ─────────────────────────────────────────────────────────────────
    if (interaction.customId === 'bot_leave') {
      const conn  = getVoiceConnection(guild.id);
      const entry = store.getEntry(guild.id);

      if (!conn && !entry) {
        return interaction.reply({ content: "❌ I'm not connected to any voice channel.", flags: [MessageFlags.Ephemeral] });
      }

      if (conn) { try { conn.destroy(); } catch (_) {} }
      stopSilencePlayer(guild.id);
      store.clearConnection(guild.id);
      clearLastChannel(guild.id);

      client.user.setPresence({ status: 'idle', activities: [{ name: 'Sleeping...', type: ActivityType.Custom }] });

      log('VOICE', 'Left via panel', { guild: guild.name, by: member.user.tag });
      await updatePanel(client);

      return interaction.reply({
        content: `👋 Disconnected from **${entry?.channelName || 'the voice channel'}**.`,
        flags: [MessageFlags.Ephemeral],
      });
    }

    // ── Force Leave ───────────────────────────────────────────────────────────
    if (interaction.customId === 'bot_forceleave') {
      const conn     = getVoiceConnection(guild.id);
      const hadEntry = store.getEntry(guild.id);

      if (conn) { try { conn.destroy(); } catch (_) {} }
      stopSilencePlayer(guild.id);
      store.clearConnection(guild.id);
      clearLastChannel(guild.id);

      client.user.setPresence({ status: 'idle', activities: [{ name: 'Sleeping...', type: ActivityType.Custom }] });

      log('VOICE', 'Force leave via panel', { guild: guild.name, by: member.user.tag });
      await updatePanel(client);

      const wasGhost = !conn && hadEntry;
      return interaction.reply({
        content: wasGhost
          ? '👻 Ghost cleared. All state wiped. You can now use Join again.'
          : '🔴 Force disconnected. All state cleared.',
        flags: [MessageFlags.Ephemeral],
      });
    }
  },
};
