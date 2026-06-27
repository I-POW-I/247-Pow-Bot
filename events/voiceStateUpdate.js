/**
 * Logs all voice activity to the guild's configured voice log channel.
 * Writes VC sessions to SQLite on join/leave.
 *
 * Audit log notes:
 *   MemberUpdate  → target IS the specific user  (mute/deafen)
 *   MemberMove    → target is the GUILD, not user (mod moving someone)
 *   MemberDisconnect → target is the GUILD        (mod force-disconnecting)
 *
 * Bot MUST have "View Audit Log" permission in the guild or all mod
 * detection silently returns null.
 */

const { Events, EmbedBuilder, AuditLogEvent } = require('discord.js');
const { log }                      = require('../src/logger');
const { getLogChannel }            = require('../src/guildConfig');
const { joinTimes, streamTimes }   = require('../src/memberTracker');
const { startSession, endSession } = require('../src/database');

const C = {
  join:           0x57F287,
  leave:          0xED4245,
  forceLeave:     0xFF7043,
  move:           0x5865F2,
  modMove:        0xFF7043,
  serverMute:     0xFF7043,
  serverUnmute:   0x57F287,
  serverDeafen:   0xFF7043,
  serverUndeafen: 0x57F287,
  streamStart:    0x9C59D1,
  streamStop:     0x747F8D,
};

