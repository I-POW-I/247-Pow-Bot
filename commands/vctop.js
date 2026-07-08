const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const { getLeaderboard, formatMs } = require('../src/database');
const { joinTimes }                = require('../src/memberTracker');

const PERIODS = {
  week:  7  * 24 * 60 * 60 * 1000,
  month: 30 * 24 * 60 * 60 * 1000,
};

const MEDALS = ['🥇', '🥈', '🥉'];

module.exports = {
  data: new SlashCommandBuilder()
    .setName('vctop')
    .setDescription('Voice channel leaderboard — top members by time spent in VC')
    .addStringOption(opt =>
      opt
        .setName('period')
        .setDescription('Time period to rank over (default: all time)')
        .setRequired(false)
        .addChoices(
          { name: 'All time',   value: 'all'   },
          { name: 'This week',  value: 'week'  },
          { name: 'This month', value: 'month' },
        )
    ),

  async execute(interaction, client) {
    const { guild } = interaction;
    const period = interaction.options.getString('period') || 'all';

    await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

    const sinceMs  = PERIODS[period] ? Date.now() - PERIODS[period] : 0;
    const rows     = getLeaderboard(guild.id, 10, sinceMs);

    if (rows.length === 0) {
      return interaction.editReply({ content: '📭 No voice session data recorded yet for this server.' });
    }

    // Resolve Discord member names — fall back to raw user ID if they've left
    await guild.members.fetch().catch(() => null);

    const lines = rows.map((row, i) => {
      const member      = guild.members.cache.get(row.user_id);
      const name        = member ? (member.displayName ?? member.user.username) : `Unknown (${row.user_id.slice(0, 6)}…)`;
      const rank        = MEDALS[i] ?? `**${i + 1}.**`;
      const active      = joinTimes.has(`${guild.id}_${row.user_id}`);
      const activeTag   = active ? ' 🔴' : '';
      const time        = formatMs(Number(row.total_ms));
      const sessions    = row.sessions;
      return `${rank}  ${name}${activeTag}\n    ${time} · ${sessions} session${sessions !== 1 ? 's' : ''}`;
    });

    const periodLabel = period === 'all' ? 'All Time' : period === 'week' ? 'This Week' : 'This Month';

    const embed = new EmbedBuilder()
      .setTitle(`Voice Leaderboard — ${periodLabel}`)
      .setDescription(lines.join('\n\n'))
      .setColor(0x7b8cff)
      .setFooter({ text: `24/7 POW Bot • ${guild.name} • 🔴 = currently in VC` })
      .setTimestamp();

    return interaction.editReply({ embeds: [embed] });
  },
};
