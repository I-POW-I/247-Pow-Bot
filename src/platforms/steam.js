/**
 * Steam API wrapper.
 * No API key required for any of these endpoints.
 *
 * Endpoints used:
 *   Store search   — store.steampowered.com/api/storesearch
 *   App details    — store.steampowered.com/api/appdetails
 *   News           — api.steampowered.com/ISteamNews/GetNewsForApp
 */

const { log } = require('../logger');

const STEAM_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  'Accept':     'application/json',
};

async function steamGet(url) {
  const res = await fetch(url, { headers: STEAM_HEADERS, signal: AbortSignal.timeout(10000) });
  if (!res.ok) throw new Error(`Steam API ${res.status}`);
  return res.json();
}

/**
 * Search for a game by name.
 * Returns top 5 results: { appid, name, tinyImage }
 */
async function searchGames(term) {
  try {
    const data = await steamGet(
      `https://store.steampowered.com/api/storesearch/?term=${encodeURIComponent(term)}&l=english&cc=US`
    );
    return (data.items || []).slice(0, 5).map(item => ({
      appid:     item.id,
      name:      item.name,
      tinyImage: item.tiny_image,
    }));
  } catch (err) {
    log('WARN', 'Steam search failed', { error: err.message });
    return [];
  }
}

/**
 * Get app details (name, header image, short description).
 */
async function getAppDetails(appId) {
  try {
    const data = await steamGet(
      `https://store.steampowered.com/api/appdetails?appids=${appId}&cc=US&l=english`
    );
    const app = data[String(appId)];
    if (!app?.success) return null;
    const d = app.data;
    return {
      name:        d.name,
      headerImage: d.header_image,
      capsuleImage: `https://cdn.cloudflare.steamstatic.com/steam/apps/${appId}/capsule_sm_120.jpg`,
      description: d.short_description,
    };
  } catch { return null; }
}

/**
 * Convert Steam BBCode / HTML to clean Discord markdown.
 * Also extracts the first image URL found in the content.
 */
function parseSteamContent(raw, maxLength = 1000) {
  let text = raw || '';

  // Extract first image URL before stripping tags
  const imgMatch =
    text.match(/\[img\](https?:\/\/[^\[]+?)\[\/img\]/i) ||
    text.match(/src=["'](https?:\/\/[^"']+\.(?:jpg|jpeg|png|gif|webp))/i);
  const imageUrl = imgMatch ? imgMatch[1].trim() : null;

  // YouTube embed extraction
  const ytMatch = text.match(/\[previewyoutube=([A-Za-z0-9_-]+)(?:;[^\]]+)?\]/i);
  const youtubeUrl = ytMatch ? `https://youtube.com/watch?v=${ytMatch[1]}` : null;

  text = text
    // Headers
    .replace(/\[h1\](.*?)\[\/h1\]/gis,   '**$1**\n')
    .replace(/\[h2\](.*?)\[\/h2\]/gis,   '**$1**\n')
    .replace(/\[h3\](.*?)\[\/h3\]/gis,   '**$1**\n')
    // Formatting
    .replace(/\[b\](.*?)\[\/b\]/gis,     '**$1**')
    .replace(/\[i\](.*?)\[\/i\]/gis,     '*$1*')
    .replace(/\[u\](.*?)\[\/u\]/gis,     '__$1__')
    .replace(/\[strike\](.*?)\[\/strike\]/gis, '~~$1~~')
    // Links
    .replace(/\[url=([^\]]+)\](.*?)\[\/url\]/gis, '[$2]($1)')
    .replace(/\[url\](.*?)\[\/url\]/gis, '$1')
    // Lists
    .replace(/\[list\]/gis, '')
    .replace(/\[\/list\]/gis, '\n')
    .replace(/\[\*\](.*?)(?=\[\*\]|\[\/list\]|\n|$)/gis, '• $1\n')
    // Strip images and video tags (already extracted above)
    .replace(/\[img\].*?\[\/img\]/gis, '')
    .replace(/\[previewyoutube[^\]]*\].*?\[\/previewyoutube\]/gis, '')
    // Strip HTML
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/?p>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    // Strip remaining BBCode
    .replace(/\[[^\]]+\]/g, '')
    // Decode HTML entities
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    // Clean up whitespace
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  // Truncate to max length
  if (text.length > maxLength) {
    // Try to cut at a newline
    const cutPoint = text.lastIndexOf('\n', maxLength - 4);
    text = (cutPoint > maxLength * 0.7 ? text.slice(0, cutPoint) : text.slice(0, maxLength - 3)) + '...';
  }

  return { text, imageUrl, youtubeUrl };
}

/**
 * Get latest news items for a Steam app.
 * Filters to official announcements only.
 *
 * @param {number|string} appId
 * @param {number} count
 * @returns {Array<{ gid, title, url, date, contents, author }>}
 */
async function getGameNews(appId, count = 3) {
  try {
    const data = await steamGet(
      `https://api.steampowered.com/ISteamNews/GetNewsForApp/v0002/?appid=${appId}&count=${count}&maxlength=2000&format=json`
    );
    const items = data?.appnews?.newsitems || [];

    // Filter to patch notes / official updates only
    return items.filter(item =>
      item.feedname === 'steam_community_announcements' ||
      item.feedname === 'steam_updates' ||
      item.feed_type === 1
    );
  } catch (err) {
    log('WARN', `Steam news failed for app ${appId}`, { error: err.message });
    return [];
  }
}

/**
 * Get the header image URL for a Steam app.
 */
function getHeaderImage(appId) {
  return `https://cdn.cloudflare.steamstatic.com/steam/apps/${appId}/header.jpg`;
}

module.exports = { searchGames, getAppDetails, getGameNews, getHeaderImage, parseSteamContent };
