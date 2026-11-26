import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { AlertTriangle, RefreshCw } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { apiFetch, ApiError } from '@/lib/api';
import { clearSubmissionKey, retryNetworkErrors, submissionKey } from '@/lib/orderSubmit';
import type { MessageStatus } from '@/components/WhatsappMessagesCard';

// Phase 32 D5 (PHASE32_TODO.md §13): the Resend dialog. Only rendered for users with
// message:resend (the card hides the button otherwise; the API enforces it too).
//  - The destination is the customer's CURRENT WhatsApp number (masked), never a
//    picker; changing it happens in Customer Details.
//  - The exact text comes from the server's preview; Confirm sends its previewHash.
//    If anything changed since (payment, items, number, language), the server answers
//    409 PREVIEW_CHANGED with the new preview: it replaces the old one here and staff
//    must confirm again. Nothing is sent from a stale preview.
//  - One Idempotency-Key per resend submission (same rules as order submissions), so
//    a double click or a network retry can never queue two resends.

export type ResendType = 'confirmation' | 'dispatched';

interface ResendPreview {
  type: ResendType;
  to: string | null;
  language: 'EN' | 'HI';
  templateName: string | null;
  header: string | null;
  body: string | null;
  footer: string | null;
  previewHash: string | null;
  blockedReason: string | null;
  previous: { id: number; status: MessageStatus; at: string } | null;
  alreadyReceived: boolean;
}

const REASONS = [
  { value: 'NOT_RECEIVED', label: "Customer didn't receive it" },
  { value: 'NUMBER_CHANGED', label: 'WhatsApp number changed' },
  { value: 'CUSTOMER_ASKED', label: 'Customer asked again' },
  { value: 'OTHER', label: 'Other (write the reason)' },
] as const;
type Reason = (typeof REASONS)[number]['value'];

const TYPE_LABEL: Record<ResendType, string> = {
  confirmation: 'Order confirmation',
  dispatched: 'Dispatch notification',
};

const STATUS_TEXT: Record<MessageStatus, string> = {
  QUEUED: 'Queued',
  PROCESSING: 'Sending',
  RETRY_WAIT: 'Retrying',
  SENT: 'Sent (not yet delivered)',
  DELIVERED: 'Delivered',
  READ: 'Read',
  FAILED: 'Failed',
  UNKNOWN: 'Unconfirmed',
  SKIPPED: 'Not sent',
};

export const resendScope = (orderId: number, type: ResendType) => `resend:${orderId}:${type}`;

const fmt = (iso: string) =>
  new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

