import { toast } from 'sonner';

import { ApiError } from '@/lib/api';

// Phase 32 D3 (PHASE32_TODO.md §19.2): one Idempotency-Key per order SUBMISSION.
//
//  - The key is created when a submission starts and kept in sessionStorage (this
//    tab only) until the server confirms the order. Every retry of that submission
//    (a double-click, an automatic network retry, pressing the button again after an
//    error, or a page refresh after a lost response) sends the SAME key, so the
//    server returns the order it already created instead of making a second one.
//  - A failed request that created no order leaves the key unused on the server, so
//    re-sending it (even with corrected details) simply creates the order.
//  - After a successful response the key is removed, so the next order, even an
//    identical one for the same customer, gets a fresh key and is a separate order.
//  - 422 means the key already created a DIFFERENT order (the details were changed
//    after a lost response). The key is replaced, so pressing the button again
//    deliberately creates this as a new order.

const PREFIX = 'pashuseva:order-submission:';

function newKey(): string {
  // randomUUID exists in every secure context (https / localhost); getRandomValues is
  // the fallback for an older browser.
  const c: Crypto = globalThis.crypto;
  if (typeof c.randomUUID === 'function') return c.randomUUID();
  const bytes = c.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (b: number) => b.toString(16).padStart(2, '0')).join('');
}

function storage(): Storage | null {
  try {
    return window.sessionStorage;
  } catch {
    return null; // storage blocked: fall back to an in-memory key for this page
  }
}
const memory = new Map<string, string>();

/** The key for this submission: the pending one if a previous attempt didn't finish, else a new one. */
export function submissionKey(scope: string): string {
  const s = storage();
  const existing = s?.getItem(PREFIX + scope) ?? memory.get(scope);
  if (existing) return existing;
  const key = newKey();
  if (s) s.setItem(PREFIX + scope, key);
  else memory.set(scope, key);
  return key;
}

/** The submission finished (order confirmed) or must not be reused: forget its key. */
export function clearSubmissionKey(scope: string) {
  storage()?.removeItem(PREFIX + scope);
  memory.delete(scope);
}

export const CREATE_ORDER_SCOPE = 'create-order';
export const reorderScope = (sourceOrderId: number) => `reorder:${sourceOrderId}`;

/** Retry only when the request never got an answer (network failure), at most twice. */
export function retryNetworkErrors(failureCount: number, error: unknown) {
  return !(error instanceof ApiError) && failureCount < 2;
}

export interface CreatedOrderResponse {
  id: number;
  orderNumber: string;
  whatsapp?: { status: 'QUEUED' | 'SKIPPED' | 'ERROR'; skipReason: string | null };
  idempotentReplay?: true;
}

/** Second toast line (§0.1): what happened to the WhatsApp confirmation. */
export function whatsappOutcomeLine(order: CreatedOrderResponse): string | null {
  const w = order.whatsapp;
  if (!w) return null;
  if (w.status === 'QUEUED') return 'WhatsApp: Queued for sending';
  if (w.status === 'SKIPPED') return `WhatsApp: Not sent: ${w.skipReason ?? 'no reason recorded'}`;
  return 'WhatsApp: Not recorded (see the order history)';
}

export function orderSavedToast(order: CreatedOrderResponse) {
  const title = order.idempotentReplay
    ? `Order already saved: ${order.orderNumber} (this submission had already been received)`
    : `Order saved: ${order.orderNumber}`;
  const line = whatsappOutcomeLine(order);
  toast.success(title, line ? { description: line } : undefined);
}

/**
 * A 422 from the server: this submission key already created a different order.
 * Returns the existing order number when the server provided it.
 */
export function existingOrderFrom(err: unknown): string | null {
  if (!(err instanceof ApiError) || err.status !== 422) return null;
  const n = err.body?.existingOrderNumber;
  return typeof n === 'string' ? n : null;
}
