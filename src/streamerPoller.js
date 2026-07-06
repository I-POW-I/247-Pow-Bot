/**
 * Streamer polling engine.
 *
 * Intervals:
 *   Kick    — 60s  (unofficial API, no quota)
 *   Twitch  — 60s  (official API, generous limits)
 *   YouTube — 5min (quota: ~100 units per check)
 *
 * Live embeds are updated on every poll cycle so viewer count stays fresh.
 * To avoid Discord rate limits, we cap embed edits to once every 5 minutes.
 */

const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { log }              = require('./logger');
const { selectAll, run }   = require('./database');

const kick    = require('./platforms/kick');
const twitch  = require('./platforms/twitch');
const youtube = require('./platforms/youtube');

const INTERVALS = {
  kick:    60  * 1000,
  twitch:  60  * 1000,
  youtube: 5   * 60 * 1000,
};

const UPDATE_COOLDOWN = 5 * 60 * 1000; // Min time between live embed edits

const PLATFORM_COLOURS = { kick: 0x53FC18, twitch: 0x9146FF, youtube: 0xFF0000 };
const PLATFORM_NAMES   = { kick: 'Kick',   twitch: 'Twitch', youtube: 'YouTube' };
const PLATFORM_ICONS   = {
  kick:    'https://kick.com/favicon.ico',
  twitch:  'https://static.twitchcdn.net/assets/favicon-32-e29e246c157142c1.png',
  youtube: 'https://www.youtube.com/favicon.ico',
};

// ── Embed builders ─────────────────────────────────────────────────────────────

function buildLiveEmbed(platform, sub, status) {
  const name = sub.display_name || status.displayName || sub.username;

  const embed = new EmbedBuilder()
    .setColor(PLATFORM_COLOURS[platform])
    .setAuthor({ name: PLATFORM_NAMES[platform], iconURL: PLATFORM_ICONS[platform] })
    .setTitle(`🔴 ${name} is now live!`)
    .setURL(status.url)
    .setDescription(status.title || 'No title')
    .setTimestamp()
    .setFooter({ text: `${PLATFORM_NAMES[platform]} • Live` });

  // Only show Playing field if platform has a real category (YouTube doesn't)
  if (status.category) {
    embed.addFields({ name: '🎮 Playing', value: status.category, inline: true });
  }

  // Viewer count
  if (status.viewers !== null && status.viewers >= 0) {
    embed.addFields({ name: '👥 Viewers', value: status.viewers.toLocaleString(), inline: true });
  }

  if (status.thumbnail) embed.setImage(status.thumbnail);

  return embed;
}

function buildOfflineEmbed(platform, sub, lastTitle) {
  const name = sub.display_name || sub.username;
  return new EmbedBuilder()
    .setColor(0x747F8D)
    .setAuthor({ name: PLATFORM_NAMES[platform], iconURL: PLATFORM_ICONS[platform] })
    .setTitle(`⚫ ${name} went offline`)
    .setDescription(lastTitle || 'Stream ended.')
    .setTimestamp()
    .setFooter({ text: `${PLATFORM_NAMES[platform]} • Offline` });
}

function buildWatchButton(url) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setLabel('Watch Stream')
      .setURL(url)
      .setEmoji('🔴')
      .setStyle(ButtonStyle.Link)
  );
}

// ── Check a single subscription ────────────────────────────────────────────────

