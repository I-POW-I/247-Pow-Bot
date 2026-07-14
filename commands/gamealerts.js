/**
 * /gamealerts — manage game update alert subscriptions.
 *
 * Subcommands:
 *   add    — search for a game by name, pick from results, set channel + role
 *   remove — pick from current subscriptions to remove
 *   list   — show all configured game alerts
 *   test   — post the latest update for a game right now
 */

const {
  SlashCommandBuilder, EmbedBuilder, MessageFlags,
  ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder,
  ButtonStyle, ChannelType, PermissionFlagsBits,
} = require('discord.js');
const { log }                  = require('../src/logger');
const { run, selectOne, selectAll } = require('../src/database');
const { searchGames, getGameNews, getAppDetails, getHeaderImage, parseSteamContent } = require('../src/platforms/steam');

// Game colour presets for popular titles
const GAME_COLOURS = {
  730:    0xF4A14C, // CS2 — orange
  570:    0xD8473E, // Dota 2 — red
  440:    0xCF6A32, // TF2 — orange/brown
  578080: 0x1D5C8B, // PUBG — blue
  1172470: 0xAB3024, // Apex — red
  1245620: 0x00AAFF, // Elden Ring — blue
  252490: 0x4B1C0F, // Rust — brown
  1086940: 0x2D6A2D, // Baldur's Gate 3 — green
  1774580: 0x6E1316, // Escape from Tarkov Arena
};

module.exports = {
  data: new SlashCommandBuilder()
    .setName('gamealerts')
    .setDescription('Manage game update alert subscriptions')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)

    .addSubcommand(sub =>
      sub.setName('add')
        .setDescription('Add a game to get patch note alerts for')
        .addStringOption(opt =>
          opt.setName('game')
            .setDescription('Game name to search for — e.g. "Counter-Strike 2"')
            .setRequired(true)
        )
        .addChannelOption(opt =>
          opt.setName('channel')
            .setDescription('Channel to post updates in')
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(true)
        )
        .addRoleOption(opt =>
          opt.setName('role')
            .setDescription('Role to ping when an update drops (optional)')
            .setRequired(false)
        )
    )

    .addSubcommand(sub =>
      sub.setName('epic')
        .setDescription('Get notified when Epic Games Store free games change')
        .addChannelOption(opt =>
          opt.setName('channel')
            .setDescription('Channel to post free game alerts in')
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(true)
        )
        .addRoleOption(opt =>
          opt.setName('role')
            .setDescription('Role to ping (optional)')
            .setRequired(false)
        )
    )

    .addSubcommand(sub =>
      sub.setName('remove')
        .setDescription('Remove a game alert — pick from your current list')
    )

    .addSubcommand(sub =>
      sub.setName('list')
        .setDescription('Show all configured game alerts for this server')
    )

    .addSubcommand(sub =>
      sub.setName('test')
        .setDescription('Post the latest update for a subscribed game right now')
    ),

  async execute(interaction) {
    const { guild } = interaction;
    const sub = interaction.options.getSubcommand();

    // ── Add ────────────────────────────────────────────────────────────────────
    if (sub === 'add') {
      const query   = interaction.options.getString('game');
      const channel = interaction.options.getChannel('channel');
      const role    = interaction.options.getRole('role');

      await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
      await interaction.editReply({ content: `🔍 Searching Steam for **${query}**...` });

      const results = await searchGames(query);
      if (results.length === 0) {
        return interaction.editReply({ content: `❌ No Steam games found for **${query}**. Try a different search term.` });
      }

      // Show select menu with search results
      const options = results.map(r => ({
        label:       r.name.slice(0, 100),
        value:       `${r.appid}|${channel.id}|${role?.id || ''}`,
        description: `App ID: ${r.appid}`,
      }));

      const menu = new StringSelectMenuBuilder()
        .setCustomId('gamealert_add_select')
        .setPlaceholder('Pick the correct game from the results...')
        .addOptions(options);

      return interaction.editReply({
        content: `Found ${results.length} result(s) for **${query}**. Pick the right one:`,
        components: [new ActionRowBuilder().addComponents(menu)],
      });
    }

    // ── Epic ───────────────────────────────────────────────────────────────────
    if (sub === 'epic') {
      const channel = interaction.options.getChannel('channel');
      const role    = interaction.options.getRole('role');

      const existing = selectOne(
        'SELECT id FROM game_subscriptions WHERE guild_id = ? AND app_id = ?',
        [guild.id, 'epic']
      );

      if (existing) {
        run('UPDATE game_subscriptions SET channel_id = ?, role_id = ? WHERE id = ?',
          [channel.id, role?.id || null, existing.id]);
        return interaction.reply({
          content: `✅ Epic free games alerts updated — posting to <#${channel.id}>${role ? ` · pinging <@&${role.id}>` : ''}.`,
          flags: [MessageFlags.Ephemeral],
        });
      }

      run(
        'INSERT INTO game_subscriptions (guild_id, app_id, game_name, channel_id, role_id) VALUES (?, ?, ?, ?, ?)',
        [guild.id, 'epic', 'Epic Games Free Games', channel.id, role?.id || null]
      );
      log('INFO', 'Epic alerts enabled', { guild: guild.name, by: interaction.user.tag });
      return interaction.reply({
        content: `✅ Epic Games free game alerts enabled in <#${channel.id}>${role ? ` · pinging <@&${role.id}>` : ''}.\nYou'll be notified whenever the free games change.`,
        flags: [MessageFlags.Ephemeral],
      });
    }

    // ── Remove ─────────────────────────────────────────────────────────────────
    if (sub === 'remove') {
      const subs = selectAll('SELECT * FROM game_subscriptions WHERE guild_id = ?', [guild.id]);
      if (subs.length === 0) {
        return interaction.reply({
          content: '📭 No game alerts configured. Use `/gamealerts add` to add one.',
          flags: [MessageFlags.Ephemeral],
        });
      }

      const options = subs.map(s => ({
        label:       s.game_name || `App ${s.app_id}`,
        value:       `${s.id}`,
        description: `<#${s.channel_id}>`,
        emoji:       s.app_id === 'epic' ? '🎮' : '🎯',
      }));

      const menu = new StringSelectMenuBuilder()
        .setCustomId('gamealert_remove_select')
        .setPlaceholder('Pick a game alert to remove...')
        .addOptions(options);

      return interaction.reply({
        content: 'Select a game alert to remove:',
        components: [new ActionRowBuilder().addComponents(menu)],
        flags: [MessageFlags.Ephemeral],
      });
    }

    // ── List ───────────────────────────────────────────────────────────────────
    if (sub === 'list') {
      const subs = selectAll('SELECT * FROM game_subscriptions WHERE guild_id = ?', [guild.id]);
      if (subs.length === 0) {
        return interaction.reply({
          content: '📭 No game alerts configured. Use `/gamealerts add` or `/gamealerts epic` to set one up.',
          flags: [MessageFlags.Ephemeral],
        });
      }

      const lines = subs.map(s => {
        const role = s.role_id ? ` · <@&${s.role_id}>` : '';
        const icon = s.app_id === 'epic' ? '🎮' : '🎯';
        return `${icon} **${s.game_name || s.app_id}** → <#${s.channel_id}>${role}`;
      });

      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(0x5865F2)
            .setTitle('🎮 Game Alert Subscriptions')
            .setDescription(lines.join('\n'))
            .setFooter({ text: `${subs.length} alert(s) configured` })
            .setTimestamp(),
        ],
        flags: [MessageFlags.Ephemeral],
      });
    }

    // ── Test ───────────────────────────────────────────────────────────────────
    if (sub === 'test') {
      const subs = selectAll(
        "SELECT * FROM game_subscriptions WHERE guild_id = ? AND app_id != 'epic'",
        [guild.id]
      );

      if (subs.length === 0) {
        return interaction.reply({
          content: '📭 No Steam game alerts configured. Add one with `/gamealerts add` first.',
          flags: [MessageFlags.Ephemeral],
        });
      }

      if (subs.length === 1) {
        // Only one game — test it directly
        return runTest(interaction, subs[0]);
      }

      // Multiple games — show select menu
      const options = subs.map(s => ({
        label: s.game_name || `App ${s.app_id}`,
        value: `${s.id}`,
      }));

      const menu = new StringSelectMenuBuilder()
        .setCustomId('gamealert_test_select')
        .setPlaceholder('Pick a game to test...')
        .addOptions(options);

      return interaction.reply({
        content: 'Which game do you want to test?',
        components: [new ActionRowBuilder().addComponents(menu)],
        flags: [MessageFlags.Ephemeral],
      });
    }
  },
};

