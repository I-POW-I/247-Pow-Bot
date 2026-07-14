/**
 * Game alerts polling engine.
 *
 * Checks Steam news every 15 minutes per subscribed game.
 * Checks Epic free games once daily.
 *
 * Tracks last seen post ID per subscription in SQLite to avoid duplicate posts.
 */

const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { log }            = require('./logger');
const { selectAll, run } = require('./database');
const { getGameNews, getAppDetails, getHeaderImage, parseSteamContent } = require('./platforms/steam');
const { getFreeGames }   = require('./platforms/epicGames');

const STEAM_INTERVAL = 15 * 60 * 1000; // 15 minutes
const EPIC_INTERVAL  = 6  * 60 * 60 * 1000; // 6 hours

// ── Embed builders ─────────────────────────────────────────────────────────────

function buildSteamEmbed(item, appId, gameName, gameDetails, color) {
  const { text, imageUrl, youtubeUrl } = parseSteamContent(item.contents, 1000);
  const headerImg = getHeaderImage(appId);

  const embed = new EmbedBuilder()
    .setColor(color || 0x1B2838) // Steam dark blue
    .setAuthor({
      name:    gameName,
      iconURL: `https://cdn.cloudflare.steamstatic.com/steam/apps/${appId}/capsule_sm_120.jpg`,
      url:     `https://store.steampowered.com/app/${appId}`,
    })
    .setTitle(item.title)
    .setURL(item.url)
    .setTimestamp(new Date(item.date * 1000))
    .setFooter({ text: 'Steam • Game Update' });

  if (text) embed.setDescription(text);

  // Thumbnail — game art top right
  if (gameDetails?.headerImage || headerImg) {
    embed.setThumbnail(gameDetails?.headerImage || headerImg);
  }

  // Main image — screenshot/promo from patch notes
  if (imageUrl) {
    embed.setImage(imageUrl);
  } else if (!imageUrl && headerImg) {
    // Fall back to header image if no screenshot in patch notes
    embed.setImage(headerImg);
  }

  return { embed, youtubeUrl };
}

function buildEpicFreeEmbed(games, upcoming) {
  const embed = new EmbedBuilder()
    .setColor(0x0078F2) // Epic blue
    .setTitle('🎮 Free Games on Epic Games Store')
    .setAuthor({
      name:    'Epic Games Store',
      iconURL: 'https://cdn2.unrealengine.com/Unreal+Engine%2Feg-logo-filled-1255x1255-0eb9d144a0f981d1cbaaa1eb957de7f3207b31bb.png',
      url:     'https://store.epicgames.com/free-games',
    })
    .setTimestamp()
    .setFooter({ text: 'Claim before they\'re gone!' });

  if (games.length === 0) {
    embed.setDescription('No free games available right now. Check back soon!');
    return { embed, buttons: [] };
  }

  // Show first game's image as main embed image
  const mainGame = games[0];
  if (mainGame.image) embed.setImage(mainGame.image);

  // Add each free game as a field
  for (const game of games) {
    const endsAt = game.endsAt ? `<t:${Math.floor(new Date(game.endsAt).getTime() / 1000)}:R>` : 'Unknown';
    embed.addFields({
      name:   game.title,
      value:  [
        game.publisher ? `*by ${game.publisher}*` : null,
        game.price     ? `~~${game.price}~~ **FREE**` : '**FREE**',
        `Ends ${endsAt}`,
      ].filter(Boolean).join('\n'),
      inline: games.length > 1,
    });
  }

  // Upcoming free games
  if (upcoming.length > 0) {
    const upcomingLines = upcoming.map(g => {
      const starts = g.startsAt ? `<t:${Math.floor(new Date(g.startsAt).getTime() / 1000)}:R>` : 'Soon';
      return `**${g.title}** — free ${starts}`;
    }).join('\n');
    embed.addFields({ name: '⏳ Coming Soon', value: upcomingLines, inline: false });
  }

  // Buttons — one per free game
  const buttons = games.slice(0, 5).map(game =>
    new ButtonBuilder()
      .setLabel(`Claim ${game.title.slice(0, 40)}`)
      .setURL(game.url)
      .setEmoji('🎮')
      .setStyle(ButtonStyle.Link)
  );

  return { embed, buttons };
}

// ── Check a single Steam subscription ─────────────────────────────────────────

