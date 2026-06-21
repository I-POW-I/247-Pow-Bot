/**
 * Tracks when members joined voice channels and started streaming.
 * Stored in memory — seeded on startup by scanning current VC members.
 *
 * Using a shared module so both voiceStateUpdate.js and ready.js
 * can access the same Maps without circular dependencies.
 */

// Key format: `${guildId}_${userId}`
const joinTimes   = new Map();
const streamTimes = new Map();

/**
 * Seed join times for all members currently in voice channels.
 * Called on startup after auto-rejoin so duration tracking works
 * for members who were already in the channel before the bot restarted.
 * Uses Date.now() as an approximation — not their real join time,
 * but better than showing "Unknown" for everyone.
 *
 * @param {import('discord.js').Guild} guild
 */
function initGuild(guild) {
  for (const channel of guild.channels.cache.values()) {
    if (!channel.isVoiceBased()) continue;
    for (const member of channel.members.values()) {
      if (member.user.bot) continue;
      const key = `${guild.id}_${member.user.id}`;
      if (!joinTimes.has(key)) {
        joinTimes.set(key, Date.now());
      }
    }
  }
}

module.exports = { joinTimes, streamTimes, initGuild };
