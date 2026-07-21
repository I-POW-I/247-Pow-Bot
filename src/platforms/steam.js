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

    // Review summary from user reviews
    let reviews = null;
    if (d.reviews) {
      reviews = d.reviews;
    }

    return {
      name:        d.name,
      headerImage: d.header_image,
      screenshots: d.screenshots?.slice(0, 1).map(s => s.path_full) || [],
      description: d.short_description || null,
      platforms:   platforms || null,
      releaseDate: d.release_date?.date || null,
      price:       d.price_overview || null,
      reviews,
    };
  } catch { return null; }
}

// Keywords that identify real patch notes vs dev blogs
const UPDATE_KEYWORDS = [
  'update', 'patch', 'hotfix', 'hot fix', 'changelog',
  'maintenance', 'build', 'notes', 'fix', 'release', 'patch notes',
];

function isActualUpdate(item) {
  const title = (item.title || '').toLowerCase();
  const isOfficialFeed = item.feedname === 'steam_community_announcements'
    || item.feedname === 'steam_updates'
    || item.feed_type === 1;
  if (!isOfficialFeed) return false;
  return UPDATE_KEYWORDS.some(kw => title.includes(kw));
}

async function getGameNews(appId, count = 5) {
  try {
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

/**
 * Get games currently 100% off on Steam (temporarily free).
 * Checks both the specials section and featured categories.
 */
async function getSteamFreeGames() {
  try {
    const data = await steamFetch('https://store.steampowered.com/api/featuredcategories?cc=US&l=en');

    const freeGames = new Map(); // appid → game data, deduplicated

    // Check all sections for 100% off games
    const sectionsToCheck = ['specials', 'top_sellers', 'new_releases', 'under10'];
    for (const section of sectionsToCheck) {
      const items = data?.[section]?.items || [];
      for (const item of items) {
        if (
          item.discount_percent === 100 &&
          item.final_price === 0 &&
          item.type === 0 && // games only
          !freeGames.has(item.id)
        ) {
          freeGames.set(item.id, {
            appid:          item.id,
            name:           item.name,
            originalPrice:  item.original_price,
            headerImage:    `https://cdn.cloudflare.steamstatic.com/steam/apps/${item.id}/header.jpg`,
            url:            `https://store.steampowered.com/app/${item.id}`,
            discountExpiry: item.discount_expiration || null,
          });
        }
      }
    }

    return [...freeGames.values()];
  } catch (err) {
    log('WARN', 'Steam free games check failed', { error: err.message });
    return [];
  }
}

function getHeaderImage(appId) {
  return `https://cdn.cloudflare.steamstatic.com/steam/apps/${appId}/header.jpg`;
}

/**
 * Parse Steam BBCode and HTML into clean Discord markdown.
 *
 * Handles:
 *  - [list][*] BBCode (standard)
 *  - [*]\ItemName format (CS2 workshop updates use backslash prefix)
 *  - <ul><li> HTML lists
 *  - {STEAM_CLAN_IMAGE} for screenshots
 *  - [url=][/url] links
 *  - [b][i][h1-3] formatting
 *  - Literal \n characters in content
 */
function parseSteamContent(raw, maxLength = 1000) {
  if (!raw) return { text: '', imageUrl: null, youtubeUrl: null };
  let text = raw;

  // ── Extract image before any processing ──────────────────────────────────────
  const clanImgMatch    = text.match(/\{STEAM_CLAN_IMAGE\}\/([^\s\[\]\n,{]+)/i);
  const regularImgMatch = text.match(/\[img\](https?:\/\/[^\[]+?)\[\/img\]/i);
  let imageUrl = null;
  if (clanImgMatch)       imageUrl = `https://clan.akamai.steamstatic.com/images/${clanImgMatch[1]}`;
  else if (regularImgMatch) imageUrl = regularImgMatch[1].trim();

  // ── Extract YouTube ───────────────────────────────────────────────────────────
  const ytMatch    = text.match(/\[previewyoutube=([A-Za-z0-9_-]+)/i);
  const youtubeUrl = ytMatch ? `https://youtube.com/watch?v=${ytMatch[1]}` : null;

  // ── Normalise line endings ────────────────────────────────────────────────────
  // Handle literal \n (two chars: backslash + n) first
  text = text.replace(/\\n/g, '\n');
  text = text.replace(/\r\n|\r/g, '\n');

  // ── Strip image/video tags ────────────────────────────────────────────────────
  text = text
    .replace(/\{STEAM_CLAN_IMAGE\}\/[^\s\[\]\n,{]+/gi, '')
    .replace(/\[img\][^\[]*?\[\/img\]/gis, '')
    .replace(/\[previewyoutube[^\]]*\][^\[]*?\[\/previewyoutube\]/gis, '');

  // ── HTML list items → bullets BEFORE stripping HTML ──────────────────────────
  // Some Steam content uses <ul><li> instead of BBCode [list][*]
  text = text
    .replace(/<li[^>]*>/gi,  '\n• ')
    .replace(/<\/li>/gi,     '')
    .replace(/<ul[^>]*>/gi,  '\n')
    .replace(/<\/ul>/gi,     '\n')
    .replace(/<ol[^>]*>/gi,  '\n')
    .replace(/<\/ol>/gi,     '\n');

  // ── BBCode → Discord markdown ─────────────────────────────────────────────────
  text = text
    // Headers
    .replace(/\[h[1-3]\]\s*(.*?)\s*\[\/h[1-3]\]/gis, '\n**$1**\n')
    // Formatting
    .replace(/\[b\]\s*(.*?)\s*\[\/b\]/gis,           '**$1**')
    .replace(/\[i\]\s*(.*?)\s*\[\/i\]/gis,           '*$1*')
    .replace(/\[u\]\s*(.*?)\s*\[\/u\]/gis,           '__$1__')
    .replace(/\[strike\]\s*(.*?)\s*\[\/strike\]/gis, '~~$1~~')
    // Links
    .replace(/\[url=([^\]]+)\]\s*(.*?)\s*\[\/url\]/gis, '[$2]($1)')
    .replace(/\[url\](.*?)\[\/url\]/gis, '$1')
    // BBCode lists — MUST handle [*] with or without leading backslash
    // e.g. [*]\FachwerkUpdated or [*]Normal item
    .replace(/\[list\]/gi,          '\n')
    .replace(/\[\/list\]/gi,        '\n')
    .replace(/\s*\[\*\]\s*\\?/g,   '\n• ')  // ← strips the \ prefix too
    // HTML line breaks
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<p[^>]*>/gi,   '\n')
    .replace(/<\/p>/gi,      '')
    // Strip all remaining HTML/BBCode
    .replace(/<[^>]+>/g,         '')
    .replace(/\[[^\]]{1,30}\]/g, '')
    // HTML entities
    .replace(/&amp;/g,  '&')
    .replace(/&lt;/g,   '<')
    .replace(/&gt;/g,   '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g,  "'")
    .replace(/&nbsp;/g, ' ');

  // ── Strip any remaining leading backslashes after bullets ─────────────────────
  // Catches edge cases like "• \ItemName" → "• ItemName"
  text = text.replace(/^• \\/gm, '• ');

  // ── Clean whitespace ──────────────────────────────────────────────────────────
  text = text
    .replace(/\n{3,}/g,    '\n\n')  // Max 2 consecutive blank lines
    .replace(/[ \t]+\n/g,  '\n')    // Trailing spaces
    .replace(/\n[ \t]+/g,  '\n')    // Leading spaces after newlines
    .trim();

  // ── Truncate cleanly at a newline boundary ────────────────────────────────────
  if (text.length > maxLength) {
    const cutAt = text.lastIndexOf('\n', maxLength - 4);
    text = (cutAt > maxLength * 0.6 ? text.slice(0, cutAt) : text.slice(0, maxLength - 3)) + '\n...';
  }

  return { text, imageUrl, youtubeUrl };
}

module.exports = {
  searchGames, getAppDetails, getGameNews,
  getSteamFreeGames, getHeaderImage, parseSteamContent,
};
