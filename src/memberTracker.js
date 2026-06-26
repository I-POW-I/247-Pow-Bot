/**
 * Tracks active VC session start times in memory.
 * On startup, open sessions are restored from the SQLite DB so
 * duration tracking is accurate even after a bot restart.
 *
 * Key format: `${guildId}_${userId}`
 */

const { startSession, getOpenSession } = require('./database');

const joinTimes   = new Map(); // guildId_userId → join timestamp (ms)
const streamTimes = new Map(); // guildId_userId → stream start timestamp (ms)

/**
 * Seed join times for all members currently in voice channels.
 * Called from ready.js after auto-rejoin.
 *
 * For each member already in a VC:
 *   - If an open DB session exists → restore their original join time (accurate across restarts)
 *   - If no open session → they joined while bot was offline, start fresh and record it
 */
function initGuild(guild) {
  for (const channel of guild.channels.cache.values()) {
    if (!channel.isVoiceBased()) continue;
    for (const member of channel.members.values()) {
      if (member.user.bot) continue;

      const key = `${guild.id}_${member.user.id}`;
      if (joinTimes.has(key)) continue; // Already seeded

      // Check if there's an open session in the DB from before the restart
      const openSession = getOpenSession(member.user.id, guild.id);

      if (openSession) {
        // Restore original join time — accurate duration tracking across restarts
        joinTimes.set(key, openSession.joined_at);
      } else {
        // No open session — member joined while bot was offline
        // Start tracking from now and write a new session row
        joinTimes.set(key, Date.now());
        startSession(member.user.id, guild.id, channel.id, channel.name);
      }
    }
  }
}

module.exports = { joinTimes, streamTimes, initGuild };
