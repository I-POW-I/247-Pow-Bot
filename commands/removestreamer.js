const {
  SlashCommandBuilder, MessageFlags, PermissionFlagsBits,
} = require('discord.js');
const { log }             = require('../src/logger');
const { run, selectOne }  = require('../src/database');
const { parseStreamerUrl } = require('../src/platforms/parseUrl');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('removestreamer')
    .setDescription('Stop watching a streamer — paste their channel link')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addStringOption(opt =>
      opt.setName('url')
        .setDescription('Channel link — same one you used with /addstreamer')
        .setRequired(true)
    ),

  async execute(interaction) {
    const { guild, member } = interaction;
    const input = interaction.options.getString('url');

    const parsed = parseStreamerUrl(input);
    if (!parsed) {
      return interaction.reply({
        content: '❌ Couldn\'t recognise that link. Use the same link you added them with.',
        flags: [MessageFlags.Ephemeral],
      });
    }

    const { platform, username, displayHint } = parsed;

    const existing = selectOne(
      'SELECT id, display_name FROM streamer_subscriptions WHERE guild_id = ? AND platform = ? AND username = ?',
      [guild.id, platform, username]
    );

    if (!existing) {
      return interaction.reply({
        content: `❌ That streamer isn't being watched in this server.`,
        flags: [MessageFlags.Ephemeral],
      });
    }

    run(
      'DELETE FROM streamer_subscriptions WHERE guild_id = ? AND platform = ? AND username = ?',
      [guild.id, platform, username]
    );

    log('INFO', 'Streamer removed', { guild: guild.name, platform, username, by: member.user.tag });

    const names = { kick: 'Kick', twitch: 'Twitch', youtube: 'YouTube' };
    const name  = existing.display_name || displayHint || username;

    return interaction.reply({
      content: `✅ No longer watching **${name}** on **${names[platform]}**.`,
      flags: [MessageFlags.Ephemeral],
    });
  },
};
