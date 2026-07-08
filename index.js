const { loadCommands, loadEvents } = require('./src/registry');
const { log } = require('./src/logger');
const client = require('./src/client');
const { init: initDatabase } = require('./src/database');
require('dotenv').config();

async function main() {
  const missing = ['BOT_TOKEN', 'CLIENT_ID'].filter(key => !process.env[key]);
  if (missing.length > 0) {
    log('ERROR', `Missing required environment variable(s): ${missing.join(', ')} — cannot start.`);
    process.exit(1);
  }

  await initDatabase();
  loadCommands(client);
  loadEvents(client);

  await client.login(process.env.BOT_TOKEN);
  log('INFO', 'Bot startup complete');
}

main().catch((error) => {
  log('ERROR', 'Startup failed', { message: error.message });
  process.exit(1);
});

// Catch unhandled errors so the bot doesn't silently die
process.on('unhandledRejection', (error) => {
  log('ERROR', 'Unhandled promise rejection', { message: error.message });
});

process.on('uncaughtException', (error) => {
  log('ERROR', 'Uncaught exception', { message: error.message });
});
