const { Client, GatewayIntentBits, Events, REST, Routes, SlashCommandBuilder, ChannelType, MessageFlags } = require('discord.js');
const { joinVoiceChannel, getVoiceConnection, VoiceConnectionStatus, entersState } = require('@discordjs/voice');
const dotenv = require('dotenv');

dotenv.config();

const token = process.env.BOT_TOKEN;
if (!token) {
  console.error('Missing BOT_TOKEN in .env');
  process.exit(1);
}

// Cleaned up registry: Removed 'stay' command entirely
const commands = [
  new SlashCommandBuilder()
    .setName('join')
    .setDescription('Bring the bot into a specified voice channel')
    .addChannelOption(option =>
      option
        .setName('channel')
        .setDescription('Voice channel to join')
        .addChannelTypes(ChannelType.GuildVoice, ChannelType.GuildStageVoice)
        .setRequired(false)
    ),
  new SlashCommandBuilder()
    .setName('leave')
    .setDescription('Disconnect the bot from the voice channel')
].map(command => command.toJSON());

const rest = new REST({ version: '10' }).setToken(token);

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates
  ]
});

function setupVoiceConnectionHandler(connection, channelName) {
  connection.on(VoiceConnectionStatus.Disconnected, async () => {
    try {
      await Promise.race([
        entersState(connection, VoiceConnectionStatus.Signalling, 5000),
        entersState(connection, VoiceConnectionStatus.Connecting, 5000)
      ]);
    } catch (error) {
      console.error('Reconnection failed, destroying voice connection:', error);
      connection.destroy();
    }
  });

  connection.on('error', error => {
    console.error(`Voice connection error in ${channelName}:`, error);
  });
}

client.once(Events.ClientReady, async () => {
  console.log(`Logged in as ${client.user.tag}`);

  try {
    if (!process.env.CLIENT_ID) {
      throw new Error('Missing CLIENT_ID in .env');
    }

    // Now registering GLOBAL commands across all servers
    await rest.put(Routes.applicationCommands(process.env.CLIENT_ID), {
      body: commands
    });
    console.log('Global slash commands registered successfully.');
  } catch (error) {
    console.error('Failed to register global commands:', error);
  }
});

client.on(Events.InteractionCreate, async interaction => {
  if (!interaction.isChatInputCommand()) return;

  const { commandName, guild, member } = interaction;

  if (commandName === 'join') {
    const targetChannel = interaction.options.getChannel('channel') || member.voice.channel;
    
    if (!targetChannel || !targetChannel.isVoiceBased()) {
      return interaction.reply({ 
        content: 'You need to specify a voice channel or be in one for me to join.', 
        flags: [MessageFlags.Ephemeral] 
      });
    }

    const existingConnection = getVoiceConnection(guild.id);
    if (existingConnection) {
      return interaction.reply({ 
        content: 'I am already connected to a voice channel in this server.', 
        flags: [MessageFlags.Ephemeral] 
      });
    }

    try {
      const connection = joinVoiceChannel({
        channelId: targetChannel.id,
        guildId: guild.id,
        adapterCreator: guild.voiceAdapterCreator,
        selfDeaf: true,
        selfMute: true
      });

      setupVoiceConnectionHandler(connection, targetChannel.name);

      return interaction.reply({ 
        content: `Joined ${targetChannel.name}. I will stay until the host provider goes down or discord shits the bed.` 
      });
    } catch (voiceError) {
      console.error('Failed to join voice channel:', voiceError);
      return interaction.reply({ 
        content: 'Failed to join the channel. Check my permissions!', 
        flags: [MessageFlags.Ephemeral] 
      });
    }
  }

  if (commandName === 'leave') {
    const connection = getVoiceConnection(guild.id);
    if (!connection) {
      return interaction.reply({ 
        content: 'Are you blind?... I am not connected to a voice channel right now.', 
        flags: [MessageFlags.Ephemeral] 
      });
    }

    connection.destroy();
    return interaction.reply({ content: 'Goodbye Nerds.' });
  }
});

client.login(token);
