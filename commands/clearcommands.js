const { SlashCommandBuilder, MessageFlags, PermissionFlagsBits } = require('discord.js');
const { log } = require('../src/logger');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('clearcommands')
    .setDescription('Wipe all old/stuck slash commands and re-register the correct ones')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction, client) {
    await interaction.reply({
      content: '🔄 Refreshing the command registry and rebuilding the current slash command set...',
      flags: [MessageFlags.Ephemeral],
    });

    try {
      const { REST, Routes } = require('discord.js');
      const rest = new REST({ version: '10' }).setToken(process.env.BOT_TOKEN);

      // Clear global commands
      await rest.put(Routes.applicationCommands(process.env.CLIENT_ID), { body: [] });
      log('INFO', 'Global commands cleared', { by: interaction.user.tag });

      // Clear guild-specific commands for every guild the bot is in
      // (old bots sometimes registered commands per-guild — this catches those)
      const guildResults = [];
      for (const guild of client.guilds.cache.values()) {
        try {
          await rest.put(
            Routes.applicationGuildCommands(process.env.CLIENT_ID, guild.id),
            { body: [] }
          );
          guildResults.push(`✅ ${guild.name}`);
        } catch {
          guildResults.push(`⚠️ ${guild.name} (skipped)`);
        }
      }

      // Re-register current commands globally
      const commandData = [...client.commands.values()].map(cmd => cmd.data.toJSON());
      await rest.put(Routes.applicationCommands(process.env.CLIENT_ID), { body: commandData });

      log('INFO', `Re-registered ${commandData.length} global command(s)`, { by: interaction.user.tag });

      const names = commandData.map(c => `\`/${c.name}\``).join(', ');

      await interaction.editReply({
        content: [
          `✅ **Command refresh complete.**`,
          ``,
          `**Global commands** — cleared and re-registered ${commandData.length} slash command(s): ${names}`,
          `**Guild commands cleared:** ${guildResults.join(' · ')}`,
          ``,
          `Older commands such as \`/join\`, \`/leave\`, and \`/stay\` should disappear within a few minutes.`,
          `If they still appear after 10 minutes, restart your Discord client.`,
        ].join('\n'),
      });

    } catch (err) {
      log('ERROR', 'clearcommands failed', { error: err.message });
      await interaction.editReply({ content: `❌ The command refresh could not be completed. ${err.message}` });
    }
  },
};
