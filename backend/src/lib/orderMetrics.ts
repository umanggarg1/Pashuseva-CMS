import type { OrderStatus } from '../generated/prisma/enums';

// Single source of truth for "what counts as a real order" across Dashboard, Reports,
// and anywhere else that aggregates orders — a cancelled order never happened as far as
// revenue or product-sold counts are concerned. Everything that sums money or "units
// sold" must filter through this; everything that just counts/lists orders (Orders
// page, dashboard's "Total Orders", Recent Orders) intentionally does NOT — those are
// meant to include cancelled orders, since they're about "what exists," not "what sold."
export const CANCELLED_STATUS: OrderStatus = 'CANCELLED';

export const salesEligibleFilter = { orderStatus: { not: CANCELLED_STATUS } } as const;
