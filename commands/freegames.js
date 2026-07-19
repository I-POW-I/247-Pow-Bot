/**
 * /freegames — manually check current free games on Epic and Steam.
 * One embed per game. Shows both platforms in one command.
 */

const {
  SlashCommandBuilder, EmbedBuilder, ActionRowBuilder,
  ButtonBuilder, ButtonStyle, MessageFlags,
} = require('discord.js');
const { getFreeGames }      = require('../src/platforms/epicGames');
const { getSteamFreeGames, getAppDetails } = require('../src/platforms/steam');

const EPIC_COLOUR  = 0x0078F2;
const STEAM_COLOUR = 0x1B2838;
const TAG_DOTS     = ['🔴', '🟡', '🟢', '🔵', '🟣', '🟠'];

function epicEmbed(game) {
  const endsAt   = game.endsAt
    ? `<t:${Math.floor(new Date(game.endsAt).getTime() / 1000)}:D>`
    : null;

  const priceLine = [
    game.origPrice ? `~~${game.origPrice}~~` : null,
    '**Free**',
    endsAt ? `until ${endsAt}` : null,
  ].filter(Boolean).join(' ');

  const tagLine = game.tags?.length
    ? game.tags.map((t, i) => `${TAG_DOTS[i % TAG_DOTS.length]} **${t}**`).join('  ')
    : null;

  const desc = [
    game.description || null,
    '',
    priceLine,
    '',
    `[Open in browser ↗](${game.url})`,
    tagLine ? '' : null,
    tagLine,
  ].filter(v => v !== null).join('\n');

  const embed = new EmbedBuilder()
    .setColor(EPIC_COLOUR)
    .setTitle(game.title)
    .setURL(game.url)
    .setDescription(desc)
    .setTimestamp()
    .setFooter({ text: 'Epic Games Store • Free Game' });

  if (game.image) embed.setImage(game.image);

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setLabel('Claim on Epic')
      .setURL(game.url)
      .setEmoji('🎮')
      .setStyle(ButtonStyle.Link)
  );

  return { embed, row };
}

function steamEmbed(game, details) {
  const origFormatted = details?.price?.initial
    ? `~~$${(details.price.initial / 100).toFixed(2)}~~`
    : null;
  const expiryLine = game.discountExpiry
    ? `Free until <t:${game.discountExpiry}:D>`
    : 'Free to Keep';

  const desc = [
    details?.description || null,
    '',
    [origFormatted, `**FREE** — ${expiryLine}`].filter(Boolean).join(' '),
    '',
    `[Open in browser ↗](${game.url})`,
  ].filter(v => v !== null).join('\n');

  const embed = new EmbedBuilder()
    .setColor(STEAM_COLOUR)
    .setTitle(game.name)
    .setURL(game.url)
    .setDescription(desc)
    .setTimestamp()
    .setFooter({ text: 'Steam • Free Game' });

  const fields = [];
  if (details?.releaseDate) fields.push({ name: 'Released',  value: details.releaseDate, inline: true });
  if (details?.platforms)   fields.push({ name: 'Platforms', value: details.platforms,   inline: true });
  if (fields.length) embed.addFields(fields);

  const img = details?.screenshots?.[0] || game.headerImage;
  if (img) embed.setImage(img);

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setLabel('Claim on Steam')
      .setURL(game.url)
      .setEmoji('🎮')
      .setStyle(ButtonStyle.Link)
  );

  return { embed, row };
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('freegames')
    .setDescription('Show current free games on Epic Games Store and Steam'),

  async execute(interaction) {
    await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

    // Fetch both platforms in parallel
    const [epicData, steamGames] = await Promise.all([
      getFreeGames(),
      getSteamFreeGames(),
    ]);

    const epicCurrent  = epicData.current  || [];
    const epicUpcoming = epicData.upcoming || [];

    if (!epicCurrent.length && !steamGames.length) {
      return interaction.editReply({
        content: '🎮 No free games available right now on Epic or Steam. Check back soon!',
      });
    }

    let firstReply = true;

    const send = async (embed, row) => {
      if (firstReply) {
        await interaction.editReply({ embeds: [embed], components: [row] });
        firstReply = false;
      } else {
        await interaction.followUp({ embeds: [embed], components: [row], flags: [MessageFlags.Ephemeral] });
      }
    };

    // ── Epic free games ───────────────────────────────────────────────────────
    for (const game of epicCurrent) {
      const { embed, row } = epicEmbed(game);
      await send(embed, row);
    }

    // ── Epic upcoming ─────────────────────────────────────────────────────────
    if (epicUpcoming.length > 0) {
      const upEmbed = new EmbedBuilder()
        .setColor(EPIC_COLOUR)
        .setTitle('⏳ Coming Up Free on Epic')
        .setDescription(
          epicUpcoming.map(g => {
            const starts = g.startsAt
              ? `<t:${Math.floor(new Date(g.startsAt).getTime() / 1000)}:D>`
              : 'Soon';
            return `**${g.title}** — free from ${starts}${g.origPrice ? ` (normally ${g.origPrice})` : ''}`;
          }).join('\n')
        )
        .setTimestamp()
        .setFooter({ text: 'Epic Games Store' });

      if (firstReply) {
        await interaction.editReply({ embeds: [upEmbed] });
        firstReply = false;
      } else {
        await interaction.followUp({ embeds: [upEmbed], flags: [MessageFlags.Ephemeral] });
      }
    }

    // ── Steam free games ──────────────────────────────────────────────────────
    for (const game of steamGames) {
      const details = await getAppDetails(game.appid).catch(() => null);
      const { embed, row } = steamEmbed(game, details);
      await send(embed, row);
    }

    // If nothing posted at all (shouldn't happen but just in case)
    if (firstReply) {
      await interaction.editReply({ content: '🎮 No free games found right now.' });
    }
  },
};
