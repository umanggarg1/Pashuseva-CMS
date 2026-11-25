import { createHash, randomUUID } from 'node:crypto';
import prisma from '../../lib/prisma';
import config from '../../config';
import { HttpError, NotFoundError } from '../../utils/httpError';
import { maskWhatsappNumber, toWhatsappNumber } from '../../utils/phone';
import { auditLogRepository } from '../../repositories/auditLog.repository';
import { loadOrderMessageSnapshot } from './snapshot';
import { buildConfirmationParams, buildDispatchParams } from './templates/builders';
import { getTemplate, metaTemplateName, renderTemplate } from './templates/definitions';
import { recordMessageActivity } from './activity';
import { kickOrderMessages } from './dispatcher';
import type { MessageTypeParam } from '../../schemas/messaging.schema';

// Phase 32 C6 (PHASE32_TODO.md §13, §19.7): an order's message history, the resend
// preview and the manual resend.
//
// Resend rules:
//   - a resend is ALWAYS a NEW record (eventKey RESEND:<uuid>, resendOfId → the latest
//     message of that type); the original records and their history are never changed;
//   - it goes to the customer's CURRENT WhatsApp number (no number picker, §19.7),
//     with consent, number, go-live, order state re-checked now — and again by the
//     worker right before sending;
//   - preview = what is sent: the confirm request carries the previewHash; if anything
//     changed since the preview (payment, items, number, language), nothing is sent
//     and the new preview is returned (409);
//   - blocked while a message of that type is in progress, while an UNKNOWN one is
//     unresolved, within 2 minutes of the last one (cooldown), and above 10 resends in
//     10 minutes per user; a double-click (same Idempotency-Key) returns the same record;
//   - two simultaneous resends for one order+type are serialized (advisory lock), so at
//     most one is created.

const DB_TYPE = { confirmation: 'ORDER_CONFIRMATION', dispatched: 'ORDER_DISPATCHED' } as const;
const REASON_TEXT: Record<string, string> = {
  NOT_RECEIVED: "Customer didn't receive it",
  NUMBER_CHANGED: 'WhatsApp number changed',
  CUSTOMER_ASKED: 'Customer asked again',
  OTHER: 'Other',
};
const DISPATCHED_STATES = ['DISPATCHED', 'IN_TRANSIT', 'OUT_FOR_DELIVERY', 'DELIVERED'];
const COOLDOWN_MS = 2 * 60_000;
const USER_LIMIT = 10;
const USER_WINDOW_MS = 10 * 60_000;

type ActingUser = { id: number; name?: string | null };

// ── history ─────────────────────────────────────────────────────────────────

export async function listOrderMessages(orderId: number, opts: { includeAdminNotes: boolean }) {
  const rows = await prisma.outboundMessage.findMany({
    where: { orderId },
    orderBy: { id: 'asc' },
    include: { triggeredBy: { select: { id: true, name: true } }, resolvedBy: { select: { id: true, name: true } } },
  });
  return rows.map((m) => ({
    id: m.id,
    type: m.type === 'ORDER_CONFIRMATION' ? 'confirmation' : 'dispatched',
    status: m.status,
    isResend: m.eventKey.startsWith('RESEND:'),
    resendOfId: m.resendOfId,
    resendReason: m.resendReason,
    to: m.toPhone ? maskWhatsappNumber(m.toPhone) : null,
    language: m.language,
    fallbackFromLanguage: m.fallbackFromLanguage,
    templateName: m.templateName,
    skipReason: m.skipReason,
    errorCode: m.errorCode,
    lastError: m.lastError,
    attempts: m.attempts,
    nextAttemptAt: m.status === 'RETRY_WAIT' ? m.nextAttemptAt : null,
    createdAt: m.createdAt,
    sentAt: m.sentAt,
    deliveredAt: m.deliveredAt,
    readAt: m.readAt,
    failedAt: m.failedAt,
    triggeredBy: m.triggeredBy,
    resolvedBy: m.resolvedBy,
    needsAttention: m.status === 'UNKNOWN' && !m.resolvedById,
    ...(opts.includeAdminNotes ? { lateResponseNote: m.lateResponseNote } : {}),
  }));
}

// ── preview ─────────────────────────────────────────────────────────────────

export interface ResendPreview {
  type: MessageTypeParam;
  to: string | null;
  language: 'EN' | 'HI';
  templateName: string | null;
  header: string | null;
  body: string | null;
  footer: string | null;
  previewHash: string | null;
  /** Why a resend isn't possible right now (null = allowed). */
  blockedReason: string | null;
  previous: { id: number; status: string; at: Date } | null;
  /** The previous message already reached the customer — warn before resending. */
  alreadyReceived: boolean;
}

