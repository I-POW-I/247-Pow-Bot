const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ping')
    .setDescription("Check 24/7 POW Bot's latency and API response time"),

  async execute(interaction, client) {
    const sent = await interaction.reply({
      content: 'Measuring...',
      fetchReply: true,
      flags: [MessageFlags.Ephemeral],
    });

    const roundtrip = sent.createdTimestamp - interaction.createdTimestamp;
    const ws        = Math.round(client.ws.ping);

    const color   = ws < 100 ? 0x4ecf85 : ws < 200 ? 0xe6b84f : 0xe56a6f;
    const quality = ws < 100 ? 'Excellent' : ws < 200 ? 'Good' : 'High';

    const embed = new EmbedBuilder()
      .setTitle('Latency')
      .setColor(color)
      .addFields(
        { name: 'WebSocket',  value: `${ws}ms`,         inline: true },
        { name: 'Roundtrip',  value: `${roundtrip}ms`,  inline: true },
        { name: 'Connection', value: quality,            inline: true },
      )
      .setFooter({ text: '24/7 POW Bot' })
      .setTimestamp();

    return interaction.editReply({ content: '', embeds: [embed] });
  },
};
