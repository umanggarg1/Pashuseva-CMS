import { z } from 'zod';

// Phase 32 D1: client-side mirror of backend/src/utils/phone.ts toWhatsappNumber —
// only used to show the error before saving; the API applies the same rule and is
// the source of truth.
const SEPARATORS = /[\s\u200B\u200C\u2060\uFEFF\-().+]|\u200D/gu;
const INDIAN_MOBILE = /^[6-9][0-9]{9}$/;

export function toWhatsappNumber(raw: string | null | undefined): string | null {
  if (typeof raw !== 'string') return null;
  const digits = raw.normalize('NFC').replace(SEPARATORS, '');
  if (!/^[0-9]+$/.test(digits)) return null;
  let national: string | null = null;
  if (digits.length === 10) national = digits;
  else if (digits.length === 11 && digits.startsWith('0')) national = digits.slice(1);
  else if (digits.length === 12 && digits.startsWith('91')) national = digits.slice(2);
  else if (digits.length === 13 && digits.startsWith('091')) national = digits.slice(3);
  else if (digits.length === 14 && digits.startsWith('0091')) national = digits.slice(4);
  if (national === null || !INDIAN_MOBILE.test(national)) return null;
  return `91${national}`;
}

export type WhatsappConsent = 'YES' | 'NO';
export type MessageLanguage = 'EN' | 'HI';
export type ConsentSource = 'STAFF' | 'CUSTOMER_STOP_REPLY' | 'BACKFILL';

export const CONSENT_OPTIONS: { value: WhatsappConsent; label: string }[] = [
  { value: 'YES', label: 'YES – Customer agreed' },
  { value: 'NO', label: 'NO – Customer declined' },
];

export const LANGUAGE_OPTIONS: { value: MessageLanguage; label: string }[] = [
  { value: 'EN', label: 'English' },
  { value: 'HI', label: 'Hindi' },
];

export const WHATSAPP_NUMBER_ERROR = 'WhatsApp number must be a valid 10-digit Indian mobile number';
// Shown directly under the YES/NO choice. The YES/NO selection itself is the consent
// record; there is deliberately no extra confirmation step (user decision after D1
// review, 2026-11-26: keep it to one action for staff serving rural customers).
export const CONSENT_REMINDER = 'Select YES only after the customer has agreed to receive WhatsApp order updates.';

/** The WhatsApp part of a customer form (create or edit). */
export const whatsappFormFields = {
  whatsappConsent: z.enum(['YES', 'NO'], { error: 'Choose YES or NO' }),
  preferredLanguage: z.enum(['EN', 'HI']),
};

interface WhatsappFormValues {
  phones: { phone: string; isWhatsapp: boolean }[];
}

/** Shared phone rules: at most one WhatsApp number, and it must be a valid Indian mobile. */
export function refineWhatsapp() {
  return (values: WhatsappFormValues, ctx: z.RefinementCtx) => {
    const flagged = values.phones.map((p, i) => ({ p, i })).filter(({ p }) => p.isWhatsapp);
    if (flagged.length > 1) {
      ctx.addIssue({ code: 'custom', path: ['phones'], message: 'Only one phone number can be the WhatsApp number' });
    }
    for (const { p, i } of flagged) {
      if (p.phone.trim() && toWhatsappNumber(p.phone) === null) {
        ctx.addIssue({ code: 'custom', path: ['phones', i, 'phone'], message: WHATSAPP_NUMBER_ERROR });
      }
    }
  };
}

/** "Last changed by Asha on 25 Nov 2026" (or the customer's STOP reply / the initial setup). */
export function describeConsentChange(info: {
  whatsappConsentAt?: string | null;
  whatsappConsentSource?: ConsentSource | null;
  whatsappConsentBy?: { name: string | null } | null;
}): string | null {
  if (!info.whatsappConsentAt) return null;
  const date = new Date(info.whatsappConsentAt).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
  if (info.whatsappConsentSource === 'CUSTOMER_STOP_REPLY') return `Customer replied STOP on WhatsApp on ${date}`;
  if (info.whatsappConsentSource === 'BACKFILL') return `Set when WhatsApp messages were introduced (${date})`;
  return `Last changed by ${info.whatsappConsentBy?.name ?? 'a staff member'} on ${date}`;
}

/** Masked number for staff screens (§0.1): 98XXXX3210; '' when not a valid mobile. Same as the backend. */
export function maskWhatsappNumber(raw: string | null | undefined): string {
  const n = toWhatsappNumber(raw);
  if (!n) return '';
  const national = n.slice(2);
  return `${national.slice(0, 2)}XXXX${national.slice(6)}`;
}
