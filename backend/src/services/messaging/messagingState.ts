import prisma from '../../lib/prisma';
import logger from '../../logger';

// Phase 32 B10 (PHASE32_TODO.md §11, §19.4): the global switches every worker instance
// shares, all in the single MessagingState row (id = 1):
//   - circuit breaker: a CONFIGURATION error (token, account, payment…) pauses ALL
//     sending — set atomically, so when several workers hit it together only ONE
//     pauses and only ONE notification goes to the Admins; queued messages are kept;
//     an Admin resumes after fixing it;
//   - shared rate-limit back-off after a Meta 429 (rateLimitedUntil);
//   - goLiveAt (Q16, §7.1), set once.
// Template-specific problems pause only that template (MessageTemplateStatus).

async function ensureRow(): Promise<void> {
  await prisma.$executeRawUnsafe(
    `INSERT INTO "MessagingState" (id, "updatedAt") VALUES (1, now()) ON CONFLICT (id) DO NOTHING`
  );
}

export async function getMessagingState() {
  return prisma.messagingState.findUnique({ where: { id: 1 } });
}

/** True when sending is paused (circuit breaker) or inside a rate-limit back-off. */
export async function sendingBlocked(): Promise<{ blocked: boolean; reason?: string }> {
  const s = await getMessagingState();
  if (s?.pausedAt) return { blocked: true, reason: `paused: ${s.pauseReason ?? ''}` };
  if (s?.rateLimitedUntil && s.rateLimitedUntil > new Date()) return { blocked: true, reason: 'rate limited' };
  return { blocked: false };
}

/** Pause all sending. Atomic: returns true only for the caller that actually paused it. */
export async function pauseSending(reason: string, by = 'system'): Promise<boolean> {
  await ensureRow();
  const n = await prisma.$executeRawUnsafe(
    `UPDATE "MessagingState" SET "pausedAt" = now(), "pauseReason" = $1, "pausedBy" = $2, "updatedAt" = now()
     WHERE id = 1 AND "pausedAt" IS NULL`,
    reason.slice(0, 500), by
  );
  if (n === 1) {
    logger.warn(`[whatsapp] sending PAUSED: ${reason}`);
    await notifyAdmins('WhatsApp sending paused', `Sending was paused automatically: ${reason}. Queued messages are kept. Fix the problem, then resume sending on the Messaging page.`);
  }
  return n === 1;
}

/** Resume sending (Admin action — wired to the Messaging page in C6/D6). */
export async function resumeSending(): Promise<boolean> {
  await ensureRow();
  const n = await prisma.$executeRawUnsafe(
    `UPDATE "MessagingState" SET "pausedAt" = NULL, "pauseReason" = NULL, "pausedBy" = NULL, "updatedAt" = now() WHERE id = 1 AND "pausedAt" IS NOT NULL`
  );
  return n === 1;
}

/** Shared back-off: never shortens an existing one. */
export async function setRateLimitedFor(seconds: number): Promise<void> {
  await ensureRow();
  await prisma.$executeRawUnsafe(
    `UPDATE "MessagingState" SET "rateLimitedUntil" = GREATEST(COALESCE("rateLimitedUntil", now()), now() + make_interval(secs => $1)), "updatedAt" = now() WHERE id = 1`,
    Math.max(1, Math.min(seconds, 3600))
  );
}

/** Q16 / §7.1: set go-live ONCE (never moved afterwards). Returns true if set now. */
export async function setGoLiveOnce(): Promise<boolean> {
  await ensureRow();
  const n = await prisma.$executeRawUnsafe(
    `UPDATE "MessagingState" SET "goLiveAt" = now(), "updatedAt" = now() WHERE id = 1 AND "goLiveAt" IS NULL`
  );
  return n === 1;
}

/** Template status cache (§4.4). Returns true if the status changed. */
export async function setTemplateStatus(name: string, language: string, status: string): Promise<boolean> {
  const before = await prisma.messageTemplateStatus.findUnique({ where: { name_language: { name, language } } });
  await prisma.messageTemplateStatus.upsert({
    where: { name_language: { name, language } },
    create: { name, language, status, checkedAt: new Date() },
    update: { status, checkedAt: new Date() },
  });
  return before?.status !== status;
}

/** null = unknown (not cached) → treated as usable; Meta's own error at send time wins. */
export async function getTemplateStatus(name: string, language: string): Promise<string | null> {
  const row = await prisma.messageTemplateStatus.findUnique({ where: { name_language: { name, language } } });
  return row?.status ?? null;
}

/**
 * In-app notification to every active Admin. De-duplicated: the same title is not
 * repeated within `withinMinutes` (default 60), across all worker instances.
 */
export async function notifyAdmins(title: string, body: string, withinMinutes = 60): Promise<number> {
  const recent = await prisma.notification.findFirst({
    where: { title, createdAt: { gt: new Date(Date.now() - withinMinutes * 60_000) } },
    select: { id: true },
  });
  if (recent) return 0;
  const admins = await prisma.user.findMany({ where: { role: 'ADMIN', status: 'ACTIVE', deletedAt: null }, select: { id: true } });
  if (admins.length === 0) return 0;
  await prisma.notification.createMany({ data: admins.map((a) => ({ userId: a.id, title, body })) });
  return admins.length;
}
