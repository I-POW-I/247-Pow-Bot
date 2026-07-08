const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const { selectOne } = require('../src/database');
const kick    = require('../src/platforms/kick');
const twitch  = require('../src/platforms/twitch');
const youtube = require('../src/platforms/youtube');

const PLATFORM_COLORS = { kick: 0x53fc18, twitch: 0x9146ff, youtube: 0xff0000 };
const PLATFORM_URLS   = {
  kick:    u => `https://kick.com/${u}`,
  twitch:  u => `https://twitch.tv/${u}`,
  youtube: u => `https://youtube.com/channel/${u}`,
};

module.exports = {
  data: new SlashCommandBuilder()
    .setName('checkstream')
    .setDescription('Check right now whether a streamer is live')
    .addStringOption(opt =>
      opt
        .setName('platform')
        .setDescription('The platform to check')
        .setRequired(true)
        .addChoices(
          { name: 'Kick',    value: 'kick'    },
          { name: 'Twitch',  value: 'twitch'  },
          { name: 'YouTube', value: 'youtube' },
        )
    )
    .addStringOption(opt =>
      opt
        .setName('username')
        .setDescription('Username or channel ID (e.g. xqc, shroud, UCxxxxxxx)')
        .setRequired(true)
    ),

  async execute(interaction) {
    const { guild } = interaction;
    const platform = interaction.options.getString('platform');
    const username = interaction.options.getString('username').trim().replace(/^@/, '');

    await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

    // Check if this streamer is in the guild's watch list
    const sub = selectOne(
      'SELECT display_name, discord_channel_id, is_live FROM streamer_subscriptions WHERE guild_id = ? AND platform = ? AND username = ?',
      [guild.id, platform, username]
    );

    let result;
    try {
      if (platform === 'kick')    result = await kick.getStreamStatus(username);
      if (platform === 'twitch')  result = await twitch.getStreamStatus(username);
      if (platform === 'youtube') result = await youtube.getStreamStatus(username);
    } catch (err) {
      return interaction.editReply({
        content: `❌ Could not check that stream — ${err.message}`,
      });
    }

    if (!result || result.error) {
      const code = result?.error;
      const msg  = code === 403 ? 'Access blocked (likely an IP restriction on Kick).'
                 : code === 429 ? 'Rate limited — try again in a moment.'
                 : 'No response from platform.';
      return interaction.editReply({ content: `❌ ${msg}` });
    }

    const displayName = result.displayName || sub?.display_name || username;
    const url         = PLATFORM_URLS[platform](username);
    const color       = result.isLive ? PLATFORM_COLORS[platform] : 0x4a4a4a;

    const embed = new EmbedBuilder()
      .setColor(color)
      .setAuthor({ name: displayName, url })
      .setTitle(result.isLive ? '🔴 Live now' : '⚫ Offline')
      .setURL(url)
      .setTimestamp();

    if (result.isLive) {
      if (result.title)    embed.setDescription(`**${result.title}**`);
      if (result.category) embed.addFields({ name: 'Category', value: result.category, inline: true });
      if (result.viewers != null) embed.addFields({ name: 'Viewers', value: result.viewers.toLocaleString(), inline: true });
      if (result.thumbnail) embed.setImage(result.thumbnail);
    }

    if (sub) {
      embed.addFields({
        name:  'Watching in this server',
        value: `Alerts → <#${sub.discord_channel_id}> · Last known status: ${sub.is_live ? '🔴 Live' : '⚫ Offline'}`,
      });
    }

    embed.setFooter({ text: `24/7 POW Bot • Checked live` });

    return interaction.editReply({ embeds: [embed] });
  },
};
