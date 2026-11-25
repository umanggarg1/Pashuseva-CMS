import { createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import prisma from '../../lib/prisma';
import logger from '../../logger';
import { toWhatsappNumber, maskWhatsappNumber } from '../../utils/phone';
import { consentLabel, CONSENT_CHANGED_ACTIVITY } from '../../utils/whatsappConsent';
import { applyProviderStatus, ProviderStatus } from './applyStatus';
import { recordActivityForMessage } from './activity';

// Phase 32 C7 (PHASE32_TODO.md §12, Q8): processing Meta's webhook.
//   - The signature (X-Hub-Signature-256 = HMAC-SHA256 of the RAW body with the app
//     secret) is verified before anything is read; invalid → nothing is processed.
//   - Status reports (sent / delivered / read / failed) only ever UPDATE the original
//     message, through the monotonic applyProviderStatus — they never create an
//     outbound message and never move a status backwards. Each report is stored once
//     (unique providerMessageId + status) in the same transaction as its update, so a
//     repeated webhook is a no-op and a crash half-way leaves nothing half-applied
//     (Meta retries on non-2xx).
//   - An inbound "STOP" / "रोकें" / "बंद" reply sets the customer's consent to NO
//     (source CUSTOMER_STOP_REPLY) and, in the SAME transaction, stops every message
//     of that customer still waiting to be sent. The worker additionally re-checks
//     consent atomically right before each send, so a message already picked up by
//     a worker is stopped too.

export function verifySignature(rawBody: Buffer, header: string | undefined, appSecret: string): boolean {
  if (!header || !header.startsWith('sha256=')) return false;
  const given = Buffer.from(header.slice('sha256='.length), 'hex');
  const expected = createHmac('sha256', appSecret).update(rawBody).digest();
  return given.length === expected.length && timingSafeEqual(given, expected);
}

const statusSchema = z.object({
  id: z.string().min(1),
  status: z.string(),
  timestamp: z.union([z.string(), z.number()]).optional(),
  recipient_id: z.string().optional(),
  biz_opaque_callback_data: z.string().optional(),
  errors: z.array(z.object({
    code: z.number().optional(),
    title: z.string().optional(),
    message: z.string().optional(),
    error_data: z.object({ details: z.string().optional() }).passthrough().optional(),
  }).passthrough()).optional(),
}).passthrough();

const inboundSchema = z.object({
  from: z.string(),
  id: z.string().optional(),
  type: z.string().optional(),
  text: z.object({ body: z.string() }).passthrough().optional(),
}).passthrough();

export const webhookPayloadSchema = z.object({
  object: z.string().optional(),
  entry: z.array(z.object({
    changes: z.array(z.object({
      field: z.string().optional(),
      value: z.object({
        statuses: z.array(statusSchema).optional(),
        messages: z.array(inboundSchema).optional(),
      }).passthrough(),
    }).passthrough()),
  }).passthrough()),
}).passthrough();

const STATUS_MAP: Record<string, ProviderStatus> = { sent: 'SENT', delivered: 'DELIVERED', read: 'READ', failed: 'FAILED' };
// STOP keywords (Q8). Compared after trimming and removing trailing punctuation;
// the Latin keyword case-insensitively.
const STOP_WORDS = new Set(['STOP', 'रोकें', 'बंद']);
export const STOP_SKIP_REASON = 'Customer replied STOP';

export function isStopReply(text: string | undefined): boolean {
  if (!text) return false;
  const t = text.normalize('NFC').trim().replace(/[.!।\s]+$/u, '').trim();
  return STOP_WORDS.has(t.toUpperCase()) || STOP_WORDS.has(t);
}

export interface WebhookResult { statuses: number; applied: number; duplicates: number; stops: number }

export async function processWebhook(payload: z.infer<typeof webhookPayloadSchema>): Promise<WebhookResult> {
  const result: WebhookResult = { statuses: 0, applied: 0, duplicates: 0, stops: 0 };
  for (const entry of payload.entry) {
    for (const change of entry.changes) {
      for (const s of change.value.statuses ?? []) {
        const mapped = STATUS_MAP[s.status];
        if (!mapped) continue; // e.g. "played" (voice notes) — not ours
        result.statuses++;
        const at = s.timestamp ? new Date(Number(s.timestamp) * 1000) : new Date();
        const err = s.errors?.[0];
        await prisma.$transaction(async (tx) => {
          const ins = await tx.messageStatusEvent.createMany({
            data: [{
              providerMessageId: s.id,
              status: s.status,
              providerTimestamp: Number.isNaN(at.getTime()) ? new Date() : at,
              errorCode: err?.code !== undefined ? String(err.code) : null,
              raw: JSON.parse(JSON.stringify(s)),
            }],
            skipDuplicates: true,
          });
          if (ins.count === 0) { result.duplicates++; return; } // repeated webhook → no-op
          const r = await applyProviderStatus({
            providerMessageId: s.id,
            status: mapped,
            at: Number.isNaN(at.getTime()) ? new Date() : at,
            callbackData: s.biz_opaque_callback_data ?? null,
            errorCode: err?.code !== undefined ? String(err.code) : null,
            errorMessage: (err?.error_data?.details ?? err?.message ?? err?.title ?? null)?.slice(0, 300) ?? null,
          }, tx);
          if (r.messageId) {
            await tx.messageStatusEvent.updateMany({ where: { providerMessageId: s.id, status: s.status }, data: { messageId: r.messageId } });
          } else {
            logger.warn(`[whatsapp:webhook] status ${s.status} for an unknown message id — stored, nothing updated`);
          }
          if (r.applied) result.applied++;
        });
      }
      for (const msg of change.value.messages ?? []) {
        const text = msg.text?.body;
        if (msg.type && msg.type !== 'text') continue;
        if (!isStopReply(text)) continue; // other replies are ignored this phase
        result.stops += await applyStopReply(msg.from);
      }
    }
  }
  return result;
}

/** Consent → NO for every customer whose WhatsApp number is `from`; stop their waiting messages. */
export async function applyStopReply(from: string): Promise<number> {
  const number = toWhatsappNumber(from);
  if (!number) return 0;
  const last10 = number.slice(2);
  const candidates = await prisma.$queryRawUnsafe<{ id: number; phone: string; customerId: number }[]>(
    `SELECT p.id, p.phone, p."customerId" FROM "CustomerPhone" p
       JOIN "Customer" c ON c.id = p."customerId"
     WHERE p."isWhatsapp" = true AND c."purgedAt" IS NULL AND right(regexp_replace(p.phone, '[^0-9]', '', 'g'), 10) = $1`,
    last10
  );
  const customerIds = [...new Set(candidates.filter((p) => toWhatsappNumber(p.phone) === number).map((p) => p.customerId))];
  let changed = 0;
  for (const customerId of customerIds) {
    const stopped = await prisma.$transaction(async (tx) => {
      const upd = await tx.customer.updateMany({
        where: { id: customerId, whatsappConsent: 'YES' },
        data: { whatsappConsent: 'NO', whatsappConsentAt: new Date(), whatsappConsentById: null, whatsappConsentSource: 'CUSTOMER_STOP_REPLY' },
      });
      // Stop everything still waiting for this customer, whether or not consent was
      // already NO (it is now NO either way).
      const skipped = await tx.$queryRawUnsafe<{ id: number }[]>(
        `UPDATE "OutboundMessage" SET status = 'SKIPPED', "skipReason" = $2, "updatedAt" = now()
         WHERE "customerId" = $1 AND status IN ('QUEUED', 'RETRY_WAIT') RETURNING id`,
        customerId, STOP_SKIP_REASON
      );
      if (upd.count === 1) {
        await tx.customerActivity.create({
          data: {
            customerId,
            activity: CONSENT_CHANGED_ACTIVITY,
            createdById: null,
            metadata: { from: consentLabel('YES'), to: consentLabel('NO'), source: 'CUSTOMER_STOP_REPLY', by: 'customer (replied STOP)' },
          },
        });
      }
      for (const m of skipped) await recordActivityForMessage(m.id, 'skipped', STOP_SKIP_REASON, tx);
      return upd.count;
    });
    if (stopped) logger.info(`[whatsapp:webhook] STOP from ${maskWhatsappNumber(number)} → consent NO for customer ${customerId}`);
    changed += stopped;
  }
  return changed;
}
