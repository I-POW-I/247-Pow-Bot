const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { log }             = require('../src/logger');
const { buildStatsEmbed } = require('../src/statusUpdater');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('status')
    .setDescription("Show 24/7 POW Bot's current voice connection and runtime stats"),

  async execute(interaction, client) {
    log('INFO', '/status', { guild: interaction.guild.name, by: interaction.user.tag });
    return interaction.reply({
      embeds: [buildStatsEmbed(interaction.guild.id, client)],
      flags:  [MessageFlags.Ephemeral],
    });
  },
};
