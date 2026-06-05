const { Client, GatewayIntentBits, Events, Partials, REST, Routes, SlashCommandBuilder, ChannelType } = require('discord.js');
const { joinVoiceChannel, getVoiceConnection, VoiceConnectionStatus, entersState } = require('@discordjs/voice');
const dotenv = require('dotenv');

dotenv.config();

const token = process.env.BOT_TOKEN;
if (!token) {
  console.error('Missing BOT_TOKEN in .env');
  process.exit(1);
}

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
    .setName('stay')
    .setDescription('Bring the bot into a specified voice channel and keep it there')
    .addChannelOption(option =>
      option
        .setName('channel')
        .setDescription('Voice channel to join')
        .addChannelTypes(ChannelType.GuildVoice, ChannelType.GuildStageVoice)
        .setRequired(false)
    ),
  new SlashCommandBuilder().setName('leave').setDescription('Disconnect the bot from the voice channel')
].map(command => command.toJSON());

const rest = new REST({ version: '10' }).setToken(token);

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates
  ],
  partials: [Partials.Channel]
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
    if (!process.env.CLIENT_ID || !process.env.GUILD_ID) {
      throw new Error('Missing CLIENT_ID or GUILD_ID in .env');
    }

    await rest.put(Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID), {
      body: commands
    });
    console.log('Slash commands registered successfully.');
  } catch (error) {
    console.error('Failed to register commands:', error);
  }
});

client.on(Events.InteractionCreate, async interaction => {
  if (!interaction.isChatInputCommand()) return;

  const { commandName, guild, member } = interaction;

  if (commandName === 'join' || commandName === 'stay') {
    const targetChannel = interaction.options.getChannel('channel') || member.voice.channel;
    if (!targetChannel || !targetChannel.isVoiceBased()) {
      return interaction.reply({ content: 'You need to specify a voice channel or be in one for me to join.', ephemeral: true });
    }

    const existingConnection = getVoiceConnection(guild.id);
    if (existingConnection) {
      return interaction.reply({ content: 'I am already connected to a voice channel in this server.', ephemeral: true });
    }

    const connection = joinVoiceChannel({
      channelId: targetChannel.id,
      guildId: guild.id,
      adapterCreator: guild.voiceAdapterCreator,
      selfDeaf: false,
      selfMute: true
    });

    setupVoiceConnectionHandler(connection, targetChannel.name);

    return interaction.reply({ content: `Joined ${targetChannel.name}. I will stay until the host provider goes down or discord shits the bed.` });
  }

  if (commandName === 'leave') {
    const connection = getVoiceConnection(guild.id);
    if (!connection) {
      return interaction.reply({ content: 'Are you blind?... I am not connected to a voice channel right now.', ephemeral: true });
    }

    connection.destroy();
    return interaction.reply({ content: 'Goodbye Nerds.' });
  }
});

client.login(token);
