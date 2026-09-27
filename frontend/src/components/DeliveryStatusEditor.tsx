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
  inlineNextStatuses,
} from '@/lib/deliveryStatus';

// Phase 23: inline Delivery Status on the Orders table (desktop rows + mobile cards).
// UI state only, same split as ArticleNumberEditor — the page owns the save and all
// cache handling. The menu lists only inlineNextStatuses (next step + Return / Lost /
// Damaged, never the current status or a backward move). Simple statuses go through a
// small confirm box with an optional location; Delivered / Returned / Lost / Damaged
// are handed to the page, which opens the shared ChangeDeliveryStatusDialog. The
// backend still decides whether any transition is allowed.
export default function DeliveryStatusEditor({
  orderNumber,
  deliveryStatus,
  orderStatus,
  canEdit,
  badge,
  onSave,
  onOpenDialog,
}: {
  orderNumber: string;
  deliveryStatus: string;
  orderStatus: string;
  canEdit: boolean;
  badge: ReactNode;
  onSave: (deliveryStatus: string, location: string | undefined) => Promise<unknown>;
  onOpenDialog: (deliveryStatus: string) => void;
}) {
  const [pending, setPending] = useState<string | null>(null);
  const [location, setLocation] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const options = canEdit ? inlineNextStatuses(deliveryStatus, orderStatus) : [];
  if (options.length === 0) return <>{badge}</>;

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
    setSaving(true);
    setError(null);
    try {
      await onSave(pending, location.trim() || undefined);
      setPending(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to update delivery status');
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
          {options.map((s) => (
            <SelectItem key={s} value={s}>
              {deliveryStatusLabel(s)}
              {DIALOG_STATUSES.includes(s) ? '…' : ''}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Dialog open={pending !== null} onOpenChange={(next) => !next && close()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Mark as {pending ? deliveryStatusLabel(pending) : ''}?</DialogTitle>
            <DialogDescription>
              {orderNumber} · currently {deliveryStatusLabel(deliveryStatus)}
            </DialogDescription>
          </DialogHeader>
          {willCancel && (
            <p className="rounded-md bg-amber-50 p-2 text-sm text-amber-700">
              Starting a return also marks the order as Cancelled.
            </p>
          )}
          <div className="space-y-1 text-sm">
            <label className="font-medium" htmlFor="inline-delivery-location">
              {(pending && STATUS_FIELD_CONFIG[pending]?.locationLabel) || 'Location'}{' '}
              <span className="font-normal text-muted-foreground">(optional)</span>
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
              Cancel
            </Button>
            <Button onClick={() => void confirm()} disabled={saving}>
              {saving && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </span>
  );
}
