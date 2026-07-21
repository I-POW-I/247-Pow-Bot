const {
  SlashCommandBuilder, EmbedBuilder, MessageFlags,
  PermissionFlagsBits, ChannelType,
} = require('discord.js');
const { setLogChannel, getLogChannel } = require('../src/guildConfig');
const { log } = require('../src/logger');

const TYPES = [
  { key: 'voice',    label: 'Voice Activity',    option: 'voice'      },
  { key: 'messages', label: 'Message Logs',      option: 'messages'   },
  { key: 'members',  label: 'Member Join/Leave',  option: 'members'    },
  { key: 'modlog',   label: 'Moderation Actions', option: 'moderation' },
];

module.exports = {
  data: new SlashCommandBuilder()
    .setName('setlogs')
    .setDescription('Configure log channels — run with no options to see current setup')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addChannelOption(opt =>
      opt.setName('voice').setDescription('Voice activity logs').addChannelTypes(ChannelType.GuildText).setRequired(false)
    )
    .addChannelOption(opt =>
      opt.setName('messages').setDescription('Message delete and edit logs').addChannelTypes(ChannelType.GuildText).setRequired(false)
    )
    .addChannelOption(opt =>
      opt.setName('members').setDescription('Member join and leave logs').addChannelTypes(ChannelType.GuildText).setRequired(false)
    )
    .addChannelOption(opt =>
      opt.setName('moderation').setDescription('Moderation action logs (kick, ban, warn, timeout)').addChannelTypes(ChannelType.GuildText).setRequired(false)
    )
    .addChannelOption(opt =>
      opt.setName('commands').setDescription('Log every slash command used in the server').addChannelTypes(ChannelType.GuildText).setRequired(false)
    ),

  async execute(interaction) {
    const { guild } = interaction;
    const updated = [];

    for (const type of TYPES) {
      const channel = interaction.options.getChannel(type.option);
      if (channel) {
        setLogChannel(guild.id, type.key, channel.id);
        updated.push({ type, channel });
        log('INFO', `Log channel set: ${type.key}`, { guild: guild.name, channel: channel.name, by: interaction.user.tag });
      }
    }

    const fields = TYPES.map(type => {
      const channelId  = getLogChannel(guild.id, type.key);
      const justUpdated = updated.find(u => u.type.key === type.key);
      return {
        name:   type.label,
        value:  channelId ? `<#${channelId}>${justUpdated ? ' ← updated' : ''}` : '*Not set*',
        inline: false,
      };
    });

    return interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(updated.length > 0 ? 0x57F287 : 0x5865F2)
          .setTitle(updated.length > 0 ? 'Log Channels Updated' : 'Log Channel Config')
          .addFields(fields)
          .setTimestamp()
          .setFooter({ text: updated.length > 0 ? `${updated.length} channel(s) updated` : 'Use /setlogs with channel options to configure' }),
      ],
      flags: [MessageFlags.Ephemeral],
    });
  },
};
