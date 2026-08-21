import { z } from 'zod';

const envSchema = z.object({
  DATABASE_URL: z.string(),
  PORT: z.string().optional(),
  // Required, not optional — a missing JWT_SECRET used to silently fall back to the
  // literal string 'replace_me' (also what .env.example ships), which meant anyone
  // who knew that default could forge a valid session cookie for any user, including
  // Admin. Failing to start is the safe behavior here, the same way a missing
  // DATABASE_URL already fails to start rather than silently using some fallback.
  JWT_SECRET: z
    .string()
    .min(32, 'JWT_SECRET must be at least 32 characters — generate one, do not hand-type it')
    .refine((v) => v !== 'replace_me', 'JWT_SECRET is still the placeholder value from .env.example'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  CORS_ORIGIN: z.string().optional(),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('Invalid environment variables:', parsed.error.format());
  process.exit(1);
}

export const config = {
  databaseUrl: parsed.data.DATABASE_URL,
  port: Number(parsed.data.PORT || 4000),
  jwtSecret: parsed.data.JWT_SECRET,
  nodeEnv: parsed.data.NODE_ENV,
  corsOrigin: parsed.data.CORS_ORIGIN || 'http://localhost:5173',
};

export default config;
