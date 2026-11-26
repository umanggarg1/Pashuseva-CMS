import { useFormContext } from 'react-hook-form';
import { MessageCircle } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import {
  CONSENT_OPTIONS,
  CONSENT_REMINDER,
  LANGUAGE_OPTIONS,
  type MessageLanguage,
  type WhatsappConsent,
} from '@/lib/whatsapp';

// Phase 32 D1: the WhatsApp part of the customer form, shared by Add Customer (used
// from the Customers page and from Create Order's customer picker) and Edit Customer.
// Must be rendered inside the form's <Form {...form}> provider.

interface WhatsappShape {
  phones: { phone: string; label?: string; isPrimary: boolean; isWhatsapp: boolean }[];
  whatsappConsent: WhatsappConsent;
  preferredLanguage: MessageLanguage;
}

/** "WhatsApp" toggle for one phone row — at most one row can be ON. */
export function WhatsappPhoneToggle({ index }: { index: number }) {
  const form = useFormContext<WhatsappShape>();
  const on = form.watch(`phones.${index}.isWhatsapp`);
  return (
    <Button
      type="button"
      size="sm"
      variant={on ? 'default' : 'outline'}
      aria-pressed={on}
      title={on ? 'This is the WhatsApp number' : 'Mark as the WhatsApp number'}
      className={cn(on && 'bg-green-600 text-white hover:bg-green-700')}
      onClick={() => {
        const phones = form.getValues('phones').map((p, i) => ({ ...p, isWhatsapp: i === index ? !on : false }));
        form.setValue('phones', phones, { shouldDirty: true, shouldValidate: form.formState.isSubmitted });
      }}
    >
      <MessageCircle className="mr-1 h-3.5 w-3.5" /> WhatsApp
    </Button>
  );
}

export function WhatsappConsentFields({
  savedConsent,
  lastChange,
}: {
  /** The consent stored today — null on create. */
  savedConsent: WhatsappConsent | null;
  /** Edit only: "Last changed by X on date". */
  lastChange?: string | null;
}) {
  const form = useFormContext<WhatsappShape>();

  return (
    <div className="space-y-3 rounded-md border p-3">
      <p className="flex items-center gap-1.5 text-sm font-medium">
        <MessageCircle className="h-4 w-4 text-green-600" /> WhatsApp order messages
      </p>

      <FormField
        control={form.control}
        name="whatsappConsent"
        render={({ field }) => (
          <FormItem>
            <FormLabel>WhatsApp Consent *</FormLabel>
            <div role="radiogroup" aria-label="WhatsApp Consent" className="flex flex-wrap gap-4">
              {CONSENT_OPTIONS.map((o) => (
                <label key={o.value} className="flex cursor-pointer items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name={field.name}
                    value={o.value}
                    checked={field.value === o.value}
                    onChange={() => field.onChange(o.value)}
                    className="h-4 w-4 accent-primary"
                  />
                  <span className={cn(o.value === 'NO' && field.value === 'NO' && 'text-red-600')}>{o.label}</span>
                </label>
              ))}
            </div>
            <p className="text-xs text-amber-700">{CONSENT_REMINDER}</p>
            {savedConsent && (
              <p className="text-xs text-muted-foreground">
                Saved: {savedConsent === 'YES' ? 'YES – Customer agreed' : 'NO – Customer declined'}
                {lastChange ? ` · ${lastChange}` : ''}
              </p>
            )}
            <FormMessage />
          </FormItem>
        )}
      />

      <FormField
        control={form.control}
        name="preferredLanguage"
        render={({ field }) => (
          <FormItem>
            <FormLabel>WhatsApp Message Language</FormLabel>
            <Select value={field.value} onValueChange={field.onChange}>
              <FormControl>
                <SelectTrigger className="w-40" aria-label="WhatsApp Message Language">
                  <SelectValue />
                </SelectTrigger>
              </FormControl>
              <SelectContent>
                {LANGUAGE_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Only for the customer&apos;s WhatsApp messages. Names and products always stay in English; the CRM
              itself stays in English.
            </p>
            <FormMessage />
          </FormItem>
        )}
      />
    </div>
  );
}

/** Per-row phone error (e.g. an invalid WhatsApp number) — rendered under the phone rows. */
export function PhoneRowErrors() {
  const form = useFormContext<WhatsappShape>();
  // Array-level errors land on .message or .root depending on how the resolver set
  // them; per-row errors are numeric keys.
  const errors = form.formState.errors.phones as
    | ({ message?: string; root?: { message?: string } } & Record<number, { phone?: { message?: string } } | undefined>)
    | undefined;
  if (!errors) return null;
  const messages: string[] = [];
  if (typeof errors.message === 'string') messages.push(errors.message);
  if (errors.root?.message) messages.push(errors.root.message);
  const rows = form.getValues('phones').length;
  for (let i = 0; i < rows; i++) {
    const m = errors[i]?.phone?.message;
    if (m) messages.push(rows > 1 ? `Phone ${i + 1}: ${m}` : m);
  }
  return (
    <>
      {[...new Set(messages)].map((m) => (
        <p key={m} className="mt-1 text-sm font-medium text-destructive">
          {m}
        </p>
      ))}
    </>
  );
}
