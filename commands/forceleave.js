const { SlashCommandBuilder, MessageFlags, PermissionFlagsBits, ActivityType } = require('discord.js');
const { getVoiceConnection } = require('@discordjs/voice');
const { log }              = require('../src/logger');
const store                = require('../src/connectionStore');
const { updatePanel }      = require('../src/statusUpdater');
const { clearLastChannel } = require('../src/guildConfig');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('forceleave')
    .setDescription('Force disconnect and wipe all connection state — fixes ghost connection issues')
    .setDefaultMemberPermissions(PermissionFlagsBits.MoveMembers),

  async execute(interaction, client) {
    const { guild, member } = interaction;

    log('VOICE', '/forceleave triggered', { guild: guild.name, by: member.user.tag });

    const connection = getVoiceConnection(guild.id);
    const hadEntry   = store.getEntry(guild.id);

    if (connection) { try { connection.destroy(); } catch (_) {} }
    store.clearConnection(guild.id);

    // Clear saved channel so bot doesn't auto-rejoin on next restart
    clearLastChannel(guild.id);

    client.user.setPresence({
      status: 'idle',
      activities: [{ name: 'Idle — use /join', type: ActivityType.Custom }],
    });

    const wasGhost = !connection && hadEntry;
    log('VOICE', wasGhost ? 'Ghost connection cleared' : 'Force disconnected', { guild: guild.name, by: member.user.tag });

    await updatePanel(client);

    return interaction.reply({
      content: wasGhost
        ? '👻 Ghost connection cleared. All state wiped. You can now use `/join` again.'
        : '🔴 Force disconnected. All state cleared. You can now use `/join` again.',
    });
  },
};
