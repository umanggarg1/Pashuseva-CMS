// Phase 32 B2 (PHASE32_TODO.md §9.3/§9.4): the contract every WhatsApp provider
// implements (dry-run, Meta Cloud API, any future BSP). The dispatcher only ever
// talks to this interface.
//
// RULE: sendTemplate NEVER throws. Every outcome — network trouble included — comes
// back as one of three results, because what happens next depends entirely on which:
//
//   ACCEPTED  Meta accepted the message (has a valid wamid)   → SENT
//   REJECTED  Meta definitely did NOT accept it               → retry / fail / pause
//   AMBIGUOUS Meta MAY have accepted it (timeout after sending, cut-off or malformed
//             response…)                                       → UNKNOWN, never auto-retried

export type ProviderLanguageCode = 'en' | 'hi';

export interface SendTemplateRequest {
  /** Normalized recipient, 91XXXXXXXXXX (utils/phone.ts toWhatsappNumber). */
  to: string;
  templateName: string;
  language: ProviderLanguageCode;
  /** Body parameters {{1}}..{{n}}, already sanitized by the template builders. */
  bodyParams: string[];
  /**
   * Echoed back by Meta in status webhooks (statuses[].biz_opaque_callback_data,
   * confirmed in Meta's status-webhook reference) — set to the OutboundMessage
   * eventKey so a send whose response was lost can still be matched (§9.5).
   */
  callbackData: string;
}

export type RejectedKind = 'TEMPORARY' | 'PERMANENT' | 'CONFIGURATION';

export type SendResult =
  | {
      outcome: 'ACCEPTED';
      providerMessageId: string;
      /** Meta's optional pacing status for templates (accepted / held_for_quality_assessment / paused). */
      pacingStatus?: string;
    }
  | {
      outcome: 'REJECTED';
      kind: RejectedKind;
      /** Meta error code as a string, or a local code such as NETWORK_ECONNREFUSED. */
      code: string;
      message: string;
      /** Seconds to wait before any retry (from Retry-After), when Meta gave one. */
      retryAfterSeconds?: number;
      /** Account-wide throughput limit: every worker should back off (§19.4). */
      rateLimited?: boolean;
      /** The problem is the template itself (paused/disabled/not approved…), not the account. */
      templateScoped?: boolean;
    }
  | {
      outcome: 'AMBIGUOUS';
      code: string;
      message: string;
    };

export interface WhatsAppProvider {
  /** 'dryrun' | 'meta' — shown on the Admin Messaging page and stored for audit. */
  readonly name: string;
  /** True only for a provider that really contacts WhatsApp. */
  readonly sendsRealMessages: boolean;
  sendTemplate(req: SendTemplateRequest): Promise<SendResult>;
}
