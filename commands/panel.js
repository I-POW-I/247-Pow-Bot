const { SlashCommandBuilder, MessageFlags, PermissionFlagsBits } = require('discord.js');
const { log }                                = require('../src/logger');
const { getGuildConfig, setGuildConfig }     = require('../src/guildConfig');
const { buildPanelEmbed, buildPanelButtons } = require('../src/statusUpdater');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('panel')
    .setDescription('Post the live bot control panel in this channel')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  async execute(interaction, client) {
    const { guild, channel, member } = interaction;

    const botMember = await guild.members.fetchMe();
    if (!channel.permissionsFor(botMember).has(['SendMessages', 'EmbedLinks'])) {
      return interaction.reply({
        content: '❌ I need **Send Messages** and **Embed Links** permission in this channel.',
        flags: [MessageFlags.Ephemeral],
      });
    }

    const existing = getGuildConfig(guild.id);

    // Delete the old panel message if one exists
    if (existing.panelChannelId && existing.panelMessageId) {
      try {
        const oldChannel = await guild.channels.fetch(existing.panelChannelId);
        const oldMessage = await oldChannel?.messages.fetch(existing.panelMessageId);
        await oldMessage?.delete();
      } catch {
        // Old message already gone — no problem
      }
    }

    // Post the new panel
    const message = await channel.send({
      embeds:     [buildPanelEmbed(guild.id)],
      components: [buildPanelButtons()],
    });

    setGuildConfig(guild.id, {
      panelChannelId: channel.id,
      panelMessageId: message.id,
    });

    log('INFO', 'Control panel deployed', { guild: guild.name, channel: channel.name, by: member.user.tag });

    return interaction.reply({
      content: '✅ Control panel posted.',
      flags: [MessageFlags.Ephemeral],
    });
  },
};
