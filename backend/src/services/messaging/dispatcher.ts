import os from 'node:os';
import type { Prisma } from '../../generated/prisma/client';
import prisma from '../../lib/prisma';
import config from '../../config';
import logger from '../../logger';
import { toWhatsappNumber, maskWhatsappNumber } from '../../utils/phone';
import { createWhatsAppProvider } from './providers';
import type { SendResult, WhatsAppProvider } from './providers/types';
import { SKIP_REASONS } from './message.service';
import { buildConfirmationParams, buildDispatchParams, ConfirmationSnapshot, DispatchSnapshot } from './templates/builders';
import { applyProviderStatus } from './applyStatus';
import {
  getTemplateStatus,
  notifyAdmins,
  pauseSending,
  sendingBlocked,
  setGoLiveOnce,
  setRateLimitedFor,
  setTemplateStatus,
} from './messagingState';

// Phase 32 B8 + B9 (PHASE32_TODO.md §9, §19.3, §19.4): the worker that sends QUEUED
// messages, and the background sweep. SAFETY RULES (all enforced below):
//   1. Atomic claim (UPDATE … FOR UPDATE SKIP LOCKED): two workers / instances can
//      never claim the same message. Each claim gets a new claimToken; EVERY later
//      write is conditioned on (id, PROCESSING, claimToken), so a stale worker can
//      never overwrite a newer state.
//   2. Write-ahead: sendStartedAt is committed BEFORE the Meta call. A worker that dies
//      after that point leaves a row the sweep turns into UNKNOWN — never re-queued,
//      so a crash can't cause a duplicate send. Before that point it's safe to retry.
//   3. Every attempt (first send, every retry) re-checks, fresh from the database:
//      consent YES, the recipient phone (still exists, same customer, still the
//      WhatsApp number, same normalized number), customer/order not in Trash, order
//      not cancelled / still dispatched, go-live, expiry, template approval.
//   4. Outcome handling: ACCEPTED → SENT; TEMPORARY → retry with backoff (max 5);
//      PERMANENT → FAILED, never retried; CONFIGURATION → message re-queued
//      untouched + sending paused (or only that template paused); AMBIGUOUS →
//      UNKNOWN, NEVER resent automatically.
//   5. WhatsApp OFF → nothing is claimed or sent; queued rows are left as they are.

export interface DispatcherDeps {
  provider?: WhatsAppProvider;
  /** Claim lease. Default 2 min. */
  leaseMs?: number;
  /** Don't start a Meta call with less than this much lease left. Default 60 s. */
  minLeaseLeftMs?: number;
}

const DEFAULT_LEASE_MS = 120_000;
const DEFAULT_MIN_LEASE_LEFT_MS = 60_000;
const BACKOFF_SECONDS = [60, 300, 900, 3600]; // after attempt 1, 2, 3, 4
const BATCH = 10;
const CONCURRENCY = 3;
const INSTANCE = `${os.hostname()}:${process.pid}`;

let defaultProvider: WhatsAppProvider | null = null;
let immediateSend = true;

/** Use a specific provider for the default worker (tests / tooling: the fake Meta server). */
export function setWhatsAppProvider(p: WhatsAppProvider | null): void {
  defaultProvider = p;
}
/** Turn the after-commit immediate send on/off (tests drive the worker step by step). */
export function setImmediateSendEnabled(enabled: boolean): void {
  immediateSend = enabled;
}

function providerFrom(deps: DispatcherDeps): WhatsAppProvider {
  if (deps.provider) return deps.provider;
  if (!defaultProvider) defaultProvider = createWhatsAppProvider(config.whatsapp, config.nodeEnv).provider;
  return defaultProvider;
}

interface Claimed {
  id: number;
  claimToken: string;
  lockedUntil: Date;
}

// ── claiming ────────────────────────────────────────────────────────────────

