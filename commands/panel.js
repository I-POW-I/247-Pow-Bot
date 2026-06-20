const { SlashCommandBuilder, MessageFlags, PermissionFlagsBits } = require('discord.js');
const { log }                                    = require('../src/logger');
const { setGuildConfig }                         = require('../src/guildConfig');
const { buildPanelEmbed, buildPanelButtons }     = require('../src/statusUpdater');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('panel')
    .setDescription('Post the live bot control panel with Join/Leave/Status buttons here')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  async execute(interaction, client) {
    const { guild, channel, member } = interaction;

    // Check bot can send embeds here
    const botMember = await guild.members.fetchMe();
    if (!channel.permissionsFor(botMember).has(['SendMessages', 'EmbedLinks'])) {
      return interaction.reply({
        content: '❌ I need **Send Messages** and **Embed Links** permission in this channel.',
        flags: [MessageFlags.Ephemeral],
      });
    }

    // Post the panel message
    const message = await channel.send({
      embeds:     [buildPanelEmbed(guild.id)],
      components: [buildPanelButtons()],
    });

    // Save channel + message ID so updatePanel() can edit it going forward
    setGuildConfig(guild.id, {
      panelChannelId: channel.id,
      panelMessageId: message.id,
    });

    log('INFO', 'Control panel deployed', {
      guild:   guild.name,
      channel: channel.name,
      by:      member.user.tag,
    });

    return interaction.reply({
      content: '✅ Control panel posted! It will stay up to date automatically.',
      flags: [MessageFlags.Ephemeral],
    });
  },
};
