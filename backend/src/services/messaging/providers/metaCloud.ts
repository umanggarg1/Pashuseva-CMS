import { classifyMetaError } from './metaErrors';
import { validateRequest } from './dryRun';
import type { SendResult, SendTemplateRequest, WhatsAppProvider } from './types';

// Phase 32 B2/B3 (PHASE32_TODO.md §9.3/§9.4): the real WhatsApp Cloud API provider.
// Only ever constructed by providers/index.ts when sending is explicitly enabled.
// Request/response shapes follow Meta's docs (read 2026-11-24):
//   POST {base}/{version}/{phone-number-id}/messages
//   success: { messaging_product, contacts:[…], messages:[{ id:"wamid…", message_status? }] }
//   error:   { error:{ message, type, code, error_data:{ details }, fbtrace_id } }
//
// The ONE question that matters for duplicates: could Meta have accepted it?
//   - connection never established (DNS / refused / unreachable / connect timeout)
//       → the request was never sent → REJECTED TEMPORARY (safe to retry)
//   - timeout / reset / cut-off AFTER the request may have been sent, a malformed or
//     id-less 2xx, or a 5xx without a readable Meta error → AMBIGUOUS (never retried)
//   - a readable Meta error object → REJECTED, classified by code (metaErrors.ts)

export interface MetaCloudOptions {
  accessToken: string;
  phoneNumberId: string;
  apiVersion: string;
  timeoutMs?: number;
  /** Tests only (fake Meta server). Production always uses the real Graph host. */
  baseUrl?: string;
}

// Failures that happen before any byte of the request reaches Meta.
const NEVER_SENT_CODES = new Set([
  'ECONNREFUSED',
  'ENOTFOUND',
  'EAI_AGAIN',
  'EHOSTUNREACH',
  'ENETUNREACH',
  'UND_ERR_CONNECT_TIMEOUT',
]);

export class MetaCloudProvider implements WhatsAppProvider {
  readonly name = 'meta';
  readonly sendsRealMessages = true;
  private readonly url: string;
  private readonly timeoutMs: number;

  constructor(private readonly opts: MetaCloudOptions) {
    if (!opts.accessToken || !opts.phoneNumberId) {
      throw new Error('MetaCloudProvider needs an access token and a phone number id');
    }
    const base = (opts.baseUrl ?? 'https://graph.facebook.com').replace(/\/+$/, '');
    this.url = `${base}/${opts.apiVersion}/${encodeURIComponent(opts.phoneNumberId)}/messages`;
    this.timeoutMs = opts.timeoutMs ?? 10_000;
  }

