/**
 * Epic Games Store free games API.
 * No API key required.
 * Returns current free games and upcoming free games.
 */

const { log } = require('../logger');

const EPIC_URL = 'https://store-site-backend-static.ak.epicgames.com/freeGamesPromotions?locale=en-US&country=US&allowCountries=US';

async function getFreeGames() {
  try {
    const res  = await fetch(EPIC_URL, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) throw new Error(`Epic API ${res.status}`);
    const data = await res.json();

    const games = data?.data?.Catalog?.searchStore?.elements || [];

    const current  = [];
    const upcoming = [];

    for (const game of games) {
      const promos = game.promotions;
      if (!promos) continue;

      const title     = game.title;
      const slug      = game.productSlug || game.urlSlug || '';
      const url       = slug ? `https://store.epicgames.com/en-US/p/${slug.replace(/\/home$/, '')}` : 'https://store.epicgames.com/free-games';
      const image     = game.keyImages?.find(i => i.type === 'OfferImageWide' || i.type === 'DieselStoreFrontWide')?.url
                     || game.keyImages?.[0]?.url
                     || null;
      const publisher = game.seller?.name || null;
      const price     = game.price?.totalPrice?.fmtPrice?.originalPrice || null;

      // Current free offers
      const currentOffers = promos.promotionalOffers?.[0]?.promotionalOffers || [];
      for (const offer of currentOffers) {
        if (offer.discountSetting?.discountPercentage === 0) {
          current.push({
            title, url, image, publisher, price,
            endsAt: offer.endDate,
          });
          break;
        }
      }

      // Upcoming free offers
      const upcomingOffers = promos.upcomingPromotionalOffers?.[0]?.promotionalOffers || [];
      for (const offer of upcomingOffers) {
        if (offer.discountSetting?.discountPercentage === 0) {
          upcoming.push({
            title, url, image, publisher, price,
            startsAt: offer.startDate,
            endsAt:   offer.endDate,
          });
          break;
        }
      }
    }

    return { current, upcoming };
  } catch (err) {
    log('WARN', 'Epic Games API failed', { error: err.message });
    return { current: [], upcoming: [] };
  }
}

module.exports = { getFreeGames };
