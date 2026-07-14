/**
 * Logs edited messages showing before and after content.
 * Only works for cached messages (sent while bot was running).
 * Requires Message Content Intent enabled in Developer Portal.
 */

const { Events, EmbedBuilder } = require('discord.js');
const { log }           = require('../src/logger');
const { getLogChannel } = require('../src/guildConfig');

module.exports = {
  name: Events.MessageUpdate,
  once: false,

  async execute(oldMessage, newMessage) {
    // Ignore DMs, bots, embeds loading (Discord auto-embeds links)
    if (!newMessage.guild) return;
    if (newMessage.author?.bot) return;
    if (oldMessage.content === newMessage.content) return; // Embed load, not a real edit

    const guild     = newMessage.guild;
    const channelId = getLogChannel(guild.id, 'messages');
    if (!channelId) return;

    let logChannel;
    try {
      logChannel = await guild.channels.fetch(channelId);
      if (!logChannel?.isTextBased()) return;
    } catch { return; }

    const author     = newMessage.author;
    const oldContent = oldMessage.content || '*Not cached*';
    const newContent = newMessage.content || '*Empty*';

    const embed = new EmbedBuilder()
      .setColor(0x5865F2)
      .setTitle('Message Edited')
      .setTimestamp()
      .setFooter({ text: `Message ID: ${newMessage.id}` })
      .setAuthor({ name: author.tag, iconURL: author.displayAvatarURL({ dynamic: true }) })
      .setThumbnail(author.displayAvatarURL({ dynamic: true, size: 256 }))
      .addFields(
        { name: 'Author',  value: `${newMessage.member || author} — ${author.tag}`, inline: true },
        { name: 'Channel', value: `<#${newMessage.channelId}>`,                      inline: true },
        { name: 'Jump',    value: `[View Message](${newMessage.url})`,               inline: true },
        {
          name:   'Before',
          value:  oldContent.length > 1024 ? oldContent.slice(0, 1021) + '...' : oldContent,
          inline: false,
        },
        {
          name:   'After',
          value:  newContent.length > 1024 ? newContent.slice(0, 1021) + '...' : newContent,
          inline: false,
        },
      );

    try {
      await logChannel.send({ embeds: [embed] });
    } catch (err) {
      log('ERROR', 'Failed to send message edit log', { guild: guild.name, error: err.message });
    }
  },
};
