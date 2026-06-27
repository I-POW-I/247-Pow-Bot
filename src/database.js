/**
 * SQLite database using sql.js — pure JavaScript, no native compilation needed.
 * Works on any hosting environment including Discloud.
 *
 * DB file: data/pow-bot.db (gitignored, persists on Discloud between restarts).
 *
 * IMPORTANT: Call await init() before using any other function.
 * This is done in events/ready.js before everything else starts.
 */

const path   = require('path');
const fs     = require('fs');
const { log } = require('./logger');

const DATA_DIR = path.join(__dirname, '..', 'data');
const DB_PATH  = path.join(DATA_DIR, 'pow-bot.db');

let db = null;

// ── Initialise ────────────────────────────────────────────────────────────────

async function init() {
  fs.mkdirSync(DATA_DIR, { recursive: true });

  try {
    const initSqlJs = require('sql.js');
    const SQL       = await initSqlJs();

    if (fs.existsSync(DB_PATH)) {
      db = new SQL.Database(fs.readFileSync(DB_PATH));
      log('INFO', 'SQLite database loaded (data/pow-bot.db)');
    } else {
      db = new SQL.Database();
      log('INFO', 'SQLite database created (data/pow-bot.db)');
    }

    db.run(`
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

    save();
  } catch (err) {
    log('ERROR', 'SQLite init failed — VC tracking unavailable', { error: err.message });
    db = null;
  }
}

// Persist the in-memory database to disk after every write
function save() {
  if (!db) return;
  try {
    fs.writeFileSync(DB_PATH, Buffer.from(db.export()));
  } catch (err) {
    log('ERROR', 'DB save failed', { error: err.message });
  }
}

// ── Internal helpers ──────────────────────────────────────────────────────────

function run(sql, params = []) {
  if (!db) return;
  try {
    const stmt = db.prepare(sql);
    stmt.run(params);
    stmt.free();
    save();
  } catch (err) {
    log('ERROR', 'DB run', { error: err.message });
  }
}

function selectOne(sql, params = []) {
  if (!db) return null;
  try {
    const stmt = db.prepare(sql);
    stmt.bind(params);
    const row = stmt.step() ? stmt.getAsObject() : null;
    stmt.free();
    return row;
  } catch (err) {
    log('ERROR', 'DB selectOne', { error: err.message });
    return null;
  }
}

function selectAll(sql, params = []) {
  if (!db) return [];
  try {
    const stmt = db.prepare(sql);
    stmt.bind(params);
    const rows = [];
    while (stmt.step()) rows.push(stmt.getAsObject());
    stmt.free();
    return rows;
  } catch (err) {
    log('ERROR', 'DB selectAll', { error: err.message });
    return [];
  }
}

// ── Streak calculation ────────────────────────────────────────────────────────

function calcStreak(userId, guildId) {
  const rows = selectAll(
    `SELECT DISTINCT date(joined_at / 1000, 'unixepoch') AS day
     FROM vc_sessions
     WHERE user_id = ? AND guild_id = ? AND duration_ms IS NOT NULL
     ORDER BY day DESC`,
    [userId, guildId]
  );

  if (rows.length === 0) return 0;

  const today     = new Date().toISOString().split('T')[0];
  const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];

  // Streak must start from today or yesterday — don't break it if they haven't joined yet today
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
}

// ── Public API ────────────────────────────────────────────────────────────────

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

function startSession(userId, guildId, channelId, channelName) {
  run(
    'INSERT INTO vc_sessions (user_id, guild_id, channel_id, channel_name, joined_at) VALUES (?, ?, ?, ?, ?)',
    [userId, guildId, channelId, channelName, Date.now()]
  );
}

function endSession(userId, guildId) {
  const now  = Date.now();
  const open = selectOne(
    'SELECT id FROM vc_sessions WHERE user_id = ? AND guild_id = ? AND left_at IS NULL ORDER BY joined_at DESC LIMIT 1',
    [userId, guildId]
  );
  if (!open) return;
  run(
    'UPDATE vc_sessions SET left_at = ?, duration_ms = ? - joined_at WHERE id = ?',
    [now, now, open.id]
  );
}

/** Find an open session — used on restart to restore original join time. */
function getOpenSession(userId, guildId) {
  return selectOne(
    'SELECT id, joined_at, channel_id, channel_name FROM vc_sessions WHERE user_id = ? AND guild_id = ? AND left_at IS NULL ORDER BY joined_at DESC LIMIT 1',
    [userId, guildId]
  );
}

/** Full VC stats for a member profile embed. */
function getUserStats(userId, guildId) {
  const base = selectOne(
    `SELECT
       COUNT(*)                      AS session_count,
       COALESCE(SUM(duration_ms), 0) AS total_ms,
       COALESCE(AVG(duration_ms), 0) AS avg_ms,
       MAX(left_at)                  AS last_seen
     FROM vc_sessions
     WHERE user_id = ? AND guild_id = ? AND duration_ms IS NOT NULL`,
    [userId, guildId]
  ) || { session_count: 0, total_ms: 0, avg_ms: 0, last_seen: null };

  const top = selectOne(
    `SELECT channel_name, SUM(duration_ms) AS total_ms
     FROM vc_sessions
     WHERE user_id = ? AND guild_id = ? AND duration_ms IS NOT NULL
     GROUP BY channel_id ORDER BY total_ms DESC LIMIT 1`,
    [userId, guildId]
  );

  return {
    ...base,
    top_channel:    top?.channel_name || null,
    top_channel_ms: top?.total_ms     || 0,
    streak:         calcStreak(userId, guildId),
  };
}

/** Server-wide session totals — for /status. */
function getServerTotals(guildId) {
  return selectOne(
    `SELECT COUNT(*) AS total_sessions, COALESCE(SUM(duration_ms), 0) AS total_ms
     FROM vc_sessions WHERE guild_id = ? AND duration_ms IS NOT NULL`,
    [guildId]
  ) || { total_sessions: 0, total_ms: 0 };
}

module.exports = { init, startSession, endSession, getOpenSession, getUserStats, getServerTotals, formatMs };
