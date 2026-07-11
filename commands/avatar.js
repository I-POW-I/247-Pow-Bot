const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('avatar')
    .setDescription("Show a user's full-size avatar")
    .addUserOption(opt =>
      opt.setName('user').setDescription('The user (defaults to yourself)').setRequired(false)
    ),
  async execute(interaction) {
    const { guild } = interaction;
    const target   = interaction.options.getUser('user') || interaction.user;
    const member   = await guild.members.fetch(target.id).catch(() => null);
    const globalUrl = target.displayAvatarURL({ dynamic: true, size: 1024 });
    const serverUrl = member?.avatarURL({ dynamic: true, size: 1024 });

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setLabel('Open full size').setURL(serverUrl || globalUrl).setStyle(ButtonStyle.Link),
    );
    if (serverUrl && serverUrl !== globalUrl) {
      row.addComponents(new ButtonBuilder().setLabel('Global avatar').setURL(globalUrl).setStyle(ButtonStyle.Link));
    }

    return interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(member?.displayColor || 0x5865F2)
          .setTitle(`${target.username}'s avatar`)
          .setImage(serverUrl || globalUrl)
          .setTimestamp()
          .setFooter({ text: `User ID: ${target.id}` }),
      ],
      components: [row],
      flags: [MessageFlags.Ephemeral],
    });
  },
};
