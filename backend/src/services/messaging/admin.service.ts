import prisma from '../../lib/prisma';
import config from '../../config';
import { HttpError, NotFoundError } from '../../utils/httpError';
import { maskWhatsappNumber } from '../../utils/phone';
import { auditLogRepository } from '../../repositories/auditLog.repository';
import { createWhatsAppProvider } from './providers';
import { getMessagingState, resumeSending } from './messagingState';
import { refreshTemplateStatuses } from './dispatcher';
import { recordActivityForMessage } from './activity';
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
      include: { order: { select: { orderNumber: true } }, customer: { select: { name: true } }, resolvedBy: { select: { id: true, name: true } } },
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
      createdAt: m.createdAt,
      resolvedBy: m.resolvedBy,
      lateResponseNote: m.lateResponseNote,
    })),
  };
}

/** UNKNOWN → an Admin decides (§9.5). Nothing is ever resent without this decision. */
export async function resolveUnknown(id: number, action: 'mark-sent' | 'mark-failed-and-resend', note: string | undefined, admin: ActingUser) {
  const m = await prisma.outboundMessage.findUnique({ where: { id } });
  if (!m) throw new NotFoundError('Message not found');
  if (m.status !== 'UNKNOWN' || m.resolvedById) throw new HttpError(409, 'Only an unresolved message with an UNKNOWN status can be resolved');

  if (action === 'mark-sent') {
    const r = await prisma.outboundMessage.updateMany({
      where: { id, status: 'UNKNOWN', resolvedById: null },
      data: { status: 'SENT', sentAt: m.sentAt ?? new Date(), resolvedById: admin.id, lastError: note ? `Marked as sent by Admin: ${note}` : 'Marked as sent by Admin' },
    });
    if (r.count !== 1) throw new HttpError(409, 'This message was changed at the same time — reload and try again');
    await recordActivityForMessage(id, 'sent', `marked as sent by ${admin.name ?? 'Admin'}${note ? `: ${note}` : ''}`);
    await auditLogRepository.create({ userId: admin.id, action: 'WhatsApp UNKNOWN message marked as sent', meta: { messageId: id, orderId: m.orderId, note: note ?? null } });
    return { messageId: id, status: 'SENT', resend: null };
  }

  const r = await prisma.outboundMessage.updateMany({
    where: { id, status: 'UNKNOWN', resolvedById: null },
    data: { status: 'FAILED', failedAt: new Date(), resolvedById: admin.id, lastError: note ? `Marked as failed by Admin: ${note}` : 'Marked as failed by Admin' },
  });
  if (r.count !== 1) throw new HttpError(409, 'This message was changed at the same time — reload and try again');
  await recordActivityForMessage(id, 'failed', `marked as failed by ${admin.name ?? 'Admin'}${note ? `: ${note}` : ''}`);
  await auditLogRepository.create({ userId: admin.id, action: 'WhatsApp UNKNOWN message marked as failed', meta: { messageId: id, orderId: m.orderId, note: note ?? null } });
  if (!m.orderId) return { messageId: id, status: 'FAILED', resend: null };
  // The resend gets every normal check (consent, number, go-live, order state).
  const resend = await createResend(
    m.orderId,
    { type: m.type === 'ORDER_CONFIRMATION' ? 'confirmation' : 'dispatched', reasonText: `Admin resolved unknown message #${id}`, resendOfId: id },
    admin,
    { skipUnknownCheck: true, skipCooldown: true }
  );
  return { messageId: id, status: 'FAILED', resend };
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
