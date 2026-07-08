const {
  SlashCommandBuilder, EmbedBuilder, MessageFlags, ChannelType,
} = require('discord.js');

const VERIFICATION_LEVELS = ['None', 'Low', 'Medium', 'High', 'Highest'];

module.exports = {
  data: new SlashCommandBuilder()
    .setName('serverinfo')
    .setDescription('Display information about this server'),

  async execute(interaction) {
    const { guild } = interaction;

    await guild.fetch();
    await guild.members.fetch().catch(() => null); // best-effort for accurate counts

    const owner = await guild.fetchOwner().catch(() => null);

    const text       = guild.channels.cache.filter(c => c.type === ChannelType.GuildText).size;
    const voice      = guild.channels.cache.filter(c => c.type === ChannelType.GuildVoice).size;
    const categories = guild.channels.cache.filter(c => c.type === ChannelType.GuildCategory).size;
    const humans     = guild.members.cache.filter(m => !m.user.bot).size;
    const bots       = guild.members.cache.filter(m => m.user.bot).size;

    const embed = new EmbedBuilder()
      .setTitle(guild.name)
      .setColor(0x7b8cff)
      .setThumbnail(guild.iconURL({ dynamic: true, size: 256 }))
      .addFields(
        { name: 'Server ID',     value: guild.id,                                                                       inline: true  },
        { name: 'Owner',         value: owner ? `${owner.user.tag}` : 'Unknown',                                        inline: true  },
        { name: 'Created',       value: `<t:${Math.floor(guild.createdTimestamp / 1000)}:R>`,                           inline: true  },
        { name: 'Members',       value: `${guild.memberCount} total · ${humans} members · ${bots} bots`,               inline: false },
        { name: 'Channels',      value: `${text} text · ${voice} voice · ${categories} categories`,                    inline: false },
        { name: 'Roles',         value: `${guild.roles.cache.size}`,                                                    inline: true  },
        { name: 'Boosts',        value: `Level ${guild.premiumTier} · ${guild.premiumSubscriptionCount ?? 0} boosts`,  inline: true  },
        { name: 'Verification',  value: VERIFICATION_LEVELS[guild.verificationLevel] ?? 'Unknown',                     inline: true  },
      )
      .setFooter({ text: '24/7 POW Bot • Server Info' })
      .setTimestamp();

    if (guild.description) embed.setDescription(guild.description);
    if (guild.bannerURL())  embed.setImage(guild.bannerURL({ size: 1024 }));

    return interaction.reply({ embeds: [embed], flags: [MessageFlags.Ephemeral] });
  },
};
