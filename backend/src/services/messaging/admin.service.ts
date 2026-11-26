import prisma from '../../lib/prisma';
import config from '../../config';
import { HttpError, NotFoundError } from '../../utils/httpError';
import { maskWhatsappNumber } from '../../utils/phone';
import { auditLogRepository } from '../../repositories/auditLog.repository';
import { createWhatsAppProvider } from './providers';
import { getMessagingState, resumeSending } from './messagingState';
import { refreshTemplateStatuses } from './dispatcher';
import { recordMessageActivity } from './activity';
import { createResend } from './resend.service';

// Phase 32 C6 (PHASE32_TODO.md §9.5, §11, §14): the Admin Messaging page actions —
// status overview, "needs attention" list, resolving UNKNOWN messages, resuming a
// paused sender, refreshing template statuses. Route-gated on message:manage
// (Admin-only by default); every action is written to the audit log.

type ActingUser = { id: number; name?: string | null };

export async function messagingStatus() {
  const state = await getMessagingState();
  const provider = createWhatsAppProvider(config.whatsapp, config.nodeEnv);
  const counts = await prisma.outboundMessage.groupBy({ by: ['status'], _count: { _all: true } });
  const oldest = await prisma.outboundMessage.findFirst({ where: { status: { in: ['QUEUED', 'RETRY_WAIT'] } }, orderBy: { createdAt: 'asc' }, select: { createdAt: true } });
  const needsAttention = await prisma.outboundMessage.count({ where: { OR: [{ status: 'UNKNOWN', resolvedById: null }, { lateResponseNote: { not: null } }] } });
  const templates = await prisma.messageTemplateStatus.findMany({ orderBy: [{ name: 'asc' }, { language: 'asc' }] });
  return {
    enabled: config.whatsapp.enabled,
    provider: provider.provider.name,
    sendsRealMessages: provider.provider.sendsRealMessages,
    providerReason: provider.reason,
    paused: state?.pausedAt ? { at: state.pausedAt, reason: state.pauseReason, by: state.pausedBy } : null,
    rateLimitedUntil: state?.rateLimitedUntil && state.rateLimitedUntil > new Date() ? state.rateLimitedUntil : null,
    goLiveAt: state?.goLiveAt ?? null,
    counts: Object.fromEntries(counts.map((c) => [c.status, c._count._all])),
    oldestWaitingSince: oldest?.createdAt ?? null,
    needsAttention,
    templates,
  };
}

export async function listMessages(q: { status?: string; needsAttention?: boolean; page: number; pageSize: number }) {
  const where = q.needsAttention
    ? { OR: [{ status: 'UNKNOWN' as const, resolvedById: null }, { status: 'FAILED' as const }, { lateResponseNote: { not: null } }] }
    : q.status ? { status: q.status as never } : {};
  const [rows, total] = await Promise.all([
    prisma.outboundMessage.findMany({
      where,
      orderBy: { id: 'desc' },
      skip: (q.page - 1) * q.pageSize,
      take: q.pageSize,
      include: { order: { select: { orderNumber: true } }, customer: { select: { name: true } }, resolvedBy: { select: { id: true, name: true } }, _count: { select: { statusEvents: true } } },
    }),
    prisma.outboundMessage.count({ where }),
  ]);
  return {
    total,
    data: rows.map((m) => ({
      id: m.id,
      orderId: m.orderId,
      orderNumber: m.order?.orderNumber ?? null,
      customerName: m.customer.name,
      type: m.type === 'ORDER_CONFIRMATION' ? 'confirmation' : 'dispatched',
      status: m.status,
      to: m.toPhone ? maskWhatsappNumber(m.toPhone) : null,
      errorCode: m.errorCode,
      lastError: m.lastError,
      skipReason: m.skipReason,
      attempts: m.attempts,
      maxAttempts: m.maxAttempts,
      createdAt: m.createdAt,
      // Phase 32 D6: what the Admin needs before deciding on an UNKNOWN.
      sendStartedAt: m.sendStartedAt,
      lastAttemptAt: m.lastAttemptAt,
      sentAt: m.sentAt,
      acknowledgedByWhatsapp: m.providerMessageId !== null,
      statusReports: m._count.statusEvents,
      resolvedBy: m.resolvedBy,
      resolvedAt: m.resolvedAt,
      resolutionNote: m.resolutionNote,
      lateResponseNote: m.lateResponseNote,
    })),
  };
}

