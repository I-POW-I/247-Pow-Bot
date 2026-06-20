/**
 * Simple timestamped logger.
 * Usage: log('INFO', 'Bot started')
 *        log('VOICE', 'Joined channel', { guild: 'MyServer', channel: 'General' })
 */

const ICONS = {
  INFO:  'ℹ️ ',
  WARN:  '⚠️ ',
  ERROR: '🔴',
  VOICE: '🔊',
  GHOST: '👻',
  HEART: '💓',
};

/**
 * @param {'INFO'|'WARN'|'ERROR'|'VOICE'|'GHOST'|'HEART'} level
 * @param {string} message
 * @param {Record<string, any>} [context]
 */
function log(level, message, context = {}) {
  const ts = new Date().toISOString();
  const icon = ICONS[level] || '  ';
  const ctx = Object.keys(context).length
    ? ' | ' + Object.entries(context).map(([k, v]) => `${k}=${v}`).join(' ')
    : '';

  console.log(`[${ts}] ${icon} [${level}] ${message}${ctx}`);
}

module.exports = { log };
