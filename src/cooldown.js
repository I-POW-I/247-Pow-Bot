/**
 * Per-user cooldowns for panel buttons.
 * Prevents rapid repeated presses from firing multiple actions.
 */

const cooldowns = new Map();

// milliseconds per button — only buttons that trigger real actions
const LIMITS = {
  bot_join:       4000,
  bot_leave:      4000,
  bot_forceleave: 4000,
  bot_refresh:    3000,
  bot_myinfo:     2000,
  bot_lookup:     2000,
};

/**
 * Check if a user is on cooldown for a given button.
 * Returns null if clear to proceed, or a string like "2.1" (seconds remaining) if blocked.
 * @param {string} userId
 * @param {string} customId
 * @returns {string|null}
 */
function checkCooldown(userId, customId) {
  const limit = LIMITS[customId];
  if (!limit) return null;

  const key  = `${userId}:${customId}`;
  const last = cooldowns.get(key);
  const now  = Date.now();

  if (last && now - last < limit) {
    return ((limit - (now - last)) / 1000).toFixed(1);
  }

  cooldowns.set(key, now);

  // Prevent the map growing indefinitely — prune stale entries periodically
  if (cooldowns.size > 2000) {
    const cutoff = now - 30000;
    for (const [k, ts] of cooldowns) {
      if (ts < cutoff) cooldowns.delete(k);
    }
  }

  return null;
}

module.exports = { checkCooldown };
