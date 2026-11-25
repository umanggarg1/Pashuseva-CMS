// Phase 32 C1 (PHASE32_TODO.md §6): how staff-recorded WhatsApp consent is stored.
// Two options only (YES / NO); every value recorded by staff is stamped with WHO and
// WHEN (source STAFF), and the customer's Activity history gets an entry with the
// previous and new value (the entry itself carries the employee and the timestamp).
// WhatsApp consent and the per-phone WhatsApp flag are independent: a customer may
// have WhatsApp and refuse messages, or agree and have no WhatsApp number.

export type WhatsappConsentValue = 'YES' | 'NO';

/** Customer columns to write when staff record a consent value. */
export function staffConsentFields(consent: WhatsappConsentValue, actingUserId: number) {
  return {
    whatsappConsent: consent,
    whatsappConsentAt: new Date(),
    whatsappConsentById: actingUserId,
    whatsappConsentSource: 'STAFF' as const,
  };
}

export const CONSENT_RECORDED_ACTIVITY = 'WhatsApp consent recorded';
export const CONSENT_CHANGED_ACTIVITY = 'WhatsApp consent changed';
export const LANGUAGE_CHANGED_ACTIVITY = 'WhatsApp message language changed';

/** Human-readable consent value for the Activity panel. */
export function consentLabel(value: string | null | undefined): string {
  if (value === 'YES') return 'YES – Customer agreed';
  if (value === 'NO') return 'NO – Customer declined';
  return '(not recorded)';
}

export function languageLabel(value: string | null | undefined): string {
  return value === 'HI' ? 'Hindi' : 'English';
}