/**
 * UNKNOWN → an Admin decides (§9.5). Nothing is ever resent without this decision.
 *
 * Phase 32 D6 data-integrity rules:
 *  - the decision is explicit (mark-sent / mark-failed-and-resend), never inferred;
 *  - a reason is mandatory and stored in resolutionNote, the time in resolvedAt;
 *  - the original lastError, errorCode, sentAt and failedAt are NEVER changed (no
 *    send or failure time is invented — resolvedAt is the decision time);
 *  - status UNKNOWN → SENT / FAILED (so it leaves Needs attention), resolvedById =
 *    the Admin; the status change, order history entry and audit log entry are
 *    written in ONE transaction;
 *  - concurrency: the update only matches a row that is still UNKNOWN and
 *    unresolved, so of two Admins resolving at once exactly one wins; the other
 *    gets 409 and nothing of theirs is written.
 */
export async function resolveUnknown(id: number, action: 'mark-sent' | 'mark-failed-and-resend', reason: string, admin: ActingUser) {
  const m = await prisma.outboundMessage.findUnique({ where: { id } });
  if (!m) throw new NotFoundError('Message not found');
  if (m.resolvedById) throw new HttpError(409, 'This message was already resolved by another Admin — reload to see their decision');
  if (m.status !== 'UNKNOWN') throw new HttpError(409, `Only an unresolved UNKNOWN message can be resolved (this one is now ${m.status}) — reload the list`);

  const markSent = action === 'mark-sent';
  const resolvedAt = new Date();
  // req.user carries no name, so look it up for the history text (the entry also
  // stores createdById).
  const adminName = admin.name ?? (await prisma.user.findUnique({ where: { id: admin.id }, select: { name: true } }))?.name ?? `user #${admin.id}`;
  await prisma.$transaction(async (tx) => {
    const r = await tx.outboundMessage.updateMany({
      where: { id, status: 'UNKNOWN', resolvedById: null },
      data: { status: markSent ? 'SENT' : 'FAILED', resolvedById: admin.id, resolvedAt, resolutionNote: reason },
    });
    if (r.count !== 1) throw new HttpError(409, 'This message was resolved or changed at the same time — reload and try again');
    await recordMessageActivity(
      { orderId: m.orderId, type: m.type, event: markSent ? 'marked-sent' : 'marked-failed', toPhone: m.toPhone, detail: `by ${adminName}: ${reason}`, createdById: admin.id },
      tx
    );
    await tx.auditLog.create({
      data: {
        userId: admin.id,
        action: markSent ? 'WhatsApp UNKNOWN message marked as sent' : 'WhatsApp UNKNOWN message marked as failed',
        meta: { messageId: id, orderId: m.orderId, decision: action, previousStatus: 'UNKNOWN', reason, resolvedAt: resolvedAt.toISOString() },
      },
    });
  });

  if (markSent) return { messageId: id, status: 'SENT', resend: null, resendBlockedReason: null };
  if (!m.orderId) return { messageId: id, status: 'FAILED', resend: null, resendBlockedReason: null };
  // The resend is a SEPARATE new message and gets every normal check (consent,
  // number, go-live, order state). If one blocks it, the resolution still stands and
  // the Admin is told why no resend was queued.
  try {
    const resend = await createResend(
      m.orderId,
      { type: m.type === 'ORDER_CONFIRMATION' ? 'confirmation' : 'dispatched', reasonText: `Admin resolved unknown message #${id}: ${reason}`, resendOfId: id },
      admin,
      { skipUnknownCheck: true, skipCooldown: true }
    );
    return { messageId: id, status: 'FAILED', resend, resendBlockedReason: null };
  } catch (err) {
    if (err instanceof HttpError) return { messageId: id, status: 'FAILED', resend: null, resendBlockedReason: err.message };
    throw err;
  }
}

export async function resume(admin: ActingUser) {
  const resumed = await resumeSending();
  await auditLogRepository.create({ userId: admin.id, action: 'WhatsApp sending resumed', meta: { wasPaused: resumed } });
  return { resumed };
}

export async function refreshTemplates(admin: ActingUser) {
  const updated = await refreshTemplateStatuses();
  await auditLogRepository.create({ userId: admin.id, action: 'WhatsApp template statuses refreshed', meta: { updated } });
  return { updated };
}
