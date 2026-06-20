const { loadCommands, loadEvents } = require('./src/registry');
const { log } = require('./src/logger');
const client = require('./src/client');
require('dotenv').config();

if (!process.env.BOT_TOKEN) {
  log('ERROR', 'Missing BOT_TOKEN in .env — cannot start.');
  process.exit(1);
}

if (!process.env.CLIENT_ID) {
  log('ERROR', 'Missing CLIENT_ID in .env — cannot start.');
  process.exit(1);
}

loadCommands(client);
loadEvents(client);

client.login(process.env.BOT_TOKEN);

// Catch unhandled errors so the bot doesn't silently die
process.on('unhandledRejection', (error) => {
  log('ERROR', 'Unhandled promise rejection', { message: error.message });
});

process.on('uncaughtException', (error) => {
  log('ERROR', 'Uncaught exception', { message: error.message });
});
