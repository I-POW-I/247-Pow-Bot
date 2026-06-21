const { Client, GatewayIntentBits } = require('discord.js');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMembers,   // Member info in voice logs
    GatewayIntentBits.GuildMessages,  // Message delete events
    GatewayIntentBits.MessageContent, // Read deleted message content (privileged intent)
  ],
});

module.exports = client;
