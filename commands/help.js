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
        { name: 'Core Commands', value: '`/panel`, `/status`, `/setlogchannel`, `/verify setup`', inline: false },
        { name: 'Admin Tools', value: '`/setbotrole`, `/purge`, `/clearcommands`', inline: false },
        { name: 'Streamer Alerts', value: '`/addstreamer`, `/streamers`, `/removestreamer`', inline: false },
        { name: 'Panel Controls', value: 'Use the buttons on the control panel for Join, Leave, My Info, Lookup, and Refresh.', inline: false },
      )
      .setFooter({ text: '24/7 POW Bot • Server management suite' });

    return interaction.reply({ embeds: [embed], flags: [MessageFlags.Ephemeral] });
  },
};
