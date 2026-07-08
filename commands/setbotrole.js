const { SlashCommandBuilder, MessageFlags, PermissionFlagsBits } = require('discord.js');
const { log } = require('../src/logger');
const { setBotControlRoleId } = require('../src/guildConfig');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('setbotrole')
    .setDescription('Set the role allowed to manage Leave and Force Leave controls')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addRoleOption(option =>
      option
        .setName('role')
        .setDescription('The role that can manage Leave and Force Leave')
        .setRequired(false)
    ),

  async execute(interaction) {
    const role = interaction.options.getRole('role');
    const guild = interaction.guild;

    if (role) {
      setBotControlRoleId(guild.id, role.id);
      log('INFO', '24/7 POW Bot control role set', { guild: guild.name, role: role.name, by: interaction.user.tag });
      return interaction.reply({
        content: `✅ The <@&${role.id}> role can now manage Leave and Force Leave controls.`,
        flags: [MessageFlags.Ephemeral],
      });
    }

    setBotControlRoleId(guild.id, null);
    log('INFO', '24/7 POW Bot control role cleared', { guild: guild.name, by: interaction.user.tag });
    return interaction.reply({
      content: '✅ The control role has been cleared. The server owner will remain the fallback authority.',
      flags: [MessageFlags.Ephemeral],
    });
  },
};
