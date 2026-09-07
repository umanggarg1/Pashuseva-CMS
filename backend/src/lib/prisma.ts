import { PrismaClient, Prisma } from '../generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import config from '../config';

declare global {
  var prisma: PrismaClient | undefined;
}

// Phase 20 Step 5: default pg.Pool max (10) kept deliberately, not raised.
// Step 5B found raising it to 20 helped warm requests (~33%) but made the very
// first (cold) request worse. Step 5C then split dashboard.service.ts's single
// ~19-query getSummary() into an 11-query getSummary() + 9-query getAnalytics(),
// which brought per-request concurrent query count under 10 anyway, so pool
// size stopped being the binding constraint for a solo request either way. Step
// 5D re-benchmarked max 10/15/20 against that smaller fan-out (see
// PHASE20_TODO.md) and found max: 10 won outright: cold/warm solo performance
// was statistically the same across all three sizes, but under 3-concurrent-
// request load, 10 stayed stable (~1-1.2s) while 15 and 20 produced repeatable
// multi-second spikes (up to 4.8s) — larger pools appear to make Neon establish
// more simultaneous fresh connections under a burst, which costs more than it
// saves. No override needed; the default is the evidenced-best choice here.
const adapter = new PrismaPg({ connectionString: config.databaseUrl });

const prisma = global.prisma || new PrismaClient({ adapter });

if (process.env.NODE_ENV !== 'production') global.prisma = prisma;

// Repository methods that need to participate in a multi-repository transaction (e.g.
// order creation touching both Order and Product stock) accept this instead of the
// singleton client, so the service can pass the same `tx` from `prisma.$transaction`.
export type PrismaClientOrTx = PrismaClient | Prisma.TransactionClient;

export default prisma;
