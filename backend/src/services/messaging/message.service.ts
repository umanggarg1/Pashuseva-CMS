import type { Prisma } from '../../generated/prisma/client';
import type { MessageLanguage, MessageType } from '../../generated/prisma/enums';
import config from '../../config';
import logger from '../../logger';
import { toWhatsappNumber } from '../../utils/phone';
import { loadOrderMessageSnapshot } from './snapshot';
import { buildConfirmationParams, buildDispatchParams } from './templates/builders';
import { metaTemplateName } from './templates/definitions';

// Phase 32 B7 (PHASE32_TODO.md §6, §7, §7.1, §10): create the WhatsApp message record
// for an order event — INSIDE the caller's transaction (order creation / reorder /
// the genuine Not Dispatched → Dispatched transition), so the record exists only if
// the order change commits.
//
// One logical event = one record: eventKey is UNIQUE (ORDER_CREATED:<id> /
// ORDER_DISPATCHED:<id>) and the insert skips duplicates, so double submissions,
// concurrent dispatches and Admin re-dispatches can never create a second record.
//
// Every event gets a record, either QUEUED (to be sent by the dispatcher, B8 — not
// built yet, so nothing is sent) or SKIPPED with the reason, checked in this order:
//   1. WhatsApp disabled
//   2. Order created before WhatsApp go-live (Q16 — also protects every existing order)
//   3. No WhatsApp consent (consent must be YES)
//   4. No valid WhatsApp number (no phone flagged WhatsApp, or it isn't a valid mobile)
//
// SAFETY: a messaging failure must never block or roll back the order. The work runs
// inside a SAVEPOINT; any error (a bug, a database error) rolls back only the message
// part, is logged, and the order transaction continues normally.

export const SKIP_REASONS = {
  DISABLED: 'WhatsApp disabled',
  BEFORE_GO_LIVE: 'Order created before WhatsApp go-live',
  NO_CONSENT: 'No WhatsApp consent',
  NO_NUMBER: 'No valid WhatsApp number',
} as const;

const EXPIRY_HOURS: Record<MessageType, number> = {
  ORDER_CONFIRMATION: 24,
  ORDER_DISPATCHED: 72,
};

export function eventKeyFor(type: MessageType, orderId: number): string {
  return type === 'ORDER_CONFIRMATION' ? `ORDER_CREATED:${orderId}` : `ORDER_DISPATCHED:${orderId}`;
}

export interface EnqueueResult {
  /** QUEUED / SKIPPED for a record that now exists; ERROR if it couldn't be written. */
  status: 'QUEUED' | 'SKIPPED' | 'ERROR';
  skipReason?: string;
  messageId?: number;
  /** false when a record for this event already existed (duplicate / re-dispatch). */
  created: boolean;
}

interface Decision {
  status: 'QUEUED' | 'SKIPPED';
  skipReason?: string;
  toPhone?: string;
  toPhoneId?: number;
  language: MessageLanguage;
}

async function decide(
  tx: Prisma.TransactionClient,
  orderCreatedAt: Date,
  customerId: number
): Promise<Decision> {
  const customer = await tx.customer.findUnique({
    where: { id: customerId },
    select: {
      preferredLanguage: true,
      whatsappConsent: true,
      phones: { where: { isWhatsapp: true }, select: { id: true, phone: true } },
    },
  });
  const language: MessageLanguage = customer?.preferredLanguage ?? 'EN';
  if (!config.whatsapp.enabled) return { status: 'SKIPPED', skipReason: SKIP_REASONS.DISABLED, language };

  const state = await tx.messagingState.findUnique({ where: { id: 1 }, select: { goLiveAt: true } });
  if (!state?.goLiveAt || orderCreatedAt < state.goLiveAt) {
    return { status: 'SKIPPED', skipReason: SKIP_REASONS.BEFORE_GO_LIVE, language };
  }
  if (customer?.whatsappConsent !== 'YES') return { status: 'SKIPPED', skipReason: SKIP_REASONS.NO_CONSENT, language };

  const phone = customer.phones[0];
  const toPhone = phone ? toWhatsappNumber(phone.phone) : null;
  if (!phone || !toPhone) return { status: 'SKIPPED', skipReason: SKIP_REASONS.NO_NUMBER, language };

  return { status: 'QUEUED', toPhone, toPhoneId: phone.id, language };
}

