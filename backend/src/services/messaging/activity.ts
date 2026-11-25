import prisma, { PrismaClientOrTx } from '../../lib/prisma';
import { maskWhatsappNumber } from '../../utils/phone';
import logger from '../../logger';

// Phase 32 C4 (PHASE32_TODO.md §18 C4): WhatsApp outcomes in the ORDER's Activity
// history — queued / sent / delivered / read / failed / skipped / unknown, with the
// reason. Each entry is written only on a real status change: every caller records it
// after a write that only one worker / webhook can win (guarded claim writes, the
// unique eventKey insert, the monotonic applyProviderStatus), so repeated webhooks or
// retries never add duplicate entries. Retry waits and pauses are not logged here
// (they're visible on the order's WhatsApp card) to keep the history readable.

export type MessageEvent = 'queued' | 'sent' | 'delivered' | 'read' | 'failed' | 'skipped' | 'unknown' | 'resent';

const TYPE_LABEL: Record<string, string> = {
  ORDER_CONFIRMATION: 'order confirmation',
  ORDER_DISPATCHED: 'dispatch notification',
};

const EVENT_LABEL: Record<MessageEvent, string> = {
  queued: 'queued',
  sent: 'sent',
  delivered: 'delivered',
  read: 'read by the customer',
  failed: 'failed',
  skipped: 'not sent',
  unknown: 'status unknown (an Admin will check)',
  resent: 'resent',
};

export function messageActivityAction(type: string, event: MessageEvent): string {
  return `WhatsApp ${TYPE_LABEL[type] ?? 'message'} ${EVENT_LABEL[event]}`;
}

export async function recordMessageActivity(
  input: {
    orderId: number | null;
    type: string;
    event: MessageEvent;
    /** Reason / detail (e.g. skip reason, Meta error) — shown as the new value. */
    detail?: string | null;
    toPhone?: string | null;
    createdById?: number | null;
  },
  client: PrismaClientOrTx = prisma
): Promise<void> {
  if (!input.orderId) return;
  const to = input.toPhone ? `to ${maskWhatsappNumber(input.toPhone)}` : null;
  const newValue = [to, input.detail].filter(Boolean).join(' — ').slice(0, 500) || null;
  try {
    await client.orderActivity.create({
      data: {
        orderId: input.orderId,
        action: messageActivityAction(input.type, input.event),
        newValue,
        createdById: input.createdById ?? null,
      },
    });
  } catch (err) {
    // History is informational: never let it break sending or order operations.
    logger.error('[whatsapp] could not record order activity:', err instanceof Error ? err.message : err);
  }
}

/** Activity for a message whose row we only know by id (worker / webhook paths). */
export async function recordActivityForMessage(
  messageId: number,
  event: MessageEvent,
  detail?: string | null,
  client: PrismaClientOrTx = prisma
): Promise<void> {
  const m = await client.outboundMessage.findUnique({ where: { id: messageId }, select: { orderId: true, type: true, toPhone: true } });
  if (!m) return;
  await recordMessageActivity({ orderId: m.orderId, type: m.type, event, detail, toPhone: m.toPhone }, client);
}
