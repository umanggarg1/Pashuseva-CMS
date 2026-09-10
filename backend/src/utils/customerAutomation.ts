import { orderRepository } from '../repositories/order.repository';
import { customerRepository } from '../repositories/customer.repository';
import type { PrismaClientOrTx } from '../lib/prisma';
// Phase 19's "is this order still active" definition moved to utils/activeOrder.ts
// (a leaf module) in the Phase 18 order->customer visibility follow-up, so
// utils/dataScope.ts and the order repository can share it without an import
// cycle. isOrderActive's behaviour is unchanged.
import { isOrderActive } from './activeOrder';

// Recomputes Customer.status from scratch from its current order set, and removes
// any Employee's CustomerAssignedEmployee row once none of the orders *they created*
// for this customer are still active (PHASE19_TODO.md design notes 4/6 — this only
// ever touches assignment rows tied to an Employee's own order-creation history for
// this customer; a manually-assigned Employee who never created an order here is
// never a candidate for removal). Idempotent and a full recompute rather than an
// incremental patch, so it self-heals regardless of what triggered it — call this
// after any order mutation that could change "is this customer active" for a given
// customerId, inside the same transaction as that mutation.
export async function recalculateCustomerState(customerId: number, tx: PrismaClientOrTx) {
  const orders = await orderRepository.findForCustomerRecalc(customerId, tx);

  const hasActiveOrder = orders.some(isOrderActive);
  await customerRepository.setStatus(customerId, hasActiveOrder ? 'ACTIVE' : 'INACTIVE', tx);

  const activeCreatorIds = new Set(
    orders.filter(isOrderActive).map((o) => o.createdById).filter((id): id is number => id !== null)
  );
  const everCreatorIds = new Set(
    orders.map((o) => o.createdById).filter((id): id is number => id !== null)
  );

  for (const employeeId of everCreatorIds) {
    if (!activeCreatorIds.has(employeeId)) {
      await customerRepository.unassign(customerId, employeeId, tx);
    }
  }
}
