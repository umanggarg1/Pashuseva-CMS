import { PrismaClient, Prisma } from '../generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import config from '../config';

declare global {
  var prisma: PrismaClient | undefined;
}

const adapter = new PrismaPg({ connectionString: config.databaseUrl });

const prisma = global.prisma || new PrismaClient({ adapter });

if (process.env.NODE_ENV !== 'production') global.prisma = prisma;

// Repository methods that need to participate in a multi-repository transaction (e.g.
// order creation touching both Order and Product stock) accept this instead of the
// singleton client, so the service can pass the same `tx` from `prisma.$transaction`.
export type PrismaClientOrTx = PrismaClient | Prisma.TransactionClient;

export default prisma;