interface Built {
  preview: ResendPreview;
  toPhone: string | null;
  toPhoneId: number | null;
  params: string[] | null;
  snapshot: unknown;
  customerId: number;
}

function hashPreview(toPhone: string, templateName: string, language: string, params: string[]): string {
  return createHash('sha256').update(JSON.stringify([toPhone, templateName, language, params])).digest('hex');
}

async function buildPreview(orderId: number, type: MessageTypeParam, opts: { skipUnknownCheck?: boolean } = {}): Promise<Built> {
  const dbType = DB_TYPE[type];
  const order = await prisma.order.findFirst({
    where: { id: orderId, deletedAt: null, purgedAt: null },
    select: { id: true, createdAt: true, orderStatus: true, deliveryStatus: true, customerId: true },
  });
  if (!order) throw new NotFoundError('Order not found');
  const customer = await prisma.customer.findUnique({
    where: { id: order.customerId },
    select: {
      whatsappConsent: true, preferredLanguage: true, deletedAt: true, purgedAt: true,
      phones: { where: { isWhatsapp: true }, select: { id: true, phone: true } },
    },
  });
  const history = await prisma.outboundMessage.findMany({ where: { orderId, type: dbType }, orderBy: { id: 'desc' } });
  const last = history[0] ?? null;
  const state = await prisma.messagingState.findUnique({ where: { id: 1 }, select: { goLiveAt: true } });

  const phone = customer?.phones[0] ?? null;
  const toPhone = phone ? toWhatsappNumber(phone.phone) : null;
  const language: 'EN' | 'HI' = customer?.preferredLanguage === 'HI' ? 'HI' : 'EN';

  let blockedReason: string | null = null;
  if (!config.whatsapp.enabled) blockedReason = 'WhatsApp sending is turned off';
  else if (!state?.goLiveAt || order.createdAt < state.goLiveAt) blockedReason = 'This order was created before WhatsApp go-live — no WhatsApp messages for it';
  else if (order.orderStatus === 'CANCELLED') blockedReason = 'The order is cancelled';
  else if (type === 'dispatched' && !DISPATCHED_STATES.includes(order.deliveryStatus)) blockedReason = 'The order has not been dispatched';
  else if (!customer || customer.deletedAt || customer.purgedAt) blockedReason = 'The customer is in Trash';
  else if (customer.whatsappConsent !== 'YES') blockedReason = 'The customer has not agreed to WhatsApp messages (consent NO)';
  else if (!toPhone) blockedReason = 'The customer has no valid WhatsApp number — set one in Customer Details first';
  else if (history.some((m) => ['QUEUED', 'PROCESSING', 'RETRY_WAIT'].includes(m.status))) blockedReason = 'A message of this type is already being sent for this order';
  else if (!opts.skipUnknownCheck && history.some((m) => m.status === 'UNKNOWN' && !m.resolvedById)) blockedReason = 'An earlier message has an unknown status — an Admin must resolve it first';
  else if (last && Date.now() - last.createdAt.getTime() < COOLDOWN_MS) {
    blockedReason = `Please wait ${Math.ceil((COOLDOWN_MS - (Date.now() - last.createdAt.getTime())) / 1000)} seconds before resending`;
  }

  let params: string[] | null = null;
  let snapshot: unknown = null;
  let header = null, body = null, footer = null, templateName: string | null = null, previewHash: string | null = null;
  const snap = await loadOrderMessageSnapshot(prisma, orderId);
  if (snap && toPhone) {
    const built = type === 'confirmation' ? buildConfirmationParams(snap.confirmation, language) : buildDispatchParams(snap.dispatch, language);
    params = built.params;
    snapshot = type === 'confirmation' ? snap.confirmation : snap.dispatch;
    templateName = metaTemplateName(type === 'confirmation' ? config.whatsapp.templates.confirmation : config.whatsapp.templates.dispatched, built.size);
    const r = renderTemplate(getTemplate(type === 'confirmation' ? 'confirmation' : 'dispatched', language, built.size), params);
    header = r.header; body = r.body; footer = r.footer;
    previewHash = hashPreview(toPhone, templateName, language, params);
  }

  return {
    preview: {
      type,
      to: toPhone ? maskWhatsappNumber(toPhone) : null,
      language,
      templateName,
      header, body, footer,
      previewHash,
      blockedReason,
      previous: last ? { id: last.id, status: last.status, at: last.createdAt } : null,
      alreadyReceived: history.some((m) => m.status === 'DELIVERED' || m.status === 'READ'),
    },
    toPhone,
    toPhoneId: phone?.id ?? null,
    params,
    snapshot,
    customerId: order.customerId,
  };
}