const CLAIM_SQL = (filter: string) => `
  UPDATE "OutboundMessage" m SET
    status = 'PROCESSING', "lockedAt" = now(), "lockedUntil" = now() + make_interval(secs => $1),
    "lockedBy" = $2, "claimToken" = gen_random_uuid()::text, "sendStartedAt" = NULL,
    attempts = attempts + 1, "lastAttemptAt" = now(), "updatedAt" = now()
  WHERE m.id IN (
    SELECT c.id FROM "OutboundMessage" c
    WHERE c.status IN ('QUEUED', 'RETRY_WAIT') AND c."nextAttemptAt" <= now() ${filter}
      -- §7: a dispatch message waits (max 10 min) while its order's confirmation is still pending
      AND NOT (c.type = 'ORDER_DISPATCHED' AND EXISTS (
        SELECT 1 FROM "OutboundMessage" k
        WHERE k."orderId" = c."orderId" AND k.type = 'ORDER_CONFIRMATION'
          AND k.status IN ('QUEUED', 'PROCESSING', 'RETRY_WAIT') AND k."createdAt" > now() - interval '10 minutes'))
    ORDER BY c."nextAttemptAt", c.id
    LIMIT $3
    FOR UPDATE SKIP LOCKED)
  RETURNING m.id, m."claimToken", m."lockedUntil"`;

export async function claimDue(limit = BATCH, leaseMs = DEFAULT_LEASE_MS): Promise<Claimed[]> {
  return prisma.$queryRawUnsafe<Claimed[]>(CLAIM_SQL(''), leaseMs / 1000, INSTANCE, limit);
}

export async function claimById(id: number, leaseMs = DEFAULT_LEASE_MS): Promise<Claimed | null> {
  const rows = await prisma.$queryRawUnsafe<Claimed[]>(CLAIM_SQL('AND c.id = $4'), leaseMs / 1000, INSTANCE, 1, id);
  return rows[0] ?? null;
}

// ── guarded writes (only while THIS worker still holds the claim) ────────────

async function guarded(c: Claimed, data: Prisma.OutboundMessageUpdateManyMutationInput): Promise<boolean> {
  const r = await prisma.outboundMessage.updateMany({ where: { id: c.id, status: 'PROCESSING', claimToken: c.claimToken }, data });
  return r.count === 1;
}
const unlock = { claimToken: null, lockedUntil: null, lockedBy: null } as const;

/** Give the claim back without counting the attempt (paused, disabled, lease too short…). */
async function release(c: Claimed): Promise<boolean> {
  return guarded(c, { status: 'QUEUED', attempts: { decrement: 1 }, sendStartedAt: null, ...unlock });
}
async function skip(c: Claimed, reason: string): Promise<'SKIPPED'> {
  await guarded(c, { status: 'SKIPPED', skipReason: reason, ...unlock });
  return 'SKIPPED';
}

// ── pre-send checks (fresh from the database, every attempt) ────────────────

const DISPATCHED_STATES = ['DISPATCHED', 'IN_TRANSIT', 'OUT_FOR_DELIVERY', 'DELIVERED'];

type Msg = NonNullable<Awaited<ReturnType<typeof loadMessage>>>;
function loadMessage(id: number) {
  return prisma.outboundMessage.findUnique({ where: { id } });
}

async function eligibility(m: Msg): Promise<string | null> {
  const customer = await prisma.customer.findUnique({
    where: { id: m.customerId },
    select: { whatsappConsent: true, deletedAt: true, purgedAt: true },
  });
  if (!customer || customer.deletedAt || customer.purgedAt) return SKIP_REASONS.CUSTOMER_TRASHED;
  // Consent is re-read here, immediately before every Meta call (mandatory rule).
  if (customer.whatsappConsent !== 'YES') return SKIP_REASONS.NO_CONSENT;

  const phone = m.toPhoneId ? await prisma.customerPhone.findUnique({ where: { id: m.toPhoneId } }) : null;
  if (!phone || phone.customerId !== m.customerId || !phone.isWhatsapp || !m.toPhone || toWhatsappNumber(phone.phone) !== m.toPhone) {
    return SKIP_REASONS.RECIPIENT_CHANGED;
  }

  if (m.orderId) {
    const order = await prisma.order.findUnique({
      where: { id: m.orderId },
      select: { deletedAt: true, purgedAt: true, orderStatus: true, deliveryStatus: true, createdAt: true },
    });
    if (!order || order.deletedAt || order.purgedAt) return SKIP_REASONS.ORDER_TRASHED;
    const state = await prisma.messagingState.findUnique({ where: { id: 1 }, select: { goLiveAt: true } });
    if (!state?.goLiveAt || order.createdAt < state.goLiveAt) return SKIP_REASONS.BEFORE_GO_LIVE;
    if (order.orderStatus === 'CANCELLED') return SKIP_REASONS.ORDER_CANCELLED;
    if (m.type === 'ORDER_DISPATCHED' && !DISPATCHED_STATES.includes(order.deliveryStatus)) return SKIP_REASONS.NOT_DISPATCHED;
  }
  return null;
}

