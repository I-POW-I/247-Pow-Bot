const { SlashCommandBuilder, MessageFlags, PermissionFlagsBits } = require('discord.js');
const { log } = require('../src/logger');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('clearcommands')
    .setDescription('Force clear and re-register all slash commands — fixes old/stuck commands showing')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction, client) {
    await interaction.reply({
      content: '🔄 Clearing and re-registering all commands...',
      flags: [MessageFlags.Ephemeral],
    });

    try {
      const { REST, Routes } = require('discord.js');
      const rest = new REST({ version: '10' }).setToken(process.env.BOT_TOKEN);

      // Step 1: Wipe everything
      await rest.put(Routes.applicationCommands(process.env.CLIENT_ID), { body: [] });
      log('INFO', 'All global commands cleared', { by: interaction.user.tag });

      // Step 2: Re-register current commands
      const commandData = [...client.commands.values()].map(cmd => cmd.data.toJSON());
      await rest.put(Routes.applicationCommands(process.env.CLIENT_ID), { body: commandData });

      log('INFO', `Re-registered ${commandData.length} command(s)`, { by: interaction.user.tag });

      await interaction.editReply({
        content: `✅ Done — cleared all old commands and re-registered **${commandData.length}** current command(s).\n\nOld commands like \`/join\`, \`/leave\`, \`/stay\` should disappear within a few minutes.`,
      });

    } catch (err) {
      log('ERROR', 'Failed to clear/re-register commands', { error: err.message });
      await interaction.editReply({ content: `❌ Failed: ${err.message}` });
    }
  },
};
