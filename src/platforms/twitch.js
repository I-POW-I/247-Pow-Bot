/**
 * Twitch Helix API wrapper.
 * Requires TWITCH_CLIENT_ID and TWITCH_CLIENT_SECRET in .env
 *
 * Uses Client Credentials flow — app access token, not user token.
 * Token auto-refreshes when it expires.
 */

const https = require('https');

let accessToken    = null;
let tokenExpiresAt = 0;

function post(url, body) {
  return new Promise((resolve, reject) => {
    const data = Buffer.from(body);
    const opts = {
      method:  'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': data.length },
    };
    const req = https.request(url, opts, res => {
      let out = '';
      res.on('data', c => out += c);
      res.on('end', () => {
        try { resolve(JSON.parse(out)); }
        catch { reject(new Error('Invalid JSON from Twitch auth')); }
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

function get(url, token) {
  return new Promise((resolve, reject) => {
    const opts = {
      headers: {
        'Client-ID':    process.env.TWITCH_CLIENT_ID,
        'Authorization': `Bearer ${token}`,
      },
    };
    const req = https.get(url, opts, res => {
      let out = '';
      res.on('data', c => out += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(out) }); }
        catch { reject(new Error('Invalid JSON from Twitch API')); }
      });
    });
    req.on('error', reject);
    req.setTimeout(8000, () => { req.destroy(); reject(new Error('Twitch API timeout')); });
  });
}

async function getToken() {
  if (accessToken && Date.now() < tokenExpiresAt - 60000) return accessToken;

  const clientId     = process.env.TWITCH_CLIENT_ID;
  const clientSecret = process.env.TWITCH_CLIENT_SECRET;

  if (!clientId || !clientSecret) throw new Error('TWITCH_CLIENT_ID or TWITCH_CLIENT_SECRET not set in .env');

  const res = await post(
    'https://id.twitch.tv/oauth2/token',
    `client_id=${clientId}&client_secret=${clientSecret}&grant_type=client_credentials`
  );

  if (!res.access_token) throw new Error('Failed to get Twitch access token');

  accessToken    = res.access_token;
  tokenExpiresAt = Date.now() + (res.expires_in * 1000);
  return accessToken;
}

/**
 * Get live status for a Twitch channel.
 * @param {string} username
 * @returns {{ isLive, title, category, viewers, thumbnail, url, displayName } | null}
 */
async function getStreamStatus(username) {
  try {
    const token = await getToken();
    const { status, body } = await get(
      `https://api.twitch.tv/helix/streams?user_login=${username.toLowerCase()}`,
      token
    );

    if (status !== 200) return null;

    const stream    = body.data?.[0];
    const isLive    = !!stream;

    // Fetch user info for display name and profile picture
    const { body: userBody } = await get(
      `https://api.twitch.tv/helix/users?login=${username.toLowerCase()}`,
      token
    );
    const user = userBody.data?.[0];

    return {
      isLive,
      title:       isLive ? stream.title || 'Untitled Stream' : null,
      category:    isLive ? stream.game_name || 'Unknown' : null,
      viewers:     isLive ? stream.viewer_count || 0 : null,
      // Replace {width} and {height} placeholders in thumbnail URL
      thumbnail:   isLive ? stream.thumbnail_url?.replace('{width}', '1280').replace('{height}', '720') : null,
      url:         `https://twitch.tv/${username.toLowerCase()}`,
      displayName: user?.display_name || username,
    };
  } catch {
    return null;
  }
}

module.exports = { getStreamStatus };
