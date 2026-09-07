import { PrismaClient, Prisma } from '../generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import config from '../config';

declare global {
  var prisma: PrismaClient | undefined;
}

// Phase 20 Step 5B tried raising pg.Pool's default max (10) to 20 to relieve
// dashboard.service.ts's ~19-query fan-out queueing (see PHASE20_TODO.md) — warm
// performance improved ~33%, but the very first (cold) request got *worse*
// (more simultaneous connections to establish up front), which is exactly the
// case this investigation started from. Held back at the default here; Step 5C
// reduces the query *count* per request instead (the essential/analytics split),
// which is expected to make any pool size — including the default — perform
// better, cold or warm. Pool size is revisited after that, against the smaller
// fan-out, not before.
const adapter = new PrismaPg({ connectionString: config.databaseUrl });

const prisma = global.prisma || new PrismaClient({ adapter });

if (process.env.NODE_ENV !== 'production') global.prisma = prisma;

// Repository methods that need to participate in a multi-repository transaction (e.g.
// order creation touching both Order and Product stock) accept this instead of the
// singleton client, so the service can pass the same `tx` from `prisma.$transaction`.
export type PrismaClientOrTx = PrismaClient | Prisma.TransactionClient;

export default prisma;
