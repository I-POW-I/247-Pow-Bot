/**
 * Steam API wrapper — no key required.
 *
 * Steam patch notes come in several formats depending on the game:
 *   - BBCode: [h2]Header[/h2][list][*]\Item[/list]
 *   - HTML:   <h3>Header</h3><ul><li>Item</li></ul>
 *   - Mixed:  [b]Header[/b] followed by HTML lists
 *   - Plain:  Raw text with \Item as inline bullet separators
 *
 * The parser handles ALL of these correctly.
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
  'maintenance', 'build', 'notes', 'fix', 'release', 'series',
];

function isActualUpdate(item) {
  const title = (item.title || '').toLowerCase();
  const isOfficialFeed =
    item.feedname === 'steam_community_announcements' ||
    item.feedname === 'steam_updates' ||
    item.feed_type === 1;
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
    for (const section of ['specials', 'top_sellers', 'new_releases', 'under10']) {
      for (const item of (data?.[section]?.items || [])) {
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
 * Parse Steam BBCode + HTML into clean Discord markdown.
 *
 * Handles ALL Steam content formats:
 *   HTML headers   <h1-6>Header</h1-6>     → **Header** on own line
 *   HTML bold      <strong>Text</strong>    → **Text** on own line (section headers)
 *   HTML italic    <em>Text</em>            → *Text*
 *   HTML lists     <ul><li>Item</li></ul>   → • Item
 *   HTML para      <p>Text</p>              → Text with line break
 *   BBCode headers [h1-h3]Header[/h1-h3]   → **Header** on own line
 *   BBCode bold    [b]Text[/b]              → **Text** on own line
 *   BBCode lists   [list][*]Item[/list]     → • Item
 *   BBCode [*]\    [*]\Item                 → • Item (CS2 style)
 *   Raw backslash  \Item                    → • Item
 *   Inline \sep    text.\NextItem           → text.\n• NextItem
 */
function parseSteamContent(raw, maxLength = 1000) {
  if (!raw) return { text: '', imageUrl: null, youtubeUrl: null };
  let text = raw;

  // ── Extract image before any processing ────────────────────────────────────
  const clanImg = text.match(/\{STEAM_CLAN_IMAGE\}\/([^\s\[\]\n,{]+)/i);
  const regImg  = text.match(/\[img\](https?:\/\/[^\[]+?)\[\/img\]/i);
  let imageUrl  = clanImg
    ? `https://clan.akamai.steamstatic.com/images/${clanImg[1]}`
    : regImg ? regImg[1].trim() : null;

  // Also check for og:image or media in content
  if (!imageUrl) {
    const srcImg = text.match(/src=["'](https?:\/\/[^"']+\.(?:jpg|jpeg|png|gif|webp))['"]/i);
    if (srcImg) imageUrl = srcImg[1];
  }

  // ── Extract YouTube ────────────────────────────────────────────────────────
  const ytMatch    = text.match(/\[previewyoutube=([A-Za-z0-9_-]+)/i) ||
                     text.match(/youtube\.com\/watch\?v=([A-Za-z0-9_-]+)/i) ||
                     text.match(/youtu\.be\/([A-Za-z0-9_-]+)/i);
  const youtubeUrl = ytMatch ? `https://youtube.com/watch?v=${ytMatch[1]}` : null;

  // ── Normalise line endings ─────────────────────────────────────────────────
  text = text.replace(/\\n/g, '\n').replace(/\r\n|\r/g, '\n');

  // ── Strip image/video tags ─────────────────────────────────────────────────
  text = text
    .replace(/\{STEAM_CLAN_IMAGE\}\/[^\s\[\]\n,{]+/gi, '')
    .replace(/\[img\][^\[]*?\[\/img\]/gis, '')
    .replace(/\[previewyoutube[^\]]*\][^\[]*?\[\/previewyoutube\]/gis, '');

  // ── HTML: convert BEFORE stripping tags ────────────────────────────────────
  // Headers → bold on own line
  text = text.replace(/<h[1-6][^>]*>\s*(.*?)\s*<\/h[1-6]>/gis, '\n**$1**\n');

  // <strong> and <b> used as section headers → bold on own line
  text = text.replace(/<(?:strong|b)[^>]*>\s*(.*?)\s*<\/(?:strong|b)>/gis, '\n**$1**');

  // <em> and <i> → italic
  text = text.replace(/<(?:em|i)[^>]*>\s*(.*?)\s*<\/(?:em|i)>/gis, '*$1*');

  // <p> → paragraph break
  text = text.replace(/<p[^>]*>/gi, '\n').replace(/<\/p>/gi, '\n');

  // List items → bullets
  text = text
    .replace(/<li[^>]*>/gi,    '\n• ')
    .replace(/<\/li>/gi,       '')
    .replace(/<[ou]l[^>]*>/gi, '\n')
    .replace(/<\/[ou]l>/gi,    '\n');

  // Line breaks
  text = text.replace(/<br\s*\/?>/gi, '\n');

  // Strip ALL remaining HTML tags
  text = text.replace(/<[^>]+>/g, '');

  // ── BBCode → Discord markdown ──────────────────────────────────────────────
  text = text
    // Headers → bold on own line
    .replace(/\[h[1-3]\]\s*(.*?)\s*\[\/h[1-3]\]/gis, '\n**$1**\n')
    // [b] used as sub-headers → bold on own line
    .replace(/\[b\]\s*(.*?)\s*\[\/b\]/gis,           '\n**$1**')
    .replace(/\[i\]\s*(.*?)\s*\[\/i\]/gis,           '*$1*')
    .replace(/\[u\]\s*(.*?)\s*\[\/u\]/gis,           '__$1__')
    .replace(/\[strike\]\s*(.*?)\s*\[\/strike\]/gis, '~~$1~~')
    // Links
    .replace(/\[url=([^\]]+)\]\s*(.*?)\s*\[\/url\]/gis, '[$2]($1)')
    .replace(/\[url\](.*?)\[\/url\]/gis, '$1')
    // Lists — [*] with optional \ prefix
    .replace(/\[list\]/gi,        '\n')
    .replace(/\[\/list\]/gi,      '\n')
    .replace(/\s*\[\*\]\s*\\?/g,  '\n• ')
    // Strip remaining BBCode
    .replace(/\[[^\]]{1,30}\]/g, '');

  // ── HTML entities ──────────────────────────────────────────────────────────
  text = text
    .replace(/&amp;/g,   '&').replace(/&lt;/g,    '<').replace(/&gt;/g,   '>')
    .replace(/&quot;/g,  '"').replace(/&#39;/g,   "'").replace(/&nbsp;/g, ' ')
    .replace(/&mdash;/g, '—').replace(/&ndash;/g, '–').replace(/&hellip;/g, '...');

  // ── Handle raw \ bullet format ─────────────────────────────────────────────
  // CS2 and some other games use \Item as inline bullet separators
  text = text
    .replace(/^\\([A-Z])/m,           '• $1')       // \Item at start of string
    .replace(/([.!?)])\s*\\([A-Z])/g, '$1\n• $2')   // .\Item or )\Item
    .replace(/\s+\\([A-Z])/g,         '\n• $1')      // space \Item mid-line
    .replace(/^\\/gm,                 '• ');          // any \ at start of line

  // ── Clean up whitespace ────────────────────────────────────────────────────
  text = text
    .replace(/\n{3,}/g,   '\n\n')   // max 2 consecutive blank lines
    .replace(/[ \t]+\n/g, '\n')     // trailing spaces
    .replace(/\n[ \t]+/g, '\n')     // leading spaces after newline
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