export default function ResendMessageDialog({
  orderId,
  customerId,
  type,
  open,
  onOpenChange,
}: {
  orderId: number;
  customerId: number;
  type: ResendType;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const [reason, setReason] = useState<Reason | ''>('');
  const [note, setNote] = useState('');
  const [preview, setPreview] = useState<ResendPreview | null>(null);
  const [changedNotice, setChangedNotice] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submitting = useRef(false);

  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Always a FRESH preview from the server (never a cached one).
  const loadPreview = useCallback(async () => {
    setPreview(null);
    setLoadError(null);
    setLoading(true);
    try {
      setPreview(await apiFetch<ResendPreview>(`/orders/${orderId}/messages/preview?type=${type}`));
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : 'Could not load the preview.');
    } finally {
      setLoading(false);
    }
  }, [orderId, type]);

  useEffect(() => {
    if (!open) return;
    setReason('');
    setNote('');
    setChangedNotice(false);
    setError(null);
    loadPreview();
  }, [open, loadPreview]);

  const resend = useMutation({
    retry: retryNetworkErrors,
    retryDelay: 1000,
    mutationFn: (p: ResendPreview) =>
      apiFetch<{ messageId: number; status: string; replay: boolean }>(`/orders/${orderId}/messages/resend`, {
        method: 'POST',
        headers: { 'Idempotency-Key': submissionKey(resendScope(orderId, type)) },
        body: JSON.stringify({
          type,
          reason,
          note: note.trim() || undefined,
          previewHash: p.previewHash,
        }),
      }),
    onSuccess: (r) => {
      clearSubmissionKey(resendScope(orderId, type));
      queryClient.invalidateQueries({ queryKey: ['order', orderId, 'whatsapp-messages'] });
      queryClient.invalidateQueries({ queryKey: ['order', String(orderId), 'activity'] });
      toast.success(r.replay ? `Resend already queued (#${r.messageId})` : `Resend queued (#${r.messageId})`, {
        description: `${TYPE_LABEL[type]} to ${preview?.to ?? 'the customer'}`,
      });
      onOpenChange(false);
    },
    onError: (err) => {
      if (err instanceof ApiError && err.status === 409 && err.body?.code === 'PREVIEW_CHANGED' && err.body.preview) {
        // Nothing was queued: show what WOULD be sent now and ask again.
        setPreview(err.body.preview as ResendPreview);
        setChangedNotice(true);
        setError(null);
        return;
      }
      if (err instanceof ApiError && err.status === 409) {
        // Blocked meanwhile (e.g. another resend started, consent changed): refresh.
        setError(err.message);
        loadPreview();
        return;
      }
      setError(err instanceof ApiError ? err.message : 'Could not reach the server. Press Confirm again to retry.');
    },
    onSettled: () => {
      submitting.current = false;
    },
  });

  const reasonValid = reason !== '' && (reason !== 'OTHER' || note.trim().length >= 3);
  const canConfirm = !!preview && !preview.blockedReason && !!preview.previewHash && reasonValid && !resend.isPending;

  function confirm() {
    if (!preview || !canConfirm || submitting.current) return;
    submitting.current = true;
    setChangedNotice(false);
    resend.mutate(preview);
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !resend.isPending && onOpenChange(o)}>
      <DialogContent className="max-h-[90vh] overflow-y-auto" data-testid="resend-dialog">
        <DialogHeader>
          <DialogTitle>Resend {TYPE_LABEL[type].toLowerCase()}</DialogTitle>
        </DialogHeader>

        {!preview && loading && <Skeleton className="h-40 w-full" />}
        {!preview && loadError && <p className="text-sm text-destructive">{loadError}</p>}

        {preview && (
          <div className="space-y-3 text-sm">
            <div className="grid grid-cols-[8rem_1fr] gap-x-2 gap-y-1">
              <span className="text-muted-foreground">Message</span>
              <span>{TYPE_LABEL[preview.type]}</span>
              <span className="text-muted-foreground">To</span>
              <span data-testid="resend-to">
                {preview.to ?? 'No valid WhatsApp number'}{' '}
                <span className="text-xs text-muted-foreground">(current WhatsApp number)</span>
                <br />
                <Link to={`/customers/${customerId}`} className="text-xs text-primary hover:underline">
                  Change the WhatsApp number in Customer Details
                </Link>
              </span>
              <span className="text-muted-foreground">Language</span>
              <span>{preview.language === 'HI' ? 'Hindi' : 'English'}</span>
              <span className="text-muted-foreground">Previous message</span>
              <span data-testid="resend-previous">
                {preview.previous
                  ? `#${preview.previous.id} · ${STATUS_TEXT[preview.previous.status]} · ${fmt(preview.previous.at)}`
                  : 'None yet'}
              </span>
            </div>

            {preview.alreadyReceived && (
              <p data-testid="resend-received-warning" className="flex items-start gap-1.5 rounded-md bg-amber-50 p-2 text-amber-900">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                The customer already received this message. Resend only if it is really needed.
              </p>
            )}
            {changedNotice && (
              <p data-testid="resend-changed-notice" className="flex items-start gap-1.5 rounded-md bg-blue-50 p-2 text-blue-900">
                <RefreshCw className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                The message changed since you opened this preview. Nothing was sent. Check the new text below
                and press Confirm again.
              </p>
            )}
            {preview.blockedReason && (
              <p data-testid="resend-blocked" className="rounded-md bg-red-50 p-2 text-red-800">
                Can&apos;t resend now: {preview.blockedReason}
              </p>
            )}

            {preview.body && (
              <div>
                <p className="mb-1 text-muted-foreground">Exact message that will be sent</p>
                <div data-testid="resend-preview" className="whitespace-pre-wrap rounded-md border bg-muted/40 p-2 text-sm">
                  {preview.header && <p className="font-semibold">{preview.header}</p>}
                  <p>{preview.body}</p>
                  {preview.footer && <p className="mt-1 text-xs text-muted-foreground">{preview.footer}</p>}
                </div>
              </div>
            )}

            <div className="space-y-1">
              <Label htmlFor="resend-reason">Reason for resending *</Label>
              <Select value={reason} onValueChange={(v) => setReason(v as Reason)}>
                <SelectTrigger id="resend-reason" aria-label="Reason for resending">
                  <SelectValue placeholder="Choose a reason" />
                </SelectTrigger>
                <SelectContent>
                  {REASONS.map((r) => (
                    <SelectItem key={r.value} value={r.value}>
                      {r.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {reason !== '' && (
                <Input
                  aria-label="Reason details"
                  placeholder={reason === 'OTHER' ? 'Write the reason (required)' : 'Details (optional)'}
                  value={note}
                  maxLength={200}
                  onChange={(e) => setNote(e.target.value)}
                />
              )}
            </div>

            {error && (
              <p data-testid="resend-error" className="text-destructive">
                {error}
              </p>
            )}
          </div>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" disabled={resend.isPending} onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" disabled={!canConfirm} onClick={confirm}>
            {resend.isPending ? 'Queuing…' : 'Confirm resend'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
