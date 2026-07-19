const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { log }            = require('./logger');
const { selectAll, run } = require('./database');
const { getGameNews, getAppDetails, getHeaderImage, parseSteamContent, getSteamFreeGames } = require('./platforms/steam');
const { getFreeGames }   = require('./platforms/epicGames');

const STEAM_INTERVAL     = 15 * 60 * 1000;
const FREE_GAME_INTERVAL =  6 * 60 * 60 * 1000;
const TAG_DOTS = ['🔴', '🟡', '🟢', '🔵', '🟣', '🟠'];
const STEAM_LOGO = 'https://store.steampowered.com/favicon.ico';
const EPIC_LOGO  = 'https://cdn2.unrealengine.com/Unreal+Engine%2Feg-logo-filled-1255x1255-0eb9d144a0f981d1cbaaa1eb957de7f3207b31bb.png';

function formatTagLine(tags) {
  if (!tags?.length) return null;
  return tags.map((t, i) => `${TAG_DOTS[i % TAG_DOTS.length]} **${t}**`).join('  ');
}

// ── Steam game update embed ────────────────────────────────────────────────────
function buildSteamUpdateEmbed(item, appId, gameName, details, color) {
  const { text, imageUrl, youtubeUrl } = parseSteamContent(item.contents, 1000);
  const headerImg = details?.headerImage || getHeaderImage(appId);

  const embed = new EmbedBuilder()
    .setColor(color || 0x1B2838)
    .setAuthor({
      name:    gameName,
      iconURL: `https://cdn.cloudflare.steamstatic.com/steam/apps/${appId}/capsule_sm_120.jpg`,
      url:     `https://store.steampowered.com/app/${appId}`,
    })
    .setTitle(item.title)
    .setURL(item.url)
    .setThumbnail(headerImg)
    .setTimestamp(new Date(item.date * 1000))
    .setFooter({ text: 'Steam • Game Update' });

  if (text) embed.setDescription(text);
  embed.setImage(imageUrl || headerImg);

  return { embed, youtubeUrl };
}

// ── Epic free game embed — one per game ───────────────────────────────────────
function buildEpicGameEmbed(game) {
  const endsAt    = game.endsAt ? `<t:${Math.floor(new Date(game.endsAt).getTime() / 1000)}:D>` : null;
  const priceLine = [game.origPrice ? `~~${game.origPrice}~~` : null, '**Free**', endsAt ? `until ${endsAt}` : null].filter(Boolean).join(' ');
  const tagLine   = formatTagLine(game.tags);

  const descParts = [];
  if (game.description) descParts.push(game.description);
  descParts.push('');
  descParts.push(priceLine);
  descParts.push('');
  descParts.push(`[Open in browser ↗](${game.url})`);
  if (tagLine) { descParts.push(''); descParts.push(tagLine); }

  const embed = new EmbedBuilder()
    .setColor(0x0078F2)
    .setTitle(game.title)
    .setURL(game.url)
    .setThumbnail(EPIC_LOGO)
    .setDescription(descParts.join('\n'))
    .setTimestamp()
    .setFooter({ text: 'Epic Games Store • Free Game' });

  if (game.image) embed.setImage(game.image);

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setLabel('Claim Free Game').setURL(game.url).setEmoji('🎮').setStyle(ButtonStyle.Link)
  );
  return { embed, row };
}

// ── Steam free game embed — one per game ──────────────────────────────────────
function buildSteamFreeEmbed(game, details) {
  const origFormatted  = details?.price?.initial ? `~~$${(details.price.initial / 100).toFixed(2)}~~` : null;
  const expiryLine     = game.discountExpiry ? `Free until <t:${game.discountExpiry}:D>` : 'Free to Keep';
  const descParts      = [];
  if (details?.description) descParts.push(details.description);
  descParts.push('');
  descParts.push([origFormatted, `**FREE** — ${expiryLine}`].filter(Boolean).join(' '));
  descParts.push('');
  descParts.push(`[Open in browser ↗](${game.url})`);

  const embed = new EmbedBuilder()
    .setColor(0x1B2838)
    .setTitle(game.name)
    .setURL(game.url)
    .setThumbnail(STEAM_LOGO)
    .setDescription(descParts.join('\n'))
    .setTimestamp()
    .setFooter({ text: 'Steam • Free Game' });

  const fields = [];
  if (details?.releaseDate) fields.push({ name: 'Release Date', value: details.releaseDate, inline: true });
  if (details?.platforms)   fields.push({ name: 'Platforms',    value: details.platforms,   inline: true });
  if (fields.length) embed.addFields(fields);

  const img = details?.screenshots?.[0] || game.headerImage;
  if (img) embed.setImage(img);

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setLabel('Claim on Steam').setURL(game.url).setEmoji('🎮').setStyle(ButtonStyle.Link)
  );
  return { embed, row };
}