async function runTest(interaction, sub) {
  await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

  const news = await getGameNews(sub.app_id, 1);
  if (!news || news.length === 0) {
    return interaction.editReply({ content: `❌ No recent news found for **${sub.game_name}**.` });
  }

  try {
    const { startGamePoller } = require('../src/gamePoller'); // just for embed builder
    // Inline the embed build here to avoid circular deps
    const { getHeaderImage, parseSteamContent } = require('../src/platforms/steam');
    const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

    const item    = news[0];
    const details = await getAppDetails(sub.app_id).catch(() => null);
    const { text, imageUrl, youtubeUrl } = parseSteamContent(item.contents, 1000);

    const embed = new EmbedBuilder()
      .setColor(sub.color || 0x1B2838)
      .setAuthor({
        name:    sub.game_name,
        iconURL: `https://cdn.cloudflare.steamstatic.com/steam/apps/${sub.app_id}/capsule_sm_120.jpg`,
        url:     `https://store.steampowered.com/app/${sub.app_id}`,
      })
      .setTitle(item.title)
      .setURL(item.url)
      .setThumbnail(details?.headerImage || getHeaderImage(sub.app_id))
      .setTimestamp(new Date(item.date * 1000))
      .setFooter({ text: 'Steam • Game Update' });

    if (text) embed.setDescription(text);
    if (imageUrl) embed.setImage(imageUrl);
    else embed.setImage(getHeaderImage(sub.app_id));

    const readMore = new ButtonBuilder()
      .setLabel('Read Full Notes')
      .setURL(item.url)
      .setStyle(ButtonStyle.Link)
      .setEmoji('📋');

    const row = new ActionRowBuilder().addComponents(readMore);
    if (youtubeUrl) {
      row.addComponents(
        new ButtonBuilder().setLabel('Watch Video').setURL(youtubeUrl).setStyle(ButtonStyle.Link).setEmoji('▶️')
      );
    }

    return interaction.editReply({
      content: `✅ Preview of latest **${sub.game_name}** update:`,
      embeds: [embed],
      components: [row],
    });
  } catch (err) {
    return interaction.editReply({ content: `❌ Test failed: ${err.message}` });
  }
}

module.exports.runTest = runTest;
