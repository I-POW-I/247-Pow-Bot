/**
 * Stores metadata for every active voice connection.
 * Key: guildId (string)
 * Value: { channelId, channelName, guildName, joinedAt (Date), reconnectCount }
 *
 * This is what lets us:
 *  - Auto-rejoin after a ghost drop (we know which channel to return to)
 *  - Show uptime in /status and the live embed
 *  - Detect ghost connections (connection object gone but entry still here)
 */

/** @type {Map<string, { channelId: string, channelName: string, guildName: string, joinedAt: Date, reconnectCount: number }>} */
const store = new Map();

/**
 * Add or update an entry when the bot joins a channel.
 */
function setConnection(guildId, { channelId, channelName, guildName }) {
  store.set(guildId, {
    channelId,
    channelName,
    guildName,
    joinedAt: new Date(),
    reconnectCount: 0,
  });
}

/**
 * Remove an entry when the bot leaves cleanly.
 */
function clearConnection(guildId) {
  store.delete(guildId);
}

/**
 * Increment the reconnect counter for a guild (so we can log how many times it auto-rejoined).
 */
function incrementReconnect(guildId) {
  const entry = store.get(guildId);
  if (entry) entry.reconnectCount += 1;
}

/**
 * Get the stored metadata for a guild, or null if not tracked.
 * @param {string} guildId
 */
function getEntry(guildId) {
  return store.get(guildId) || null;
}

/**
 * Get all entries (used by the heartbeat to check every guild).
 * @returns {[string, object][]}
 */
function getAllEntries() {
  return [...store.entries()];
}

/**
 * Format how long the bot has been connected in a human-readable string.
 * e.g. "2h 14m" or "45m 03s"
 * @param {Date} joinedAt
 */
function formatUptime(joinedAt) {
  const ms = Date.now() - joinedAt.getTime();
  const totalSeconds = Math.floor(ms / 1000);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;

  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${String(s).padStart(2, '0')}s`;
  return `${s}s`;
}

module.exports = { setConnection, clearConnection, incrementReconnect, getEntry, getAllEntries, formatUptime };
