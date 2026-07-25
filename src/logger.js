/**
 * Timestamped logger for Discloud console.
 *
 * Format: [timestamp] LEVEL | message | key=value key=value
 * Levels: INFO, WARN, ERROR, VOICE, GHOST, HEART
 */

const LEVELS = {
  INFO:  'INFO ',
  WARN:  'WARN ',
  ERROR: 'ERROR',
  VOICE: 'VOICE',
  GHOST: 'GHOST',
  HEART: 'HEART',
};

/**
 * @param {'INFO'|'WARN'|'ERROR'|'VOICE'|'GHOST'|'HEART'} level
 * @param {string} message
 * @param {Record<string, any>} [context]
 */
function log(level, message, context = {}) {
  const ts  = new Date().toISOString();
  const lvl = LEVELS[level] || 'INFO ';
  const ctx = Object.keys(context).length
    ? ' | ' + Object.entries(context).map(([k, v]) => `${k}=${v}`).join(' | ')
    : '';

  console.log(`[${ts}] ${lvl} | ${message}${ctx}`);
}

module.exports = { log };
