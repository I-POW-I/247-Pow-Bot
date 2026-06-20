/**
 * Fires every time ANYONE's voice state changes in any guild the bot is in.
 * This covers: joining a VC, leaving a VC, moving between VCs,
 * server mute/unmute, server deafen/undeafen, starting/stopping a stream.
 *
 * We skip self-mute/unmute and self-deafen/undeafen because those fire
 * constantly and would spam the log channel.
 * We also skip bots (including ourselves).
 */

const { Events, EmbedBuilder, AuditLogEvent } = require('discord.js');
const { log }            = require('../src/logger');
const { getGuildConfig } = require('../src/guildConfig');

// ── Colour palette for different event types ──────────────────────────────────
const COLOURS = {
  join:             0x57F287, // green
  leave:            0xED4245, // red
  move:             0x5865F2, // blurple
  serverMute:       0xFF7043, // orange
  serverUnmute:     0xFEE75C, // yellow
  serverDeafen:     0xFF7043,
  serverUndeafen:   0xFEE75C,
  streamStart:      0x9C59D1, // purple
  streamStop:       0x9ca3af, // grey
};

// ── Event builder helpers ─────────────────────────────────────────────────────

function joinEmbed(member, channel) {
  return new EmbedBuilder()
    .setColor(COLOURS.join)
    .setAuthor({ name: member.user.tag, iconURL: member.user.displayAvatarURL() })
    .setDescription(`📥 **${member.displayName}** joined **${channel.name}**`)
    .addFields({ name: 'Channel', value: `<#${channel.id}>`, inline: true })
    .setTimestamp();
}

function leaveEmbed(member, channel) {
  return new EmbedBuilder()
    .setColor(COLOURS.leave)
    .setAuthor({ name: member.user.tag, iconURL: member.user.displayAvatarURL() })
    .setDescription(`📤 **${member.displayName}** left **${channel.name}**`)
    .addFields({ name: 'Channel', value: `<#${channel.id}>`, inline: true })
    .setTimestamp();
}

function moveEmbed(member, fromChannel, toChannel) {
  return new EmbedBuilder()
    .setColor(COLOURS.move)
    .setAuthor({ name: member.user.tag, iconURL: member.user.displayAvatarURL() })
    .setDescription(`🔀 **${member.displayName}** moved channels`)
    .addFields(
      { name: 'From', value: `<#${fromChannel.id}>`, inline: true },
      { name: 'To',   value: `<#${toChannel.id}>`,   inline: true },
    )
    .setTimestamp();
}

function serverMuteEmbed(member, muted, channel, modTag) {
  return new EmbedBuilder()
    .setColor(muted ? COLOURS.serverMute : COLOURS.serverUnmute)
    .setAuthor({ name: member.user.tag, iconURL: member.user.displayAvatarURL() })
    .setDescription(muted
      ? `🔇 **${member.displayName}** was server-muted`
      : `🔈 **${member.displayName}** was server-unmuted`)
    .addFields(
      { name: 'Channel', value: channel ? `<#${channel.id}>` : '—', inline: true },
      { name: 'By',      value: modTag || 'Unknown',                 inline: true },
    )
    .setTimestamp();
}

function serverDeafenEmbed(member, deafened, channel, modTag) {
  return new EmbedBuilder()
    .setColor(deafened ? COLOURS.serverDeafen : COLOURS.serverUndeafen)
    .setAuthor({ name: member.user.tag, iconURL: member.user.displayAvatarURL() })
    .setDescription(deafened
      ? `🔕 **${member.displayName}** was server-deafened`
      : `🔔 **${member.displayName}** was server-undeafened`)
    .addFields(
      { name: 'Channel', value: channel ? `<#${channel.id}>` : '—', inline: true },
      { name: 'By',      value: modTag || 'Unknown',                 inline: true },
    )
    .setTimestamp();
}

