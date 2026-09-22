import { collectCinemaBusinessSignals } from '../lib/business-signal-collector';

describe('collectCinemaBusinessSignals', () => {
  it('returns only allowlisted aggregate metrics', async () => {
    const filters: Record<string, unknown>[] = [];
    const collection = { countDocuments: async (filter: Record<string, unknown> = {}) => { filters.push(filter); return filters.length; } };
    const snapshot = await collectCinemaBusinessSignals({
      collections: { users: collection, chatSessions: collection, watchlists: collection, productClicks: collection, commerceOrders: collection },
      periodDays: 7,
      observedAt: new Date('2026-09-22T00:00:00.000Z'),
    });
    expect(snapshot.source).toBe('wazhop-dxb-cinema-readonly');
    expect(snapshot.platformId).toBe('wazhop-dxb-cinema');
    expect(snapshot.observations.map((item) => item.metricId)).toEqual(['total_users', 'active_users', 'onboarding_completed', 'new_users', 'chat_sessions', 'watchlist_adds', 'product_clicks', 'commerce_orders']);
    expect(snapshot.observations.every((item) => !Object.hasOwn(item, 'email') && !Object.hasOwn(item, 'userId'))).toBe(true);
    expect(filters.some((filter) => filter.email)).toBe(true);
  });
});
