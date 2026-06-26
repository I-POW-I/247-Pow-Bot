/**
 * SQLite database — persistent VC session tracking.
 * File: data/pow-bot.db (gitignored, survives Discloud restarts).
 *
 * vc_sessions columns:
 *   id, user_id, guild_id, channel_id, channel_name,
 *   joined_at (ms), left_at (ms), duration_ms
 */

const Database = require('better-sqlite3');
const path     = require('path');
const fs       = require('fs');
const { log }  = require('./logger');

const DATA_DIR = path.join(__dirname, '..', 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });

let db;
try {
  db = new Database(path.join(DATA_DIR, 'pow-bot.db'));
  db.pragma('journal_mode = WAL');

  db.exec(`
    CREATE TABLE IF NOT EXISTS vc_sessions (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id      TEXT    NOT NULL,
      guild_id     TEXT    NOT NULL,
      channel_id   TEXT    NOT NULL,
      channel_name TEXT    NOT NULL,
      joined_at    INTEGER NOT NULL,
      left_at      INTEGER,
      duration_ms  INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_user_guild ON vc_sessions (user_id, guild_id);
    CREATE INDEX IF NOT EXISTS idx_guild      ON vc_sessions (guild_id);
    CREATE INDEX IF NOT EXISTS idx_joined     ON vc_sessions (joined_at);
  `);

  log('INFO', 'SQLite database ready (data/pow-bot.db)');
} catch (err) {
  log('ERROR', 'SQLite init failed — VC tracking unavailable', { error: err.message });
  db = null;
}

// ── Prepared statements ───────────────────────────────────────────────────────

const s = db ? {
  start: db.prepare(`
    INSERT INTO vc_sessions (user_id, guild_id, channel_id, channel_name, joined_at)
    VALUES (?, ?, ?, ?, ?)
  `),

  end: db.prepare(`
    UPDATE vc_sessions
    SET left_at = ?, duration_ms = ? - joined_at
    WHERE id = (
      SELECT id FROM vc_sessions
      WHERE user_id = ? AND guild_id = ? AND left_at IS NULL
      ORDER BY joined_at DESC LIMIT 1
    )
  `),

  // Fetch the open session so we can restore original join time after restart
  openSession: db.prepare(`
    SELECT id, joined_at, channel_id, channel_name
    FROM vc_sessions
    WHERE user_id = ? AND guild_id = ? AND left_at IS NULL
    ORDER BY joined_at DESC LIMIT 1
  `),

  userStats: db.prepare(`
    SELECT
      COUNT(*)                      AS session_count,
      COALESCE(SUM(duration_ms), 0) AS total_ms,
      COALESCE(AVG(duration_ms), 0) AS avg_ms,
      MAX(left_at)                  AS last_seen
    FROM vc_sessions
    WHERE user_id = ? AND guild_id = ? AND duration_ms IS NOT NULL
  `),

  topChannel: db.prepare(`
    SELECT channel_name, SUM(duration_ms) AS total_ms
    FROM vc_sessions
    WHERE user_id = ? AND guild_id = ? AND duration_ms IS NOT NULL
    GROUP BY channel_id
    ORDER BY total_ms DESC LIMIT 1
  `),

  // Used for streak — distinct UTC days with VC activity, newest first
  streakDays: db.prepare(`
    SELECT DISTINCT date(joined_at / 1000, 'unixepoch') AS day
    FROM vc_sessions
    WHERE user_id = ? AND guild_id = ? AND duration_ms IS NOT NULL
    ORDER BY day DESC
  `),

  // Server-wide totals for /status
  serverTotals: db.prepare(`
    SELECT COUNT(*) AS total_sessions, COALESCE(SUM(duration_ms), 0) AS total_ms
    FROM vc_sessions
    WHERE guild_id = ? AND duration_ms IS NOT NULL
  `),
} : null;

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Format milliseconds into a readable string. e.g. 7384000 → "2h 3m" */
function formatMs(ms) {
  if (!ms || ms <= 0) return '0m';
  const totalS = Math.floor(ms / 1000);
  const d = Math.floor(totalS / 86400);
  const h = Math.floor((totalS % 86400) / 3600);
  const m = Math.floor((totalS % 3600) / 60);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

/**
 * Calculate current VC streak — consecutive days with at least one session.
 * Streak starts from today or yesterday (so it doesn't break if they haven't
 * joined yet today but were active yesterday).
 */
function calcStreak(userId, guildId) {
  if (!s) return 0;
  try {
    const rows = s.streakDays.all(userId, guildId);
    if (rows.length === 0) return 0;

    const today     = new Date().toISOString().split('T')[0];
    const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];

    // Must have been active today or yesterday for streak to be alive
    if (rows[0].day !== today && rows[0].day !== yesterday) return 0;

    let streak = 1;
    for (let i = 1; i < rows.length; i++) {
      const prev = new Date(rows[i - 1].day);
      const curr = new Date(rows[i].day);
      const diff = Math.round((prev - curr) / 86400000);
      if (diff === 1) streak++;
      else break;
    }
    return streak;
  } catch { return 0; }
}

// ── Public API ────────────────────────────────────────────────────────────────

function startSession(userId, guildId, channelId, channelName) {
  if (!s) return;
  try { s.start.run(userId, guildId, channelId, channelName, Date.now()); }
  catch (err) { log('ERROR', 'DB startSession', { error: err.message }); }
}

function endSession(userId, guildId) {
  if (!s) return;
  try {
    const now = Date.now();
    s.end.run(now, now, userId, guildId);
  } catch (err) { log('ERROR', 'DB endSession', { error: err.message }); }
}

/** Returns the open session for a user, or null. Used to restore join times on restart. */
function getOpenSession(userId, guildId) {
  if (!s) return null;
  try { return s.openSession.get(userId, guildId) || null; }
  catch { return null; }
}

/**
 * Full stats for a member profile.
 * @returns {{ session_count, total_ms, avg_ms, last_seen, top_channel, top_channel_ms, streak }}
 */
function getUserStats(userId, guildId) {
  if (!s) return { session_count: 0, total_ms: 0, avg_ms: 0, last_seen: null, top_channel: null, top_channel_ms: 0, streak: 0 };
  try {
    const base    = s.userStats.get(userId, guildId) || { session_count: 0, total_ms: 0, avg_ms: 0, last_seen: null };
    const top     = s.topChannel.get(userId, guildId) || null;
    const streak  = calcStreak(userId, guildId);
    return {
      ...base,
      top_channel:    top?.channel_name || null,
      top_channel_ms: top?.total_ms     || 0,
      streak,
    };
  } catch (err) {
    log('ERROR', 'DB getUserStats', { error: err.message });
    return { session_count: 0, total_ms: 0, avg_ms: 0, last_seen: null, top_channel: null, top_channel_ms: 0, streak: 0 };
  }
}

/** Server-wide session totals — for /status. */
function getServerTotals(guildId) {
  if (!s) return { total_sessions: 0, total_ms: 0 };
  try { return s.serverTotals.get(guildId) || { total_sessions: 0, total_ms: 0 }; }
  catch { return { total_sessions: 0, total_ms: 0 }; }
}

module.exports = { startSession, endSession, getOpenSession, getUserStats, getServerTotals, formatMs };
