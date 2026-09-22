/** Pure aggregate definitions for the DXB Cinema workforce connector. */
export type CountCollection = { countDocuments(filter?: Record<string, unknown>): Promise<number> };
export type CinemaSignalCollections = {
  users: CountCollection;
  chatSessions: CountCollection;
  watchlists: CountCollection;
  productClicks: CountCollection;
  commerceOrders: CountCollection;
};
export type CinemaSignalObservation = { metricId: string; value: number; previousValue: number | null; timestamp: string; period: string; confidence: 'high'; sampleSize: number; definition: string };

function range(end: Date, days: number, periodsBack = 0): { $gte: Date; $lt: Date } {
  const endMs = end.getTime() - periodsBack * days * 86_400_000;
  return { $gte: new Date(endMs - days * 86_400_000), $lt: new Date(endMs) };
}
async function countPeriod(collection: CountCollection, field: string, window: { $gte: Date; $lt: Date }): Promise<number> {
  return collection.countDocuments({ [field]: window });
}

/** Produces aggregate-only facts with no database client or environment dependency. */
export async function collectCinemaBusinessSignals({ collections, periodDays, observedAt = new Date() }: { collections: CinemaSignalCollections; periodDays: number; observedAt?: Date }): Promise<{ source: string; platformId: string; observedAt: string; period: string; definitionsVersion: string; observations: CinemaSignalObservation[] }> {
  if (!Number.isInteger(periodDays) || periodDays < 1 || periodDays > 90) throw new Error('periodDays must be an integer from 1 to 90');
  const current = range(observedAt, periodDays);
  const previous = range(observedAt, periodDays, 1);
  const timestamp = observedAt.toISOString();
  const period = `${periodDays}d`;
  const [totalUsers, activeUsers, onboardingCompleted, newUsers, previousNewUsers, chatSessions, previousChatSessions, watchlistAdds, previousWatchlistAdds, productClicks, previousProductClicks, commerceOrders, previousCommerceOrders] = await Promise.all([
    collections.users.countDocuments({ email: { $type: 'string', $ne: '' } }),
    collections.users.countDocuments({ lastSeen: { $gte: current.$gte.toISOString(), $lt: current.$lt.toISOString() } }),
    collections.users.countDocuments({ onboardingDone: true }),
    countPeriod(collections.users, 'createdAt', current), countPeriod(collections.users, 'createdAt', previous),
    countPeriod(collections.chatSessions, 'createdAt', current), countPeriod(collections.chatSessions, 'createdAt', previous),
    countPeriod(collections.watchlists, 'addedAt', current), countPeriod(collections.watchlists, 'addedAt', previous),
    countPeriod(collections.productClicks, 'clickedAt', current), countPeriod(collections.productClicks, 'clickedAt', previous),
    countPeriod(collections.commerceOrders, 'createdAt', current), countPeriod(collections.commerceOrders, 'createdAt', previous),
  ]);
  const observation = (metricId: string, value: number, previousValue: number | null, definition: string): CinemaSignalObservation => ({ metricId, value, previousValue, timestamp, period, confidence: 'high', sampleSize: value, definition });
  return { source: 'wazhop-dxb-cinema-readonly', platformId: 'wazhop-dxb-cinema', observedAt: timestamp, period, definitionsVersion: 'wazhop-dxb-cinema-business-metrics-v1', observations: [
    observation('total_users', totalUsers, null, 'User records with a non-empty email as of the observation end.'),
    observation('active_users', activeUsers, null, 'Users with a lastSeen heartbeat during the observation period.'),
    observation('onboarding_completed', onboardingCompleted, null, 'Users whose current onboardingDone flag is true.'),
    observation('new_users', newUsers, previousNewUsers, 'User records created during the observation period.'),
    observation('chat_sessions', chatSessions, previousChatSessions, 'Saved chat sessions created during the observation period.'),
    observation('watchlist_adds', watchlistAdds, previousWatchlistAdds, 'Watchlist entries added during the observation period.'),
    observation('product_clicks', productClicks, previousProductClicks, 'Tracked product-click events recorded during the observation period.'),
    observation('commerce_orders', commerceOrders, previousCommerceOrders, 'Commerce orders created during the observation period; no mixed-currency revenue is calculated.'),
  ] };
}
