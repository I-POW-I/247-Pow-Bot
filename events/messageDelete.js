/**
 * Logs deleted messages to the guild's configured messages log channel.
 *
 * Important limitation: Discord only provides message content for messages
 * the bot has cached (seen since it last started). Messages deleted before
 * the bot came online, or very old messages, will show "Content unavailable".
 * This is a Discord API limitation — not a bug.
 *
 * Requires: Message Content Intent enabled in Discord Developer Portal
 * under Bot → Privileged Gateway Intents.
 */

const { Events, EmbedBuilder } = require('discord.js');
const { log }           = require('../src/logger');
const { getLogChannel } = require('../src/guildConfig');

module.exports = {
  name: Events.MessageDelete,
  once: false,

  async execute(message) {
    // Ignore DMs and bots
    if (!message.guild || message.author?.bot) return;

    const guild     = message.guild;
    const channelId = getLogChannel(guild.id, 'messages');
    if (!channelId) return;

    let logChannel;
    try {
      logChannel = await guild.channels.fetch(channelId);
      if (!logChannel?.isTextBased()) return;
    } catch { return; }

    const author  = message.author;
    const content = message.content || null;
    const attachments = [...(message.attachments?.values() || [])];

    const embed = new EmbedBuilder()
      .setColor(0xED4245)
      .setTitle('🗑️  Message Deleted')
      .setTimestamp()
      .setFooter({ text: `Message ID: ${message.id}` });

    // Author info
    if (author) {
      embed.setAuthor({ name: author.tag, iconURL: author.displayAvatarURL({ dynamic: true }) });
      embed.addFields(
        { name: 'Author',  value: `${message.member || author} — ${author.tag}`, inline: true },
        { name: 'Channel', value: `<#${message.channelId}>`,                     inline: true },
      );
    } else {
      embed.addFields({ name: 'Channel', value: `<#${message.channelId}>`, inline: true });
    }

    // Message content
    if (content) {
      // Truncate if over Discord's field limit
      const truncated = content.length > 1024
        ? content.slice(0, 1021) + '...'
        : content;
      embed.addFields({ name: 'Content', value: truncated, inline: false });
    } else {
      embed.addFields({ name: 'Content', value: '*Content unavailable — message was not cached*', inline: false });
    }

    // Attachments / images
    if (attachments.length > 0) {
      const attachmentList = attachments.map(a => `[${a.name}](${a.url})`).join('\n');
      embed.addFields({ name: `Attachments (${attachments.length})`, value: attachmentList, inline: false });

      // Set the first image as the embed image if it's an image file
      const firstImage = attachments.find(a => a.contentType?.startsWith('image/'));
      if (firstImage) embed.setImage(firstImage.url);
    }

    try {
      await logChannel.send({ embeds: [embed] });
    } catch (err) {
      log('ERROR', 'Failed to send message delete log', { guild: guild.name, error: err.message });
    }
  },
};
