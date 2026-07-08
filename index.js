const { loadCommands, loadEvents } = require('./src/registry');
const { log, logDivider } = require('./src/logger');
const client = require('./src/client');
require('dotenv').config();
const { version } = require('./package.json');

async function main() {
  const missing = ['BOT_TOKEN', 'CLIENT_ID'].filter(key => !process.env[key]);
  if (missing.length > 0) {
    log('ERROR', `Missing required environment variable(s): ${missing.join(', ')} — cannot start.`);
    process.exit(1);
  }

  // ── Startup banner ──────────────────────────────────────────────────────────
  logDivider();
  logDivider(`24/7 POW Bot  ·  v${version}`);
  logDivider();

  loadCommands(client);
  loadEvents(client);

  await client.login(process.env.BOT_TOKEN);
}

main().catch((error) => {
  log('ERROR', 'Startup failed', { message: error.message });
  process.exit(1);
});

// ── Graceful shutdown ─────────────────────────────────────────────────────────
async function shutdown(signal) {
  log('INFO', `${signal} received — shutting down 24/7 POW Bot cleanly`);
  try {
    const { getVoiceConnection } = require('@discordjs/voice');
    const { stopSilencePlayer }  = require('./src/audioPlayer');
    for (const guild of client.guilds.cache.values()) {
      try {
        stopSilencePlayer(guild.id);
        const conn = getVoiceConnection(guild.id);
        if (conn) conn.destroy();
      } catch (_) {}
    }
    client.destroy();
  } catch (_) {}
  log('INFO', '24/7 POW Bot shut down cleanly');
  process.exit(0);
}

process.on('SIGINT',  () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

// ── Catch unhandled errors so the bot doesn't silently die ───────────────────
process.on('unhandledRejection', (error) => {
  log('ERROR', 'Unhandled promise rejection', { message: error.message });
});

process.on('uncaughtException', (error) => {
  log('ERROR', 'Uncaught exception', { message: error.message });
});