async function checkSteamSubscription(client, sub) {
  const news = await getGameNews(sub.app_id, 1);
  if (!news || news.length === 0) return;

  const latest = news[0];

  // Skip if we've already posted this item
  if (latest.gid === sub.last_post_id) return;

  log('INFO', `New update for ${sub.game_name}`, { guild: sub.guild_id });

  try {
    const guild   = await client.guilds.fetch(sub.guild_id);
    const channel = await guild.channels.fetch(sub.channel_id);
    if (!channel?.isTextBased()) return;

    // Fetch game details for artwork
    const details = await getAppDetails(sub.app_id).catch(() => null);

    const { embed, youtubeUrl } = buildSteamEmbed(latest, sub.app_id, sub.game_name, details, sub.color);

    const components = [];

    // Read more button
    const readMore = new ButtonBuilder()
      .setLabel('Read Full Notes')
      .setURL(latest.url)
      .setStyle(ButtonStyle.Link)
      .setEmoji('📋');

    const row = new ActionRowBuilder().addComponents(readMore);

    // YouTube video button if found in patch notes
    if (youtubeUrl) {
      row.addComponents(
        new ButtonBuilder()
          .setLabel('Watch Video')
          .setURL(youtubeUrl)
          .setStyle(ButtonStyle.Link)
          .setEmoji('▶️')
      );
    }

    components.push(row);

    // Role ping if configured
    const content = sub.role_id ? `<@&${sub.role_id}>` : undefined;

    await channel.send({ content, embeds: [embed], components });

    // Update last seen post ID
    run('UPDATE game_subscriptions SET last_post_id = ? WHERE id = ?', [latest.gid, sub.id]);

  } catch (err) {
    log('WARN', `Failed to post game update for ${sub.game_name}`, { error: err.message });
  }
}

// ── Check Epic free games ──────────────────────────────────────────────────────

async function checkEpicGames(client) {
  const subs = selectAll('SELECT * FROM game_subscriptions WHERE app_id = ?', ['epic']);
  if (subs.length === 0) return;

  const { current, upcoming } = await getFreeGames();
  if (current.length === 0) return;

  // Build a key from current game titles to detect changes
  const currentKey = current.map(g => g.title).sort().join('|');

  for (const sub of subs) {
    if (sub.last_post_id === currentKey) continue; // Already posted these games

    try {
      const guild   = await client.guilds.fetch(sub.guild_id);
      const channel = await guild.channels.fetch(sub.channel_id);
      if (!channel?.isTextBased()) continue;

      const { embed, buttons } = buildEpicFreeEmbed(current, upcoming);
      const components = buttons.length > 0 ? [new ActionRowBuilder().addComponents(buttons)] : [];
      const content    = sub.role_id ? `<@&${sub.role_id}>` : undefined;

      await channel.send({ content, embeds: [embed], components });

      run('UPDATE game_subscriptions SET last_post_id = ? WHERE id = ?', [currentKey, sub.id]);
      log('INFO', `Posted Epic free games`, { guild: sub.guild_id, count: current.length });

    } catch (err) {
      log('WARN', 'Failed to post Epic free games', { error: err.message });
    }
  }
}

// ── Poll all Steam subscriptions ───────────────────────────────────────────────

async function pollSteam(client) {
  const subs = selectAll('SELECT * FROM game_subscriptions WHERE app_id != ?', ['epic']);
  for (const sub of subs) {
    await checkSteamSubscription(client, sub);
    await new Promise(r => setTimeout(r, 1000)); // 1s between games to avoid hammering Steam
  }
}

// ── Start ──────────────────────────────────────────────────────────────────────

function startGamePoller(client) {
  const steamCount = selectAll('SELECT id FROM game_subscriptions WHERE app_id != ?', ['epic']).length;
  const epicCount  = selectAll('SELECT id FROM game_subscriptions WHERE app_id = ?', ['epic']).length;

  log('INFO', 'Game poller started', {
    steam: `${steamCount} game(s)`,
    epic:  `${epicCount} server(s)`,
  });

  // Stagger so everything doesn't fire at once on startup
  setTimeout(() => {
    pollSteam(client);
    setInterval(() => pollSteam(client), STEAM_INTERVAL);
  }, 20000);

  setTimeout(() => {
    checkEpicGames(client);
    setInterval(() => checkEpicGames(client), EPIC_INTERVAL);
  }, 30000);
}

module.exports = { startGamePoller };
