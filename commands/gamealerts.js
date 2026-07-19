const {
  SlashCommandBuilder, EmbedBuilder, MessageFlags,
  ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder,
  ButtonStyle, ChannelType, PermissionFlagsBits,
} = require('discord.js');
const { log }                       = require('../src/logger');
const { run, selectOne, selectAll } = require('../src/database');
const { searchGames, getGameNews, getAppDetails, getHeaderImage, parseSteamContent } = require('../src/platforms/steam');

const GAME_COLOURS = {
  730: 0xF4A14C, 570: 0xD8473E, 440: 0xCF6A32, 578080: 0x1D5C8B,
  1172470: 0xAB3024, 1245620: 0x00AAFF, 252490: 0x4B1C0F,
  1086940: 0x2D6A2D, 271590: 0x1A6B2A, 1091500: 0xE8D5A3,
};

const TAG_DOTS = ['🔴', '🟡', '🟢', '🔵', '🟣', '🟠'];
const EPIC_LOGO = 'https://cdn2.unrealengine.com/Unreal+Engine%2Feg-logo-filled-1255x1255-0eb9d144a0f981d1cbaaa1eb957de7f3207b31bb.png';

module.exports = {
  GAME_COLOURS,

  data: new SlashCommandBuilder()
    .setName('gamealerts')
    .setDescription('Manage game update and free game alert subscriptions')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand(sub =>
      sub.setName('add')
        .setDescription('Get patch note alerts when a Steam game updates')
        .addStringOption(opt => opt.setName('game').setDescription('Game name — e.g. "Counter-Strike 2"').setRequired(true))
        .addChannelOption(opt => opt.setName('channel').setDescription('Channel to post updates in').addChannelTypes(ChannelType.GuildText).setRequired(true))
        .addRoleOption(opt => opt.setName('role').setDescription('Role to ping when an update drops (optional)').setRequired(false))
    )
    .addSubcommand(sub =>
      sub.setName('epic')
        .setDescription('Get alerted when Epic Games Store free games change')
        .addChannelOption(opt => opt.setName('channel').setDescription('Channel to post in').addChannelTypes(ChannelType.GuildText).setRequired(true))
        .addRoleOption(opt => opt.setName('role').setDescription('Role to ping (optional)').setRequired(false))
    )
    .addSubcommand(sub =>
      sub.setName('steamfree')
        .setDescription('Get alerted when games become temporarily free on Steam')
        .addChannelOption(opt => opt.setName('channel').setDescription('Channel to post in').addChannelTypes(ChannelType.GuildText).setRequired(true))
        .addRoleOption(opt => opt.setName('role').setDescription('Role to ping (optional)').setRequired(false))
    )
    .addSubcommand(sub => sub.setName('remove').setDescription('Remove a game alert'))
    .addSubcommand(sub => sub.setName('list').setDescription('Show all configured game alerts'))
    .addSubcommand(sub => sub.setName('test').setDescription('Post the latest update for a subscribed game right now')),

  async execute(interaction) {
    const { guild } = interaction;
    const sub = interaction.options.getSubcommand();

    // ── Add Steam game ─────────────────────────────────────────────────────────
    if (sub === 'add') {
      const query   = interaction.options.getString('game');
      const channel = interaction.options.getChannel('channel');
      const role    = interaction.options.getRole('role');
      await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
      await interaction.editReply({ content: `🔍 Searching Steam for **${query}**...` });
      const results = await searchGames(query);
      if (!results.length) return interaction.editReply({ content: `❌ No Steam games found for **${query}**. Try a different name.` });
      const options = results.map(r => ({
        label: r.name.slice(0, 100),
        value: `${r.appid}|||${channel.id}|||${role?.id || ''}`,
        description: `App ID: ${r.appid}`,
      }));
      const menu = new StringSelectMenuBuilder().setCustomId('gamealert_add_select').setPlaceholder('Pick the correct game...').addOptions(options);
      return interaction.editReply({ content: `Found **${results.length}** result(s) — pick the right one:`, components: [new ActionRowBuilder().addComponents(menu)] });
    }

    // ── Epic ───────────────────────────────────────────────────────────────────
    if (sub === 'epic') {
      const channel = interaction.options.getChannel('channel');
      const role    = interaction.options.getRole('role');
      const existing = selectOne('SELECT id FROM game_subscriptions WHERE guild_id = ? AND app_id = ?', [guild.id, 'epic']);
      if (existing) {
        run('UPDATE game_subscriptions SET channel_id = ?, role_id = ? WHERE id = ?', [channel.id, role?.id || null, existing.id]);
        return interaction.reply({ content: `✅ Epic free game alerts updated → <#${channel.id}>${role ? ` · <@&${role.id}>` : ''}.`, flags: [MessageFlags.Ephemeral] });
      }
      run('INSERT INTO game_subscriptions (guild_id, app_id, game_name, channel_id, role_id) VALUES (?, ?, ?, ?, ?)',
        [guild.id, 'epic', 'Epic Games Free Games', channel.id, role?.id || null]);
      log('INFO', 'Epic alerts enabled', { guild: guild.name, by: interaction.user.tag });
      return interaction.reply({ content: `✅ Epic free game alerts enabled in <#${channel.id}>${role ? ` · pinging <@&${role.id}>` : ''}.\nEach free game gets its own post.`, flags: [MessageFlags.Ephemeral] });
    }

    // ── Steam free ─────────────────────────────────────────────────────────────
    if (sub === 'steamfree') {
      const channel = interaction.options.getChannel('channel');
      const role    = interaction.options.getRole('role');
      const existing = selectOne('SELECT id FROM game_subscriptions WHERE guild_id = ? AND app_id = ?', [guild.id, 'steam_free']);
      if (existing) {
        run('UPDATE game_subscriptions SET channel_id = ?, role_id = ? WHERE id = ?', [channel.id, role?.id || null, existing.id]);
        return interaction.reply({ content: `✅ Steam free game alerts updated → <#${channel.id}>${role ? ` · <@&${role.id}>` : ''}.`, flags: [MessageFlags.Ephemeral] });
      }
      run('INSERT INTO game_subscriptions (guild_id, app_id, game_name, channel_id, role_id) VALUES (?, ?, ?, ?, ?)',
        [guild.id, 'steam_free', 'Steam Free Games', channel.id, role?.id || null]);
      log('INFO', 'Steam free alerts enabled', { guild: guild.name, by: interaction.user.tag });
      return interaction.reply({ content: `✅ Steam free game alerts enabled in <#${channel.id}>${role ? ` · pinging <@&${role.id}>` : ''}.`, flags: [MessageFlags.Ephemeral] });
    }

    // ── Remove ─────────────────────────────────────────────────────────────────
    if (sub === 'remove') {
      const subs = selectAll('SELECT * FROM game_subscriptions WHERE guild_id = ?', [guild.id]);
      if (!subs.length) return interaction.reply({ content: '📭 No game alerts configured.', flags: [MessageFlags.Ephemeral] });
      const NAMES = { epic: 'Epic Free Games', steam_free: 'Steam Free Games' };
      const options = subs.map(s => ({ label: NAMES[s.app_id] || s.game_name || s.app_id, value: `${s.id}`, description: `Posts to channel`, emoji: '🎯' }));
      const menu = new StringSelectMenuBuilder().setCustomId('gamealert_remove_select').setPlaceholder('Pick an alert to remove...').addOptions(options);
      return interaction.reply({ content: 'Select a game alert to remove:', components: [new ActionRowBuilder().addComponents(menu)], flags: [MessageFlags.Ephemeral] });
    }

    // ── List ───────────────────────────────────────────────────────────────────
    if (sub === 'list') {
      const subs = selectAll('SELECT * FROM game_subscriptions WHERE guild_id = ?', [guild.id]);
      if (!subs.length) return interaction.reply({ content: '📭 No game alerts configured.', flags: [MessageFlags.Ephemeral] });
      const ICONS = { epic: '🎮', steam_free: '🎮' };
      const NAMES = { epic: 'Epic Free Games', steam_free: 'Steam Free Games' };
      const lines = subs.map(s => `${ICONS[s.app_id] || '🎯'} **${NAMES[s.app_id] || s.game_name}** → <#${s.channel_id}>${s.role_id ? ` · <@&${s.role_id}>` : ''}`);
      return interaction.reply({
        embeds: [new EmbedBuilder().setColor(0x5865F2).setTitle('🎮 Game Alert Subscriptions').setDescription(lines.join('\n')).setFooter({ text: `${subs.length} alert(s)` }).setTimestamp()],
        flags: [MessageFlags.Ephemeral],
      });
    }

    // ── Test ───────────────────────────────────────────────────────────────────
    if (sub === 'test') {
      const subs = selectAll("SELECT * FROM game_subscriptions WHERE guild_id = ? AND app_id != 'epic' AND app_id != 'steam_free'", [guild.id]);
      if (!subs.length) return interaction.reply({ content: '📭 No Steam game update alerts configured.', flags: [MessageFlags.Ephemeral] });
      if (subs.length === 1) return runTest(interaction, subs[0]);
      const menu = new StringSelectMenuBuilder().setCustomId('gamealert_test_select').setPlaceholder('Which game?')
        .addOptions(subs.map(s => ({ label: s.game_name || s.app_id, value: `${s.id}` })));
      return interaction.reply({ content: 'Pick a game to test:', components: [new ActionRowBuilder().addComponents(menu)], flags: [MessageFlags.Ephemeral] });
    }
  },
};