function base(member, colour, title) {
  return new EmbedBuilder()
    .setColor(colour)
    .setAuthor({ name: member.user.tag, iconURL: member.user.displayAvatarURL({ dynamic: true }) })
    .setTitle(title)
    .setTimestamp()
    .setFooter({ text: `User ID: ${member.user.id}` });
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

/**
 * Get the mod who performed a MEMBER_UPDATE action (mute/deafen).
 * These entries have the specific user as the target.
 */
async function getMuteDeafMod(guild, userId, windowMs = 4000) {
  try {
    const logs  = await guild.fetchAuditLogs({ type: AuditLogEvent.MemberUpdate, limit: 5 });
    const entry = logs.entries.find(e =>
      e.target?.id === userId && (Date.now() - e.createdTimestamp) < windowMs
    );
    return entry?.executor?.tag || null;
  } catch { return null; }
}

/**
 * Get the mod who performed a MEMBER_MOVE action.
 * MemberMove entries target the GUILD, not the moved user.
 * We match by destination channel + recent timestamp for accuracy.
 */
async function getMoveMod(guild, destChannelId, windowMs = 5000) {
  try {
    const logs  = await guild.fetchAuditLogs({ type: AuditLogEvent.MemberMove, limit: 5 });
    const entry = logs.entries.find(e =>
      (Date.now() - e.createdTimestamp) < windowMs &&
      e.extra?.channel?.id === destChannelId
    );
    return entry?.executor?.tag || null;
  } catch { return null; }
}

/**
 * Get the mod who performed a MEMBER_DISCONNECT action.
 * MemberDisconnect entries also target the GUILD, not the disconnected user.
 * We just check recency — if there's a disconnect audit within a few seconds
 * of the leave event, it was a forced disconnect.
 */
async function getDisconnectMod(guild, windowMs = 5000) {
  try {
    const logs  = await guild.fetchAuditLogs({ type: AuditLogEvent.MemberDisconnect, limit: 3 });
    const entry = logs.entries.find(e =>
      (Date.now() - e.createdTimestamp) < windowMs
    );
    return entry?.executor?.tag || null;
  } catch { return null; }
}

async function sendLog(guild, embed) {
  const channelId = getLogChannel(guild.id, 'voice');
  if (!channelId) return;
  try {
    const channel = await guild.channels.fetch(channelId);
    if (channel?.isTextBased()) await channel.send({ embeds: [embed] });
  } catch (err) {
    log('ERROR', 'Failed to send voice log', { guild: guild.name, error: err.message });
  }
}

module.exports = {
  name: Events.VoiceStateUpdate,
  once: false,

  async execute(oldState, newState) {
    const member = newState.member || oldState.member;
    if (!member || member.user.bot) return;

    const guild      = newState.guild;
    const oldChannel = oldState.channel;
    const newChannel = newState.channel;
    const key        = `${guild.id}_${member.user.id}`;

    // ── Join ──────────────────────────────────────────────────────────────────
    if (!oldChannel && newChannel) {
      joinTimes.set(key, Date.now());
      startSession(member.user.id, guild.id, newChannel.id, newChannel.name);

      await sendLog(guild, base(member, C.join, '📥  Member Joined Voice')
        .addFields(
          { name: 'Member',      value: `${member} — ${member.user.tag}`,             inline: false },
          { name: 'Channel',     value: `<#${newChannel.id}> **${newChannel.name}**`, inline: true  },
          { name: 'Members Now', value: `${newChannel.members.size}`,                 inline: true  },
        ));
      return;
    }

    // ── Leave ─────────────────────────────────────────────────────────────────
    if (oldChannel && !newChannel) {
      const duration = joinTimes.has(key)
        ? formatDuration(Date.now() - joinTimes.get(key))
        : null;

      joinTimes.delete(key);
      streamTimes.delete(key);
      endSession(member.user.id, guild.id);

      // Check if a mod force-disconnected them
      const disconnectedBy = await getDisconnectMod(guild);

      if (disconnectedBy) {
        await sendLog(guild, base(member, C.forceLeave, '🚫  Member Disconnected by Moderator')
          .addFields(
            { name: 'Member',          value: `${member} — ${member.user.tag}`,              inline: false },
            { name: 'Channel',         value: `<#${oldChannel.id}> **${oldChannel.name}**`,  inline: true  },
            { name: 'Was In',          value: duration || 'Unknown',                          inline: true  },
            { name: 'Disconnected By', value: disconnectedBy,                                 inline: false },
          ));
      } else {
        await sendLog(guild, base(member, C.leave, '📤  Member Left Voice')
          .addFields(
            { name: 'Member',  value: `${member} — ${member.user.tag}`,             inline: false },
            { name: 'Channel', value: `<#${oldChannel.id}> **${oldChannel.name}**`, inline: true  },
            { name: 'Was In',  value: duration || 'Unknown',                         inline: true  },
          ));
      }
      return;
    }

    // ── Move between channels ─────────────────────────────────────────────────
    if (oldChannel && newChannel && oldChannel.id !== newChannel.id) {
      // Close old session, start new one in destination channel
      endSession(member.user.id, guild.id);
      startSession(member.user.id, guild.id, newChannel.id, newChannel.name);
      joinTimes.set(key, Date.now());

      // Check destination channel — if a recent MemberMove audit matches, it was a mod
      const movedBy = await getMoveMod(guild, newChannel.id);

      await sendLog(guild, base(member,
        movedBy ? C.modMove : C.move,
        movedBy ? '🔀  Member Moved by Moderator' : '🔀  Member Changed Channel')
        .addFields(
          { name: 'Member',  value: `${member} — ${member.user.tag}`,             inline: false },
          { name: 'From',    value: `<#${oldChannel.id}> **${oldChannel.name}**`, inline: true  },
          { name: 'To',      value: `<#${newChannel.id}> **${newChannel.name}**`, inline: true  },
          ...(movedBy
            ? [{ name: 'Moved By', value: movedBy, inline: false }]
            : [{ name: 'Self Move', value: 'Member moved themselves', inline: false }]
          ),
        ));
      return;
    }

    // ── Same channel state changes ─────────────────────────────────────────────

    if (oldState.serverMute !== newState.serverMute) {
      const mod = await getMuteDeafMod(guild, member.id);
      await sendLog(guild, base(member,
        newState.serverMute ? C.serverMute : C.serverUnmute,
        newState.serverMute ? '🔇  Member Server Muted' : '🔈  Member Server Unmuted')
        .addFields(
          { name: 'Member',    value: `${member} — ${member.user.tag}`,                                inline: false },
          { name: 'Channel',   value: newChannel ? `<#${newChannel.id}> **${newChannel.name}**` : '—', inline: true  },
          { name: 'Action By', value: mod || 'Unknown',                                                inline: true  },
        ));
      return;
    }

    if (oldState.serverDeaf !== newState.serverDeaf) {
      const mod = await getMuteDeafMod(guild, member.id);
      await sendLog(guild, base(member,
        newState.serverDeaf ? C.serverDeafen : C.serverUndeafen,
        newState.serverDeaf ? '🔕  Member Server Deafened' : '🔔  Member Server Undeafened')
        .addFields(
          { name: 'Member',    value: `${member} — ${member.user.tag}`,                                inline: false },
          { name: 'Channel',   value: newChannel ? `<#${newChannel.id}> **${newChannel.name}**` : '—', inline: true  },
          { name: 'Action By', value: mod || 'Unknown',                                                inline: true  },
        ));
      return;
    }

    if (oldState.streaming !== newState.streaming) {
      if (newState.streaming) {
        streamTimes.set(key, Date.now());
        await sendLog(guild, base(member, C.streamStart, '🖥️  Member Started Streaming')
          .addFields(
            { name: 'Member',  value: `${member} — ${member.user.tag}`,                                inline: false },
            { name: 'Channel', value: newChannel ? `<#${newChannel.id}> **${newChannel.name}**` : '—', inline: true  },
          ));
      } else {
        const duration = streamTimes.has(key)
          ? formatDuration(Date.now() - streamTimes.get(key))
          : null;
        streamTimes.delete(key);
        await sendLog(guild, base(member, C.streamStop, '🖥️  Member Stopped Streaming')
          .addFields(
            { name: 'Member',       value: `${member} — ${member.user.tag}`,                                inline: false },
            { name: 'Channel',      value: newChannel ? `<#${newChannel.id}> **${newChannel.name}**` : '—', inline: true  },
            { name: 'Streamed For', value: duration || 'Unknown',                                            inline: true  },
          ));
      }
      return;
    }
  },
};
