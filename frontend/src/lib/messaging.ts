import type { QueryClient } from '@tanstack/react-query';

import { apiFetch } from '@/lib/api';

// Phase 32 D7: ONE place for the WhatsApp messaging types, API calls and React Query
// cache keys used by the Order Details messages card (D4), the Resend dialog (D5) and
// Settings → WhatsApp Messaging (D6).
//
// Security notes (checked by the D7 tests):
//  - Phone numbers only ever arrive MASKED from the server (`to: "98XXXX3210"`); the
//    types have no field for a full number.
//  - No WhatsApp credential (access token, app secret, verify token, phone-number id)
//    is ever returned by these endpoints; the status only says which provider is in
//    use and whether it sends real messages.
//  - Every call is authorised by the server (order:view / message:resend /
//    message:manage); the frontend hides what it can't use but never relies on that.

// ── types ──────────────────────────────────────────────────────────────────────

export type MessageType = 'confirmation' | 'dispatched';
export type MessageStatus =
  | 'QUEUED'
  | 'PROCESSING'
  | 'RETRY_WAIT'
  | 'SENT'
  | 'DELIVERED'
  | 'READ'
  | 'FAILED'
  | 'UNKNOWN'
  | 'SKIPPED';
export type MessageLanguage = 'EN' | 'HI';

interface StaffRef {
  id: number;
  name: string | null;
}

/** GET /orders/:id/messages: one message of an order (D4 card). */
export interface OrderMessage {
  id: number;
  type: MessageType;
  status: MessageStatus;
  isResend: boolean;
  resendOfId: number | null;
  resendReason: string | null;
  /** Masked by the server: 98XXXX3210. */
  to: string | null;
  language: MessageLanguage;
  fallbackFromLanguage: MessageLanguage | null;
  templateName: string | null;
  skipReason: string | null;
  errorCode: string | null;
  lastError: string | null;
  attempts: number;
  nextAttemptAt: string | null;
  createdAt: string;
  sentAt: string | null;
  deliveredAt: string | null;
  readAt: string | null;
  failedAt: string | null;
  triggeredBy: StaffRef | null;
  needsAttention: boolean;
  resolvedBy: StaffRef | null;
  resolvedAt: string | null;
  resolutionNote: string | null;
  /** Only sent to users with message:manage (never displayed on the order card). */
  lateResponseNote?: string | null;
}

/** GET /orders/:id/messages/preview?type=: what a resend would send now (D5). */
export interface ResendPreview {
  type: MessageType;
  to: string | null;
  language: MessageLanguage;
  templateName: string | null;
  header: string | null;
  body: string | null;
  footer: string | null;
  previewHash: string | null;
  blockedReason: string | null;
  previous: { id: number; status: MessageStatus; at: string; statusAt: string | null } | null;
  alreadyReceived: boolean;
  lastReceived: { id: number; status: 'READ' | 'DELIVERED'; at: string | null } | null;
}

export type ResendReason = 'NOT_RECEIVED' | 'NUMBER_CHANGED' | 'CUSTOMER_ASKED' | 'OTHER';
export interface ResendRequest {
  type: MessageType;
  reason: ResendReason;
  note?: string;
  previewHash: string;
}
export interface ResendResult {
  messageId: number;
  status: MessageStatus;
  replay: boolean;
}

/** GET /messaging/status (D6). */
export interface TemplateStatus {
  name: string;
  language: string;
  status: string;
  checkedAt: string;
}
export interface MessagingStatus {
  enabled: boolean;
  provider: string;
  sendsRealMessages: boolean;
  providerReason: string | null;
  paused: { at: string; reason: string | null; by: string | null } | null;
  rateLimitedUntil: string | null;
  goLiveAt: string | null;
  counts: Partial<Record<MessageStatus, number>>;
  oldestWaitingSince: string | null;
  needsAttention: number;
  templates: TemplateStatus[];
}

/** GET /messaging/messages?needsAttention=true: rows of the Needs attention list (D6). */
export interface AttentionMessage {
  id: number;
  orderId: number | null;
  orderNumber: string | null;
  customerName: string;
  type: MessageType;
  status: MessageStatus;
  to: string | null;
  errorCode: string | null;
  lastError: string | null;
  skipReason: string | null;
  attempts: number;
  maxAttempts: number;
  createdAt: string;
  sendStartedAt: string | null;
  lastAttemptAt: string | null;
  sentAt: string | null;
  acknowledgedByWhatsapp: boolean;
  statusReports: number;
  resolvedBy: StaffRef | null;
  resolvedAt: string | null;
  resolutionNote: string | null;
  lateResponseNote: string | null;
}
export interface Page<T> {
  total: number;
  data: T[];
}

