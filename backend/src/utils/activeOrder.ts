import { Prisma } from '../generated/prisma/client';
import type { OrderStatus, DeliveryStatus } from '../generated/prisma/enums';

// The single definition of "is this order still an active, ongoing piece of work."
// Shared by:
//   - Customer status derivation + automatic Customer-Employee unassignment
//     (utils/customerAutomation.ts)
//   - Employee customer visibility, the order->customer bridge added as a Phase 18
//     follow-up (utils/dataScope.ts, repositories/order.repository.ts)
// This module deliberately has no local imports so every one of those can pull it
// in without an import cycle.
//
// See PHASE19_TODO.md design note 1: an order cancelled *before* dispatch
// (orderService.cancel's immediate-restore path) never enters the return flow, so
// its deliveryStatus stays NOT_DISPATCHED forever — that case is checked
// explicitly, it is not just "deliveryStatus is terminal." An order cancelled
// *after* dispatch stays active until it physically comes back (RETURNED / LOST /
// DAMAGED), so the handling Employee can still track the return (see PHASE18_TODO.md,
// the "reverse gap" follow-up under section 2).
export const DELIVERY_TERMINAL_STATUSES: readonly DeliveryStatus[] = [
  'DELIVERED',
  'RETURNED',
  'LOST',
  'DAMAGED',
];

export function isOrderActive(order: {
  orderStatus: OrderStatus;
  deliveryStatus: DeliveryStatus;
}): boolean {
  if (DELIVERY_TERMINAL_STATUSES.includes(order.deliveryStatus)) return false;
  if (order.orderStatus === 'CANCELLED' && order.deliveryStatus === 'NOT_DISPATCHED') return false;
  return true;
}

// The Prisma-where twin of isOrderActive — MUST stay logically identical to it.
// Any change to the predicate above has to be mirrored here (a table test over
// every deliveryStatus x {CANCELLED, non-CANCELLED} combination guards this).
export const activeOrderWhere: Prisma.OrderWhereInput = {
  deliveryStatus: { notIn: [...DELIVERY_TERMINAL_STATUSES] },
  NOT: { orderStatus: 'CANCELLED', deliveryStatus: 'NOT_DISPATCHED' },
};
