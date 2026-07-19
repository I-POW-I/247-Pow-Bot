/**
 * /gamealerts — manage game update and free game alert subscriptions.
 *
 * Subcommands:
 *   game      — subscribe to patch notes for a specific Steam game
 *   freegames — subscribe to free game alerts (Epic + Steam, one embed per game)
 *   remove    — pick from current subscriptions to remove
 *   list      — show all configured alerts
 *   test      — post the latest update for a subscribed game right now
 */

const {
  SlashCommandBuilder, EmbedBuilder, MessageFlags,
  ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder,
  ButtonStyle, ChannelType, PermissionFlagsBits,
} = require('discord.js');
const { log }                       = require('../src/logger');
const { run, selectOne, selectAll } = require('../src/database');
const {
  searchGames, getGameNews, getAppDetails,
  getHeaderImage, parseSteamContent,
} = require('../src/platforms/steam');

// Colour presets for popular games
const GAME_COLOURS = {
  730:     0xF4A14C, // CS2
  570:     0xD8473E, // Dota 2
  440:     0xCF6A32, // TF2
  578080:  0x1D5C8B, // PUBG
  1172470: 0xAB3024, // Apex Legends
  1245620: 0x00AAFF, // Elden Ring
  252490:  0x4B1C0F, // Rust
  1086940: 0x2D6A2D, // Baldur's Gate 3
  271590:  0x1A6B2A, // GTA V
  1091500: 0xE8D5A3, // Cyberpunk 2077
};
module.exports.GAME_COLOURS = GAME_COLOURS;

module.exports = {
  GAME_COLOURS,

  data: new SlashCommandBuilder()
    .setName('gamealerts')
    .setDescription('Manage game update and free game alert subscriptions')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)

    .addSubcommand(sub =>
      sub.setName('game')
        .setDescription('Get patch note alerts when a Steam game updates')
        .addStringOption(opt =>
          opt.setName('game')
            .setDescription('Game name to search — e.g. "Counter-Strike 2"')
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
      sub.setName('freegames')
        .setDescription('Get alerted when Epic or Steam games become free')
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

    // ── Game updates ───────────────────────────────────────────────────────────
    if (sub === 'game') {
      const query   = interaction.options.getString('game');
      const channel = interaction.options.getChannel('channel');
      const role    = interaction.options.getRole('role');

      await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
      await interaction.editReply({ content: `🔍 Searching Steam for **${query}**...` });

      const results = await searchGames(query);
      if (!results.length) {
        return interaction.editReply({ content: `❌ No results for **${query}**. Try a different name.` });
      }

      const options = results.map(r => ({
        label:       r.name.slice(0, 100),
        value:       `${r.appid}|||${channel.id}|||${role?.id || ''}`,
        description: `App ID: ${r.appid}`,
      }));

      const menu = new StringSelectMenuBuilder()
        .setCustomId('gamealert_add_select')
        .setPlaceholder('Pick the correct game from the results...')
        .addOptions(options);

      return interaction.editReply({
        content:    `Found **${results.length}** result(s) for **${query}** — pick the right one:`,
        components: [new ActionRowBuilder().addComponents(menu)],
      });
    }

    // ── Free games (Epic + Steam) ──────────────────────────────────────────────
    if (sub === 'freegames') {
      const channel = interaction.options.getChannel('channel');
      const role    = interaction.options.getRole('role');
      const updates = [];

      // Epic
      const epicExisting = selectOne('SELECT id FROM game_subscriptions WHERE guild_id = ? AND app_id = ?', [guild.id, 'epic']);
      if (epicExisting) {
        run('UPDATE game_subscriptions SET channel_id = ?, role_id = ? WHERE id = ?', [channel.id, role?.id || null, epicExisting.id]);
        updates.push('Epic Games (updated)');
      } else {
        run('INSERT INTO game_subscriptions (guild_id, app_id, game_name, channel_id, role_id) VALUES (?, ?, ?, ?, ?)',
          [guild.id, 'epic', 'Epic Games Free Games', channel.id, role?.id || null]);
        updates.push('Epic Games');
      }

      // Steam free
      const steamExisting = selectOne('SELECT id FROM game_subscriptions WHERE guild_id = ? AND app_id = ?', [guild.id, 'steam_free']);
      if (steamExisting) {
        run('UPDATE game_subscriptions SET channel_id = ?, role_id = ? WHERE id = ?', [channel.id, role?.id || null, steamExisting.id]);
        updates.push('Steam Free Games (updated)');
      } else {
        run('INSERT INTO game_subscriptions (guild_id, app_id, game_name, channel_id, role_id) VALUES (?, ?, ?, ?, ?)',
          [guild.id, 'steam_free', 'Steam Free Games', channel.id, role?.id || null]);
        updates.push('Steam Free Games');
      }

      log('INFO', 'Free game alerts configured', { guild: guild.name, by: interaction.user.tag });

      return interaction.reply({
        content: [
          `✅ Free game alerts set up in <#${channel.id}>${role ? ` · pinging <@&${role.id}>` : ''}:`,
          `• 🎮 Epic Games Store — notified when free games change weekly`,
          `• 🎯 Steam — notified when paid games go free`,
          ``,
          `Each game gets its own post with a claim button.`,
        ].join('\n'),
        flags: [MessageFlags.Ephemeral],
      });
    }

    // ── Remove ─────────────────────────────────────────────────────────────────
    if (sub === 'remove') {
      const subs = selectAll('SELECT * FROM game_subscriptions WHERE guild_id = ?', [guild.id]);
      if (!subs.length) {
        return interaction.reply({ content: '📭 No game alerts configured.', flags: [MessageFlags.Ephemeral] });
      }

      const NAMES = { epic: 'Epic Free Games', steam_free: 'Steam Free Games' };
      const options = subs.map(s => ({
        label:       (NAMES[s.app_id] || s.game_name || s.app_id).slice(0, 100),
        value:       `${s.id}`,
        description: `Posts to channel ID: ${s.channel_id}`,
        emoji:       s.app_id === 'epic' || s.app_id === 'steam_free' ? '🎮' : '🎯',
      }));

      const menu = new StringSelectMenuBuilder()
        .setCustomId('gamealert_remove_select')
        .setPlaceholder('Pick an alert to remove...')
        .addOptions(options);

      return interaction.reply({
        content:    'Select a game alert to remove:',
        components: [new ActionRowBuilder().addComponents(menu)],
        flags:      [MessageFlags.Ephemeral],
      });
    }

    // ── List ───────────────────────────────────────────────────────────────────
    if (sub === 'list') {
      const subs = selectAll('SELECT * FROM game_subscriptions WHERE guild_id = ?', [guild.id]);
      if (!subs.length) {
        return interaction.reply({ content: '📭 No game alerts configured.', flags: [MessageFlags.Ephemeral] });
      }

      const NAMES = { epic: '🎮 Epic Free Games', steam_free: '🎯 Steam Free Games' };
      const lines = subs.map(s =>
        `${NAMES[s.app_id] || `🎯 ${s.game_name || s.app_id}`} → <#${s.channel_id}>${s.role_id ? ` · <@&${s.role_id}>` : ''}`
      );

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
        "SELECT * FROM game_subscriptions WHERE guild_id = ? AND app_id != 'epic' AND app_id != 'steam_free'",
        [guild.id]
      );

      if (!subs.length) {
        return interaction.reply({
          content: '📭 No Steam game update alerts configured. Add one with `/gamealerts game` first.',
          flags: [MessageFlags.Ephemeral],
        });
      }

      if (subs.length === 1) return runTest(interaction, subs[0], false);

      const menu = new StringSelectMenuBuilder()
        .setCustomId('gamealert_test_select')
        .setPlaceholder('Which game do you want to test?')
        .addOptions(subs.map(s => ({ label: (s.game_name || s.app_id).slice(0, 100), value: `${s.id}` })));

      return interaction.reply({
        content:    'Pick a game to test:',
        components: [new ActionRowBuilder().addComponents(menu)],
        flags:      [MessageFlags.Ephemeral],
      });
    }
  },
};

