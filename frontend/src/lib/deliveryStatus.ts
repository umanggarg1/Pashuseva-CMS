// Delivery-status rules shared by Order Details' Change Status dialog and the
// Orders table's inline editor (Phase 23). UI only: they decide what's *offered*.
// The backend (order.service.ts: assertNotBackwardDelivery, the never-dispatched
// return guard, and the stock-restored-once check) is the authority on every
// transition; nothing here is relied on to block an invalid one.

export const DELIVERY_STEPS = [
  'NOT_DISPATCHED',
  'DISPATCHED',
  'IN_TRANSIT',
  'OUT_FOR_DELIVERY',
  'DELIVERED',
] as const;
// Every value the Change Status dialog can offer — forward path, then the
// return/exception branch. Mirrors the backend's DELIVERY_RETURN_SEQUENCE/
// DELIVERY_TERMINAL_STATUSES (order.service.ts) so the dropdown never offers
// something the server will then reject.
export const DELIVERY_STATUS_OPTIONS = [
  ...DELIVERY_STEPS,
  'RETURN_PENDING',
  'RETURN_IN_TRANSIT',
  'RETURNED',
  'LOST',
  'DAMAGED',
] as const;
export const DELIVERY_RETURN_SEQUENCE = ['RETURN_PENDING', 'RETURN_IN_TRANSIT', 'RETURNED'] as const;
export const DELIVERY_TERMINAL_STATUSES = ['DELIVERED', 'RETURNED', 'LOST', 'DAMAGED'];

export const isReturnStatus = (s: string) => (DELIVERY_RETURN_SEQUENCE as readonly string[]).includes(s);

// THE shared forward-option rule (Phase 24) — used by both the Orders table's inline
// menu and Order Details' Change Status dialog, so the two always offer the same
// choices. Every valid *forward* status from the current one (e.g. In Transit →
// Delivered directly) plus the return / Lost / Damaged options. Never the current
// status and never a backward move (those are getCorrectionOptions, Admin/Manager
// only). Every entry is a move the backend accepts from any role with
// delivery:update. See PHASE24_TODO.md "Menu".
export function getAllowedDeliveryStatusOptions(deliveryStatus: string, orderStatus: string): string[] {
  if (DELIVERY_TERMINAL_STATUSES.includes(deliveryStatus)) return [];
  const cancelled = orderStatus === 'CANCELLED';
  switch (deliveryStatus) {
    case 'NOT_DISPATCHED':
      return cancelled ? [] : ['DISPATCHED'];
    case 'DISPATCHED':
    case 'IN_TRANSIT':
    case 'OUT_FOR_DELIVERY': {
      // A cancelled order on a forward stage (only reachable via an Admin correction)
      // gets no forward options — Delivered would silently un-cancel it.
      const ahead = cancelled
        ? []
        : DELIVERY_STEPS.slice(DELIVERY_STEPS.indexOf(deliveryStatus) + 1);
      return [...ahead, 'RETURN_PENDING', 'LOST', 'DAMAGED', 'RETURNED'];
    }
    case 'RETURN_PENDING':
      return ['RETURN_IN_TRANSIT', 'LOST', 'DAMAGED', 'RETURNED'];
    case 'RETURN_IN_TRANSIT':
      return ['RETURNED', 'LOST', 'DAMAGED'];
    default:
      return [];
  }
}

// Admin/Manager corrections (Phase 24) — shown separately from the forward options,
// in Order Details' dialog only, never in the table. Everything that isn't the current
// status, isn't a forward option, and isn't *ahead* of the current status — a later
// forward step, or (while still on the forward path) any return-path status, e.g.
// Dispatched → Return In Transit is a forward move the menu deliberately omits, not a
// correction. None out of NOT_DISPATCHED (backend rule), and never back to
// NOT_DISPATCHED for a cancelled order (it could then neither be returned nor
// cancelled, so its stock would never come back).
export function getCorrectionOptions(deliveryStatus: string, orderStatus: string): string[] {
  if (deliveryStatus === 'NOT_DISPATCHED') return [];
  const forward = getAllowedDeliveryStatusOptions(deliveryStatus, orderStatus);
  const currentIndex = DELIVERY_STEPS.indexOf(deliveryStatus as (typeof DELIVERY_STEPS)[number]);
  return DELIVERY_STATUS_OPTIONS.filter((s) => {
    if (s === deliveryStatus || forward.includes(s)) return false;
    const index = DELIVERY_STEPS.indexOf(s as (typeof DELIVERY_STEPS)[number]);
    if (currentIndex !== -1 && index > currentIndex) return false;
    if (currentIndex !== -1 && isReturnStatus(s)) return false;
    if (s === 'NOT_DISPATCHED' && orderStatus === 'CANCELLED') return false;
    return true;
  });
}

// Statuses whose side effects (payment collection, received-by, stock restore,
// final exception) need the full Change Status dialog rather than a quick confirm.
export const DIALOG_STATUSES = ['DELIVERED', 'RETURNED', 'LOST', 'DAMAGED'];

export function deliveryStatusLabel(status: string) {
  return status.replace(/_/g, ' ');
}

// Phase 26: where a returned parcel comes back and who takes it in — the defaults the
// Change Status dialog pre-selects for RETURNED (staff can still pick "Other…").
export const RETURN_RECEIVED_AT = 'Kanina';
export const RETURN_RECEIVED_BY = 'Akash Enterprises';

export const STATUS_FIELD_CONFIG: Record<string, { locationLabel: string }> = {
  DISPATCHED: { locationLabel: 'Dispatch Location' },
  IN_TRANSIT: { locationLabel: 'Current Location' },
  OUT_FOR_DELIVERY: { locationLabel: 'Out for Delivery From' },
  DELIVERED: { locationLabel: 'Delivered At' },
  RETURN_PENDING: { locationLabel: 'Location' },
  RETURN_IN_TRANSIT: { locationLabel: 'Current Location' },
  RETURNED: { locationLabel: 'Received Back At' },
  LOST: { locationLabel: 'Last Known Location' },
  DAMAGED: { locationLabel: 'Location' },
};

export interface DeliveryAddress {
  addressLine: string;
  landmark: string | null;
  city: string;
  district: string | null;
  state: string;
  pincode: string;
}

export function formatOrderAddress(address: DeliveryAddress | null | undefined): string {
  if (!address) return '';
  return [address.addressLine, address.landmark, address.city, address.district, address.state, address.pincode]
    .filter(Boolean)
    .join(', ');
}
