/**
 * YouTube Data API v3 wrapper.
 * Requires YOUTUBE_API_KEY in .env
 * Free tier: 10,000 units/day.
 */

const https = require('https');

function get(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch { reject(new Error('Invalid JSON from YouTube API')); }
      });
    });
    req.on('error', reject);
    req.setTimeout(8000, () => { req.destroy(); reject(new Error('YouTube API timeout')); });
  });
}

/**
 * Resolve a YouTube handle (@MrBeast, /c/name, /user/name) to a channel ID.
 * @param {string} handle  — e.g. "@MrBeast" or "MrBeast"
 * @returns {string|null}  — channel ID starting with UC...
 */
async function resolveHandle(handle) {
  try {
    const apiKey  = process.env.YOUTUBE_API_KEY;
    if (!apiKey) return null;

    // Clean handle — remove @ if present
    const clean = handle.replace(/^@/, '');

    // Try searching by handle (forHandle parameter — works for @ handles)
    const { body } = await get(
      `https://www.googleapis.com/youtube/v3/channels?part=id,snippet&forHandle=${encodeURIComponent(clean)}&key=${apiKey}`
    );

    if (body.items?.[0]?.id) return body.items[0].id;

    // Fallback: search by username (older channel format)
    const { body: byUser } = await get(
      `https://www.googleapis.com/youtube/v3/channels?part=id,snippet&forUsername=${encodeURIComponent(clean)}&key=${apiKey}`
    );

    return byUser.items?.[0]?.id || null;
  } catch { return null; }
}

/**
 * Get live status for a YouTube channel.
 * @param {string} channelId
 */
async function getStreamStatus(channelId) {
  try {
    const apiKey = process.env.YOUTUBE_API_KEY;
    if (!apiKey) throw new Error('YOUTUBE_API_KEY not set');

    const searchUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&channelId=${channelId}&eventType=live&type=video&key=${apiKey}`;
    const { status, body } = await get(searchUrl);
    if (status !== 200) return null;

    const item    = body.items?.[0];
    const isLive  = !!item;
    const videoId = item?.id?.videoId;

    let viewers = null;
    if (isLive && videoId) {
      const { body: statsBody } = await get(
        `https://www.googleapis.com/youtube/v3/videos?part=liveStreamingDetails&id=${videoId}&key=${apiKey}`
      );
      viewers = parseInt(statsBody.items?.[0]?.liveStreamingDetails?.concurrentViewers) || 0;
    }

    const { body: channelBody } = await get(
      `https://www.googleapis.com/youtube/v3/channels?part=snippet&id=${channelId}&key=${apiKey}`
    );
    const channel = channelBody.items?.[0];

    return {
      isLive,
      title:       isLive ? item.snippet?.title || 'Untitled Stream' : null,
      category:    'Live Stream',
      viewers,
      thumbnail:   isLive ? item.snippet?.thumbnails?.maxres?.url || item.snippet?.thumbnails?.high?.url || null : null,
      url:         isLive ? `https://youtube.com/watch?v=${videoId}` : `https://youtube.com/channel/${channelId}`,
      displayName: channel?.snippet?.title || channelId,
    };
  } catch { return null; }
}

module.exports = { getStreamStatus, resolveHandle };
