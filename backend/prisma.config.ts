import 'dotenv/config';
import { defineConfig, env } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'ts-node prisma/seed.ts',
  },
  // Prisma 7: this URL is used only by the Prisma CLI (migrate deploy / status …);
  // the running app connects through src/config.ts + the pg adapter with the pooled
  // DATABASE_URL. Phase 29: migrations go over Neon's *direct* (non-pooled)
  // connection when DIRECT_URL is set — Prisma's migration advisory lock is
  // session-level and unreliable through a pooler (a production deploy once failed
  // with P1002 on it). Without DIRECT_URL, behaviour is unchanged.
  datasource: {
    url: process.env.DIRECT_URL ? env('DIRECT_URL') : env('DATABASE_URL'),
  },
});
