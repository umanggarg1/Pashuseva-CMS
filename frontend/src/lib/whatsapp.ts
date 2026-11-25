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
export const CONFIRM_AGREEMENT_ERROR =
  'Confirm that you asked the customer and they agreed — or choose NO';

/** The WhatsApp part of a customer form (create or edit). */
export const whatsappFormFields = {
  whatsappConsent: z.enum(['YES', 'NO'], { error: 'Choose YES or NO' }),
  whatsappConfirmed: z.boolean(),
  preferredLanguage: z.enum(['EN', 'HI']),
};

interface WhatsappFormValues {
  phones: { phone: string; isWhatsapp: boolean }[];
  whatsappConsent: WhatsappConsent;
  whatsappConfirmed: boolean;
}

/**
 * Shared rules: at most one WhatsApp number, it must be a valid Indian mobile, and a
 * YES that is being newly recorded (always on create; on edit only when it changes
 * to YES) needs the staff member's explicit confirmation that the customer agreed.
 */
export function refineWhatsapp(savedConsent: WhatsappConsent | null) {
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
    if (needsAgreementConfirmation(values.whatsappConsent, savedConsent) && !values.whatsappConfirmed) {
      ctx.addIssue({ code: 'custom', path: ['whatsappConfirmed'], message: CONFIRM_AGREEMENT_ERROR });
    }
  };
}

export function needsAgreementConfirmation(selected: WhatsappConsent | undefined, saved: WhatsappConsent | null) {
  return selected === 'YES' && saved !== 'YES';
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
