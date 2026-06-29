const {
  SlashCommandBuilder, EmbedBuilder,
  ActionRowBuilder, ButtonBuilder, ButtonStyle,
  MessageFlags, PermissionFlagsBits,
} = require('discord.js');
const { log }              = require('../src/logger');
const { setGuildConfig }   = require('../src/guildConfig');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('verify')
    .setDescription('Verification commands')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
    .addSubcommand(sub =>
      sub
        .setName('setup')
        .setDescription('Post the verification message with a button in this channel')
        .addRoleOption(opt =>
          opt
            .setName('role')
            .setDescription('The role to give when someone verifies')
            .setRequired(true)
        )
        .addStringOption(opt =>
          opt
            .setName('title')
            .setDescription('Title of the verification embed (default: Verify)')
            .setRequired(false)
        )
        .addStringOption(opt =>
          opt
            .setName('description')
            .setDescription('Description text on the embed')
            .setRequired(false)
        )
    ),

  async execute(interaction, client) {
    const { guild, member } = interaction;
    const sub  = interaction.options.getSubcommand();

    if (sub === 'setup') {
      const role  = interaction.options.getRole('role');
      const title = interaction.options.getString('title') || '✅  Verify';
      const desc  = interaction.options.getString('description') ||
        'Click the button below.';

      // Check bot can assign this role
      const botMember = await guild.members.fetchMe();
      if (botMember.roles.highest.position <= role.position) {
        return interaction.reply({
          content: `❌ I can't assign **${role.name}** — it's higher than or equal to my highest role. Move my role above it in Server Settings → Roles.`,
          flags: [MessageFlags.Ephemeral],
        });
      }

      const embed = new EmbedBuilder()
        .setTitle(title)
        .setDescription(desc)
        .setColor(0x57F287)
        .setFooter({ text: guild.name });

      const button = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('bot_verify')
          .setLabel('Verify')
          .setEmoji('✅')
          .setStyle(ButtonStyle.Success)
      );

      const message = await interaction.channel.send({ embeds: [embed], components: [button] });

      // Save role ID and message info so we can reference it later
      setGuildConfig(guild.id, {
        verifyRoleId:      role.id,
        verifyChannelId:   interaction.channel.id,
        verifyMessageId:   message.id,
      });

      log('INFO', 'Verify setup', { guild: guild.name, role: role.name, by: member.user.tag });

      return interaction.reply({
        content: `✅ Verification message posted. Members will receive **${role.name}** when they click the button.`,
        flags: [MessageFlags.Ephemeral],
      });
    }
  },
};
