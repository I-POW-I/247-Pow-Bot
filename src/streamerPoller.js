/**
 * Streamer polling engine.
 * Polls each platform on its own interval and posts/edits
 * Discord announcements when streamers go live or offline.
 *
 * Platform intervals:
 *   Kick    — 60 seconds  (unofficial API, no quota)
 *   Twitch  — 60 seconds  (official API, generous limits)
 *   YouTube — 5 minutes   (quota: ~100 units per check)
 */

const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { log }    = require('./logger');
const { selectAll, run } = require('./database');

const kick    = require('./platforms/kick');
const twitch  = require('./platforms/twitch');
const youtube = require('./platforms/youtube');

const INTERVALS = {
  kick:    60  * 1000,
  twitch:  60  * 1000,
  youtube: 5   * 60 * 1000,
};

const PLATFORM_COLOURS = {
  kick:    0x53FC18,
  twitch:  0x9146FF,
  youtube: 0xFF0000,
};

const PLATFORM_NAMES = {
  kick:    'Kick',
  twitch:  'Twitch',
  youtube: 'YouTube',
};

const PLATFORM_ICONS = {
  kick:    'https://kick.com/favicon.ico',
  twitch:  'https://static.twitchcdn.net/assets/favicon-32-e29e246c157142c1.png',
  youtube: 'https://www.youtube.com/favicon.ico',
};

// ── Embed builders ────────────────────────────────────────────────────────────

function buildLiveEmbed(platform, streamer, status) {
  const colour      = PLATFORM_COLOURS[platform];
  const platformName = PLATFORM_NAMES[platform];
  const viewers     = status.viewers !== null
    ? `👥 ${status.viewers.toLocaleString()} viewers`
    : null;

  const embed = new EmbedBuilder()
    .setColor(colour)
    .setAuthor({
      name:    `${platformName}`,
      iconURL: PLATFORM_ICONS[platform],
    })
    .setTitle(`🔴 ${status.displayName} is now live!`)
    .setURL(status.url)
    .setDescription(status.title)
    .setTimestamp()
    .setFooter({ text: `${platformName} • Live` });

  if (status.category) {
    embed.addFields({ name: '🎮 Playing', value: status.category, inline: true });
  }

  if (viewers) {
    embed.addFields({ name: '👥 Viewers', value: status.viewers.toLocaleString(), inline: true });
  }

  if (status.thumbnail) {
    embed.setImage(status.thumbnail);
  }

  return embed;
}

function buildOfflineEmbed(platform, displayName, title) {
  return new EmbedBuilder()
    .setColor(0x747F8D)
    .setAuthor({
      name:    PLATFORM_NAMES[platform],
      iconURL: PLATFORM_ICONS[platform],
    })
    .setTitle(`⚫ ${displayName} went offline`)
    .setDescription(title || 'Stream ended.')
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

// ── Check a single subscription ───────────────────────────────────────────────

async function checkSubscription(client, sub) {
  const platformModule = { kick, twitch, youtube }[sub.platform];
  if (!platformModule) return;

  const status = await platformModule.getStreamStatus(sub.username);
  if (!status) return; // API error — skip this cycle

  const wasLive = sub.is_live === 1;
  const isNowLive = status.isLive;

  // ── Went live ───────────────────────────────────────────────────────────────
  if (!wasLive && isNowLive) {
    log('INFO', `${sub.username} went live on ${sub.platform}`, { guild: sub.guild_id });

    try {
      const guild   = await client.guilds.fetch(sub.guild_id);
      const channel = await guild.channels.fetch(sub.discord_channel_id);
      if (!channel?.isTextBased()) return;

      const embed   = buildLiveEmbed(sub.platform, sub, status);
      const button  = buildWatchButton(status.url);

      // Role ping as message content (pings don't render inside embeds)
      const content = sub.role_id ? `<@&${sub.role_id}>` : undefined;

      const message = await channel.send({
        content,
        embeds:     [embed],
        components: [button],
      });

      // Save message ID and mark as live
      run(
        'UPDATE streamer_subscriptions SET is_live = 1, last_message_id = ?, last_went_live = ? WHERE id = ?',
        [message.id, Date.now(), sub.id]
      );

    } catch (err) {
      log('ERROR', `Failed to post live notification for ${sub.username}`, { error: err.message });
    }
  }

  // ── Went offline ────────────────────────────────────────────────────────────
  else if (wasLive && !isNowLive) {
    log('INFO', `${sub.username} went offline on ${sub.platform}`, { guild: sub.guild_id });

    if (sub.last_message_id) {
      try {
        const guild   = await client.guilds.fetch(sub.guild_id);
        const channel = await guild.channels.fetch(sub.discord_channel_id);
        if (!channel?.isTextBased()) return;

        const message = await channel.messages.fetch(sub.last_message_id).catch(() => null);
        if (message) {
          await message.edit({
            content:    null,
            embeds:     [buildOfflineEmbed(sub.platform, sub.display_name || sub.username, sub.last_stream_title)],
            components: [],
          });
        }
      } catch (err) {
        log('WARN', `Failed to update offline message for ${sub.username}`, { error: err.message });
      }
    }

    run(
      'UPDATE streamer_subscriptions SET is_live = 0, last_message_id = NULL WHERE id = ?',
      [sub.id]
    );
  }
}

// ── Poll all subscriptions for a platform ─────────────────────────────────────

async function pollPlatform(client, platform) {
  const subs = selectAll(
    'SELECT * FROM streamer_subscriptions WHERE platform = ?',
    [platform]
  );

  if (subs.length === 0) return;

  for (const sub of subs) {
    await checkSubscription(client, sub);
    // Small delay between checks to avoid hammering APIs
    await new Promise(r => setTimeout(r, 500));
  }
}

// ── Start polling ─────────────────────────────────────────────────────────────

function startStreamerPoller(client) {
  const hasKick    = !!true; // Always enabled — no key needed
  const hasTwitch  = !!(process.env.TWITCH_CLIENT_ID && process.env.TWITCH_CLIENT_SECRET);
  const hasYoutube = !!process.env.YOUTUBE_API_KEY;

  log('INFO', 'Streamer poller starting', {
    kick:    hasKick    ? 'enabled' : 'enabled (no auth needed)',
    twitch:  hasTwitch  ? 'enabled' : 'disabled (no API keys)',
    youtube: hasYoutube ? 'enabled' : 'disabled (no API key)',
  });

  // Stagger the initial polls so they don't all fire at once on startup
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
