/**
 * Simple per-guild config stored in data/guild-config.json
 *
 * Shape: { [guildId]: { logChannelId, panelChannelId, panelMessageId } }
 *
 * This means each server that uses the bot can have its own
 * log channel and control panel — they don't interfere with each other.
 */

const fs   = require('fs');
const path = require('path');

const CONFIG_PATH = path.join(__dirname, '..', 'data', 'guild-config.json');

// ── Helpers ──────────────────────────────────────────────────────────────────

function readAll() {
  try {
    return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  } catch {
    return {};
  }
}

function writeAll(data) {
  fs.mkdirSync(path.dirname(CONFIG_PATH), { recursive: true });
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(data, null, 2), 'utf8');
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Get the full config object for a guild (or an empty object if none set).
 * @param {string} guildId
 * @returns {{ logChannelId?: string, panelChannelId?: string, panelMessageId?: string }}
 */
function getGuildConfig(guildId) {
  return readAll()[guildId] || {};
}

/**
 * Update one or more fields for a guild.
 * @param {string} guildId
 * @param {object} updates  e.g. { logChannelId: '123456' }
 */
function setGuildConfig(guildId, updates) {
  const all = readAll();
  all[guildId] = { ...all[guildId], ...updates };
  writeAll(all);
}

module.exports = { getGuildConfig, setGuildConfig };
