import { PrismaClient, Prisma } from '../generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import config from '../config';

declare global {
  var prisma: PrismaClient | undefined;
}

// Phase 20 Step 5: default pg.Pool max is 10, which is smaller than
// dashboard.service.ts's getSummary() firing ~19 concurrent queries in one
// Promise.all — measured (see PHASE20_TODO.md Step 5A) as the dominant cause of
// its slowness: a warm-pool run split into two queueing "waves" of ~10 and ~9
// queries, and the same query type measured outside the batch was ~10x faster
// than the ones queueing inside it. 20 is a deliberately modest experiment (not
// tuned to eliminate all queueing for every future query fan-out), to be
// benchmarked and revisited, not a final number.
const adapter = new PrismaPg({ connectionString: config.databaseUrl, max: 20 });

const prisma = global.prisma || new PrismaClient({ adapter });

if (process.env.NODE_ENV !== 'production') global.prisma = prisma;

// Repository methods that need to participate in a multi-repository transaction (e.g.
// order creation touching both Order and Product stock) accept this instead of the
// singleton client, so the service can pass the same `tx` from `prisma.$transaction`.
export type PrismaClientOrTx = PrismaClient | Prisma.TransactionClient;

export default prisma;
