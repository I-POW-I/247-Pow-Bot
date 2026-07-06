/**
 * YouTube Data API v3 wrapper.
 * Requires YOUTUBE_API_KEY in .env
 * Uses native fetch.
 */

const { log } = require('../logger');

async function ytGet(path) {
  const res = await fetch(`https://www.googleapis.com/youtube/v3/${path}`, {
    signal: AbortSignal.timeout(10000),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`YouTube API ${res.status}: ${text.slice(0, 100)}`);
  }

  return res.json();
}

/**
 * Resolve a YouTube handle or /c/ or /user/ path to a channel ID.
 */
async function resolveHandle(handle) {
  try {
    const apiKey = process.env.YOUTUBE_API_KEY;
    if (!apiKey) return null;

    const clean = handle.replace(/^@/, '');

    // Try forHandle first (works for @ handles)
    const byHandle = await ytGet(`channels?part=id,snippet&forHandle=${encodeURIComponent(clean)}&key=${apiKey}`);
    if (byHandle.items?.[0]?.id) return byHandle.items[0].id;

    // Fallback: forUsername (legacy channel format)
    const byUser = await ytGet(`channels?part=id&forUsername=${encodeURIComponent(clean)}&key=${apiKey}`);
    return byUser.items?.[0]?.id || null;
  } catch (err) {
    log('WARN', `YouTube handle resolve failed for ${handle}`, { error: err.message });
    return null;
  }
}

/**
 * Fetch a channel's display name by channel ID.
 */
async function getDisplayName(channelId) {
  try {
    const apiKey = process.env.YOUTUBE_API_KEY;
    if (!apiKey) return null;
    const data = await ytGet(`channels?part=snippet&id=${channelId}&key=${apiKey}`);
    return data.items?.[0]?.snippet?.title || null;
  } catch { return null; }
}

/**
 * Get live status for a YouTube channel.
 */
async function getStreamStatus(channelId) {
  try {
    const apiKey = process.env.YOUTUBE_API_KEY;
    if (!apiKey) throw new Error('YOUTUBE_API_KEY not set');

    // Search for active live streams on this channel
    const search = await ytGet(
      `search?part=snippet&channelId=${channelId}&eventType=live&type=video&key=${apiKey}`
    );

    const item    = search.items?.[0];
    const isLive  = !!item;
    const videoId = item?.id?.videoId;

    let viewers     = null;
    let displayName = null;

    if (isLive && videoId) {
      // Fetch viewer count — separate API call
      const stats = await ytGet(
        `videos?part=liveStreamingDetails&id=${videoId}&key=${apiKey}`
      );
      const liveDetails = stats.items?.[0]?.liveStreamingDetails;
      viewers = parseInt(liveDetails?.concurrentViewers) || 0;
    }

    // Always fetch channel display name
    const channelData = await ytGet(`channels?part=snippet&id=${channelId}&key=${apiKey}`);
    displayName = channelData.items?.[0]?.snippet?.title || channelId;

    return {
      isLive,
      title:       isLive ? item.snippet?.title || 'Untitled Stream' : null,
      category:    null, // YouTube has no game field — field omitted in embed
      viewers,
      thumbnail:   isLive
        ? item.snippet?.thumbnails?.maxres?.url || item.snippet?.thumbnails?.high?.url || null
        : null,
      url:         isLive ? `https://youtube.com/watch?v=${videoId}` : `https://youtube.com/channel/${channelId}`,
      displayName,
    };
  } catch (err) {
    log('WARN', `YouTube check failed for ${channelId}`, { error: err.message });
    return null;
  }
}

module.exports = { getStreamStatus, resolveHandle, getDisplayName };
