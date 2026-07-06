/**
 * Kick.com platform wrapper.
 * Uses Kick's unofficial public API — no auth required.
 * Uses native fetch for reliable request handling.
 */

const { log } = require('../logger');

async function getStreamStatus(username) {
  try {
    const res = await fetch(`https://kick.com/api/v2/channels/${username.toLowerCase()}`, {
      headers: {
        'User-Agent':      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept':          'application/json, text/plain, */*',
        'Accept-Language': 'en-US,en;q=0.9',
        'Referer':         'https://kick.com/',
        'Origin':          'https://kick.com',
      },
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) {
      log('WARN', `Kick API ${res.status} for ${username}`);
      return null;
    }

    // Guard against HTML responses (Kick challenge page)
    const contentType = res.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
      log('WARN', `Kick returned non-JSON for ${username} — possible bot challenge`);
      return null;
    }

    const body = await res.json();

    const isLive      = !!body.livestream;
    const stream      = body.livestream;
    const displayName = body.user?.username || body.slug || username;

    return {
      isLive,
      title:       isLive ? stream.session_title || 'Untitled Stream' : null,
      category:    isLive ? (stream.categories?.[0]?.name || null) : null,
      viewers:     isLive ? (stream.viewer_count ?? 0) : null,
      thumbnail:   isLive ? (stream.thumbnail?.url || null) : null,
      url:         `https://kick.com/${username.toLowerCase()}`,
      displayName,
    };
  } catch (err) {
    log('WARN', `Kick check failed for ${username}`, { error: err.message });
    return null;
  }
}

module.exports = { getStreamStatus };
