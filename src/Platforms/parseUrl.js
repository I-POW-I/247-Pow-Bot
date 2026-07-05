/**
 * Parse a streamer channel URL and extract the platform + username/ID.
 *
 * Supported formats:
 *   Kick:    https://kick.com/xqc
 *   Twitch:  https://twitch.tv/shroud  or  https://www.twitch.tv/shroud
 *   YouTube: https://youtube.com/@MrBeast
 *            https://youtube.com/channel/UCxxxxxxx
 *            https://www.youtube.com/c/channelname
 *
 * Returns: { platform, username, displayHint } or null if unrecognised
 */

function parseStreamerUrl(input) {
  // Strip whitespace and ensure it has a protocol for URL parsing
  let url = input.trim();
  if (!url.startsWith('http')) url = 'https://' + url;

  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }

  const host     = parsed.hostname.replace('www.', '');
  const segments = parsed.pathname.split('/').filter(Boolean);

  // ── Kick ────────────────────────────────────────────────────────────────────
  if (host === 'kick.com') {
    const username = segments[0]?.toLowerCase();
    if (!username) return null;
    return { platform: 'kick', username, displayHint: username };
  }

  // ── Twitch ──────────────────────────────────────────────────────────────────
  if (host === 'twitch.tv') {
    const username = segments[0]?.toLowerCase();
    if (!username) return null;
    return { platform: 'twitch', username, displayHint: username };
  }

  // ── YouTube ─────────────────────────────────────────────────────────────────
  if (host === 'youtube.com' || host === 'youtu.be') {
    // /channel/UCxxxxxxx  — already a channel ID
    if (segments[0] === 'channel' && segments[1]) {
      return { platform: 'youtube', username: segments[1], displayHint: segments[1], needsResolve: false };
    }

    // /@Handle or /c/name or /user/name — needs resolving to channel ID
    if (segments[0]?.startsWith('@') || segments[0] === 'c' || segments[0] === 'user') {
      const handle = segments[0].startsWith('@') ? segments[0] : segments[1];
      if (!handle) return null;
      return { platform: 'youtube', username: handle, displayHint: handle, needsResolve: true };
    }

    return null;
  }

  return null;
}

module.exports = { parseStreamerUrl };
