/**
 * Logs all voice activity to the guild's configured voice log channel.
 * Detects forced disconnects and moderator moves via audit log.
 * Tracks join/stream times via memberTracker for duration display.
 * Skips: self-mute, self-deafen, bots.
 */

const { Events, EmbedBuilder, AuditLogEvent } = require('discord.js');
const { log }                    = require('../src/logger');
const { getLogChannel }          = require('../src/guildConfig');
const { joinTimes, streamTimes } = require('../src/memberTracker');

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
 * Fetch the executor of a recent audit log action for a target user.
 * Returns null if nothing found within the time window.
 */
async function getAuditExecutor(guild, targetId, auditType, windowMs = 4000) {
  try {
    const logs  = await guild.fetchAuditLogs({ type: auditType, limit: 5 });
    const entry = logs.entries.find(e =>
      e.target?.id === targetId && (Date.now() - e.createdTimestamp) < windowMs
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

      // Check if a mod forcibly disconnected this member
      const disconnectedBy = await getAuditExecutor(guild, member.id, AuditLogEvent.MemberDisconnect);

      if (disconnectedBy) {
        // Forced disconnect by a moderator
        await sendLog(guild, base(member, C.forceLeave, '🚫  Member Disconnected by Moderator')
          .addFields(
            { name: 'Member',          value: `${member} — ${member.user.tag}`,              inline: false },
            { name: 'Channel',         value: `<#${oldChannel.id}> **${oldChannel.name}**`,  inline: true  },
            { name: 'Was In',          value: duration || 'Unknown',                          inline: true  },
            { name: 'Disconnected By', value: disconnectedBy,                                 inline: false },
          ));
      } else {
        // Voluntary leave
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
      // Check if a mod moved them (MemberMove audit event)
      const movedBy = await getAuditExecutor(guild, member.id, AuditLogEvent.MemberMove);

      await sendLog(guild, base(member, movedBy ? C.modMove : C.move,
        movedBy ? '🔀  Member Moved by Moderator' : '🔀  Member Changed Channel')
        .addFields(
          { name: 'Member', value: `${member} — ${member.user.tag}`,             inline: false },
          { name: 'From',   value: `<#${oldChannel.id}> **${oldChannel.name}**`, inline: true  },
          { name: 'To',     value: `<#${newChannel.id}> **${newChannel.name}**`, inline: true  },
          ...(movedBy ? [{ name: 'Moved By', value: movedBy, inline: false }] : []),
        ));
      return;
    }

    // ── State changes in same channel ─────────────────────────────────────────

    if (oldState.serverMute !== newState.serverMute) {
      const mod = await getAuditExecutor(guild, member.id, AuditLogEvent.MemberUpdate);
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
      const mod = await getAuditExecutor(guild, member.id, AuditLogEvent.MemberUpdate);
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

    // Self-mute / self-deafen intentionally not logged
  },
};