// ── Check Steam subscription ───────────────────────────────────────────────────
async function checkSteamSubscription(client, sub) {
  const news = await getGameNews(sub.app_id, 1);
  if (!news?.length) return;
  const latest = news[0];
  if (latest.gid === sub.last_post_id) return;

  log('INFO', `New update for ${sub.game_name}`);
  try {
    const guild   = await client.guilds.fetch(sub.guild_id);
    const channel = await guild.channels.fetch(sub.channel_id);
    if (!channel?.isTextBased()) return;

    const details = await getAppDetails(sub.app_id).catch(() => null);
    const { embed, youtubeUrl } = buildSteamUpdateEmbed(latest, sub.app_id, sub.game_name, details, sub.color);

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setLabel('Read Full Notes').setURL(latest.url).setStyle(ButtonStyle.Link).setEmoji('📋')
    );
    if (youtubeUrl) {
      row.addComponents(new ButtonBuilder().setLabel('Watch Video').setURL(youtubeUrl).setStyle(ButtonStyle.Link).setEmoji('▶️'));
    }

    const content = sub.role_id ? `<@&${sub.role_id}>` : undefined;
    await channel.send({ content, embeds: [embed], components: [row] });
    run('UPDATE game_subscriptions SET last_post_id = ? WHERE id = ?', [latest.gid, sub.id]);
  } catch (err) {
    log('WARN', `Failed to post update for ${sub.game_name}`, { error: err.message });
  }
}

// ── Check Epic free games ──────────────────────────────────────────────────────
async function checkEpicGames(client) {
  const subs = selectAll('SELECT * FROM game_subscriptions WHERE app_id = ?', ['epic']);
  if (!subs.length) return;

  const { current, upcoming } = await getFreeGames();
  if (!current.length) return;

  const currentKey = current.map(g => g.title).sort().join('|');

  for (const sub of subs) {
    if (sub.last_post_id === currentKey) continue;
    try {
      const guild   = await client.guilds.fetch(sub.guild_id);
      const channel = await guild.channels.fetch(sub.channel_id);
      if (!channel?.isTextBased()) continue;

      const content = sub.role_id ? `<@&${sub.role_id}>` : undefined;

      // One message per free game
      for (let i = 0; i < current.length; i++) {
        const { embed, row } = buildEpicGameEmbed(current[i]);
        await channel.send({ content: i === 0 ? content : undefined, embeds: [embed], components: [row] });
        if (i < current.length - 1) await new Promise(r => setTimeout(r, 1000));
      }

      // Upcoming summary
      if (upcoming.length > 0) {
        const upEmbed = new EmbedBuilder()
          .setColor(0x0078F2)
          .setTitle('⏳ Coming Up Free on Epic')
          .setThumbnail(EPIC_LOGO)
          .setDescription(upcoming.map(g => {
            const starts = g.startsAt ? `<t:${Math.floor(new Date(g.startsAt).getTime() / 1000)}:D>` : 'Soon';
            return `**${g.title}** — free from ${starts}${g.origPrice ? ` (normally ${g.origPrice})` : ''}`;
          }).join('\n'))
          .setTimestamp().setFooter({ text: 'Epic Games Store' });
        await channel.send({ embeds: [upEmbed] });
      }

      run('UPDATE game_subscriptions SET last_post_id = ? WHERE id = ?', [currentKey, sub.id]);
      log('INFO', `Posted ${current.length} Epic free game(s)`, { guild: sub.guild_id });
    } catch (err) {
      log('WARN', 'Failed to post Epic free games', { error: err.message });
    }
  }
}

// ── Check Steam free games ─────────────────────────────────────────────────────
async function checkSteamFreeGames(client) {
  const subs = selectAll('SELECT * FROM game_subscriptions WHERE app_id = ?', ['steam_free']);
  if (!subs.length) return;

  const freeGames = await getSteamFreeGames();
  if (!freeGames.length) return;

  for (const sub of subs) {
    const seenIds  = (sub.last_post_id || '').split(',').filter(Boolean);
    const newGames = freeGames.filter(g => !seenIds.includes(String(g.appid)));
    if (!newGames.length) continue;

    try {
      const guild   = await client.guilds.fetch(sub.guild_id);
      const channel = await guild.channels.fetch(sub.channel_id);
      if (!channel?.isTextBased()) continue;

      const content = sub.role_id ? `<@&${sub.role_id}>` : undefined;

      for (let i = 0; i < newGames.length; i++) {
        const details = await getAppDetails(newGames[i].appid).catch(() => null);
        const { embed, row } = buildSteamFreeEmbed(newGames[i], details);
        await channel.send({ content: i === 0 ? content : undefined, embeds: [embed], components: [row] });
        if (i < newGames.length - 1) await new Promise(r => setTimeout(r, 1000));
      }

      const allSeen = [...new Set([...seenIds, ...freeGames.map(g => String(g.appid))])].join(',');
      run('UPDATE game_subscriptions SET last_post_id = ? WHERE id = ?', [allSeen, sub.id]);
      log('INFO', `Posted ${newGames.length} Steam free game(s)`, { guild: sub.guild_id });
    } catch (err) {
      log('WARN', 'Failed to post Steam free games', { error: err.message });
    }
  }
}

// ── Poll all Steam game updates ────────────────────────────────────────────────
async function pollSteam(client) {
  const subs = selectAll("SELECT * FROM game_subscriptions WHERE app_id != 'epic' AND app_id != 'steam_free'", []);
  for (const sub of subs) {
    await checkSteamSubscription(client, sub);
    await new Promise(r => setTimeout(r, 1000));
  }
}

// ── Start ──────────────────────────────────────────────────────────────────────
function startGamePoller(client) {
  log('INFO', 'Game poller started');
  setTimeout(() => { pollSteam(client); setInterval(() => pollSteam(client), STEAM_INTERVAL); }, 20000);
  setTimeout(() => {
    checkEpicGames(client); checkSteamFreeGames(client);
    setInterval(() => { checkEpicGames(client); checkSteamFreeGames(client); }, FREE_GAME_INTERVAL);
  }, 30000);
}

module.exports = { startGamePoller };
