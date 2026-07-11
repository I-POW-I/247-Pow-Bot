const { SlashCommandBuilder, MessageFlags, PermissionFlagsBits } = require('discord.js');
const { log }            = require('../src/logger');
const { setGuildConfig } = require('../src/guildConfig');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('setbotrole')
    .setDescription('Set which role can use the Leave and Force Leave panel buttons')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addRoleOption(opt =>
      opt.setName('role')
        .setDescription('The role that can control the bot — leave blank to reset to server owner only')
        .setRequired(false)
    ),

  async execute(interaction) {
    const { guild, member } = interaction;
    const role = interaction.options.getRole('role');

    if (role) {
      setGuildConfig(guild.id, { botControlRoleId: role.id });
      log('INFO', 'Bot control role set', { guild: guild.name, role: role.name, by: member.user.tag });
      return interaction.reply({
        content: `✅ Members with **${role.name}** can now use the Leave and Force Leave buttons.`,
        flags: [MessageFlags.Ephemeral],
      });
    } else {
      setGuildConfig(guild.id, { botControlRoleId: null });
      log('INFO', 'Bot control role cleared', { guild: guild.name, by: member.user.tag });
      return interaction.reply({
        content: '✅ Bot control role cleared — only the server owner can now use Leave and Force Leave.',
        flags: [MessageFlags.Ephemeral],
      });
    }
  },
};