const langCode = (l: string) => (l === 'HI' ? 'hi' : 'en');
const usable = (status: string | null) => status === null || status === 'APPROVED';

/**
 * §4.4 / Q6: if the customer's (Hindi) template isn't approved, fall back to English —
 * the params are rebuilt in English from the stored snapshot (same order data).
 * Returns the (possibly updated) message, or a skip reason.
 */
async function resolveTemplate(c: Claimed, m: Msg): Promise<Msg | { skip: string }> {
  if (!m.templateName) return { skip: SKIP_REASONS.TEMPLATE_NOT_APPROVED };
  if (usable(await getTemplateStatus(m.templateName, langCode(m.language)))) return m;
  if (m.language === 'HI' && usable(await getTemplateStatus(m.templateName, 'en')) && m.snapshot) {
    const built = m.type === 'ORDER_CONFIRMATION'
      ? buildConfirmationParams(m.snapshot as unknown as ConfirmationSnapshot, 'EN')
      : buildDispatchParams(m.snapshot as unknown as DispatchSnapshot, 'EN');
    const ok = await guarded(c, { language: 'EN', fallbackFromLanguage: 'HI', params: built.params });
    if (!ok) return { skip: '__lost_claim__' };
    return { ...m, language: 'EN', fallbackFromLanguage: 'HI', params: built.params };
  }
  await notifyAdmins('WhatsApp template not approved', `Template "${m.templateName}" (${langCode(m.language)}) is not approved, so messages using it are skipped. Check WhatsApp Manager.`);
  return { skip: SKIP_REASONS.TEMPLATE_NOT_APPROVED };
}

// ── processing one claimed message ──────────────────────────────────────────

export type ProcessOutcome =
  | 'SENT' | 'RETRY_WAIT' | 'FAILED' | 'UNKNOWN' | 'SKIPPED' | 'REQUEUED' | 'RELEASED' | 'LOST_CLAIM';

