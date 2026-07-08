/**
 * Logs when a member leaves or is kicked from the server.
 * Checks audit log to distinguish kicks from voluntary leaves.
 */

const { Events, EmbedBuilder, AuditLogEvent } = require('discord.js');
const { log }           = require('../src/logger');
const { getLogChannel } = require('../src/guildConfig');

async function getKicker(guild, userId, windowMs = 5000) {
  try {
    const logs  = await guild.fetchAuditLogs({ type: AuditLogEvent.MemberKick, limit: 3 });
    const entry = logs.entries.find(e =>
      e.target?.id === userId && (Date.now() - e.createdTimestamp) < windowMs
    );
    if (!entry) return null;
    return {
      tag:    entry.executor.tag,
      mention: `${entry.executor} — ${entry.executor.tag}`,
      reason: entry.reason || 'No reason provided',
    };
  } catch { return null; }
}

module.exports = {
  name: Events.GuildMemberRemove,
  once: false,

  async execute(member) {
    const guild     = member.guild;
    const channelId = getLogChannel(guild.id, 'members');
    if (!channelId) return;

    let logChannel;
    try {
      logChannel = await guild.channels.fetch(channelId);
      if (!logChannel?.isTextBased()) return;
    } catch { return; }

    const user    = member.user;
    const kick    = await getKicker(guild, user.id);
    const joinedAt = member.joinedAt;
    const timeInServer = joinedAt
      ? (() => {
          const ms  = Date.now() - joinedAt.getTime();
          const d   = Math.floor(ms / 86400000);
          const h   = Math.floor((ms % 86400000) / 3600000);
          if (d > 0) return `${d}d ${h}h`;
          return `${h}h`;
        })()
      : 'Unknown';

    // Top roles (exclude @everyone, max 5)
    const roles = member.roles?.cache
      .filter(r => r.id !== guild.id)
      .sort((a, b) => b.position - a.position)
      .first(5)
      .map(r => `<@&${r.id}>`);

    const embed = new EmbedBuilder()
      .setColor(kick ? 0xFF8C42 : 0xED4245)
      .setTitle(kick ? '👢  Member Kicked' : '📤  Member Left')
      .setAuthor({ name: user.tag, iconURL: user.displayAvatarURL({ dynamic: true }) })
      .setThumbnail(user.displayAvatarURL({ dynamic: true, size: 256 }))
      .addFields(
        { name: 'Member',         value: `${user} — ${user.tag}`, inline: false },
        { name: 'Time in Server', value: timeInServer,             inline: true  },
        { name: 'Member Count',   value: `${guild.memberCount}`,   inline: true  },
        { name: '\u200b',         value: '\u200b',                 inline: true  },
      )
      .setTimestamp()
      .setFooter({ text: `24/7 POW Bot • User ID ${user.id}` });

    if (kick) {
      embed.addFields(
        { name: 'Kicked By', value: kick.mention, inline: true },
        { name: 'Reason',    value: kick.reason,  inline: true },
        { name: '\u200b',    value: '\u200b',      inline: true },
      );
    }

    if (roles?.length > 0) {
      embed.addFields({ name: 'Roles', value: roles.join(' '), inline: false });
    }

    try {
      await logChannel.send({ embeds: [embed] });
    } catch (err) {
      log('ERROR', 'Failed to send member remove log', { guild: guild.name, error: err.message });
    }
  },
};
