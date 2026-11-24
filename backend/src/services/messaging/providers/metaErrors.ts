import type { RejectedKind } from './types';

// Phase 32 B3 (PHASE32_TODO.md §9.4): Meta Cloud API error code → what to do.
//
// Source: Meta's official "Error codes" page for the WhatsApp Cloud API, read
// 2026-11-24. Meta: build error handling around `code` (and error_data.details);
// `error_subcode` is deprecated (not returned from v16.0). Where Meta gives retry
// guidance it's quoted in the comment.
//
// Kinds:
//   TEMPORARY      Meta rejected it for a passing reason → retry with backoff (max 5).
//   PERMANENT      This message can never succeed as sent → FAILED, never retried.
//   CONFIGURATION  The account / token / template is broken → affects EVERY message:
//                  pause sending (circuit breaker) and tell an Admin; the message is
//                  re-queued untouched (not counted as an attempt).
// An error response means Meta did NOT accept the message, so none of these is ever
// AMBIGUOUS — ambiguity only comes from network trouble or a malformed success.

export interface MetaErrorRule {
  kind: RejectedKind;
  /** Account-wide throughput limit: all workers back off together. */
  rateLimited?: boolean;
  /** The template (not the whole account) is the problem. */
  templateScoped?: boolean;
  note: string;
}

const T = (note: string, extra: Partial<MetaErrorRule> = {}): MetaErrorRule => ({ kind: 'TEMPORARY', note, ...extra });
const P = (note: string, extra: Partial<MetaErrorRule> = {}): MetaErrorRule => ({ kind: 'PERMANENT', note, ...extra });
const C = (note: string, extra: Partial<MetaErrorRule> = {}): MetaErrorRule => ({ kind: 'CONFIGURATION', note, ...extra });

export const META_ERROR_RULES: Record<number, MetaErrorRule> = {
  // ── authentication / permissions / account → CONFIGURATION ──────────────────
  0: C('Unable to authenticate the app user (expired/invalid token)'),
  3: C('Capability or permissions issue'),
  10: C('Permission not granted or removed'),
  190: C('Access token expired — "Get a new access token"'),
  200: C('No access token provided'),
  33: C('The business phone number has been deleted'),
  368: C('WhatsApp Business Account restricted/disabled for a policy violation'),
  131005: C('Permission not granted or removed'),
  131031: C('Account restricted/disabled for policy violation or data verification failed'),
  131037: C('Business phone number has no approved display name'),
  131042: C('Payment method error'),
  131045: C('Phone number registration error — "Register the phone number before trying again"'),
  131048: C('Restrictions on messages from this number (spam/blocked) — check quality status'),
  133010: C('Phone number not registered on the platform'),

  // ── template problems → CONFIGURATION, template-scoped ──────────────────────
  132000: C('Parameter count does not match the template (template/version mismatch)', { templateScoped: true }),
  132001: C('Template does not exist in that language or is not approved', { templateScoped: true }),
  132007: C('Template content violates a WhatsApp policy', { templateScoped: true }),
  132015: C('Template paused due to low quality — "Edit template"', { templateScoped: true }),
  132016: C('Template permanently disabled — "Create a new template"', { templateScoped: true }),

  // ── temporary: throughput / availability → TEMPORARY ────────────────────────
  1: T('Invalid request or possible server error — check status page, then retry'),
  2: T('"Temporary due to downtime or due to being overloaded"'),
  4: T('App reached its API call rate limit — "try again later"', { rateLimited: true }),
  80007: T('WhatsApp Business Account reached its rate limit — "Try again later"', { rateLimited: true }),
  130429: T('Cloud API message throughput reached — "Try again later"', { rateLimited: true }),
  131000: T('Unknown error — "Try again."'),
  131016: T('A service is temporarily unavailable'),
  131056: T('Too many messages to the same recipient — "Wait and retry"'),
  131057: T('Business Account is in maintenance mode'),
  133004: T('Server is temporarily unavailable'),

  // ── this message / this recipient can never succeed → PERMANENT ─────────────
  100: P('Unsupported or misspelled parameter (bug in our request)'),
  131008: P('Required parameter missing (bug in our request)'),
  131009: P('One or more parameter values are invalid'),
  132005: P('Translated text is too long'),
  132012: P('Variable parameter values formatted incorrectly'),
  135000: P('Unknown error with the request parameters'),
  131021: P('Sender and recipient phone number are the same'),
  131026: P('Unable to deliver: not a WhatsApp number, terms not accepted, or old client'),
  131047: P('24-hour window expired (does not apply to templates — would indicate a bug)'),
  131049: P('Not delivered to maintain ecosystem engagement — "Retrying does not guarantee delivery"'),
  131050: P('Recipient stopped receiving marketing messages — "Do not retry"'),
  131051: P('Unsupported message type'),
  130403: P('This business has blocked the user — "Do not retry"'),
  130472: P('Not sent as part of a Meta experiment'),
  130497: P('Account restricted from messaging users in this country'),
};

export interface Classification extends MetaErrorRule {
  known: boolean;
}

/**
 * Classify a Meta error response. Unknown codes: a 5xx is treated as TEMPORARY (Meta
 * explicitly rejected it while having trouble, so a bounded retry is safe); anything
 * else unknown is PERMANENT — fail safe, never loop on something we don't understand.
 */
export function classifyMetaError(code: number, httpStatus: number): Classification {
  const rule = META_ERROR_RULES[code];
  if (rule) return { ...rule, known: true };
  if (httpStatus >= 500) return { kind: 'TEMPORARY', note: `Unknown Meta error code ${code} with HTTP ${httpStatus}`, known: false };
  return { kind: 'PERMANENT', note: `Unknown Meta error code ${code} with HTTP ${httpStatus}`, known: false };
}