async function runTest(interaction, sub) {
  await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
  const news = await getGameNews(sub.app_id, 1);
  if (!news?.length) return interaction.editReply({ content: `❌ No recent news found for **${sub.game_name}**.` });
  try {
    const item    = news[0];
    const details = await getAppDetails(sub.app_id).catch(() => null);
    const { text, imageUrl, youtubeUrl } = parseSteamContent(item.contents, 1000);
    const headerImg = details?.headerImage || getHeaderImage(sub.app_id);
    const embed = new EmbedBuilder()
      .setColor(sub.color || 0x1B2838)
      .setAuthor({ name: sub.game_name, iconURL: `https://cdn.cloudflare.steamstatic.com/steam/apps/${sub.app_id}/capsule_sm_120.jpg`, url: `https://store.steampowered.com/app/${sub.app_id}` })
      .setTitle(item.title).setURL(item.url).setThumbnail(headerImg)
      .setTimestamp(new Date(item.date * 1000)).setFooter({ text: 'Steam • Game Update' });
    if (text) embed.setDescription(text);
    embed.setImage(imageUrl || headerImg);
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setLabel('Read Full Notes').setURL(item.url).setStyle(ButtonStyle.Link).setEmoji('📋')
    );
    if (youtubeUrl) row.addComponents(new ButtonBuilder().setLabel('Watch Video').setURL(youtubeUrl).setStyle(ButtonStyle.Link).setEmoji('▶️'));
    return interaction.editReply({ content: `✅ Latest **${sub.game_name}** update:`, embeds: [embed], components: [row] });
  } catch (err) {
    return interaction.editReply({ content: `❌ Test failed: ${err.message}` });
  }
}

module.exports.runTest = runTest;
