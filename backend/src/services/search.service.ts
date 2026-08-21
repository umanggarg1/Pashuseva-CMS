import { customerService } from './customer.service';
import { productService } from './product.service';
import { orderService } from './order.service';
import { userService } from './user.service';
import { customerListQuerySchema } from '../schemas/customer.schema';
import { productListQuerySchema } from '../schemas/product.schema';
import { orderListQuerySchema } from '../schemas/order.schema';
import { hasPermission } from '../utils/permissions';
import type { Role } from '../generated/prisma/enums';

type ActingUser = {
  id: number;
  role: Role | null;
  managerId?: number | null;
  permissions?: string[];
};

const RESULTS_PER_GROUP = 5;
const EMPTY = { data: [], total: 0 };

// Global nav search (Ctrl+K) — deliberately reuses each module's own permission-scoped
// list() rather than querying Prisma directly, so a search can never surface a record
// the acting user isn't otherwise allowed to see (phases.md-adjacent requirement — see
// PHASE1-6_TODO.md's "search results respect permissions" point). Deliveries are
// excluded — Phase 7 doesn't exist yet. Employees (Phase 14) reuses
// `userService.searchForGlobalSearch`, which returns [] outright for an Employee
// acting user rather than filtering results down, matching routes/api/users.ts's own
// Admin/Manager-only gate.
//
// Customer/order list() already scope every result to the acting user's own
// assignment (so a permission-less/PENDING user's query resolves to an empty set by
// construction), but product.list() has no such scoping — it's a flat query with no
// concept of "whose products." Checking the corresponding view permission explicitly
// before calling each sub-search (Phase 15) closes that gap rather than relying on
// each service's own — sometimes accidental — scoping to keep this safe.
export const searchService = {
  async globalSearch(actingUser: ActingUser, q: string) {
    const [customers, products, orders, employees] = await Promise.all([
      hasPermission(actingUser, 'customer:view')
        ? customerService.list(
            actingUser,
            customerListQuerySchema.parse({ search: q, page: 1, pageSize: RESULTS_PER_GROUP })
          )
        : EMPTY,
      hasPermission(actingUser, 'product:view')
        ? productService.list(
            productListQuerySchema.parse({ search: q, page: 1, pageSize: RESULTS_PER_GROUP })
          )
        : EMPTY,
      hasPermission(actingUser, 'order:view')
        ? orderService.list(
            actingUser,
            orderListQuerySchema.parse({ search: q, page: 1, pageSize: RESULTS_PER_GROUP })
          )
        : EMPTY,
      userService.searchForGlobalSearch(actingUser, q, RESULTS_PER_GROUP),
    ]);

    return {
      customers: { data: customers.data, total: customers.total },
      products: { data: products.data, total: products.total },
      orders: { data: orders.data, total: orders.total },
      employees: { data: employees, total: employees.length },
    };
  },
};