  async sendTemplate(req: SendTemplateRequest): Promise<SendResult> {
    const problem = validateRequest(req);
    if (problem) {
      // Caught before anything is sent — a bug on our side, never retried.
      return { outcome: 'REJECTED', kind: 'PERMANENT', code: 'INVALID_REQUEST', message: problem };
    }

    const body = JSON.stringify({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: req.to,
      type: 'template',
      template: {
        name: req.templateName,
        language: { code: req.language },
        components: [
          { type: 'body', parameters: req.bodyParams.map((text) => ({ type: 'text', text })) },
        ],
      },
      biz_opaque_callback_data: req.callbackData,
    });

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    let res: Response;
    try {
      res = await fetch(this.url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.opts.accessToken}`,
          'Content-Type': 'application/json',
        },
        body,
        signal: controller.signal,
      });
    } catch (err) {
      clearTimeout(timer);
      return classifyNetworkError(err);
    }

    let text: string;
    try {
      text = await res.text();
    } catch (err) {
      clearTimeout(timer);
      // Headers arrived but the body was cut off: for a 2xx Meta may well have accepted.
      if (res.ok) return { outcome: 'AMBIGUOUS', code: 'RESPONSE_CUT_OFF', message: `response body unreadable: ${errName(err)}` };
      return rejectedWithoutBody(res);
    }
    clearTimeout(timer);

    let json: unknown;
    try {
      json = text ? JSON.parse(text) : undefined;
    } catch {
      json = undefined;
    }

    if (res.ok) {
      const msg = (json as { messages?: { id?: unknown; message_status?: unknown }[] } | undefined)?.messages?.[0];
      const id = msg?.id;
      if (typeof id === 'string' && /^wamid\.\S+$/.test(id)) {
        return {
          outcome: 'ACCEPTED',
          providerMessageId: id,
          ...(typeof msg?.message_status === 'string' ? { pacingStatus: msg.message_status } : {}),
        };
      }
      // A "success" we can't confirm is NEVER treated as sent, and never retried.
      return { outcome: 'AMBIGUOUS', code: 'MALFORMED_SUCCESS', message: `HTTP ${res.status} without a valid message id` };
    }

    const error = (json as { error?: { code?: unknown; message?: unknown; error_data?: { details?: unknown } } } | undefined)?.error;
    if (error && typeof error.code === 'number') {
      const c = classifyMetaError(error.code, res.status);
      const details = typeof error.error_data?.details === 'string' ? error.error_data.details : '';
      const message = [typeof error.message === 'string' ? error.message : '', details, c.note]
        .filter(Boolean)
        .join(' — ')
        .slice(0, 500);
      return {
        outcome: 'REJECTED',
        kind: c.kind,
        code: String(error.code),
        message,
        ...(c.rateLimited || res.status === 429 ? { rateLimited: Boolean(c.rateLimited), retryAfterSeconds: retryAfter(res) } : {}),
        ...(c.templateScoped ? { templateScoped: true } : {}),
      };
    }
    return rejectedWithoutBody(res);
  }
}

function rejectedWithoutBody(res: Response): SendResult {
  // No readable Meta error object.
  if (res.status === 429) {
    return { outcome: 'REJECTED', kind: 'TEMPORARY', code: 'HTTP_429', message: 'rate limited (no error body)', rateLimited: true, retryAfterSeconds: retryAfter(res) };
  }
  if (res.status === 401 || res.status === 403) {
    return { outcome: 'REJECTED', kind: 'CONFIGURATION', code: `HTTP_${res.status}`, message: 'authentication/permission rejected (no error body)' };
  }
  if (res.status >= 500) {
    // e.g. a gateway error page — Meta may or may not have processed the request.
    return { outcome: 'AMBIGUOUS', code: `HTTP_${res.status}`, message: 'server error without a Meta error object' };
  }
  return { outcome: 'REJECTED', kind: 'PERMANENT', code: `HTTP_${res.status}`, message: 'request rejected without a Meta error object' };
}

function retryAfter(res: Response): number | undefined {
  const h = res.headers.get('retry-after');
  if (!h) return undefined;
  const secs = Number(h);
  if (Number.isFinite(secs) && secs >= 0) return Math.min(secs, 3600);
  const date = Date.parse(h);
  if (!Number.isNaN(date)) return Math.min(Math.max(Math.ceil((date - Date.now()) / 1000), 0), 3600);
  return undefined;
}

function errName(err: unknown): string {
  const e = err as { name?: string; code?: string; cause?: { code?: string } };
  return e?.cause?.code ?? e?.code ?? e?.name ?? 'error';
}

function classifyNetworkError(err: unknown): SendResult {
  const e = err as { name?: string; cause?: { code?: string; name?: string } };
  if (e?.name === 'AbortError' || e?.name === 'TimeoutError') {
    return { outcome: 'AMBIGUOUS', code: 'TIMEOUT', message: 'no response within the timeout — Meta may have accepted it' };
  }
  const code = e?.cause?.code;
  if (code && NEVER_SENT_CODES.has(code)) {
    return { outcome: 'REJECTED', kind: 'TEMPORARY', code: `NETWORK_${code}`, message: 'could not connect to Meta (request never sent)' };
  }
  return { outcome: 'AMBIGUOUS', code: `NETWORK_${code ?? e?.cause?.name ?? e?.name ?? 'UNKNOWN'}`, message: 'connection failed after the request may have been sent' };
}
