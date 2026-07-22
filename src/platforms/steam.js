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

const UPDATE_KEYWORDS = [
  'update', 'patch', 'hotfix', 'hot fix', 'changelog',
  'maintenance', 'build', 'notes', 'fix', 'release',
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
      `https://api.steampowered.com/ISteamNews/GetNewsForApp/v0002/?appid=${appId}&count=${count}&maxlength=5000&format=json`
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
    const freeGames = new Map();
    const sectionsToCheck = ['specials', 'top_sellers', 'new_releases', 'under10'];
    for (const section of sectionsToCheck) {
      const items = data?.[section]?.items || [];
      for (const item of items) {
        if (item.discount_percent === 100 && item.final_price === 0 && item.type === 0 && !freeGames.has(item.id)) {
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
 * Parse Steam BBCode/HTML into clean Discord markdown.
 *
 * Steam CS2-style content uses MULTIPLE formats:
 *   [*]\Item   — BBCode list item with backslash prefix (common in CS2)
 *   \Item      — standalone backslash bullet (no [*] tag at all)
 *   .\Item     — period then backslash = next bullet item
 *   . \Item    — period space backslash = next bullet item
 *   )\Item     — closing paren then backslash = next bullet item
 *   <li>Item   — HTML list items
 *
 * We handle ALL these cases to produce clean readable Discord output.
 */
function parseSteamContent(raw, maxLength = 1000) {
  if (!raw) return { text: '', imageUrl: null, youtubeUrl: null };
  let text = raw;

  // ── Extract image ──────────────────────────────────────────────────────────
  const clanImgMatch    = text.match(/\{STEAM_CLAN_IMAGE\}\/([^\s\[\]\n,{]+)/i);
  const regularImgMatch = text.match(/\[img\](https?:\/\/[^\[]+?)\[\/img\]/i);
  let imageUrl = null;
  if (clanImgMatch)       imageUrl = `https://clan.akamai.steamstatic.com/images/${clanImgMatch[1]}`;
  else if (regularImgMatch) imageUrl = regularImgMatch[1].trim();

  // ── Extract YouTube ────────────────────────────────────────────────────────
  const ytMatch    = text.match(/\[previewyoutube=([A-Za-z0-9_-]+)/i);
  const youtubeUrl = ytMatch ? `https://youtube.com/watch?v=${ytMatch[1]}` : null;

  // ── Normalise all line endings and literal \n ──────────────────────────────
  text = text.replace(/\\n/g, '\n').replace(/\r\n|\r/g, '\n');

  // ── Strip image and video tags ─────────────────────────────────────────────
  text = text
    .replace(/\{STEAM_CLAN_IMAGE\}\/[^\s\[\]\n,{]+/gi, '')
    .replace(/\[img\][^\[]*?\[\/img\]/gis, '')
    .replace(/\[previewyoutube[^\]]*\][^\[]*?\[\/previewyoutube\]/gis, '');

  // ── HTML list items → bullets BEFORE stripping HTML ───────────────────────
  text = text
    .replace(/<li[^>]*>/gi,  '\n• ')
    .replace(/<\/li>/gi,     '')
    .replace(/<ul[^>]*>/gi,  '\n')
    .replace(/<\/ul>/gi,     '\n')
    .replace(/<ol[^>]*>/gi,  '\n')
    .replace(/<\/ol>/gi,     '\n');

  // ── BBCode → Discord markdown ──────────────────────────────────────────────
  text = text
    .replace(/\[h[1-3]\]\s*(.*?)\s*\[\/h[1-3]\]/gis, '\n**$1**\n')
    .replace(/\[b\]\s*(.*?)\s*\[\/b\]/gis,           '\n**$1**')
    .replace(/\[i\]\s*(.*?)\s*\[\/i\]/gis,           '*$1*')
    .replace(/\[u\]\s*(.*?)\s*\[\/u\]/gis,           '__$1__')
    .replace(/\[strike\]\s*(.*?)\s*\[\/strike\]/gis, '~~$1~~')
    .replace(/\[url=([^\]]+)\]\s*(.*?)\s*\[\/url\]/gis, '[$2]($1)')
    .replace(/\[url\](.*?)\[\/url\]/gis, '$1')
    // BBCode lists — strip [*] and the optional backslash prefix that follows
    .replace(/\[list\]/gi,           '\n')
    .replace(/\[\/list\]/gi,         '\n')
    .replace(/\s*\[\*\]\s*\\?/g,     '\n• ')
    // HTML
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<p[^>]*>/gi,   '\n')
    .replace(/<\/p>/gi,      '')
    .replace(/<[^>]+>/g,     '')
    // Strip remaining BBCode tags
    .replace(/\[[^\]]{1,30}\]/g, '')
    // HTML entities
    .replace(/&amp;/g,  '&').replace(/&lt;/g,   '<').replace(/&gt;/g,   '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g,  "'").replace(/&nbsp;/g, ' ');

  // ── Handle Steam's \Bullet inline format ───────────────────────────────────
  // CS2 and some other games use \ as inline bullet markers within content.
  // These appear in several patterns we need to handle:

  // Pattern 1: content starts with \ before a capital letter
  // e.g. "\The bomb damage..." → "• The bomb damage..."
  text = text.replace(/^\\([A-Z])/m, '• $1');

  // Pattern 2: ". \" or ".\", or ")\" followed by a capital = new bullet item
  // e.g. "audible.\The bomb explosion" → "audible.\n• The bomb explosion"
  // e.g. "Notes)\Added Workshop" → "Notes)\n• Added Workshop"
  text = text.replace(/([.)])\s*\\([A-Z])/g, '$1\n• $2');

  // Pattern 3: any remaining " \" before a capital letter mid-sentence
  // e.g. "fire. \FachwerkUpdated" → "fire.\n• FachwerkUpdated"
  text = text.replace(/\s+\\([A-Z])/g, '\n• $1');

  // Pattern 4: standalone backslash at start of a line
  text = text.replace(/^\\/gm, '• ');

  // ── Clean up ───────────────────────────────────────────────────────────────
  text = text
    .replace(/\n{3,}/g,   '\n\n')  // max 2 consecutive blank lines
    .replace(/[ \t]+\n/g, '\n')    // trailing spaces on lines
    .replace(/\n[ \t]+/g, '\n')    // leading spaces after newlines
    .trim();

  // ── Truncate cleanly at a newline ──────────────────────────────────────────
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
