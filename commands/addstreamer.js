const {
  SlashCommandBuilder, MessageFlags, PermissionFlagsBits, ChannelType,
} = require('discord.js');
const { log }                  = require('../src/logger');
const { run, selectOne }       = require('../src/database');
const { parseStreamerUrl }      = require('../src/platforms/parseUrl');
const { resolveHandle }        = require('../src/platforms/youtube');

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
        .setDescription('Custom display name for embeds (optional)')
        .setRequired(false)
    ),

  async execute(interaction) {
    const { guild, member } = interaction;
    const input       = interaction.options.getString('url');
    const channel     = interaction.options.getChannel('channel');
    const role        = interaction.options.getRole('role');
    const displayName = interaction.options.getString('display_name') || null;

    await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

    // ── Parse the URL ─────────────────────────────────────────────────────────
    const parsed = parseStreamerUrl(input);

    if (!parsed) {
      return interaction.editReply({
        content: [
          '❌ Couldn\'t recognise that link. Supported formats:',
          '• `https://kick.com/username`',
          '• `https://twitch.tv/username`',
          '• `https://youtube.com/@handle` or `https://youtube.com/channel/UCxxxxxxx`',
        ].join('\n'),
      });
    }

    let { platform, username } = parsed;
    const platformNames = { kick: 'Kick', twitch: 'Twitch', youtube: 'YouTube' };

    // ── Resolve YouTube handles to channel IDs ────────────────────────────────
    if (platform === 'youtube' && parsed.needsResolve) {
      await interaction.editReply({ content: `🔍 Resolving YouTube channel...` });

      if (!process.env.YOUTUBE_API_KEY) {
        return interaction.editReply({
          content: '❌ `YOUTUBE_API_KEY` is not set in your environment variables. Add it in Discloud to enable YouTube notifications.',
        });
      }

      const channelId = await resolveHandle(username);
      if (!channelId) {
        return interaction.editReply({
          content: `❌ Couldn't find a YouTube channel for **${username}**. Try using the direct channel ID link instead:\n\`https://youtube.com/channel/UCxxxxxxx\``,
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
      return interaction.editReply({
        content: `❌ That streamer is already being watched in this server.`,
      });
    }

    // ── Check bot permissions in the target channel ───────────────────────────
    const botMember = await guild.members.fetchMe();
    if (!channel.permissionsFor(botMember).has(['SendMessages', 'EmbedLinks'])) {
      return interaction.editReply({
        content: `❌ I don't have **Send Messages** and **Embed Links** permission in <#${channel.id}>.`,
      });
    }

    // ── Save to DB ────────────────────────────────────────────────────────────
    run(
      `INSERT INTO streamer_subscriptions
        (guild_id, platform, username, display_name, discord_channel_id, role_id, is_live)
       VALUES (?, ?, ?, ?, ?, ?, 0)`,
      [guild.id, platform, username, displayName, channel.id, role?.id || null]
    );

    log('INFO', 'Streamer added', { guild: guild.name, platform, username, by: member.user.tag });

    const name    = displayName || parsed.displayHint || username;
    const roleStr = role ? ` · pinging <@&${role.id}>` : '';

    return interaction.editReply({
      content: `✅ Now watching **${name}** on **${platformNames[platform]}**.\nNotifications will post in <#${channel.id}>${roleStr}.`,
    });
  },
};