function streamEmbed(member, started, channel) {
  return new EmbedBuilder()
    .setColor(started ? COLOURS.streamStart : COLOURS.streamStop)
    .setAuthor({ name: member.user.tag, iconURL: member.user.displayAvatarURL() })
    .setDescription(started
      ? `🖥️ **${member.displayName}** started streaming`
      : `🖥️ **${member.displayName}** stopped streaming`)
    .addFields({ name: 'Channel', value: channel ? `<#${channel.id}>` : '—', inline: true })
    .setTimestamp();
}

// ── Audit log helper (to find who did a server mute/deafen) ──────────────────

async function getModeratorTag(guild, actionType, targetId) {
  try {
    const logs = await guild.fetchAuditLogs({ type: actionType, limit: 3 });
    const entry = logs.entries.find(e =>
      e.target?.id === targetId &&
      (Date.now() - e.createdTimestamp) < 5000
    );
    return entry?.executor?.tag || null;
  } catch {
    return null;
  }
}

// ── Main event handler ────────────────────────────────────────────────────────

module.exports = {
  name: Events.VoiceStateUpdate,
  once: false,

  async execute(oldState, newState) {
    const member = newState.member || oldState.member;
    if (!member || member.user.bot) return; // Ignore bots entirely

    const guild  = newState.guild;
    const config = getGuildConfig(guild.id);
    if (!config.logChannelId) return; // No log channel set for this guild

    let logChannel;
    try {
      logChannel = await guild.channels.fetch(config.logChannelId);
      if (!logChannel?.isTextBased()) return;
    } catch {
      return; // Channel deleted or no access
    }

    const oldChannel = oldState.channel;
    const newChannel = newState.channel;

    try {
      // ── Join ──────────────────────────────────────────────────────────────
      if (!oldChannel && newChannel) {
        log('VOICE', `${member.user.tag} joined ${newChannel.name}`, { guild: guild.name });
        await logChannel.send({ embeds: [joinEmbed(member, newChannel)] });
        return;
      }

      // ── Leave ─────────────────────────────────────────────────────────────
      if (oldChannel && !newChannel) {
        log('VOICE', `${member.user.tag} left ${oldChannel.name}`, { guild: guild.name });
        await logChannel.send({ embeds: [leaveEmbed(member, oldChannel)] });
        return;
      }

      // ── Move ──────────────────────────────────────────────────────────────
      if (oldChannel && newChannel && oldChannel.id !== newChannel.id) {
        log('VOICE', `${member.user.tag} moved ${oldChannel.name} → ${newChannel.name}`, { guild: guild.name });
        await logChannel.send({ embeds: [moveEmbed(member, oldChannel, newChannel)] });
        return;
      }

      // ── Same channel — check for state changes ────────────────────────────

      // Server mute / unmute (a mod action — always log these)
      if (oldState.serverMute !== newState.serverMute) {
        const modTag = await getModeratorTag(guild, AuditLogEvent.MemberUpdate, member.id);
        await logChannel.send({ embeds: [serverMuteEmbed(member, newState.serverMute, newChannel, modTag)] });
        return;
      }

      // Server deafen / undeafen (a mod action — always log these)
      if (oldState.serverDeaf !== newState.serverDeaf) {
        const modTag = await getModeratorTag(guild, AuditLogEvent.MemberUpdate, member.id);
        await logChannel.send({ embeds: [serverDeafenEmbed(member, newState.serverDeaf, newChannel, modTag)] });
        return;
      }

      // Stream start / stop (interesting to see who's sharing their screen)
      if (oldState.streaming !== newState.streaming) {
        await logChannel.send({ embeds: [streamEmbed(member, newState.streaming, newChannel)] });
        return;
      }

      // Self-mute/unmute and self-deafen/undeafen are intentionally
      // NOT logged — they fire constantly and would flood the channel.

    } catch (err) {
      log('ERROR', 'Failed to send voice log', { guild: guild.name, error: err.message });
    }
  },
};