/**
 * Post the latest update for a game.
 * @param {boolean} alreadyDeferred - true when called from a select menu handler
 *   that already called interaction.deferReply()
 */
async function runTest(interaction, sub, alreadyDeferred = false) {
  if (!alreadyDeferred) {
    await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
  }

  const news = await getGameNews(sub.app_id, 5);
  if (!news?.length) {
    return interaction.editReply({
      content: `❌ No recent patch notes or updates found for **${sub.game_name}**.\nSteam might not have any matching updates yet — try again after the next game update.`,
    });
  }

  try {
    const item      = news[0];
    const details   = await getAppDetails(sub.app_id).catch(() => null);
    const { text, imageUrl, youtubeUrl } = parseSteamContent(item.contents, 1000);
    const headerImg = details?.headerImage || getHeaderImage(sub.app_id);

    const embed = new EmbedBuilder()
      .setColor(sub.color || GAME_COLOURS[parseInt(sub.app_id)] || 0x1B2838)
      .setAuthor({
        name:    sub.game_name,
        iconURL: `https://cdn.cloudflare.steamstatic.com/steam/apps/${sub.app_id}/capsule_sm_120.jpg`,
        url:     `https://store.steampowered.com/app/${sub.app_id}`,
      })
      .setTitle(item.title)
      .setURL(item.url)
      .setThumbnail(headerImg)
      .setTimestamp(new Date(item.date * 1000))
      .setFooter({ text: 'Steam • Game Update' });

    if (text) embed.setDescription(text);
    embed.setImage(imageUrl || headerImg);

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setLabel('Read Full Notes').setURL(item.url).setStyle(ButtonStyle.Link).setEmoji('📋')
    );
    if (youtubeUrl) {
      row.addComponents(
        new ButtonBuilder().setLabel('Watch Video').setURL(youtubeUrl).setStyle(ButtonStyle.Link).setEmoji('▶️')
      );
    }

    return interaction.editReply({
      content:    `✅ Latest **${sub.game_name}** update:`,
      embeds:     [embed],
      components: [row],
    });
  } catch (err) {
    return interaction.editReply({ content: `❌ Test failed: ${err.message}` });
  }
}

module.exports.runTest = runTest;
