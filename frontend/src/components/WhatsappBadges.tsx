import { MessageCircle } from 'lucide-react';

import { cn } from '@/lib/utils';
import { maskWhatsappNumber, type WhatsappConsent } from '@/lib/whatsapp';

// Phase 32 D2: read-only WhatsApp markers for CRM screens (UI stays English).

interface PhoneLike {
  phone: string;
  isPrimary: boolean;
  isWhatsapp?: boolean;
}

/** Green WhatsApp icon placed right after a phone number that is the WhatsApp number. */
export function WhatsappIcon({ className }: { className?: string }) {
  return (
    <span role="img" aria-label="WhatsApp number" title="WhatsApp number" className={cn('inline-flex align-middle', className)}>
      <MessageCircle className="h-3.5 w-3.5 text-green-600" aria-hidden="true" />
    </span>
  );
}

/** "WhatsApp Consent: YES" (green) / "WhatsApp Consent: NO" (red). */
export function ConsentBadge({ consent, className }: { consent: WhatsappConsent; className?: string }) {
  const yes = consent === 'YES';
  return (
    <span
      data-testid="consent-badge"
      title={yes ? 'YES – Customer agreed to WhatsApp order messages' : 'NO – Customer declined WhatsApp order messages'}
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium',
        yes ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-700',
        className
      )}
    >
      <MessageCircle className="h-3 w-3" aria-hidden="true" />
      WhatsApp Consent: {yes ? 'YES' : 'NO'}
    </span>
  );
}

/** The number a compact row shows: the primary, else the first. */
export function displayedPhone<T extends PhoneLike>(phones: T[]): T | undefined {
  return phones.find((p) => p.isPrimary) ?? phones[0];
}

/**
 * For compact rows that show only one number (Create Order picker, global search):
 * the icon when that number is the WhatsApp number, or the icon plus the WhatsApp
 * number when it is a different (alternate) phone. Nothing when there is none.
 */
export function CompactWhatsapp({ phones, shown }: { phones: PhoneLike[]; shown?: PhoneLike }) {
  const wa = phones.find((p) => p.isWhatsapp);
  if (!wa) return null;
  if (shown && wa.phone === shown.phone) return <WhatsappIcon className="ml-1" />;
  return (
    <span className="ml-1 inline-flex items-center gap-0.5 text-xs text-green-700">
      <WhatsappIcon /> {wa.phone}
    </span>
  );
}

/**
 * Phase 32 D3: Create Order hint for the selected customer — where the confirmation
 * will go, or why none will be sent. Information only (no field, no extra click);
 * the post-save toast reports what actually happened.
 */
export function WhatsappOrderHint({
  phones,
  consent,
  language,
}: {
  phones: PhoneLike[];
  consent?: WhatsappConsent;
  language?: 'EN' | 'HI';
}) {
  if (!consent) return null;
  const wa = phones.find((p) => p.isWhatsapp);
  const masked = wa ? maskWhatsappNumber(wa.phone) : '';
  let text: string;
  let ok = false;
  if (consent === 'NO') text = 'WhatsApp consent is NO, no message will be sent';
  else if (!masked) text = 'No WhatsApp number, no message will be sent';
  else {
    ok = true;
    text = `Confirmation will be sent on WhatsApp to ${masked} (${language === 'HI' ? 'Hindi' : 'English'})`;
  }
  return (
    <p
      data-testid="whatsapp-order-hint"
      className={cn(
        'mt-2 flex items-center gap-1.5 rounded-md px-2 py-1 text-xs',
        ok ? 'bg-green-50 text-green-800' : 'bg-amber-50 text-amber-800'
      )}
    >
      <MessageCircle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      {text}
    </p>
  );
}
