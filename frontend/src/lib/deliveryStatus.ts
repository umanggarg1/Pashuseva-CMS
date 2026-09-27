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

const isReturnStatus = (s: string) => (DELIVERY_RETURN_SEQUENCE as readonly string[]).includes(s);

// canOverride = Admin/Manager: any direction — except into the return path from
// NOT_DISPATCHED, which the backend refuses for every role (nothing left to return).
export function isDeliveryOptionAllowed(current: string, next: string, canOverride = false): boolean {
  if (current === 'NOT_DISPATCHED' && isReturnStatus(next)) return false;
  if (canOverride) return true;
  if (DELIVERY_TERMINAL_STATUSES.includes(current)) return next === current;
  if (next === 'LOST' || next === 'DAMAGED' || next === current) return true;
  const forwardCurrent = DELIVERY_STEPS.indexOf(current as (typeof DELIVERY_STEPS)[number]);
  const forwardNext = DELIVERY_STEPS.indexOf(next as (typeof DELIVERY_STEPS)[number]);
  if (forwardCurrent !== -1 && forwardNext !== -1) return forwardNext >= forwardCurrent;
  const returnCurrent = DELIVERY_RETURN_SEQUENCE.indexOf(
    current as (typeof DELIVERY_RETURN_SEQUENCE)[number]
  );
  const returnNext = DELIVERY_RETURN_SEQUENCE.indexOf(
    next as (typeof DELIVERY_RETURN_SEQUENCE)[number]
  );
  if (returnCurrent !== -1 && returnNext !== -1) return returnNext >= returnCurrent;
  return true; // crossing branches (e.g. forward -> return-pending) is always allowed
}

// Phase 23: what the Orders table's inline menu offers — only the next step plus
// Return / Lost / Damaged, never the current status and never a backward move
// (corrections stay in Order Details). Every entry is a forward move, so it's valid
// for Employee, Manager and Admin alike. See PHASE23_TODO.md "Next-step menu".
export function inlineNextStatuses(deliveryStatus: string, orderStatus: string): string[] {
  if (DELIVERY_TERMINAL_STATUSES.includes(deliveryStatus)) return [];
  const exceptions = ['LOST', 'DAMAGED'];
  switch (deliveryStatus) {
    case 'NOT_DISPATCHED':
      return orderStatus === 'CANCELLED' ? [] : ['DISPATCHED'];
    case 'DISPATCHED':
    case 'IN_TRANSIT':
    case 'OUT_FOR_DELIVERY': {
      if (orderStatus === 'CANCELLED') return ['RETURN_PENDING', ...exceptions];
      const next = DELIVERY_STEPS[DELIVERY_STEPS.indexOf(deliveryStatus) + 1];
      return [next, 'RETURN_PENDING', ...exceptions];
    }
    case 'RETURN_PENDING':
      return ['RETURN_IN_TRANSIT', ...exceptions];
    case 'RETURN_IN_TRANSIT':
      return ['RETURNED', ...exceptions];
    default:
      return [];
  }
}

// Statuses whose side effects (payment collection, received-by, stock restore,
// final exception) need the full Change Status dialog rather than a quick confirm.
export const DIALOG_STATUSES = ['DELIVERED', 'RETURNED', 'LOST', 'DAMAGED'];

export function deliveryStatusLabel(status: string) {
  return status.replace(/_/g, ' ');
}

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