export async function processClaimed(c: Claimed, deps: DispatcherDeps = {}): Promise<ProcessOutcome> {
  let sendStarted = false;
  try {
    if (!config.whatsapp.enabled || (await sendingBlocked()).blocked) {
      return (await release(c)) ? 'RELEASED' : 'LOST_CLAIM';
    }
    const m0 = await loadMessage(c.id);
    if (!m0 || m0.claimToken !== c.claimToken || m0.status !== 'PROCESSING') return 'LOST_CLAIM';

    if (m0.expiresAt < new Date()) {
      await guarded(c, { status: 'FAILED', failedAt: new Date(), lastError: 'Expired before it could be sent', errorKind: 'PERMANENT', ...unlock });
      return 'FAILED';
    }
    const reason = await eligibility(m0);
    if (reason) return skip(c, reason);

    const t = await resolveTemplate(c, m0);
    if ('skip' in t) return t.skip === '__lost_claim__' ? 'LOST_CLAIM' : skip(c, t.skip);
    const m = t;
    const params = m.params as unknown;
    if (!Array.isArray(params) || params.some((p) => typeof p !== 'string')) {
      throw new Error('stored params are missing or malformed');
    }

    // Lease guard: never start a Meta call that could outlive the claim.
    const minLeft = deps.minLeaseLeftMs ?? DEFAULT_MIN_LEASE_LEFT_MS;
    if (new Date(c.lockedUntil).getTime() - Date.now() < minLeft) {
      return (await release(c)) ? 'RELEASED' : 'LOST_CLAIM';
    }

    // Write-ahead: from here on, Meta MAY receive the message.
    if (!(await guarded(c, { sendStartedAt: new Date() }))) return 'LOST_CLAIM';
    sendStarted = true;

    const result = await providerFrom(deps).sendTemplate({
      to: m.toPhone!,
      templateName: m.templateName!,
      language: langCode(m.language) as 'en' | 'hi',
      bodyParams: params as string[],
      callbackData: m.eventKey,
    });
    return await handleResult(c, m, result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error(`[whatsapp] message ${c.id} processing error (${sendStarted ? 'after' : 'before'} send started): ${message}`);
    if (sendStarted) {
      // We can't know whether Meta got it → UNKNOWN, never resent automatically.
      await guarded(c, { status: 'UNKNOWN', errorKind: 'AMBIGUOUS', lastError: `internal error after send started: ${message}`.slice(0, 500), ...unlock });
      return 'UNKNOWN';
    }
    return retryOrFail(c, { kind: 'TEMPORARY', code: 'INTERNAL', message: `internal error before sending: ${message}` });
  }
}

async function retryOrFail(c: Claimed, e: { kind: 'TEMPORARY'; code: string; message: string; retryAfterSeconds?: number }): Promise<ProcessOutcome> {
  const row = await prisma.outboundMessage.findUnique({ where: { id: c.id }, select: { attempts: true, maxAttempts: true } });
  const attempts = row?.attempts ?? 1;
  if (attempts >= (row?.maxAttempts ?? 5)) {
    await guarded(c, { status: 'FAILED', failedAt: new Date(), errorKind: 'TEMPORARY', errorCode: e.code, lastError: `Retries exhausted: ${e.message}`.slice(0, 500), sendStartedAt: null, ...unlock });
    return 'FAILED';
  }
  const backoff = BACKOFF_SECONDS[Math.min(attempts - 1, BACKOFF_SECONDS.length - 1)];
  const wait = Math.max(backoff, e.retryAfterSeconds ?? 0);
  await guarded(c, {
    status: 'RETRY_WAIT', nextAttemptAt: new Date(Date.now() + wait * 1000), errorKind: 'TEMPORARY',
    errorCode: e.code, lastError: e.message.slice(0, 500), sendStartedAt: null, ...unlock,
  });
  return 'RETRY_WAIT';
}

async function handleResult(c: Claimed, m: Msg, r: SendResult): Promise<ProcessOutcome> {
  if (r.outcome === 'ACCEPTED') {
    const ok = await guarded(c, { status: 'SENT', providerMessageId: r.providerMessageId, sentAt: new Date(), errorKind: null, lastError: null, ...unlock });
    if (ok) {
      logger.info(`[whatsapp] message ${c.id} SENT to ${maskWhatsappNumber(m.toPhone)} (${m.templateName}/${langCode(m.language)}) id=${r.providerMessageId}`);
      return 'SENT';
    }
    return lateAcceptance(c.id, r.providerMessageId);
  }
  if (r.outcome === 'AMBIGUOUS') {
    await guarded(c, { status: 'UNKNOWN', errorKind: 'AMBIGUOUS', errorCode: r.code, lastError: r.message.slice(0, 500), ...unlock });
    return 'UNKNOWN';
  }
  // REJECTED: Meta definitely did not accept it.
  if (r.kind === 'PERMANENT') {
    await guarded(c, { status: 'FAILED', failedAt: new Date(), errorKind: 'PERMANENT', errorCode: r.code, lastError: r.message.slice(0, 500), sendStartedAt: null, ...unlock });
    return 'FAILED';
  }
  if (r.kind === 'TEMPORARY') {
    if (r.rateLimited) await setRateLimitedFor(r.retryAfterSeconds ?? 60);
    return retryOrFail(c, { kind: 'TEMPORARY', code: r.code, message: r.message, retryAfterSeconds: r.retryAfterSeconds });
  }
  // CONFIGURATION: re-queue untouched (attempt not counted) and pause.
  await guarded(c, { status: 'QUEUED', attempts: { decrement: 1 }, sendStartedAt: null, errorKind: 'CONFIGURATION', errorCode: r.code, lastError: r.message.slice(0, 500), ...unlock });
  if (r.templateScoped && m.templateName) {
    if (await setTemplateStatus(m.templateName, langCode(m.language), 'PAUSED')) {
      await notifyAdmins(`WhatsApp template ${m.templateName} (${langCode(m.language)}) unavailable`, `Meta rejected the template: ${r.message}. Messages using it wait or fall back to English; refresh template statuses after fixing it in WhatsApp Manager.`);
    }
  } else {
    await pauseSending(`${r.code}: ${r.message}`.slice(0, 500));
  }
  return 'REQUEUED';
}

/**
 * §19.3: Meta accepted the message but this worker had lost its claim (the sweep
 * marked it UNKNOWN after the lease expired, a webhook reconciled it, or an Admin
 * resolved it). Never overwrite: attach the wamid only to a still-unresolved UNKNOWN
 * row with no wamid; otherwise just record a note for the Admin.
 */
async function lateAcceptance(id: number, wamid: string): Promise<ProcessOutcome> {
  const attached = await prisma.outboundMessage.updateMany({
    where: { id, status: 'UNKNOWN', providerMessageId: null, resolvedById: null },
    data: { status: 'SENT', providerMessageId: wamid, sentAt: new Date(), lastError: null, errorKind: null },
  });
  if (attached.count === 1) return 'SENT';
  const row = await prisma.outboundMessage.findUnique({ where: { id }, select: { providerMessageId: true } });
  if (row?.providerMessageId !== wamid) {
    await prisma.outboundMessage.update({
      where: { id },
      data: { lateResponseNote: `Meta accepted this message (${wamid}) at ${new Date().toISOString()} after the worker lost its claim; a resend may have duplicated it.` },
    });
    await notifyAdmins('WhatsApp message possibly sent twice', `Message #${id}: Meta accepted it after it had already been resolved. Check the Messaging page.`, 5);
  }
  return 'LOST_CLAIM';
}

// ── B9: background sweep ────────────────────────────────────────────────────

/** Expired locks: send started → UNKNOWN (never re-queued); not started → retry (counted). */
export async function recoverExpiredLocks(): Promise<{ unknown: number; requeued: number; failed: number }> {
  const unknown = await prisma.$executeRawUnsafe(
    `UPDATE "OutboundMessage" SET status = 'UNKNOWN', "errorKind" = 'AMBIGUOUS',
       "lastError" = 'Worker stopped after the send started; Meta may have accepted it', "claimToken" = NULL, "lockedUntil" = NULL, "lockedBy" = NULL, "updatedAt" = now()
     WHERE status = 'PROCESSING' AND "lockedUntil" < now() AND "sendStartedAt" IS NOT NULL`
  );
  const failed = await prisma.$executeRawUnsafe(
    `UPDATE "OutboundMessage" SET status = 'FAILED', "failedAt" = now(), "errorKind" = 'TEMPORARY',
       "lastError" = 'Retries exhausted: worker stopped before sending', "claimToken" = NULL, "lockedUntil" = NULL, "lockedBy" = NULL, "updatedAt" = now()
     WHERE status = 'PROCESSING' AND "lockedUntil" < now() AND "sendStartedAt" IS NULL AND attempts >= "maxAttempts"`
  );
  const requeued = await prisma.$executeRawUnsafe(
    `UPDATE "OutboundMessage" SET status = 'RETRY_WAIT', "nextAttemptAt" = now(),
       "lastError" = 'Worker stopped before sending; retrying', "claimToken" = NULL, "lockedUntil" = NULL, "lockedBy" = NULL, "updatedAt" = now()
     WHERE status = 'PROCESSING' AND "lockedUntil" < now() AND "sendStartedAt" IS NULL`
  );
  return { unknown, requeued, failed };
}

/** QUEUED / RETRY_WAIT past expiresAt → FAILED "Expired" (never sent stale). */
export async function expireStale(): Promise<number> {
  return prisma.$executeRawUnsafe(
    `UPDATE "OutboundMessage" SET status = 'FAILED', "failedAt" = now(), "errorKind" = 'PERMANENT', "lastError" = 'Expired before it could be sent', "updatedAt" = now()
     WHERE status IN ('QUEUED', 'RETRY_WAIT') AND "expiresAt" < now()`
  );
}

/** Oldest QUEUED waiting > 15 min while enabled and not paused → Admin alert (max hourly). */
export async function queueAgeAlert(): Promise<boolean> {
  const oldest = await prisma.outboundMessage.findFirst({ where: { status: { in: ['QUEUED', 'RETRY_WAIT'] } }, orderBy: { createdAt: 'asc' }, select: { createdAt: true } });
  if (!oldest || Date.now() - oldest.createdAt.getTime() < 15 * 60_000) return false;
  const n = await notifyAdmins('WhatsApp messages waiting', `The oldest WhatsApp message has been waiting since ${oldest.createdAt.toISOString()}. Check the Messaging page.`, 60);
  return n > 0;
}

/** B9: refresh the template approval cache from the provider (when it supports it). */
export async function refreshTemplateStatuses(deps: DispatcherDeps = {}): Promise<number> {
  const list = await providerFrom(deps).listTemplates?.();
  if (!list) return 0;
  const bases = [config.whatsapp.templates.confirmation, config.whatsapp.templates.dispatched];
  let n = 0;
  for (const t of list) {
    if (!bases.some((b) => new RegExp(`^${b}_[1-5]$`).test(t.name))) continue;
    await setTemplateStatus(t.name, t.language, t.status);
    n++;
  }
  return n;
}

async function runPool<T>(items: T[], worker: (t: T) => Promise<unknown>, concurrency = CONCURRENCY) {
  const queue = [...items];
  await Promise.allSettled(Array.from({ length: Math.min(concurrency, queue.length) }, async () => {
    while (queue.length) {
      const item = queue.shift()!;
      try { await worker(item); } catch (err) { logger.error('[whatsapp] worker error', err); }
    }
  }));
}

let lastTemplateRefresh = 0;
/** One sweep tick. Never throws. */
export async function runSweepOnce(deps: DispatcherDeps = {}): Promise<{ claimed: number }> {
  try {
    if (!config.whatsapp.enabled) return { claimed: 0 };
    await recoverExpiredLocks();
    await expireStale();
    await queueAgeAlert();
    if (Date.now() - lastTemplateRefresh > 6 * 3600_000) {
      lastTemplateRefresh = Date.now();
      await refreshTemplateStatuses(deps);
    }
    if ((await sendingBlocked()).blocked) return { claimed: 0 };
    const claimed = await claimDue(BATCH, deps.leaseMs);
    await runPool(claimed, (c) => track(processClaimed(c, deps)));
    return { claimed: claimed.length };
  } catch (err) {
    logger.error('[whatsapp] sweep failed (will retry next tick):', err instanceof Error ? err.message : err);
    return { claimed: 0 };
  }
}

// ── immediate send after an order commits + lifecycle ──────────────────────

const inFlight = new Set<Promise<unknown>>();
function track<T>(p: Promise<T>): Promise<T> {
  inFlight.add(p);
  p.finally(() => inFlight.delete(p)).catch(() => {});
  return p;
}
let stopping = false;

/** Fire-and-forget: try to send the order's QUEUED messages right away (after commit). */
export function kickOrderMessages(orderId: number, deps: DispatcherDeps = {}): void {
  if (!config.whatsapp.enabled || stopping || !immediateSend) return;
  setImmediate(() => {
    track((async () => {
      const rows = await prisma.outboundMessage.findMany({ where: { orderId, status: 'QUEUED' }, select: { id: true } });
      for (const r of rows) {
        if ((await sendingBlocked()).blocked) return;
        const c = await claimById(r.id, deps.leaseMs);
        if (c) await processClaimed(c, deps);
      }
    })().catch((err) => logger.error('[whatsapp] immediate send failed (the sweep will retry):', err instanceof Error ? err.message : err)));
  });
}

let timer: NodeJS.Timeout | null = null;
let ticking = false;

/** Start the 30 s sweep (only when WhatsApp is enabled). Sets go-live once for a real provider. */
export async function startWhatsappWorker(deps: DispatcherDeps = {}): Promise<void> {
  if (!config.whatsapp.enabled || timer) return;
  const provider = providerFrom(deps);
  if (provider.sendsRealMessages && (await setGoLiveOnce())) logger.info('[whatsapp] go-live time recorded (orders created from now on are eligible)');
  logger.info(`[whatsapp] worker started (provider: ${provider.name}, instance ${INSTANCE})`);
  timer = setInterval(() => {
    if (ticking || stopping) return;
    ticking = true;
    track(runSweepOnce(deps)).finally(() => { ticking = false; });
  }, 30_000);
}

/** SIGTERM: stop claiming, let in-flight sends finish (max ~10 s). */
export async function stopWhatsappWorker(maxWaitMs = 10_000): Promise<void> {
  stopping = true;
  if (timer) clearInterval(timer);
  timer = null;
  await Promise.race([Promise.allSettled([...inFlight]), new Promise((r) => setTimeout(r, maxWaitMs))]);
}

export { applyProviderStatus };
