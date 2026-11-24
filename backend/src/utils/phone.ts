// Phase 32 B1 (PHASE32_TODO.md §6, §19.1): turn a stored customer phone into the
// number WhatsApp needs — 12 ASCII digits, `91` + a 10-digit Indian mobile — or null
// when it isn't one. The stored `CustomerPhone.phone` text is never rewritten; this
// only produces the send-time value (and validates a phone being flagged WhatsApp).
//
// Strict on purpose: a wrong guess sends a customer's order details to a stranger,
// so anything ambiguous is rejected rather than "fixed".

// Separators people type or paste. \s with the `u` flag covers every Unicode
// whitespace, incl. the NON-BREAKING SPACE U+00A0 that A0 found in 6 real phones
// (numbers copied from WhatsApp / web pages). The zero-width characters are not
// whitespace in JS, so they're listed explicitly — they also arrive via copy-paste.
// The zero-width joiner (U+200D) is its own alternative rather than inside the
// character class, where it would read as joining its neighbours.
const SEPARATORS = /[\s\u200B\u200C\u2060\uFEFF\-().+]|\u200D/gu;

// An Indian mobile number: 10 digits, first digit 6–9.
const INDIAN_MOBILE = /^[6-9][0-9]{9}$/;

/**
 * Normalize to `91XXXXXXXXXX`, or return null if it isn't a valid Indian mobile.
 *
 * Accepted (after removing separators):
 *   9876543210        → 919876543210   (10 digits)
 *   09876543210       → 919876543210   (trunk 0)
 *   919876543210      → 919876543210   (country code; also "+91 98765 43210")
 *   0919876543210     → 919876543210   (0 + country code)
 *   00919876543210    → 919876543210   (international 00 prefix)
 * Rejected: anything with non-ASCII digits (Devanagari ९, Arabic-Indic, full-width),
 * letters or other symbols; landlines / numbers not starting 6–9; wrong length.
 */
export function toWhatsappNumber(raw: string | null | undefined): string | null {
  if (typeof raw !== 'string') return null;
  const digits = raw.normalize('NFC').replace(SEPARATORS, '');
  // ASCII digits only — [0-9], never \d-with-Unicode, so ९८७… is rejected, not
  // silently accepted or mangled.
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

export function isValidWhatsappNumber(raw: string | null | undefined): boolean {
  return toWhatsappNumber(raw) !== null;
}

/**
 * Masked display form for staff screens and logs (§0.1): `98XXXX3210`.
 * Accepts a raw or normalized number; returns '' when it isn't a valid mobile.
 */
export function maskWhatsappNumber(raw: string | null | undefined): string {
  const n = toWhatsappNumber(raw);
  if (!n) return '';
  const national = n.slice(2);
  return `${national.slice(0, 2)}XXXX${national.slice(6)}`;
}