async function checkSubscription(client, sub) {
  const modules = { kick, twitch, youtube };
  const mod     = modules[sub.platform];
  if (!mod) return;

  const status = await mod.getStreamStatus(sub.username);
  if (!status) return; // API error or timeout — skip cycle

  const wasLive   = sub.is_live === 1;
  const isNowLive = status.isLive;

  // ── Just went live ──────────────────────────────────────────────────────────
  if (!wasLive && isNowLive) {
    log('INFO', `🔴 ${sub.username} went live on ${sub.platform}`, { guild: sub.guild_id });

    try {
      const guild   = await client.guilds.fetch(sub.guild_id);
      const channel = await guild.channels.fetch(sub.discord_channel_id);
      if (!channel?.isTextBased()) return;

      const content = sub.role_id ? `<@&${sub.role_id}>` : undefined;
      const message = await channel.send({
        content,
        embeds:     [buildLiveEmbed(sub.platform, sub, status)],
        components: [buildWatchButton(status.url)],
      });

      run(
        `UPDATE streamer_subscriptions
         SET is_live = 1, last_message_id = ?, last_went_live = ?,
             last_stream_title = ?, last_updated_at = ?
         WHERE id = ?`,
        [message.id, Date.now(), status.title, Date.now(), sub.id]
      );
    } catch (err) {
      log('ERROR', `Failed to post live notification for ${sub.username}`, { error: err.message });
    }
  }

  // ── Still live — update embed if cooldown has passed ───────────────────────
  else if (wasLive && isNowLive) {
    const lastUpdated = sub.last_updated_at || 0;
    if (Date.now() - lastUpdated < UPDATE_COOLDOWN) return; // Too soon to update

    if (!sub.last_message_id) return;

    try {
      const guild   = await client.guilds.fetch(sub.guild_id);
      const channel = await guild.channels.fetch(sub.discord_channel_id);
      if (!channel?.isTextBased()) return;

      const message = await channel.messages.fetch(sub.last_message_id).catch(() => null);
      if (!message) return;

      await message.edit({
        embeds:     [buildLiveEmbed(sub.platform, sub, status)],
        components: [buildWatchButton(status.url)],
      });

      run(
        'UPDATE streamer_subscriptions SET last_stream_title = ?, last_updated_at = ? WHERE id = ?',
        [status.title, Date.now(), sub.id]
      );
    } catch (err) {
      log('WARN', `Failed to update live embed for ${sub.username}`, { error: err.message });
    }
  }

  // ── Just went offline ───────────────────────────────────────────────────────
  else if (wasLive && !isNowLive) {
    log('INFO', `⚫ ${sub.username} went offline on ${sub.platform}`, { guild: sub.guild_id });

    if (sub.last_message_id) {
      try {
        const guild   = await client.guilds.fetch(sub.guild_id);
        const channel = await guild.channels.fetch(sub.discord_channel_id);
        if (!channel?.isTextBased()) return;

        const message = await channel.messages.fetch(sub.last_message_id).catch(() => null);
        if (message) {
          await message.edit({
            content:    null,
            embeds:     [buildOfflineEmbed(sub.platform, sub, sub.last_stream_title)],
            components: [],
          });
        }
      } catch (err) {
        log('WARN', `Failed to update offline message for ${sub.username}`, { error: err.message });
      }
    }

    run(
      'UPDATE streamer_subscriptions SET is_live = 0, last_message_id = NULL, last_updated_at = NULL WHERE id = ?',
      [sub.id]
    );
  }
}

// ── Poll all subscriptions for a platform ──────────────────────────────────────

async function pollPlatform(client, platform) {
  const subs = selectAll('SELECT * FROM streamer_subscriptions WHERE platform = ?', [platform]);
  if (subs.length === 0) return;

  for (const sub of subs) {
    await checkSubscription(client, sub);
    await new Promise(r => setTimeout(r, 500)); // Small gap between checks
  }
}

// ── Start polling ──────────────────────────────────────────────────────────────

function startStreamerPoller(client) {
  const hasTwitch  = !!(process.env.TWITCH_CLIENT_ID && process.env.TWITCH_CLIENT_SECRET);
  const hasYoutube = !!process.env.YOUTUBE_API_KEY;

  log('INFO', 'Streamer poller starting', {
    kick:    'enabled',
    twitch:  hasTwitch  ? 'enabled' : '⚠️ disabled — set TWITCH_CLIENT_ID + TWITCH_CLIENT_SECRET in .env',
    youtube: hasYoutube ? 'enabled' : '⚠️ disabled — set YOUTUBE_API_KEY in .env',
  });

  // Stagger startup polls so they don't all fire at once
  setTimeout(() => {
    pollPlatform(client, 'kick');
    setInterval(() => pollPlatform(client, 'kick'), INTERVALS.kick);
  }, 5000);

  if (hasTwitch) {
    setTimeout(() => {
      pollPlatform(client, 'twitch');
      setInterval(() => pollPlatform(client, 'twitch'), INTERVALS.twitch);
    }, 10000);
  }

  if (hasYoutube) {
    setTimeout(() => {
      pollPlatform(client, 'youtube');
      setInterval(() => pollPlatform(client, 'youtube'), INTERVALS.youtube);
    }, 15000);
  }
}

module.exports = { startStreamerPoller };
