const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');
const { getFreeGames } = require('../src/platforms/epicGames');

const EPIC_LOGO = 'https://cdn2.unrealengine.com/Unreal+Engine%2Feg-logo-filled-1255x1255-0eb9d144a0f981d1cbaaa1eb957de7f3207b31bb.png';
const TAG_DOTS  = ['🔴', '🟡', '🟢', '🔵', '🟣', '🟠'];

module.exports = {
  data: new SlashCommandBuilder()
    .setName('freegames')
    .setDescription('Show current free games on Epic Games Store'),

  async execute(interaction) {
    await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
    const { current, upcoming } = await getFreeGames();

    if (!current.length) return interaction.editReply({ content: '🎮 No free games on Epic right now. Check back soon!' });

    for (let i = 0; i < current.length; i++) {
      const game    = current[i];
      const endsAt  = game.endsAt ? `<t:${Math.floor(new Date(game.endsAt).getTime() / 1000)}:D>` : null;
      const price   = [game.origPrice ? `~~${game.origPrice}~~` : null, '**Free**', endsAt ? `until ${endsAt}` : null].filter(Boolean).join(' ');
      const tagLine = game.tags?.length ? game.tags.map((t, j) => `${TAG_DOTS[j % TAG_DOTS.length]} **${t}**`).join('  ') : null;

      const desc = [
        game.description || null,
        '',
        price,
        '',
        `[Open in browser ↗](${game.url})`,
        tagLine ? '' : null,
        tagLine,
      ].filter(v => v !== null).join('\n');

      const embed = new EmbedBuilder()
        .setColor(0x0078F2).setTitle(game.title).setURL(game.url)
        .setThumbnail(EPIC_LOGO).setDescription(desc)
        .setTimestamp().setFooter({ text: 'Epic Games Store • Free Game' });

      if (game.image) embed.setImage(game.image);

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setLabel('Claim Free Game').setURL(game.url).setEmoji('🎮').setStyle(ButtonStyle.Link)
      );

      if (i === 0) await interaction.editReply({ embeds: [embed], components: [row] });
      else await interaction.followUp({ embeds: [embed], components: [row], flags: [MessageFlags.Ephemeral] });
    }

    if (upcoming.length) {
      const upEmbed = new EmbedBuilder()
        .setColor(0x0078F2).setTitle('⏳ Coming Up Free on Epic').setThumbnail(EPIC_LOGO)
        .setDescription(upcoming.map(g => {
          const starts = g.startsAt ? `<t:${Math.floor(new Date(g.startsAt).getTime() / 1000)}:D>` : 'Soon';
          return `**${g.title}** — free from ${starts}${g.origPrice ? ` (normally ${g.origPrice})` : ''}`;
        }).join('\n'))
        .setTimestamp().setFooter({ text: 'Epic Games Store' });
      await interaction.followUp({ embeds: [upEmbed], flags: [MessageFlags.Ephemeral] });
    }
  },
};
