import { customerRepository } from '../repositories/customer.repository';
import { orderRepository } from '../repositories/order.repository';
import { productRepository } from '../repositories/product.repository';
import { userRepository } from '../repositories/user.repository';
import { customerService } from './customer.service';
import { orderService } from './order.service';
import { productService } from './product.service';
import { userService } from './user.service';
import { logger } from '../logger';

export type TrashItemType = 'customer' | 'order' | 'product' | 'employee';

export interface TrashItem {
  type: TrashItemType;
  id: number;
  label: string;
  deletedBy: { id: number; name: string | null } | null;
  deletedAt: Date;
  deletionExpiresAt: Date;
}

function toItem(
  type: TrashItemType,
  id: number,
  label: string,
  deletedBy: { id: number; name: string | null } | null,
  deletedAt: Date | null,
  deletionExpiresAt: Date | null
): TrashItem {
  return { type, id, label, deletedBy, deletedAt: deletedAt!, deletionExpiresAt: deletionExpiresAt! };
}

// Admin-only aggregate view across all four trashable entities — Trash (Phase 3
// addendum). Each entity's own repository already excludes purged rows
// (findTrashed() filters purgedAt: null / row-doesn't-exist-once-purged for
// Product), so this never needs to filter that out itself.
export const trashService = {
  async list(type?: TrashItemType): Promise<TrashItem[]> {
    const [customers, orders, products, employees] = await Promise.all([
      !type || type === 'customer' ? customerRepository.findTrashed() : [],
      !type || type === 'order' ? orderRepository.findTrashed() : [],
      !type || type === 'product' ? productRepository.findTrashed() : [],
      !type || type === 'employee' ? userRepository.findTrashed() : [],
    ]);

    const items = [
      ...customers.map((c) => toItem('customer', c.id, c.name, c.deletedBy, c.deletedAt, c.deletionExpiresAt)),
      ...orders.map((o) =>
        toItem('order', o.id, o.orderNumber, o.deletedBy, o.deletedAt, o.deletionExpiresAt)
      ),
      ...products.map((p) => toItem('product', p.id, p.name, p.deletedBy, p.deletedAt, p.deletionExpiresAt)),
      ...employees.map((u) =>
        toItem('employee', u.id, u.name ?? u.email, u.deletedBy, u.deletedAt, u.deletionExpiresAt)
      ),
    ];
    return items.sort((a, b) => b.deletedAt.getTime() - a.deletedAt.getTime());
  },

  async count() {
    const items = await trashService.list();
    return items.length;
  },

  // The daily purge sweep — permanently removes (or, for Customer/Order/Employee,
  // anonymizes) everything whose deletionExpiresAt has passed. actingUser is null
  // throughout, same "System" attribution as every other automatic action in this
  // app's audit trail.
  async purgeExpired() {
    const [customers, orders, products, employees] = await Promise.all([
      customerRepository.findExpired(),
      orderRepository.findExpired(),
      productRepository.findExpired(),
      userRepository.findExpired(),
    ]);

    await Promise.all([
      ...customers.map((c) => customerService.permanentlyDelete(c.id, null)),
      ...orders.map((o) => orderService.permanentlyDelete(o.id, null)),
      ...products.map((p) => productService.permanentlyDelete(p.id)),
      ...employees.map((u) => userService.permanentlyDelete(u.id, null)),
    ]);

    const total = customers.length + orders.length + products.length + employees.length;
    if (total > 0) {
      logger.info(
        `Trash purge: permanently removed ${total} expired record(s) (${customers.length} customers, ${orders.length} orders, ${products.length} products, ${employees.length} employees).`
      );
    }
    return total;
  },
};

const PURGE_INTERVAL_MS = 60 * 60 * 1000; // hourly — see PHASE16_TODO.md for why an
// in-process interval instead of a real cron scheduler.

export function startTrashPurgeScheduler() {
  const run = () => {
    trashService.purgeExpired().catch((err) => logger.error('Trash purge failed', err));
  };
  run();
  return setInterval(run, PURGE_INTERVAL_MS);
}
