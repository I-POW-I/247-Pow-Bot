const {
  SlashCommandBuilder, MessageFlags, PermissionFlagsBits, ChannelType,
} = require('discord.js');
const { log }             = require('../src/logger');
const { run, selectOne }  = require('../src/database');
const { parseStreamerUrl } = require('../src/platforms/parseUrl');
const { resolveHandle: resolveYouTube, getDisplayName: ytDisplayName } = require('../src/platforms/youtube');
const { getDisplayName: twitchDisplayName } = require('../src/platforms/twitch');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('addstreamer')
    .setDescription('Add a streamer to watch — paste their channel link')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addStringOption(opt =>
      opt.setName('url')
        .setDescription('Channel link — e.g. https://kick.com/xqc or https://twitch.tv/shroud')
        .setRequired(true)
    )
    .addChannelOption(opt =>
      opt.setName('channel')
        .setDescription('Channel to post live notifications in')
        .addChannelTypes(ChannelType.GuildText)
        .setRequired(true)
    )
    .addRoleOption(opt =>
      opt.setName('role')
        .setDescription('Role to ping when they go live (optional)')
        .setRequired(false)
    )
    .addStringOption(opt =>
      opt.setName('display_name')
        .setDescription('Override the display name shown in embeds (optional)')
        .setRequired(false)
    ),

  async execute(interaction) {
    const { guild, member } = interaction;
    const input           = interaction.options.getString('url');
    const channel         = interaction.options.getChannel('channel');
    const role            = interaction.options.getRole('role');
    const overrideName    = interaction.options.getString('display_name') || null;

    await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

    // ── Parse URL ─────────────────────────────────────────────────────────────
    const parsed = parseStreamerUrl(input);
    if (!parsed) {
      return interaction.editReply({
        content: [
          '❌ 24/7 POW Bot could not recognise that link. Supported formats are:',
          '• `https://kick.com/username`',
          '• `https://twitch.tv/username`',
          '• `https://youtube.com/@handle` or `https://youtube.com/channel/UCxxxxxxx`',
        ].join('\n'),
      });
    }

    let { platform, username, displayHint } = parsed;
    const platformNames = { kick: 'Kick', twitch: 'Twitch', youtube: 'YouTube' };

    // ── Resolve YouTube handles ───────────────────────────────────────────────
    if (platform === 'youtube' && parsed.needsResolve) {
      await interaction.editReply({ content: `🔍 Resolving YouTube channel...` });
      if (!process.env.YOUTUBE_API_KEY) {
        return interaction.editReply({
          content: '❌ YouTube support is not configured yet. Please add `YOUTUBE_API_KEY` in Discloud Variables.',
        });
      }
      const channelId = await resolveYouTube(username);
      if (!channelId) {
        return interaction.editReply({
          content: `❌ 24/7 POW Bot could not find a YouTube channel for **${username}**. Please try the direct channel link instead:\n\`https://youtube.com/channel/UCxxxxxxx\``,
        });
      }
      username = channelId;
    }

    // ── Check not already added ───────────────────────────────────────────────
    const existing = selectOne(
      'SELECT id FROM streamer_subscriptions WHERE guild_id = ? AND platform = ? AND username = ?',
      [guild.id, platform, username]
    );
    if (existing) {
      return interaction.editReply({ content: '❌ That streamer is already being watched in this server.' });
    }

    // ── Check bot permissions ─────────────────────────────────────────────────
    const botMember = await guild.members.fetchMe();
    if (!channel.permissionsFor(botMember).has(['SendMessages', 'EmbedLinks'])) {
      return interaction.editReply({
        content: `❌ 24/7 POW Bot does not have **Send Messages** and **Embed Links** permission in <#${channel.id}>.`,
      });
    }

    // ── Auto-fetch display name if not overridden ─────────────────────────────
    let displayName = overrideName;
    if (!displayName) {
      await interaction.editReply({ content: `🔍 Fetching streamer info...` });
      if (platform === 'twitch') {
        displayName = await twitchDisplayName(username).catch(() => null);
      } else if (platform === 'youtube') {
        displayName = await ytDisplayName(username).catch(() => null);
      }
      // Kick display name is fetched on first poll from the API response
      displayName = displayName || displayHint || username;
    }

    // ── Save ──────────────────────────────────────────────────────────────────
    run(
      `INSERT INTO streamer_subscriptions
        (guild_id, platform, username, display_name, discord_channel_id, role_id, is_live)
       VALUES (?, ?, ?, ?, ?, ?, 0)`,
      [guild.id, platform, username, displayName, channel.id, role?.id || null]
    );

    log('INFO', 'Streamer added', { guild: guild.name, platform, username, displayName, by: member.user.tag });

    const roleStr = role ? ` · pinging <@&${role.id}>` : '';
    return interaction.editReply({
      content: `✅ 24/7 POW Bot is now watching **${displayName}** on **${platformNames[platform]}**.\nNotifications will post in <#${channel.id}>${roleStr}.`,
    });
  },
};
