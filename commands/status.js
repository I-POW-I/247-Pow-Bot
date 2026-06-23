const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { log }                  = require('../src/logger');
const { buildStatsEmbed }      = require('../src/statusUpdater');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('status')
    .setDescription("Show the bot's current connection stats"),

  async execute(interaction, client) {
    const { guild } = interaction;

    log('INFO', '/status checked', { guild: guild.name, by: interaction.user.tag });

    return interaction.reply({
      embeds: [buildStatsEmbed(guild.id, client)],
      flags:  [MessageFlags.Ephemeral],
    });
  },
};
