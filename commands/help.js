const { SlashCommandBuilder, MessageFlags, EmbedBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('help')
    .setDescription('Show a quick overview of 24/7 POW Bot and its commands'),

  async execute(interaction) {
    const embed = new EmbedBuilder()
      .setTitle('🖤 24/7 POW Bot')
      .setDescription('24/7 POW Bot keeps voice uptime stable, manages server activity logs, handles verification, and delivers streamer alerts.')
      .setColor(0x7b8cff)
      .addFields(
        { name: 'Core',           value: '`/panel`, `/status`, `/ping`, `/serverinfo`, `/help`',             inline: false },
        { name: 'Configuration',  value: '`/setlogchannel`, `/setbotrole`, `/verify setup`',                 inline: false },
        { name: 'Moderation',     value: '`/purge`, `/clearcommands`',                                       inline: false },
        { name: 'Streamer Alerts', value: '`/addstreamer`, `/streamers`, `/removestreamer`',                 inline: false },
        { name: 'Panel Controls', value: 'Join · Leave · Force Leave · My Info · Lookup · Refresh',          inline: false },
      )
      .setFooter({ text: '24/7 POW Bot • Server management suite' });

    return interaction.reply({ embeds: [embed], flags: [MessageFlags.Ephemeral] });
  },
};
