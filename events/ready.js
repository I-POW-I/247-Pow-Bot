const { Events } = require('discord.js');
const { log }               = require('../src/logger');
const { startHeartbeat }    = require('../src/heartbeat');
const { startStatusUpdater, updatePanel } = require('../src/statusUpdater');

module.exports = {
  name: Events.ClientReady,
  once: true,

  async execute(client) {
    log('INFO', `Logged in as ${client.user.tag}`);
    log('INFO', `Serving ${client.guilds.cache.size} guild(s)`);

    // Register slash commands globally
    try {
      const { REST, Routes } = require('discord.js');
      const rest = new REST({ version: '10' }).setToken(process.env.BOT_TOKEN);
      const commandData = [...client.commands.values()].map(cmd => cmd.data.toJSON());
      await rest.put(Routes.applicationCommands(process.env.CLIENT_ID), { body: commandData });
      log('INFO', `Registered ${commandData.length} global slash command(s)`);
    } catch (err) {
      log('ERROR', 'Failed to register slash commands', { error: err.message });
    }

    // Start ghost-detection heartbeat
    startHeartbeat(client);

    // Start presence updater (updates the bot's status dot + text every 60s)
    startStatusUpdater(client);

    // Refresh all control panels on startup (in case the bot restarted mid-session)
    await updatePanel(client);

    log('INFO', 'Bot fully ready');
  },
};
