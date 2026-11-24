import { randomUUID } from 'node:crypto';
import logger from '../../../logger';
import { maskWhatsappNumber } from '../../../utils/phone';
import type { SendResult, SendTemplateRequest, WhatsAppProvider } from './types';

// Phase 32 B2: the DEFAULT provider. Never touches the network — it only checks the
// request is well-formed (so builder bugs still surface locally), logs a masked
// summary, and answers like Meta would with a clearly fake id.
export class DryRunProvider implements WhatsAppProvider {
  readonly name = 'dryrun';
  readonly sendsRealMessages = false;

  constructor(private readonly reason = 'default') {}

  async sendTemplate(req: SendTemplateRequest): Promise<SendResult> {
    const problem = validateRequest(req);
    if (problem) {
      return { outcome: 'REJECTED', kind: 'PERMANENT', code: 'DRYRUN_INVALID_REQUEST', message: problem };
    }
    const providerMessageId = `wamid.DRYRUN.${randomUUID()}`;
    logger.info(
      `[whatsapp:dryrun] NOT sent (${this.reason}) → ${maskWhatsappNumber(req.to)} template=${req.templateName}/${req.language} params=${req.bodyParams.length} id=${providerMessageId}`
    );
    return { outcome: 'ACCEPTED', providerMessageId };
  }
}

/** Shape checks shared by every provider; returns a problem description or null. */
export function validateRequest(req: SendTemplateRequest): string | null {
  if (!/^91[6-9][0-9]{9}$/.test(req.to)) return 'recipient is not a normalized Indian mobile (91XXXXXXXXXX)';
  if (!/^[a-z0-9_]{1,512}$/.test(req.templateName)) return 'invalid template name';
  if (req.language !== 'en' && req.language !== 'hi') return 'invalid language';
  if (!req.callbackData) return 'missing callbackData';
  if (req.bodyParams.length === 0) return 'no body parameters';
  for (const [i, p] of req.bodyParams.entries()) {
    if (typeof p !== 'string' || p.trim() === '') return `parameter {{${i + 1}}} is empty`;
    if (/[\n\r\t]/.test(p)) return `parameter {{${i + 1}}} contains a newline or tab`;
    if (/ {5,}/.test(p)) return `parameter {{${i + 1}}} has more than 4 consecutive spaces`;
  }
  return null;
}
