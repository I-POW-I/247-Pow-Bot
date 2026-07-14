/**
 * /freegames — manually show current Epic Games Store free games.
 * Anyone can run this. Posts an embed with all current free games
 * and upcoming ones, with claim buttons.
 */

const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');
const { getFreeGames } = require('../src/platforms/epicGames');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('freegames')
    .setDescription('Show current free games on Epic Games Store'),

  async execute(interaction) {
    await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

    const { current, upcoming } = await getFreeGames();

    if (current.length === 0) {
      return interaction.editReply({
        content: '🎮 No free games available on Epic right now. Check back soon!',
      });
    }

    const embed = new EmbedBuilder()
      .setColor(0x0078F2)
      .setTitle('🎮 Free Games on Epic Games Store')
      .setAuthor({
        name:    'Epic Games Store',
        iconURL: 'https://cdn2.unrealengine.com/Unreal+Engine%2Feg-logo-filled-1255x1255-0eb9d144a0f981d1cbaaa1eb957de7f3207b31bb.png',
        url:     'https://store.epicgames.com/free-games',
      })
      .setTimestamp()
      .setFooter({ text: 'Free to claim — yours to keep forever once claimed' });

    // First game image as main image
    if (current[0]?.image) embed.setImage(current[0].image);

    for (const game of current) {
      const endsAt = game.endsAt
        ? `Ends <t:${Math.floor(new Date(game.endsAt).getTime() / 1000)}:R>`
        : 'Limited time';
      embed.addFields({
        name:   `🎁 ${game.title}`,
        value:  [
          game.publisher ? `*by ${game.publisher}*` : null,
          game.price     ? `~~${game.price}~~ **FREE**` : '**FREE**',
          endsAt,
        ].filter(Boolean).join('\n'),
        inline: current.length > 1,
      });
    }

    if (upcoming.length > 0) {
      const lines = upcoming.map(g => {
        const starts = g.startsAt
          ? `<t:${Math.floor(new Date(g.startsAt).getTime() / 1000)}:R>`
          : 'Soon';
        return `**${g.title}** — free ${starts}`;
      });
      embed.addFields({ name: '⏳ Coming Up Next', value: lines.join('\n'), inline: false });
    }

    // Claim buttons — one per free game (max 5)
    const buttons = current.slice(0, 5).map(game =>
      new ButtonBuilder()
        .setLabel(`Claim: ${game.title.slice(0, 35)}`)
        .setURL(game.url)
        .setEmoji('🎮')
        .setStyle(ButtonStyle.Link)
    );

    const components = buttons.length > 0
      ? [new ActionRowBuilder().addComponents(buttons)]
      : [];

    return interaction.editReply({ embeds: [embed], components });
  },
};