// "mark-failed-and-resend" also needs message:resend (server-enforced; Admin bypasses).
export type ResolveDecision = 'mark-sent' | 'mark-failed' | 'mark-failed-and-resend';
export interface ResolveResult {
  messageId: number;
  status: 'SENT' | 'FAILED';
  resend: ResendResult | null;
  /** Mark-failed-and-resend whose resend the normal checks blocked: why. */
  resendBlockedReason: string | null;
}

// ── cache keys ─────────────────────────────────────────────────────────────────
// The order keys match OrderDetail's own (numeric id), so invalidation reaches them.

export const messagingKeys = {
  all: ['messaging'] as const,
  status: () => ['messaging', 'status'] as const,
  needsAttention: (page: number, pageSize: number) => ['messaging', 'needs-attention', page, pageSize] as const,
  needsAttentionAll: () => ['messaging', 'needs-attention'] as const,
  orderMessages: (orderId: number) => ['order', orderId, 'whatsapp-messages'] as const,
  orderActivity: (orderId: number) => ['order', orderId, 'activity'] as const,
};

// ── API client ─────────────────────────────────────────────────────────────────

export const messagingApi = {
  orderMessages: (orderId: number) => apiFetch<OrderMessage[]>(`/orders/${orderId}/messages`),
  resendPreview: (orderId: number, type: MessageType) =>
    apiFetch<ResendPreview>(`/orders/${orderId}/messages/preview?type=${type}`),
  resend: (orderId: number, body: ResendRequest, idempotencyKey: string) =>
    apiFetch<ResendResult>(`/orders/${orderId}/messages/resend`, {
      method: 'POST',
      headers: { 'Idempotency-Key': idempotencyKey },
      body: JSON.stringify(body),
    }),
  status: () => apiFetch<MessagingStatus>('/messaging/status'),
  needsAttention: (page: number, pageSize: number) =>
    apiFetch<Page<AttentionMessage>>(`/messaging/messages?needsAttention=true&page=${page}&pageSize=${pageSize}`),
  resolve: (messageId: number, decision: ResolveDecision, reason: string) =>
    apiFetch<ResolveResult>(`/messaging/messages/${messageId}/resolve`, {
      method: 'POST',
      body: JSON.stringify({ action: decision, reason: reason.trim() }),
    }),
  resume: () => apiFetch<{ resumed: boolean }>('/messaging/resume', { method: 'POST' }),
  refreshTemplates: () => apiFetch<{ updated: number }>('/messaging/templates/refresh', { method: 'POST' }),
};

// ── cache invalidation after each action ───────────────────────────────────────

/**
 * After Resume (sending state, queue figures) or a template refresh (the template
 * table): both live in the status. The Needs attention list doesn't change.
 */
export function invalidateAfterRefreshTemplatesOrResume(qc: QueryClient) {
  return qc.invalidateQueries({ queryKey: messagingKeys.status() });
}

/**
 * After a resolution: the status counts, every Needs attention page, and the
 * order's messages card + activity history (a resend may also have been queued).
 */
export function invalidateAfterResolve(qc: QueryClient, orderId: number | null) {
  const jobs = [qc.invalidateQueries({ queryKey: messagingKeys.all })];
  if (orderId !== null) {
    jobs.push(qc.invalidateQueries({ queryKey: messagingKeys.orderMessages(orderId) }));
    jobs.push(qc.invalidateQueries({ queryKey: messagingKeys.orderActivity(orderId) }));
  }
  return Promise.all(jobs);
}

/** After a resend: the order's messages card and activity history; the Admin queue figures. */
export function invalidateAfterResend(qc: QueryClient, orderId: number) {
  return Promise.all([
    qc.invalidateQueries({ queryKey: messagingKeys.orderMessages(orderId) }),
    qc.invalidateQueries({ queryKey: messagingKeys.orderActivity(orderId) }),
    qc.invalidateQueries({ queryKey: messagingKeys.status() }),
  ]);
}

// ── small derived values ───────────────────────────────────────────────────────

/** Statuses that can still change on their own → the order card refreshes every 10 s. */
export const ACTIVE_STATUSES: MessageStatus[] = ['QUEUED', 'PROCESSING', 'RETRY_WAIT', 'SENT'];
export const ORDER_MESSAGES_REFRESH_MS = 10_000;
export const MESSAGING_PAGE_REFRESH_MS = 30_000;

export function hasActiveMessages(messages: OrderMessage[] | undefined): boolean {
  return !!messages?.some((m) => ACTIVE_STATUSES.includes(m.status) && !m.resolvedAt);
}

/** Waiting to be sent = queued + retrying + being sent. */
export function queueSize(status: Pick<MessagingStatus, 'counts'>): number {
  const c = status.counts;
  return (c.QUEUED ?? 0) + (c.RETRY_WAIT ?? 0) + (c.PROCESSING ?? 0);
}
