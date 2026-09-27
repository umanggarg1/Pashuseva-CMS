import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { apiFetch, ApiError } from '@/lib/api';
import {
  DELIVERY_STATUS_OPTIONS,
  STATUS_FIELD_CONFIG,
  deliveryStatusLabel,
  formatOrderAddress,
  isDeliveryOptionAllowed,
  type DeliveryAddress,
} from '@/lib/deliveryStatus';

// Just what this dialog reads — Order Details passes its full order, the Orders
// table passes the order loaded when the dialog opens (Phase 23).
export interface DeliveryDialogOrder {
  id: number;
  deliveryStatus: string;
  paymentStatus: string;
  customer: { name: string };
  address?: DeliveryAddress | null;
}

// The order as PATCH /orders/:id/delivery-status returns it — callers merge these
// into their caches.
export interface SavedDeliveryOrder {
  id: number;
  deliveryStatus: string;
  orderStatus: string;
  paymentStatus: string;
}

// Moved out of OrderDetail.tsx in Phase 23 so the Orders table's inline editor opens
// the *same* dialog for Delivered / Returned / Lost / Damaged — one implementation of
// the payment-collection, received-by and stock-restore handling. Works either
// self-contained (its own "Change Status" button, as on Order Details — resets on
// every open) or opened by the caller with a preselected status (`open` /
// `onOpenChange` / `initialStatus`); a caller-opened dialog is mounted fresh for
// each opening, so its starting values come straight from the props below.
export default function ChangeDeliveryStatusDialog({
  order,
  canOverrideStatus,
  canAddPayment,
  remaining,
  onSuccess,
  open: controlledOpen,
  onOpenChange,
  initialStatus,
  showTrigger = true,
}: {
  order: DeliveryDialogOrder;
  canOverrideStatus: boolean;
  canAddPayment: boolean;
  remaining: number | undefined;
  onSuccess: (order: SavedDeliveryOrder) => void;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  initialStatus?: string;
  showTrigger?: boolean;
}) {
  const currentStatus = order.deliveryStatus;
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen ?? internalOpen;
  const [status, setStatus] = useState(initialStatus ?? currentStatus);
  // Opened straight at Delivered (Orders table) → pre-fill Delivered At the same way
  // picking Delivered in the dropdown does (handleStatusChange below).
  const [location, setLocation] = useState(() =>
    initialStatus === 'DELIVERED' ? formatOrderAddress(order.address) : ''
  );
  const [note, setNote] = useState('');
  const [receivedByOption, setReceivedByOption] = useState<'customer' | 'other'>('customer');
  const [receivedByOther, setReceivedByOther] = useState('');
  // Bundling a payment collected at the point of delivery into this same action
  // (COD, or confirming an online payment already made) — only relevant once
  // there's something left to pay. Defaults to Unpaid: recording a payment is an
  // explicit choice, never assumed just because the parcel was delivered.
  const [paymentStatusChoice, setPaymentStatusChoice] = useState<'UNPAID' | 'PAID'>('UNPAID');
  const [paymentMethod, setPaymentMethod] = useState<'CASH' | 'ONLINE'>('CASH');

  const isDelivered = status === 'DELIVERED';
  const showPaymentSection = isDelivered && canAddPayment && order.paymentStatus !== 'PAID';
  const receivedBy = receivedByOption === 'customer' ? order.customer.name : receivedByOther;

  const config = STATUS_FIELD_CONFIG[status] ?? { locationLabel: 'Location' };

  function resetFields(nextStatus: string) {
    setStatus(nextStatus);
    setLocation('');
    setNote('');
    setReceivedByOption('customer');
    setReceivedByOther('');
    setPaymentStatusChoice('UNPAID');
    setPaymentMethod('CASH');
  }

  function setOpen(next: boolean) {
    // Self-contained mode: start clean from the current status on every open.
    if (next && controlledOpen === undefined) resetFields(currentStatus);
    if (controlledOpen === undefined) setInternalOpen(next);
    onOpenChange?.(next);
  }

  // Pre-fill Delivered At with the order's own delivery address the moment
  // Delivered is selected — staff just confirms it rather than typing from
  // scratch, but can still edit or clear it.
  function handleStatusChange(next: string) {
    setStatus(next);
    if (next === 'DELIVERED' && !location) {
      setLocation(formatOrderAddress(order.address));
    }
  }

  const updateStatus = useMutation({
    mutationFn: () =>
      apiFetch<SavedDeliveryOrder>(`/orders/${order.id}/delivery-status`, {
        method: 'PATCH',
        body: JSON.stringify({
          deliveryStatus: status,
          location: location || undefined,
          note: note || undefined,
          receivedBy:
            status === 'DELIVERED' || status === 'RETURNED' ? receivedBy || undefined : undefined,
          ...(showPaymentSection && {
            paymentCollected: paymentStatusChoice === 'PAID',
            ...(paymentStatusChoice === 'PAID' && { paymentMethod }),
          }),
        }),
      }),
    onSuccess: (saved) => {
      toast.success('Delivery status updated');
      onSuccess(saved);
      setOpen(false);
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : 'Failed to update delivery status'),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {showTrigger && (
        <DialogTrigger asChild>
          <Button variant="outline">Change Status</Button>
        </DialogTrigger>
      )}
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Change Status</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <p className="text-muted-foreground">
            Current: <span className="font-medium">{deliveryStatusLabel(currentStatus)}</span>
          </p>
          <div>
            <label className="text-sm font-medium">New Status</label>
            <Select value={status} onValueChange={handleStatusChange}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DELIVERY_STATUS_OPTIONS.filter((s) =>
                  isDeliveryOptionAllowed(currentStatus, s, canOverrideStatus)
                ).map((s) => (
                  <SelectItem key={s} value={s}>
                    {deliveryStatusLabel(s)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="mt-1 text-xs text-muted-foreground">
              {canOverrideStatus
                ? 'You can pick any stage, including going back, or re-selecting the current one again to log a new location.'
                : 'You can move forward (including starting a return, or marking Lost/Damaged), or re-select the current status again to log a new location — a Manager/Admin can move a status backward if needed.'}
            </p>
          </div>
          <div>
            <label className="text-sm font-medium">{config.locationLabel}</label>
            <Input value={location} onChange={(e) => setLocation(e.target.value)} />
          </div>
          {(status === 'DELIVERED' || status === 'RETURNED') && (
            <div className="space-y-2">
              <label className="text-sm font-medium">Received By</label>
              <Select
                value={receivedByOption}
                onValueChange={(v) => setReceivedByOption(v as 'customer' | 'other')}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="customer">{order.customer.name}</SelectItem>
                  <SelectItem value="other">Other…</SelectItem>
                </SelectContent>
              </Select>
              {receivedByOption === 'other' && (
                <Input
                  value={receivedByOther}
                  onChange={(e) => setReceivedByOther(e.target.value)}
                  placeholder="e.g. Rajesh Kumar"
                />
              )}
            </div>
          )}
          {showPaymentSection && (
            <div className="space-y-3 rounded-md border p-3">
              <p className="text-sm font-semibold">Payment Details</p>
              {remaining !== undefined && (
                <p className="text-xs text-muted-foreground">
                  Remaining balance: ₹{remaining.toLocaleString()}
                </p>
              )}
              <div>
                <label className="text-xs font-medium text-muted-foreground">Payment Status</label>
                <div className="mt-1 flex gap-2">
                  {(['UNPAID', 'PAID'] as const).map((s) => (
                    <Button
                      key={s}
                      type="button"
                      size="sm"
                      variant={paymentStatusChoice === s ? 'default' : 'outline'}
                      onClick={() => setPaymentStatusChoice(s)}
                    >
                      {s === 'UNPAID' ? 'Unpaid' : 'Paid'}
                    </Button>
                  ))}
                </div>
              </div>
              {paymentStatusChoice === 'PAID' && (
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Payment Method</label>
                  <div className="mt-1 flex gap-2">
                    {(['CASH', 'ONLINE'] as const).map((m) => (
                      <Button
                        key={m}
                        type="button"
                        size="sm"
                        variant={paymentMethod === m ? 'default' : 'outline'}
                        onClick={() => setPaymentMethod(m)}
                      >
                        {m === 'CASH' ? 'COD' : 'Online'}
                      </Button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
          <div>
            <label className="text-sm font-medium">Note</label>
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional note" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            disabled={updateStatus.isPending}
            onClick={() => updateStatus.mutate()}
          >
            {updateStatus.isPending
              ? 'Updating…'
              : status === 'DELIVERED'
                ? 'Mark as Delivered'
                : 'Update Status'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
