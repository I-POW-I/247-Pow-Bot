const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const { getUserSessions, getOpenSession, formatMs } = require('../src/database');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('sessions')
    .setDescription('View recent voice session history for yourself or another member')
    .addUserOption(opt =>
      opt
        .setName('member')
        .setDescription('The member to look up (defaults to you)')
        .setRequired(false)
    ),

  async execute(interaction) {
    const { guild } = interaction;
    const target = interaction.options.getMember('member') || interaction.member;
    const user   = target.user;

    await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

    const sessions = getUserSessions(user.id, guild.id, 10);
    const open     = getOpenSession(user.id, guild.id);

    if (sessions.length === 0 && !open) {
      return interaction.editReply({
        content: `📭 No voice session history found for **${user.username}** in this server.`,
      });
    }

    const lines = [];

    // Active session first
    if (open) {
      const elapsed = formatMs(Date.now() - Number(open.joined_at));
      lines.push(`🔴 **Currently in** \`${open.channel_name}\` — ${elapsed} so far`);
    }

    // Recent completed sessions
    for (const s of sessions) {
      if (!s.duration_ms) continue; // skip open sessions (already shown above)
      const ts  = Math.floor(Number(s.joined_at) / 1000);
      const dur = formatMs(Number(s.duration_ms));
      lines.push(`\`${s.channel_name}\` — ${dur} · <t:${ts}:R>`);
    }

    if (lines.length === 0) {
      return interaction.editReply({
        content: `📭 No completed sessions found for **${user.username}** yet.`,
      });
    }

    const embed = new EmbedBuilder()
      .setAuthor({ name: target.displayName ?? user.username, iconURL: user.displayAvatarURL({ dynamic: true }) })
      .setTitle('Voice Session History')
      .setDescription(lines.join('\n'))
      .setColor(0x7b8cff)
      .setFooter({ text: `24/7 POW Bot • Showing last ${Math.min(sessions.length, 10)} sessions` })
      .setTimestamp();

    return interaction.editReply({ embeds: [embed] });
  },
};
