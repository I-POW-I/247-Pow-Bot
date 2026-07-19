/**
 * Steam API wrapper — no key required.
 */

const { log } = require('../logger');

async function steamFetch(url) {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json' },
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new Error(`Steam ${res.status}`);
  return res.json();
}

async function searchGames(term) {
  try {
    const data = await steamFetch(
      `https://store.steampowered.com/api/storesearch/?term=${encodeURIComponent(term)}&l=english&cc=US`
    );
    return (data.items || []).slice(0, 5).map(i => ({
      appid: i.id, name: i.name, tinyImage: i.tiny_image,
    }));
  } catch (err) {
    log('WARN', 'Steam search failed', { error: err.message });
    return [];
  }
}

async function getAppDetails(appId) {
  try {
    const data = await steamFetch(
      `https://store.steampowered.com/api/appdetails?appids=${appId}&cc=US&l=english`
    );
    const app = data[String(appId)];
    if (!app?.success) return null;
    const d = app.data;
    const platforms = Object.entries(d.platforms || {})
      .filter(([, v]) => v)
      .map(([k]) => k.charAt(0).toUpperCase() + k.slice(1))
      .join(', ');
    return {
      name:        d.name,
      headerImage: d.header_image,
      screenshots: d.screenshots?.slice(0, 1).map(s => s.path_full) || [],
      description: d.short_description || null,
      platforms:   platforms || null,
      releaseDate: d.release_date?.date || null,
      price:       d.price_overview || null,
    };
  } catch { return null; }
}

// Keywords that identify real patch notes vs dev blogs/community posts
const UPDATE_KEYWORDS = [
  'update', 'patch', 'hotfix', 'hot fix', 'changelog',
  'maintenance', 'build', 'notes', 'fix', 'release',
];

function isActualUpdate(item) {
  const title = (item.title || '').toLowerCase();
  // Must be an official feed type
  const isOfficialFeed = item.feedname === 'steam_community_announcements'
    || item.feedname === 'steam_updates'
    || item.feed_type === 1;
  if (!isOfficialFeed) return false;
  // Title must contain at least one update-related keyword
  return UPDATE_KEYWORDS.some(kw => title.includes(kw));
}

async function getGameNews(appId, count = 5) {
  try {
    // Fetch more than needed so filtering doesn't leave us empty
    const data = await steamFetch(
      `https://api.steampowered.com/ISteamNews/GetNewsForApp/v0002/?appid=${appId}&count=${count}&maxlength=3000&format=json`
    );
    const items = data?.appnews?.newsitems || [];
    return items.filter(isActualUpdate);
  } catch (err) {
    log('WARN', `Steam news failed for ${appId}`, { error: err.message });
    return [];
  }
}

async function getSteamFreeGames() {
  try {
    const data = await steamFetch('https://store.steampowered.com/api/featuredcategories?cc=US&l=en');
    const specials = data?.specials?.items || [];
    return specials
      .filter(i => i.discount_percent === 100 && i.final_price === 0 && i.type === 0)
      .map(i => ({
        appid:          i.id,
        name:           i.name,
        originalPrice:  i.original_price,
        headerImage:    `https://cdn.cloudflare.steamstatic.com/steam/apps/${i.id}/header.jpg`,
        url:            `https://store.steampowered.com/app/${i.id}`,
        discountExpiry: i.discount_expiration || null,
      }));
  } catch (err) {
    log('WARN', 'Steam free games check failed', { error: err.message });
    return [];
  }
}

function getHeaderImage(appId) {
  return `https://cdn.cloudflare.steamstatic.com/steam/apps/${appId}/header.jpg`;
}

function parseSteamContent(raw, maxLength = 1000) {
  if (!raw) return { text: '', imageUrl: null, youtubeUrl: null };
  let text = raw;

  // Extract image - Steam clan images
  const clanImgMatch   = text.match(/\{STEAM_CLAN_IMAGE\}\/([^\s\[\]\n,]+)/i);
  const regularImgMatch = text.match(/\[img\](https?:\/\/[^\[]+?)\[\/img\]/i);
  let imageUrl = null;
  if (clanImgMatch)    imageUrl = `https://clan.akamai.steamstatic.com/images/${clanImgMatch[1]}`;
  else if (regularImgMatch) imageUrl = regularImgMatch[1].trim();

  // Extract YouTube
  const ytMatch = text.match(/\[previewyoutube=([A-Za-z0-9_-]+)/i);
  const youtubeUrl = ytMatch ? `https://youtube.com/watch?v=${ytMatch[1]}` : null;

  // Normalise line endings and literal \n
  text = text.replace(/\\n/g, '\n').replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  // Strip image/video tags
  text = text
    .replace(/\{STEAM_CLAN_IMAGE\}\/[^\s\[\]\n,]+/gi, '')
    .replace(/\[img\][^\[]*?\[\/img\]/gis, '')
    .replace(/\[previewyoutube[^\]]*\][^\[]*?\[\/previewyoutube\]/gis, '');

  // BBCode → Discord markdown
  text = text
    .replace(/\[h[1-3]\]\s*(.*?)\s*\[\/h[1-3]\]/gis, '\n**$1**\n')
    .replace(/\[b\]\s*(.*?)\s*\[\/b\]/gis,           '**$1**')
    .replace(/\[i\]\s*(.*?)\s*\[\/i\]/gis,           '*$1*')
    .replace(/\[u\]\s*(.*?)\s*\[\/u\]/gis,           '__$1__')
    .replace(/\[strike\]\s*(.*?)\s*\[\/strike\]/gis, '~~$1~~')
    .replace(/\[url=([^\]]+)\]\s*(.*?)\s*\[\/url\]/gis, '[$2]($1)')
    .replace(/\[url\](.*?)\[\/url\]/gis, '$1')
    // Lists — key fix: every [*] on its own line regardless of surrounding whitespace
    .replace(/\[list\]/gi, '\n')
    .replace(/\[\/list\]/gi, '\n')
    .replace(/\s*\[\*\]\s*/g, '\n• ')
    // HTML
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<p[^>]*>/gi, '\n').replace(/<\/p>/gi, '')
    .replace(/<[^>]+>/g, '')
    // Strip remaining BBCode
    .replace(/\[[^\]]{1,30}\]/g, '')
    // HTML entities
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ');

  // Clean whitespace
  text = text
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n[ \t]+/g, '\n')
    .trim();

  // Truncate
  if (text.length > maxLength) {
    const cutAt = text.lastIndexOf('\n', maxLength - 4);
    text = (cutAt > maxLength * 0.6 ? text.slice(0, cutAt) : text.slice(0, maxLength - 3)) + '\n...';
  }

  return { text, imageUrl, youtubeUrl };
}

module.exports = { searchGames, getAppDetails, getGameNews, getSteamFreeGames, getHeaderImage, parseSteamContent };
