/**
 * /removestreamer — shows a dropdown of currently watched streamers.
 * User picks from the list rather than typing a URL.
 * Handled via interactionCreate for the StringSelectMenu response.
 */

const {
  SlashCommandBuilder, MessageFlags, EmbedBuilder,
  ActionRowBuilder, StringSelectMenuBuilder, PermissionFlagsBits,
} = require('discord.js');
const { selectAll } = require('../src/database');

const EMOJI = { kick: '🟢', twitch: '🟣', youtube: '🔴' };
const NAMES = { kick: 'Kick', twitch: 'Twitch', youtube: 'YouTube' };

module.exports = {
  data: new SlashCommandBuilder()
    .setName('removestreamer')
    .setDescription('Stop watching a streamer — pick from your current list')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  async execute(interaction) {
    const { guild } = interaction;

    const subs = selectAll(
      'SELECT * FROM streamer_subscriptions WHERE guild_id = ? ORDER BY platform, display_name, username',
      [guild.id]
    );

    if (subs.length === 0) {
      return interaction.reply({
        content: '📭 No streamers are being watched in this server. Use `/addstreamer` to add one.',
        flags: [MessageFlags.Ephemeral],
      });
    }

    const options = subs.map(s => ({
      label:       `${s.display_name || s.username}`,
      description: `${NAMES[s.platform]} · ${s.is_live === 1 ? '🔴 Currently live' : 'Offline'}`,
      value:       `${s.id}`,
      emoji:       EMOJI[s.platform],
    }));

    const menu = new StringSelectMenuBuilder()
      .setCustomId('remove_streamer_select')
      .setPlaceholder('Pick a streamer to remove...')
      .addOptions(options);

    return interaction.reply({
      content: 'Select the streamer you want to remove:',
      components: [new ActionRowBuilder().addComponents(menu)],
      flags: [MessageFlags.Ephemeral],
    });
  },
};
