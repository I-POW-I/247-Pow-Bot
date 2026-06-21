/**
 * Per-guild config stored in data/guild-config.json
 *
 * Shape:
 * {
 *   [guildId]: {
 *     logChannels: {
 *       voice:    "channelId",
 *       messages: "channelId",
 *       members:  "channelId",
 *     },
 *     panelChannelId:  "channelId",
 *     panelMessageId:  "messageId",
 *     lastChannelId:   "channelId",   ← last VC the bot was in, for auto-rejoin
 *   }
 * }
 */

const fs   = require('fs');
const path = require('path');

const CONFIG_PATH = path.join(__dirname, '..', 'data', 'guild-config.json');

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

function getGuildConfig(guildId) {
  return readAll()[guildId] || {};
}

function setGuildConfig(guildId, updates) {
  const all = readAll();
  all[guildId] = { ...all[guildId], ...updates };
  writeAll(all);
}

function getLogChannel(guildId, type) {
  const config = getGuildConfig(guildId);
  return config.logChannels?.[type] || null;
}

function setLogChannel(guildId, type, channelId) {
  const all = readAll();
  if (!all[guildId]) all[guildId] = {};
  if (!all[guildId].logChannels) all[guildId].logChannels = {};
  all[guildId].logChannels[type] = channelId;
  writeAll(all);
}

/**
 * Save the last known voice channel the bot was in for a guild.
 * Used by ready.js to auto-rejoin after a restart.
 */
function setLastChannel(guildId, channelId) {
  const all = readAll();
  if (!all[guildId]) all[guildId] = {};
  all[guildId].lastChannelId = channelId;
  writeAll(all);
}

/**
 * Clear the saved channel — called on /leave and /forceleave
 * so the bot doesn't rejoin a channel it was told to leave.
 */
function clearLastChannel(guildId) {
  const all = readAll();
  if (all[guildId]) {
    delete all[guildId].lastChannelId;
    writeAll(all);
  }
}

module.exports = {
  getGuildConfig,
  setGuildConfig,
  getLogChannel,
  setLogChannel,
  setLastChannel,
  clearLastChannel,
};
