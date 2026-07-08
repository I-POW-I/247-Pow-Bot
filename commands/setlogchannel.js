const { SlashCommandBuilder, ChannelType, MessageFlags, PermissionFlagsBits } = require('discord.js');
const { log }           = require('../src/logger');
const { setLogChannel } = require('../src/guildConfig');

const TYPE_LABELS = {
  voice:    '🔊 Voice Activity',
  messages: '🗑️ Message Deletes',
  members:  '👥 Member Join/Leave',
};

module.exports = {
  data: new SlashCommandBuilder()
    .setName('setlogchannel')
    .setDescription('Set which channel a specific type of log gets posted to')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addStringOption(option =>
      option
        .setName('type')
        .setDescription('What type of logs to send here')
        .setRequired(true)
        .addChoices(
          { name: '🔊 Voice Activity',      value: 'voice'    },
          { name: '🗑️ Message Deletes',     value: 'messages' },
          { name: '👥 Member Join / Leave', value: 'members'  },
        )
    )
    .addChannelOption(option =>
      option
        .setName('channel')
        .setDescription('The text channel to send these logs to')
        .addChannelTypes(ChannelType.GuildText)
        .setRequired(true)
    ),

  async execute(interaction) {
    const { guild, member } = interaction;
    const type    = interaction.options.getString('type');
    const channel = interaction.options.getChannel('channel');

    const botMember = await guild.members.fetchMe();
    if (!channel.permissionsFor(botMember).has(['SendMessages', 'EmbedLinks'])) {
      return interaction.reply({
        content: `❌ 24/7 POW Bot does not have **Send Messages** and **Embed Links** in <#${channel.id}>.`,
        flags: [MessageFlags.Ephemeral],
      });
    }

    setLogChannel(guild.id, type, channel.id);

    log('INFO', `Log channel set for ${type}`, { guild: guild.name, channel: channel.name, by: member.user.tag });

    await channel.send({
      embeds: [{
        color:       0x4ecf85,
        title:       `📋 ${TYPE_LABELS[type]} Logs — Active`,
        description: `This channel will now receive **${TYPE_LABELS[type]}** logs for **${guild.name}**.`,
        footer:      { text: `Configured by ${member.user.tag}` },
        timestamp:   new Date().toISOString(),
      }],
    });

    return interaction.reply({
      content: `✅ **${TYPE_LABELS[type]}** logs will now post in <#${channel.id}> for 24/7 POW Bot.`,
      flags: [MessageFlags.Ephemeral],
    });
  },
};
