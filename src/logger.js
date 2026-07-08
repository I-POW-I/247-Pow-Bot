/**
 * Simple timestamped logger.
 * Usage: log('INFO', '24/7 POW Bot started')
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

/** Single startup step — clean checkmark line used during the boot sequence */
function logStep(label, value = '') {
  const ts = new Date().toISOString();
  console.log(`[${ts}]  ✓  ${label.padEnd(12)} ${value}`);
}

/** Visual divider — omit text for a plain bar, pass text for a labelled section */
function logDivider(text) {
  const bar = '─'.repeat(56);
  if (text !== undefined) {
    console.log(text ? `\n  ${text}\n` : '');
  } else {
    console.log(`  ${bar}`);
  }
}

module.exports = { log, logStep, logDivider };
