/**
 * Silent audio stream — keeps the bot's voice connection alive 24/7.
 *
 * Discord can silently drop connections that aren't sending any audio.
 * This plays a continuous stream of silence (zero-byte PCM frames) so
 * Discord always sees the bot as an active audio participant.
 *
 * Requires: opusscript (Opus encoding) + libsodium-wrappers (packet encryption)
 */

const {
  createAudioPlayer,
  createAudioResource,
  AudioPlayerStatus,
  NoSubscriberBehavior,
  StreamType,
} = require('@discordjs/voice');
const { Readable } = require('stream');

// 20ms of 48kHz stereo 16-bit PCM silence = 3840 bytes per frame
const SILENCE_FRAME = Buffer.alloc(3840, 0);

class SilenceStream extends Readable {
  _read() {
    this.push(SILENCE_FRAME);
  }
}

// One player per guild — tracked here so we can stop cleanly on leave
const players = new Map();

/**
 * Attach a silent audio player to a voice connection.
 * Call this every time the bot joins a channel.
 * @param {import('@discordjs/voice').VoiceConnection} connection
 * @param {string} guildId
 */
function attachSilencePlayer(connection, guildId) {
  // Clean up any existing player for this guild
  stopSilencePlayer(guildId);

  const player = createAudioPlayer({
    behaviors: { noSubscriber: NoSubscriberBehavior.Play },
  });

  const play = () => {
    const resource = createAudioResource(new SilenceStream(), {
      inputType: StreamType.Raw,
    });
    player.play(resource);
  };

  // Loop continuously — when one resource ends, start another
  player.on(AudioPlayerStatus.Idle, play);
  play();

  connection.subscribe(player);
  players.set(guildId, player);
}

/**
 * Stop and remove the audio player for a guild.
 * Call this on leave / forceleave.
 * @param {string} guildId
 */
function stopSilencePlayer(guildId) {
  const player = players.get(guildId);
  if (player) {
    try { player.stop(true); } catch (_) {}
    players.delete(guildId);
  }
}

module.exports = { attachSilencePlayer, stopSilencePlayer };
