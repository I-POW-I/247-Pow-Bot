const { SlashCommandBuilder, ChannelType, MessageFlags, PermissionFlagsBits } = require('discord.js');
const { log }            = require('../src/logger');
const { setGuildConfig } = require('../src/guildConfig');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('setlogchannel')
    .setDescription('Set the channel where all voice activity logs are posted')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addChannelOption(option =>
      option
        .setName('channel')
        .setDescription('The text channel to send voice logs to')
        .addChannelTypes(ChannelType.GuildText)
        .setRequired(true)
    ),

  async execute(interaction) {
    const { guild, member } = interaction;
    const channel = interaction.options.getChannel('channel');

    // Verify the bot can actually send messages there
    const botMember = await guild.members.fetchMe();
    if (!channel.permissionsFor(botMember).has(['SendMessages', 'EmbedLinks'])) {
      return interaction.reply({
        content: `❌ I don't have permission to send messages in <#${channel.id}>. Give me **Send Messages** and **Embed Links** there first.`,
        flags: [MessageFlags.Ephemeral],
      });
    }

    setGuildConfig(guild.id, { logChannelId: channel.id });

    log('INFO', 'Log channel set', {
      guild:   guild.name,
      channel: channel.name,
      by:      member.user.tag,
    });

    await channel.send({
      embeds: [{
        color:       0x57F287,
        title:       '📋 Voice Log Channel Set',
        description: 'All voice channel activity in this server will be logged here.\n\nThis includes: joins, leaves, moves, server mutes/deafens, and screen shares.',
        footer:      { text: `Configured by ${member.user.tag}` },
        timestamp:   new Date().toISOString(),
      }],
    });

    return interaction.reply({
      content: `✅ Voice logs will now be posted in <#${channel.id}>.`,
      flags: [MessageFlags.Ephemeral],
    });
  },
};
