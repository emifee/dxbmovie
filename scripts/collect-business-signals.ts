/** Server-only CLI wrapper for DXB Cinema's aggregate signal collector. */
import { MongoClient } from 'mongodb';
import { collectCinemaBusinessSignals } from '../lib/business-signal-collector';

function parsePeriodDays(args: string[]): number {
  const raw = args.find((arg) => arg.startsWith('--period-days='))?.split('=')[1] ?? '7';
  const days = Number(raw);
  if (!Number.isInteger(days) || days < 1 || days > 90) throw new Error('--period-days must be an integer from 1 to 90');
  return days;
}

async function main(): Promise<void> {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI is required on the Cinema server');
  const client = new MongoClient(uri, { tlsAllowInvalidCertificates: true });
  try {
    await client.connect();
    const db = client.db('dxbmovies');
    const snapshot = await collectCinemaBusinessSignals({
      collections: {
        users: db.collection('users'), chatSessions: db.collection('chatSessions'),
        watchlists: db.collection('watchlists'), productClicks: db.collection('product_clicks'),
        commerceOrders: db.collection('commerce_orders'),
      },
      periodDays: parsePeriodDays(process.argv.slice(2)),
    });
    process.stdout.write(`${JSON.stringify(snapshot, null, 2)}\n`);
  } finally {
    await client.close();
  }
}

if (process.argv[1]?.endsWith('collect-business-signals.ts')) {
  main().catch((error: unknown) => { process.stderr.write(`DXB Cinema business-signal collection failed: ${error instanceof Error ? error.message : String(error)}\n`); process.exitCode = 1; });
}