export async function previewResend(orderId: number, type: MessageTypeParam): Promise<ResendPreview> {
  return (await buildPreview(orderId, type)).preview;
}

// ── resend ──────────────────────────────────────────────────────────────────

export interface ResendResult {
  messageId: number;
  status: string;
  replay: boolean;
}

/** Shared by the Resend dialog and the Admin "mark failed and resend" action. */
export async function createResend(
  orderId: number,
  input: { type: MessageTypeParam; reasonText: string; previewHash?: string; requestKey?: string; resendOfId?: number },
  actingUser: ActingUser,
  opts: { skipUnknownCheck?: boolean; skipCooldown?: boolean } = {}
): Promise<ResendResult> {
  if (input.requestKey) {
    const prior = await prisma.outboundMessage.findUnique({ where: { requestKey: input.requestKey }, select: { id: true, status: true, orderId: true } });
    if (prior) {
      if (prior.orderId !== orderId) throw new HttpError(422, 'This request key was already used for another order');
      return { messageId: prior.id, status: prior.status, replay: true };
    }
  }
  const recent = await prisma.outboundMessage.count({
    where: { triggeredById: actingUser.id, eventKey: { startsWith: 'RESEND:' }, createdAt: { gt: new Date(Date.now() - USER_WINDOW_MS) } },
  });
  if (recent >= USER_LIMIT) throw new HttpError(429, `Too many resends — at most ${USER_LIMIT} in 10 minutes. Please try again later.`);

  const dbType = DB_TYPE[input.type];
  let created: { id: number; status: string };
  try {
    created = await prisma.$transaction(async (tx) => {
      // One resend at a time per order + type: concurrent requests wait here and then
      // see the record the first one created (→ "already being sent").
      await tx.$executeRawUnsafe(`SELECT pg_advisory_xact_lock(hashtext($1))`, `resend:${orderId}:${dbType}`);
      const b = await buildPreview(orderId, input.type, { skipUnknownCheck: opts.skipUnknownCheck });
      const blocked = opts.skipCooldown && b.preview.blockedReason?.startsWith('Please wait') ? null : b.preview.blockedReason;
      if (blocked) throw new HttpError(409, blocked);
      if (input.previewHash !== undefined && input.previewHash !== b.preview.previewHash) {
        throw new HttpError(409, 'The message changed since the preview — please check the new preview and confirm again', { code: 'PREVIEW_CHANGED', preview: b.preview });
      }
      const previous = await tx.outboundMessage.findFirst({ where: { orderId, type: dbType }, orderBy: { id: 'desc' }, select: { id: true } });
      const row = await tx.outboundMessage.create({
        data: {
          eventKey: `RESEND:${randomUUID()}`,
          type: dbType,
          orderId,
          customerId: b.customerId,
          resendOfId: input.resendOfId ?? previous?.id ?? null,
          resendReason: input.reasonText.slice(0, 300),
          requestKey: input.requestKey ?? null,
          toPhone: b.toPhone,
          toPhoneId: b.toPhoneId,
          language: b.preview.language,
          templateName: b.preview.templateName,
          params: b.params ?? undefined,
          snapshot: JSON.parse(JSON.stringify(b.snapshot)),
          status: 'QUEUED',
          expiresAt: new Date(Date.now() + 24 * 3600_000),
          nextAttemptAt: new Date(Date.now() - 60_000),
          triggeredById: actingUser.id,
        },
        select: { id: true, status: true },
      });
      await recordMessageActivity({
        orderId, type: dbType, event: 'resent', toPhone: b.toPhone,
        detail: `by ${actingUser.name ?? `user #${actingUser.id}`}: ${input.reasonText}`.slice(0, 300),
        createdById: actingUser.id,
      }, tx);
      return row;
    }, { timeout: 15000 });
  } catch (err) {
    // Same Idempotency-Key at the same moment → return the record the first one made.
    if (input.requestKey && (err as { code?: string })?.code === 'P2002') {
      const prior = await prisma.outboundMessage.findUnique({ where: { requestKey: input.requestKey }, select: { id: true, status: true } });
      if (prior) return { messageId: prior.id, status: prior.status, replay: true };
    }
    throw err;
  }
  await auditLogRepository.create({
    userId: actingUser.id,
    action: 'WhatsApp message resent',
    meta: { orderId, messageId: created.id, type: input.type, reason: input.reasonText },
  });
  kickOrderMessages(orderId);
  return { messageId: created.id, status: created.status, replay: false };
}

export function resendReasonText(reason: string, note?: string): string {
  return reason === 'OTHER' ? `Other: ${note ?? ''}`.trim() : (REASON_TEXT[reason] ?? reason) + (note ? ` — ${note}` : '');
}
