const {
  SlashCommandBuilder, MessageFlags, EmbedBuilder,
} = require('discord.js');
const { selectAll } = require('../src/database');

const PLATFORM_EMOJI = { kick: '🟢', twitch: '🟣', youtube: '🔴' };
const PLATFORM_NAMES = { kick: 'Kick', twitch: 'Twitch', youtube: 'YouTube' };

module.exports = {
  data: new SlashCommandBuilder()
    .setName('streamers')
    .setDescription('List all streamers being watched in this server'),

  async execute(interaction) {
    const { guild } = interaction;

    const subs = selectAll(
      'SELECT * FROM streamer_subscriptions WHERE guild_id = ? ORDER BY platform, username',
      [guild.id]
    );

    if (subs.length === 0) {
      return interaction.reply({
        content: '📭 No streamers are being watched in this server. Use `/addstreamer` to add one.',
        flags: [MessageFlags.Ephemeral],
      });
    }

    // Group by platform
    const grouped = { kick: [], twitch: [], youtube: [] };
    for (const sub of subs) {
      if (grouped[sub.platform]) grouped[sub.platform].push(sub);
    }

    const embed = new EmbedBuilder()
      .setTitle('📡 Watched Streamers')
      .setColor(0x5865F2)
      .setFooter({ text: `${subs.length} streamer(s) total` })
      .setTimestamp();

    for (const [platform, list] of Object.entries(grouped)) {
      if (list.length === 0) continue;

      const lines = list.map(s => {
        const name    = s.display_name || s.username;
        const status  = s.is_live ? '🔴 LIVE' : '⚫ Offline';
        const channel = `<#${s.discord_channel_id}>`;
        const role    = s.role_id ? ` · <@&${s.role_id}>` : '';
        return `**${name}** — ${status}\n${channel}${role}`;
      }).join('\n\n');

      embed.addFields({
        name:   `${PLATFORM_EMOJI[platform]} ${PLATFORM_NAMES[platform]}`,
        value:  lines,
        inline: false,
      });
    }

    return interaction.reply({ embeds: [embed], flags: [MessageFlags.Ephemeral] });
  },
};
