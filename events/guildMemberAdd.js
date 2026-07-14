/**
 * Logs when a member joins the server.
 * Posts to the members log channel.
 */

const { Events, EmbedBuilder } = require('discord.js');
const { log }           = require('../src/logger');
const { getLogChannel } = require('../src/guildConfig');

module.exports = {
  name: Events.GuildMemberAdd,
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

    const user       = member.user;
    const accountAge = Date.now() - user.createdAt.getTime();
    const ageInDays  = Math.floor(accountAge / 86400000);

    // Flag suspiciously new accounts
    const isNew     = ageInDays < 7;
    const ageStr    = ageInDays > 365
      ? `${Math.floor(ageInDays / 365)}y ${Math.floor((ageInDays % 365) / 30)}m`
      : ageInDays > 30
        ? `${Math.floor(ageInDays / 30)} month(s)`
        : `${ageInDays} day(s)`;

    const embed = new EmbedBuilder()
      .setColor(0x57F287)
      .setTitle(`${isNew ? '⚠️  New Account — ' : ''}Member Joined`)
      .setAuthor({ name: user.tag, iconURL: user.displayAvatarURL({ dynamic: true }) })
      .setThumbnail(user.displayAvatarURL({ dynamic: true, size: 256 }))
      .addFields(
        { name: 'Member',        value: `${member} — ${user.tag}`,                                          inline: false },
        { name: 'Account Age',   value: `${ageStr}${isNew ? ' ⚠️' : ''}`,                                  inline: true  },
        { name: 'Created',       value: `<t:${Math.floor(user.createdAt.getTime() / 1000)}:R>`,             inline: true  },
        { name: 'Member Count',  value: `${guild.memberCount}`,                                             inline: true  },
      )
      .setTimestamp()
      .setFooter({ text: `User ID: ${user.id}` });

    if (isNew) {
      embed.setDescription('⚠️ This account was created less than 7 days ago.');
    }

    try {
      await logChannel.send({ embeds: [embed] });
    } catch (err) {
      log('ERROR', 'Failed to send member add log', { guild: guild.name, error: err.message });
    }
  },
};
