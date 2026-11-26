import { MessageCircle } from 'lucide-react';

import { cn } from '@/lib/utils';
import { CONSENT_OPTIONS, CONSENT_REMINDER, type ConsentSource, type WhatsappConsent } from '@/lib/whatsapp';

// Phase 32 (Create Order consent): an existing customer's WhatsApp consent, shown and
// changeable while booking, without leaving Create Order. The saved value is preselected;
// leaving it alone changes nothing. A different choice is saved WITH the order (same
// transaction, server-side), never on its own, so there's no extra button or click.

function savedText(saved: WhatsappConsent, source: ConsentSource | null | undefined, at: string | null | undefined): string {
  const date = at ? new Date(at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : null;
  if (saved === 'NO' && !source) return 'Saved: NO (not asked yet). Ask the customer.';
  if (source === 'CUSTOMER_STOP_REPLY') return `Saved: NO. The customer replied STOP on WhatsApp${date ? ` on ${date}` : ''}.`;
  return `Saved: ${saved === 'YES' ? 'YES – Customer agreed' : 'NO – Customer declined'}${date ? ` (${date})` : ''}`;
}

export default function OrderConsentChoice({
  saved,
  source,
  at,
  value,
  onChange,
}: {
  saved: WhatsappConsent;
  source?: ConsentSource | null;
  at?: string | null;
  value: WhatsappConsent;
  onChange: (value: WhatsappConsent) => void;
}) {
  const changed = value !== saved;
  const stop = source === 'CUSTOMER_STOP_REPLY';
  return (
    <div data-testid="order-consent" className="mt-3 space-y-2 rounded-md border p-3">
      <p className="flex items-center gap-1.5 text-sm font-medium">
        <MessageCircle className="h-4 w-4 text-green-600" aria-hidden="true" /> WhatsApp consent
      </p>
      <div role="radiogroup" aria-label="WhatsApp consent" className="flex flex-wrap gap-4">
        {CONSENT_OPTIONS.map((o) => (
          <label key={o.value} className="flex cursor-pointer items-center gap-2 text-sm">
            <input
              type="radio"
              name="order-whatsapp-consent"
              value={o.value}
              checked={value === o.value}
              onChange={() => onChange(o.value)}
              className="h-4 w-4 accent-primary"
            />
            <span className={cn(o.value === 'NO' && value === 'NO' && 'text-red-600')}>{o.label}</span>
          </label>
        ))}
      </div>
      <p className="text-xs text-amber-700">{CONSENT_REMINDER}</p>
      <p data-testid="order-consent-status" className={cn('text-xs', stop && !changed ? 'text-red-700' : 'text-muted-foreground')}>
        {changed
          ? `Will be saved as ${value} with this order (was ${saved}).`
          : savedText(saved, source, at)}
      </p>
    </div>
  );
}
