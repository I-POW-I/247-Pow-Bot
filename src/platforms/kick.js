/**
 * Kick.com platform wrapper.
 * Uses Kick's unofficial public API — no auth required.
 * Endpoint may change without notice; built with that in mind.
 */

const https = require('https');

const BASE_HEADERS = {
  'User-Agent':      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  'Accept':          'application/json',
  'Accept-Language': 'en-US,en;q=0.9',
  'Referer':         'https://kick.com/',
};

function get(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: BASE_HEADERS }, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch { reject(new Error('Invalid JSON from Kick API')); }
      });
    });
    req.on('error', reject);
    req.setTimeout(8000, () => { req.destroy(); reject(new Error('Kick API timeout')); });
  });
}

/**
 * Get live status for a Kick channel.
 * @param {string} username
 * @returns {{ isLive, title, category, viewers, thumbnail, url, displayName } | null}
 */
async function getStreamStatus(username) {
  try {
    const { status, body } = await get(`https://kick.com/api/v2/channels/${username.toLowerCase()}`);
    if (status !== 200 || !body) return null;

    const isLive    = body.livestream !== null && body.livestream !== undefined;
    const stream    = body.livestream;
    const displayName = body.user?.username || username;

    return {
      isLive,
      title:       isLive ? stream.session_title || 'Untitled Stream' : null,
      category:    isLive ? stream.categories?.[0]?.name || 'Unknown' : null,
      viewers:     isLive ? stream.viewer_count || 0 : null,
      thumbnail:   isLive ? stream.thumbnail?.url || null : null,
      url:         `https://kick.com/${username.toLowerCase()}`,
      displayName,
    };
  } catch {
    return null;
  }
}

module.exports = { getStreamStatus };
