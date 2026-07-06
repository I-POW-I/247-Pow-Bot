/**
 * Twitch Helix API wrapper.
 * Requires TWITCH_CLIENT_ID and TWITCH_CLIENT_SECRET in Discloud environment variables.
 *
 * If you're seeing "token request failed: 403" in logs:
 *   1. Go to dev.twitch.tv/console/apps
 *   2. Create an application (category: Other, redirect: http://localhost)
 *   3. Copy the Client ID and generate a Client Secret
 *   4. Set TWITCH_CLIENT_ID and TWITCH_CLIENT_SECRET in Discloud Variables
 */

const { log } = require('../logger');

let accessToken    = null;
let tokenExpiresAt = 0;
let tokenFailed    = false; // Stop retrying if credentials are wrong

async function getToken() {
  if (tokenFailed) throw new Error('Twitch credentials invalid — check TWITCH_CLIENT_ID and TWITCH_CLIENT_SECRET in Discloud Variables');
  if (accessToken && Date.now() < tokenExpiresAt - 60000) return accessToken;

  const clientId     = process.env.TWITCH_CLIENT_ID;
  const clientSecret = process.env.TWITCH_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error('TWITCH_CLIENT_ID or TWITCH_CLIENT_SECRET not set in Discloud Variables');
  }

  const res = await fetch('https://id.twitch.tv/oauth2/token', {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body:    `client_id=${clientId}&client_secret=${clientSecret}&grant_type=client_credentials`,
    signal:  AbortSignal.timeout(10000),
  });

  if (res.status === 403 || res.status === 401) {
    tokenFailed = true;
    throw new Error(`Twitch credentials rejected (${res.status}) — verify your Client ID and Secret at dev.twitch.tv/console`);
  }

  if (!res.ok) throw new Error(`Twitch token endpoint returned ${res.status}`);

  const data = await res.json();
  if (!data.access_token) throw new Error('Twitch token response missing access_token');

  accessToken    = data.access_token;
  tokenExpiresAt = Date.now() + data.expires_in * 1000;
  tokenFailed    = false;
  return accessToken;
}

async function twitchGet(path) {
  const token = await getToken();
  const res   = await fetch(`https://api.twitch.tv/helix/${path}`, {
    headers: {
      'Client-ID':     process.env.TWITCH_CLIENT_ID,
      'Authorization': `Bearer ${token}`,
    },
    signal: AbortSignal.timeout(10000),
  });

  if (!res.ok) throw new Error(`Twitch API ${res.status} for ${path}`);
  return res.json();
}

async function getStreamStatus(username) {
  try {
    const [streamData, userData] = await Promise.all([
      twitchGet(`streams?user_login=${encodeURIComponent(username.toLowerCase())}`),
      twitchGet(`users?login=${encodeURIComponent(username.toLowerCase())}`),
    ]);

    const stream = streamData.data?.[0];
    const user   = userData.data?.[0];
    const isLive = !!stream;

    return {
      isLive,
      title:       isLive ? stream.title || 'Untitled Stream' : null,
      category:    isLive ? (stream.game_name || null) : null,
      viewers:     isLive ? (stream.viewer_count ?? 0) : null,
      thumbnail:   isLive ? stream.thumbnail_url?.replace('{width}', '1280').replace('{height}', '720') : null,
      url:         `https://twitch.tv/${username.toLowerCase()}`,
      displayName: user?.display_name || username,
    };
  } catch (err) {
    return { error: err.message };
  }
}

async function getDisplayName(username) {
  try {
    const data = await twitchGet(`users?login=${encodeURIComponent(username.toLowerCase())}`);
    return data.data?.[0]?.display_name || null;
  } catch { return null; }
}

/**
 * Test credentials at startup — logs a clear warning if they're wrong.
 */
async function validateCredentials() {
  try {
    await getToken();
    log('INFO', 'Twitch credentials validated');
  } catch (err) {
    log('WARN', `Twitch: ${err.message}`);
  }
}

module.exports = { getStreamStatus, getDisplayName, validateCredentials };
