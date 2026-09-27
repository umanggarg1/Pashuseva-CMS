import { useState } from 'react';
import type { MouseEvent, ReactNode } from 'react';
import { Loader2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select';
import { ApiError } from '@/lib/api';
import {
  DIALOG_STATUSES,
  STATUS_FIELD_CONFIG,
  deliveryStatusLabel,
  getAllowedDeliveryStatusOptions,
} from '@/lib/deliveryStatus';

// Phase 23: inline Delivery Status on the Orders table (desktop rows + mobile cards).
// UI state only, same split as ArticleNumberEditor — the page owns the save and all
// cache handling. The menu shows the current status as a disabled ✓ item, then
// getAllowedDeliveryStatusOptions (Phase 24: every valid forward step + Return / Lost / Damaged,
// never a backward move), then — for a Not Dispatched order and a user with
// order:cancel — "Cancel order…". Simple statuses go through a small confirm box with
// an optional location; Cancel order… through the same box with a required reason;
// Delivered / Returned / Lost / Damaged are handed to the page, which opens the
// shared ChangeDeliveryStatusDialog. The backend still decides whether any
// transition is allowed.

// Menu value for the order-level cancel action (not a delivery status).
const CANCEL_ORDER = '__cancel_order__';
export default function DeliveryStatusEditor({
  orderNumber,
  deliveryStatus,
  orderStatus,
  canEdit,
  canCancel = false,
  badge,
  onSave,
  onOpenDialog,
  onCancelOrder,
}: {
  orderNumber: string;
  deliveryStatus: string;
  orderStatus: string;
  canEdit: boolean;
  badge: ReactNode;
  onSave: (deliveryStatus: string, location: string | undefined) => Promise<unknown>;
  onOpenDialog: (deliveryStatus: string) => void;
  canCancel?: boolean;
  onCancelOrder?: (reason: string) => Promise<unknown>;
}) {
  const [pending, setPending] = useState<string | null>(null);
  const [location, setLocation] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const options = canEdit ? getAllowedDeliveryStatusOptions(deliveryStatus, orderStatus) : [];
  const offerCancel =
    canCancel && !!onCancelOrder && deliveryStatus === 'NOT_DISPATCHED' && orderStatus !== 'CANCELLED';
  if (options.length === 0 && !offerCancel) return <>{badge}</>;
  const isCancel = pending === CANCEL_ORDER;

  function choose(next: string) {
    if (DIALOG_STATUSES.includes(next)) {
      onOpenDialog(next);
      return;
    }
    setLocation('');
    setError(null);
    setPending(next);
  }

  function close() {
    if (saving) return;
    setPending(null);
    setError(null);
  }

  async function confirm() {
    if (!pending || saving) return;
    // The cancel reason is required (POST /:id/cancel rejects an empty one).
    if (isCancel && !location.trim()) {
      setError('A reason is required to cancel the order.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      if (isCancel) await onCancelOrder!(location.trim());
      else await onSave(pending, location.trim() || undefined);
      setPending(null);
    } catch (err) {
      const fallback = isCancel ? 'Failed to cancel the order' : 'Failed to update delivery status';
      setError(err instanceof ApiError ? err.message : fallback);
    } finally {
      setSaving(false);
    }
  }

  // Keeps a mobile card's <Link> from navigating. The menu and confirm box are
  // portalled, but their React events still bubble through here.
  function stopClick(e: MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
  }

  const willCancel = pending === 'RETURN_PENDING' && orderStatus !== 'CANCELLED';

  return (
    <span className="inline-flex" onClick={stopClick}>
      <Select value="" onValueChange={choose}>
        <SelectTrigger
          aria-label={`Change delivery status (currently ${deliveryStatusLabel(deliveryStatus)})`}
          className="h-auto w-auto gap-1 rounded-full border-0 bg-transparent p-0 hover:opacity-80 focus:ring-1 focus:ring-offset-0 [&>svg]:h-3.5 [&>svg]:w-3.5"
        >
          {badge}
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={`__current__${deliveryStatus}`} disabled>
            ✓ {deliveryStatusLabel(deliveryStatus)}
          </SelectItem>
          {options.map((s) => (
            <SelectItem key={s} value={s}>
              {deliveryStatusLabel(s)}
              {DIALOG_STATUSES.includes(s) ? '…' : ''}
            </SelectItem>
          ))}
          {offerCancel && (
            <SelectItem value={CANCEL_ORDER} className="text-destructive">
              Cancel order…
            </SelectItem>
          )}
        </SelectContent>
      </Select>

      <Dialog open={pending !== null} onOpenChange={(next) => !next && close()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {isCancel
                ? `Cancel ${orderNumber}?`
                : `Mark as ${pending ? deliveryStatusLabel(pending) : ''}?`}
            </DialogTitle>
            <DialogDescription>
              {isCancel
                ? 'Never dispatched, so its stock goes back immediately.'
                : `${orderNumber} · currently ${deliveryStatusLabel(deliveryStatus)}`}
            </DialogDescription>
          </DialogHeader>
          {willCancel && (
            <p className="rounded-md bg-amber-50 p-2 text-sm text-amber-700">
              Starting a return also marks the order as Cancelled.
            </p>
          )}
          <div className="space-y-1 text-sm">
            <label className="font-medium" htmlFor="inline-delivery-location">
              {isCancel
                ? 'Reason'
                : (pending && STATUS_FIELD_CONFIG[pending]?.locationLabel) || 'Location'}{' '}
              <span className="font-normal text-muted-foreground">
                {isCancel ? '(required)' : '(optional)'}
              </span>
            </label>
            <Input
              id="inline-delivery-location"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  void confirm();
                }
              }}
              disabled={saving}
            />
            {error && <p className="text-xs text-destructive">{error}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={close} disabled={saving}>
              {isCancel ? 'Keep order' : 'Cancel'}
            </Button>
            <Button
              variant={isCancel ? 'destructive' : 'default'}
              onClick={() => void confirm()}
              disabled={saving || (isCancel && !location.trim())}
            >
              {saving && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
              {isCancel ? 'Cancel order' : 'Confirm'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </span>
  );
}
