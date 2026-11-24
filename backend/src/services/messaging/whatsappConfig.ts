import { z } from 'zod';

// Phase 32 (PHASE32_TODO.md §15, B2/B11): WhatsApp settings, parsed from the
// environment. Pure — no process.exit, no logging — so it can be verified directly
// (providers/provider.verify.ts); src/config.ts calls it and refuses to start on
// invalid settings, the same way it already does for JWT_SECRET.
//
// SAFETY: real sending needs ALL of
//   WHATSAPP_ENABLED=true  +  WHATSAPP_PROVIDER=meta  +  the Meta credentials,
// and OUTSIDE production additionally WHATSAPP_ALLOW_NON_PRODUCTION_SEND=true (only
// for the deliberate Meta test-number check, E21). Every default is "off / dry-run".

const flag = z
  .string()
  .optional()
  .transform((v, ctx) => {
    if (v === undefined || v.trim() === '') return false;
    const s = v.trim().toLowerCase();
    if (s === 'true') return true;
    if (s === 'false') return false;
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'must be "true" or "false"' });
    return z.NEVER;
  });

const optionalText = z
  .string()
  .optional()
  .transform((v) => (v && v.trim() !== '' ? v.trim() : undefined));

// Meta template names: lowercase letters, digits and underscores (Meta docs).
const templateName = z
  .string()
  .regex(/^[a-z0-9_]{1,512}$/, 'template names are lowercase letters, digits and underscores');

export const whatsappEnvSchema = z
  .object({
    WHATSAPP_ENABLED: flag,
    WHATSAPP_PROVIDER: z.enum(['dryrun', 'meta']).default('dryrun'),
    WHATSAPP_ALLOW_NON_PRODUCTION_SEND: flag,
    // Graph API version. v21.0 expires 2027-01-21 per Meta's version table (checked
    // 2026-11-24); v26.0 was the latest listed. Re-check at E21 / before A4.
    WHATSAPP_API_VERSION: z
      .string()
      .regex(/^v\d+\.\d+$/, 'looks like v26.0')
      .default('v26.0'),
    WHATSAPP_PHONE_NUMBER_ID: optionalText,
    WHATSAPP_BUSINESS_ACCOUNT_ID: optionalText,
    WHATSAPP_ACCESS_TOKEN: optionalText,
    WHATSAPP_APP_SECRET: optionalText,
    WHATSAPP_WEBHOOK_VERIFY_TOKEN: optionalText,
    WHATSAPP_TEMPLATE_CONFIRMATION: templateName.default('ps_order_confirmation'),
    WHATSAPP_TEMPLATE_DISPATCHED: templateName.default('ps_order_dispatched'),
  })
  .superRefine((env, ctx) => {
    if (env.WHATSAPP_ENABLED && env.WHATSAPP_PROVIDER === 'meta') {
      for (const key of [
        'WHATSAPP_ACCESS_TOKEN',
        'WHATSAPP_PHONE_NUMBER_ID',
        'WHATSAPP_APP_SECRET',
        'WHATSAPP_WEBHOOK_VERIFY_TOKEN',
      ] as const) {
        if (!env[key]) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: [key],
            message: `${key} is required when WHATSAPP_ENABLED=true and WHATSAPP_PROVIDER=meta`,
          });
        }
      }
    }
  });

export interface WhatsappConfig {
  enabled: boolean;
  provider: 'dryrun' | 'meta';
  allowNonProductionSend: boolean;
  apiVersion: string;
  phoneNumberId?: string;
  businessAccountId?: string;
  accessToken?: string;
  appSecret?: string;
  webhookVerifyToken?: string;
  templates: { confirmation: string; dispatched: string };
}

export type WhatsappConfigResult =
  | { ok: true; config: WhatsappConfig }
  | { ok: false; errors: Record<string, string[]> };

export function parseWhatsappEnv(env: Record<string, string | undefined>): WhatsappConfigResult {
  const parsed = whatsappEnvSchema.safeParse(env);
  if (!parsed.success) {
    const errors: Record<string, string[]> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? 'WHATSAPP');
      (errors[key] ??= []).push(issue.message);
    }
    return { ok: false, errors };
  }
  const e = parsed.data;
  return {
    ok: true,
    config: {
      enabled: e.WHATSAPP_ENABLED,
      provider: e.WHATSAPP_PROVIDER,
      allowNonProductionSend: e.WHATSAPP_ALLOW_NON_PRODUCTION_SEND,
      apiVersion: e.WHATSAPP_API_VERSION,
      phoneNumberId: e.WHATSAPP_PHONE_NUMBER_ID,
      businessAccountId: e.WHATSAPP_BUSINESS_ACCOUNT_ID,
      accessToken: e.WHATSAPP_ACCESS_TOKEN,
      appSecret: e.WHATSAPP_APP_SECRET,
      webhookVerifyToken: e.WHATSAPP_WEBHOOK_VERIFY_TOKEN,
      templates: {
        confirmation: e.WHATSAPP_TEMPLATE_CONFIRMATION,
        dispatched: e.WHATSAPP_TEMPLATE_DISPATCHED,
      },
    },
  };
}
