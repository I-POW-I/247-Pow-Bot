/**
 * Stores metadata for every active voice connection.
 * Key: guildId
 * Value: { channelId, channelName, guildName, joinedAt, reconnectCount }
 */

const store = new Map();

/**
 * @param {string} guildId
 * @param {{ channelId, channelName, guildName, joinedAt?, reconnectCount? }} meta
 */
function setConnection(guildId, { channelId, channelName, guildName, joinedAt, reconnectCount }) {
  store.set(guildId, {
    channelId,
    channelName,
    guildName,
    joinedAt:       joinedAt       || new Date(),
    reconnectCount: reconnectCount || 0,
  });
}

function clearConnection(guildId) {
  store.delete(guildId);
}

function incrementReconnect(guildId) {
  const entry = store.get(guildId);
  if (entry) entry.reconnectCount += 1;
}

function getEntry(guildId) {
  return store.get(guildId) || null;
}

function getAllEntries() {
  return [...store.entries()];
}

function formatUptime(joinedAt) {
  const ms           = Date.now() - new Date(joinedAt).getTime();
  const totalSeconds = Math.floor(ms / 1000);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;

  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${String(s).padStart(2, '0')}s`;
  return `${s}s`;
}

module.exports = { setConnection, clearConnection, incrementReconnect, getEntry, getAllEntries, formatUptime };