async function writeRecord(
  tx: Prisma.TransactionClient,
  type: MessageType,
  orderId: number,
  actingUserId: number | undefined
): Promise<EnqueueResult> {
  const eventKey = eventKeyFor(type, orderId);
  const existing = await tx.outboundMessage.findUnique({ where: { eventKey }, select: { id: true, status: true, skipReason: true } });
  if (existing) {
    return { status: existing.status === 'SKIPPED' ? 'SKIPPED' : 'QUEUED', skipReason: existing.skipReason ?? undefined, messageId: existing.id, created: false };
  }

  const snap = await loadOrderMessageSnapshot(tx, orderId);
  if (!snap) throw new Error(`order ${orderId} not found while creating its WhatsApp record`);
  const d = await decide(tx, snap.orderCreatedAt, snap.customerId);

  let templateName: string | null = null;
  let params: string[] | null = null;
  let snapshot: Prisma.InputJsonValue | undefined;
  if (d.status === 'QUEUED') {
    const lang = d.language === 'HI' ? 'HI' : 'EN';
    const built = type === 'ORDER_CONFIRMATION'
      ? buildConfirmationParams(snap.confirmation, lang)
      : buildDispatchParams(snap.dispatch, lang);
    const base = type === 'ORDER_CONFIRMATION' ? config.whatsapp.templates.confirmation : config.whatsapp.templates.dispatched;
    templateName = metaTemplateName(base, built.size);
    params = built.params;
    snapshot = JSON.parse(JSON.stringify(type === 'ORDER_CONFIRMATION' ? snap.confirmation : snap.dispatch)) as Prisma.InputJsonValue;
  }

  const now = new Date();
  // skipDuplicates = INSERT … ON CONFLICT DO NOTHING on the unique eventKey: if a
  // concurrent request created it first, this inserts nothing and we read theirs.
  const { count } = await tx.outboundMessage.createMany({
    data: [{
      eventKey,
      type,
      orderId,
      customerId: snap.customerId,
      language: d.language,
      status: d.status,
      skipReason: d.skipReason ?? null,
      toPhone: d.toPhone ?? null,
      toPhoneId: d.toPhoneId ?? null,
      templateName,
      ...(params ? { params } : {}),
      ...(snapshot !== undefined ? { snapshot } : {}),
      expiresAt: new Date(now.getTime() + EXPIRY_HOURS[type] * 3600_000),
      triggeredById: actingUserId ?? null,
    }],
    skipDuplicates: true,
  });
  const row = await tx.outboundMessage.findUnique({ where: { eventKey }, select: { id: true, status: true, skipReason: true } });
  if (!row) throw new Error(`WhatsApp record ${eventKey} missing after insert`);
  return {
    status: row.status === 'SKIPPED' ? 'SKIPPED' : 'QUEUED',
    skipReason: row.skipReason ?? undefined,
    messageId: row.id,
    created: count === 1,
  };
}

/**
 * Create the message record for an order event inside `tx`. Never throws: on any
 * failure only the message part is rolled back (savepoint) and { status: 'ERROR' }
 * is returned, so the surrounding order transaction always carries on.
 */
export async function enqueueOrderMessage(
  tx: Prisma.TransactionClient,
  input: { type: MessageType; orderId: number; actingUserId?: number }
): Promise<EnqueueResult> {
  await tx.$executeRawUnsafe('SAVEPOINT phase32_message');
  try {
    const result = await writeRecord(tx, input.type, input.orderId, input.actingUserId);
    await tx.$executeRawUnsafe('RELEASE SAVEPOINT phase32_message');
    return result;
  } catch (err) {
    await tx.$executeRawUnsafe('ROLLBACK TO SAVEPOINT phase32_message');
    await tx.$executeRawUnsafe('RELEASE SAVEPOINT phase32_message');
    logger.error(`[whatsapp] could not create ${input.type} record for order ${input.orderId} — order continues without it:`, err instanceof Error ? err.message : err);
    return { status: 'ERROR', created: false };
  }
}
