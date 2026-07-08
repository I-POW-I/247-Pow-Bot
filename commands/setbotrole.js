const { SlashCommandBuilder, MessageFlags, PermissionFlagsBits } = require('discord.js');
const { log } = require('../src/logger');
const { getBotControlRoleId, setBotControlRoleId } = require('../src/guildConfig');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('setbotrole')
    .setDescription('Set or view the role allowed to manage Leave and Force Leave controls')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addRoleOption(option =>
      option
        .setName('role')
        .setDescription('The role that can manage Leave and Force Leave')
        .setRequired(false)
    )
    .addBooleanOption(option =>
      option
        .setName('clear')
        .setDescription('Remove the current bot-control role (server owner becomes the fallback)')
        .setRequired(false)
    ),

  async execute(interaction) {
    const role       = interaction.options.getRole('role');
    const clearFlag  = interaction.options.getBoolean('clear');
    const guild      = interaction.guild;
    const currentId  = getBotControlRoleId(guild.id);

    // ── Set a new role ────────────────────────────────────────────────────────
    if (role) {
      setBotControlRoleId(guild.id, role.id);
      log('INFO', '24/7 POW Bot control role set', { guild: guild.name, role: role.name, by: interaction.user.tag });
      return interaction.reply({
        content: `✅ The <@&${role.id}> role can now manage Leave and Force Leave controls.`,
        flags: [MessageFlags.Ephemeral],
      });
    }

    // ── Clear the role ────────────────────────────────────────────────────────
    if (clearFlag) {
      if (!currentId) {
        return interaction.reply({
          content: '❕ No bot-control role is currently set — nothing to clear.',
          flags: [MessageFlags.Ephemeral],
        });
      }
      setBotControlRoleId(guild.id, null);
      log('INFO', '24/7 POW Bot control role cleared', { guild: guild.name, by: interaction.user.tag });
      return interaction.reply({
        content: '✅ The control role has been cleared. The server owner will remain the fallback authority.',
        flags: [MessageFlags.Ephemeral],
      });
    }

    // ── No args — show current config ─────────────────────────────────────────
    if (currentId) {
      const resolved = guild.roles.cache.get(currentId);
      return interaction.reply({
        content: resolved
          ? `ℹ️ The current bot-control role is <@&${currentId}>.\nUse \`/setbotrole role:\` to change it, or \`/setbotrole clear:True\` to remove it.`
          : `⚠️ A bot-control role was configured but no longer exists in this server. Use \`/setbotrole clear:True\` to reset it.`,
        flags: [MessageFlags.Ephemeral],
      });
    }

    return interaction.reply({
      content: `ℹ️ No bot-control role is set. The server owner is the fallback for Leave and Force Leave.\nUse \`/setbotrole role:\` to configure one.`,
      flags: [MessageFlags.Ephemeral],
    });
  },
};
