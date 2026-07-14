const { Events, PermissionFlagsBits, MessageFlags, ActivityType } = require('discord.js');
const { joinVoiceChannel, getVoiceConnection, VoiceConnectionStatus } = require('@discordjs/voice');
const { log }                     = require('../src/logger');
const store                       = require('../src/connectionStore');
const { attachDisconnectHandler } = require('../src/heartbeat');
const {
  updatePanel, buildMemberEmbed,
  buildChannelSelectRow, buildUserSelectRow,
} = require('../src/statusUpdater');
const { setLastChannel, clearLastChannel, setStats, getVerifyRoleId, getBotControlRoleId } = require('../src/guildConfig');
const { attachSilencePlayer, stopSilencePlayer } = require('../src/audioPlayer');
const { run, selectOne, selectAll } = require('../src/database');
const { joinTimes }               = require('../src/memberTracker');

const HEALTHY = [
  VoiceConnectionStatus.Ready,
  VoiceConnectionStatus.Signalling,
  VoiceConnectionStatus.Connecting,
];

const PLATFORM_NAMES = { kick: 'Kick', twitch: 'Twitch', youtube: 'YouTube' };

// ── Shared join logic ─────────────────────────────────────────────────────────
async function joinChannel(targetChannel, guild, member, client, interaction) {
  const existingConn = getVoiceConnection(guild.id);
  if (existingConn) {
    if (HEALTHY.includes(existingConn.state.status)) {
      const entry = store.getEntry(guild.id);
      return interaction.reply({
        content: `I am already connected to **${entry?.channelName || 'a voice channel'}**. Ask a admin to use the Leave button first.`,
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

    store.setConnection(guild.id, {
      channelId:   targetChannel.id,
      channelName: targetChannel.name,
      guildName:   guild.name,
    });
    setLastChannel(guild.id, targetChannel.id);

    const entry = store.getEntry(guild.id);
    setStats(guild.id, { joinedAt: entry.joinedAt, reconnectCount: 0 });

    client.user.setPresence({
      status: 'online',
      activities: [{ name: `🔊 ${targetChannel.name}`, type: ActivityType.Custom }],
    });

    log('VOICE', 'Joined channel', { guild: guild.name, channel: targetChannel.name, by: member.user.tag });
    await updatePanel(client);

    return interaction.reply({ content: `✅ Joined **${targetChannel.name}**.`, flags: [MessageFlags.Ephemeral] });
  } catch {
    return interaction.reply({
      content: 'Failed to join — check I have the **Connect** permission.',
      flags: [MessageFlags.Ephemeral],
    });
  }
}

module.exports = {
  name: Events.InteractionCreate,
  once: false,

  async execute(interaction, client) {

    // ── Slash commands ────────────────────────────────────────────────────────
    if (interaction.isChatInputCommand()) {
      const command = client.commands.get(interaction.commandName);
      if (!command) return;
      try {
        await command.execute(interaction, client);
      } catch (err) {
        log('WARN', `Error in /${interaction.commandName}`, { error: err.message });
        const reply = { content: 'Something went wrong.', flags: [MessageFlags.Ephemeral] };
        interaction.replied || interaction.deferred
          ? await interaction.followUp(reply)
          : await interaction.reply(reply);
      }
      return;
    }

    // ── Channel select (voice channel picker for Join) ─────────────────────────
    if (interaction.isChannelSelectMenu() && interaction.customId === 'bot_join_channel') {
      const targetChannel = interaction.channels.first();
      if (!targetChannel?.isVoiceBased()) {
        return interaction.reply({ content: 'That is not a voice channel.', flags: [MessageFlags.Ephemeral] });
      }
      return joinChannel(targetChannel, interaction.guild, interaction.member, client, interaction);
    }

    // ── User select (member lookup) ───────────────────────────────────────────
    if (interaction.isUserSelectMenu() && interaction.customId === 'bot_lookup_user') {
      const { guild } = interaction;
      const user   = interaction.users.first();
      const member = await guild.members.fetch(user.id).catch(() => null);
      if (!member) {
        return interaction.reply({ content: 'Could not find that member.', flags: [MessageFlags.Ephemeral] });
      }
      return interaction.reply({
        embeds: [buildMemberEmbed(member, guild)],
        flags:  [MessageFlags.Ephemeral],
      });
    }

    // ── Game alert: add (game selected from search results) ──────────────────
    if (interaction.isStringSelectMenu() && interaction.customId === 'gamealert_add_select') {
      const { guild, member } = interaction;
      const [appId, channelId, roleId] = interaction.values[0].split('|');
      const gameName = interaction.component.options.find(o => o.value === interaction.values[0])?.label || `App ${appId}`;

      const existing = selectOne(
        'SELECT id FROM game_subscriptions WHERE guild_id = ? AND app_id = ?',
        [guild.id, appId]
      );

      if (existing) {
        return interaction.update({
          content: `> **${gameName}** is already being tracked in this server.`,
          components: [],
        });
      }

      const { GAME_COLOURS } = require('../commands/gamealerts');
      const color = GAME_COLOURS?.[parseInt(appId)] || null;

      run(
        'INSERT INTO game_subscriptions (guild_id, app_id, game_name, channel_id, role_id, color) VALUES (?, ?, ?, ?, ?, ?)',
        [guild.id, appId, gameName, channelId, roleId || null, color || null]
      );

      log('INFO', 'Game alert added', { guild: guild.name, game: gameName, appId, by: member.user.tag });

      const roleStr = roleId ? ` · pinging <@&${roleId}>` : '';
      return interaction.update({
        content: `✅ Now tracking **${gameName}** — updates will post in <#${channelId}>${roleStr}.`,
        components: [],
      });
    }

    // ── Game alert: remove ────────────────────────────────────────────────────
    if (interaction.isStringSelectMenu() && interaction.customId === 'gamealert_remove_select') {
      const { guild, member } = interaction;
      const subId    = interaction.values[0];
      const sub      = selectOne('SELECT * FROM game_subscriptions WHERE id = ? AND guild_id = ?', [subId, guild.id]);

      if (!sub) {
        return interaction.update({ content: 'Not found — may have already been removed.', components: [] });
      }

      run('DELETE FROM game_subscriptions WHERE id = ?', [subId]);
      log('INFO', 'Game alert removed', { guild: guild.name, game: sub.game_name, by: member.user.tag });

      return interaction.update({
        content: `✅ No longer tracking **${sub.game_name}**.`,
        components: [],
      });
    }

    // ── Game alert: test (game selected) ─────────────────────────────────────
    if (interaction.isStringSelectMenu() && interaction.customId === 'gamealert_test_select') {
      const subId = interaction.values[0];
      const sub   = selectOne('SELECT * FROM game_subscriptions WHERE id = ?', [subId]);
      if (!sub) return interaction.update({ content: 'Not found.', components: [] });
      await interaction.update({ content: `🔍 Fetching latest update for **${sub.game_name}**...`, components: [] });
      const { runTest } = require('../commands/gamealerts');
      return runTest(interaction, sub);
    }

    // ── Remove streamer select ────────────────────────────────────────────────
    if (interaction.isStringSelectMenu() && interaction.customId === 'remove_streamer_select') {
      const { guild, member } = interaction;
      const subId = interaction.values[0];
      const sub   = selectOne('SELECT * FROM streamer_subscriptions WHERE id = ? AND guild_id = ?', [subId, guild.id]);

      if (!sub) {
        return interaction.update({ content: 'Not found — may have already been removed.', components: [] });
      }

      run('DELETE FROM streamer_subscriptions WHERE id = ?', [subId]);
      log('INFO', 'Streamer removed', { guild: guild.name, platform: sub.platform, username: sub.username, by: member.user.tag });

      return interaction.update({
        content:    `✅ No longer watching **${sub.display_name || sub.username}** on **${PLATFORM_NAMES[sub.platform]}**.`,
        components: [],
      });
    }

    if (!interaction.isButton()) return;

    const { guild, member } = interaction;
    const isAdmin = member.permissions.has(PermissionFlagsBits.ManageGuild);

    // ── Verify button ─────────────────────────────────────────────────────────
    if (interaction.customId === 'bot_verify') {
      const roleId = getVerifyRoleId(guild.id);
      if (!roleId) {
        return interaction.reply({ content: 'Verification not set up. An admin needs to run `/verify setup` first.', flags: [MessageFlags.Ephemeral] });
      }
      const role = guild.roles.cache.get(roleId);
      if (!role) {
        return interaction.reply({ content: 'The verify role no longer exists — contact an admin.', flags: [MessageFlags.Ephemeral] });
      }
      if (member.roles.cache.has(roleId)) {
        return interaction.reply({ content: 'You are already verified.', flags: [MessageFlags.Ephemeral] });
      }
      try {
        await member.roles.add(role, 'Verified via button');
        log('INFO', 'Member verified', { guild: guild.name, user: member.user.tag, role: role.name });
        return interaction.reply({ content: `✅ You've been verified and given the **${role.name}** role.`, flags: [MessageFlags.Ephemeral] });
      } catch (err) {
        log('WARN', 'Failed to assign verify role', { guild: guild.name, error: err.message });
        return interaction.reply({ content: 'Failed to assign role — make sure my role is above the verify role in Server Settings → Roles.', flags: [MessageFlags.Ephemeral] });
      }
    }

    // ── Open to everyone ──────────────────────────────────────────────────────

    if (interaction.customId === 'bot_refresh') {
      await updatePanel(client);
      return interaction.reply({ content: 'Panel refreshed.', flags: [MessageFlags.Ephemeral] });
    }

    if (interaction.customId === 'bot_myinfo') {
      return interaction.reply({
        embeds: [buildMemberEmbed(member, guild)],
        flags:  [MessageFlags.Ephemeral],
      });
    }

    if (interaction.customId === 'bot_lookup') {
      const { buildUserSelectRow } = require('../src/statusUpdater');
      return interaction.reply({
        content:    'Select a member to view their profile:',
        components: [buildUserSelectRow()],
        flags:      [MessageFlags.Ephemeral],
      });
    }

    // ── Role/owner gated ──────────────────────────────────────────────────────
    const botControlRoleId = getBotControlRoleId(guild.id);
    const canControl       = botControlRoleId
      ? member.roles.cache.has(botControlRoleId)
      : guild.ownerId === member.user.id;

    // ── Join — Manage Server ──────────────────────────────────────────────────
    if (interaction.customId === 'bot_join') {
      if (!isAdmin) {
        return interaction.reply({ content: 'You need **Manage Server** to use this.', flags: [MessageFlags.Ephemeral] });
      }
      const targetChannel = member.voice?.channel;
      if (targetChannel?.isVoiceBased()) return joinChannel(targetChannel, guild, member, client, interaction);
      return interaction.reply({
        content:    "You're not in a voice channel. Pick one:",
        components: [buildChannelSelectRow()],
        flags:      [MessageFlags.Ephemeral],
      });
    }

    // ── Leave — role/owner gated ──────────────────────────────────────────────
    if (interaction.customId === 'bot_leave') {
      if (!canControl) {
        return interaction.reply({
          content: botControlRoleId ? `You need the <@&${botControlRoleId}> role.` : 'Only the server owner can use this.',
          flags: [MessageFlags.Ephemeral],
        });
      }
      const conn  = getVoiceConnection(guild.id);
      const entry = store.getEntry(guild.id);
      if (!conn && !entry) return interaction.reply({ content: "Not connected.", flags: [MessageFlags.Ephemeral] });
      if (conn) { try { conn.destroy(); } catch (_) {} }
      stopSilencePlayer(guild.id);
      store.clearConnection(guild.id);
      clearLastChannel(guild.id);
      client.user.setPresence({ status: 'idle', activities: [{ name: 'Sleeping...', type: ActivityType.Custom }] });
      log('VOICE', 'Left via panel', { guild: guild.name, by: member.user.tag });
      await updatePanel(client);
      return interaction.reply({ content: `Disconnected from **${entry?.channelName || 'the voice channel'}**.`, flags: [MessageFlags.Ephemeral] });
    }

    // ── Force Leave — role/owner gated ────────────────────────────────────────
    if (interaction.customId === 'bot_forceleave') {
      if (!canControl) {
        return interaction.reply({
          content: botControlRoleId ? `You need the <@&${botControlRoleId}> role.` : 'Only the server owner can use this.',
          flags: [MessageFlags.Ephemeral],
        });
      }
      const conn     = getVoiceConnection(guild.id);
      const hadEntry = store.getEntry(guild.id);
      if (conn) { try { conn.destroy(); } catch (_) {} }
      stopSilencePlayer(guild.id);
      store.clearConnection(guild.id);
      clearLastChannel(guild.id);
      log('VOICE', 'Force leave via panel', { guild: guild.name, by: member.user.tag });
      await updatePanel(client);
      return interaction.reply({
        content: !conn && hadEntry ? 'Cache cleared, Bot state now reset & ready to go.' : '🔴 Force disconnected the from voice channel.',
        flags: [MessageFlags.Ephemeral],
      });
    }
  },
};
