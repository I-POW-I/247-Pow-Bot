const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ping')
    .setDescription("Check the bot's response time"),
  async execute(interaction, client) {
    const sent  = await interaction.reply({ content: '🏓 Measuring...', flags: [MessageFlags.Ephemeral], fetchReply: true });
    const round = sent.createdTimestamp - interaction.createdTimestamp;
    const ws    = client.ws.ping;
    await interaction.editReply({
      content: '',
      embeds: [
        new EmbedBuilder()
          .setColor(ws < 100 ? 0x57F287 : ws < 200 ? 0xFEE75C : 0xED4245)
          .setTitle('🏓 Pong')
          .addFields(
            { name: 'Roundtrip', value: `${round}ms`, inline: true },
            { name: 'WebSocket', value: `${ws}ms`,    inline: true },
          )
          .setTimestamp(),
      ],
    });
  },
};
