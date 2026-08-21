import prisma from '../lib/prisma';
import { Prisma } from '../generated/prisma/client';
import { productService } from './product.service';
import { salesEligibleFilter } from '../lib/orderMetrics';
import { customerDataWhere, orderDataWhere } from '../utils/dataScope';
import type { Role, DataScope } from '../generated/prisma/enums';
import type {
  ReportRange,
  SalesReportQuery,
  OrdersReportQuery,
  CustomersReportQuery,
  PaymentsReportQuery,
} from '../schemas/dashboard.schema';

type ActingUser = {
  id: number;
  role: Role | null;
  customerDataScope?: DataScope | null;
  orderDataScope?: DataScope | null;
};

// Same Data Scope rule as buildOrderWhere/buildCustomerWhere in order.service.ts /
// customer.service.ts (Phase 15 addendum) — shared via utils/dataScope.ts so the
// dashboard/reports and the list endpoints never see a different answer to "which
// records can this user see."
function orderScope(actingUser: ActingUser): Prisma.OrderWhereInput {
  return orderDataWhere(actingUser, actingUser.orderDataScope);
}

function customerScope(actingUser: ActingUser): Prisma.CustomerWhereInput {
  return customerDataWhere(actingUser, actingUser.customerDataScope);
}

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}
function endOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
}

// Calendar-based windows (week starts Monday, month starts the 1st) — used by both the
// dashboard's compact numbers and the Sales Report's date filter, so they always agree.
function resolveRange(range: ReportRange, from?: Date, to?: Date): { start: Date; end: Date } {
  const now = new Date();
  switch (range) {
    case 'today':
      return { start: startOfDay(now), end: endOfDay(now) };
    case 'yesterday': {
      const y = new Date(now);
      y.setDate(y.getDate() - 1);
      return { start: startOfDay(y), end: endOfDay(y) };
    }
    case 'week': {
      const day = now.getDay();
      const diffToMonday = day === 0 ? 6 : day - 1;
      const monday = new Date(now);
      monday.setDate(now.getDate() - diffToMonday);
      return { start: startOfDay(monday), end: endOfDay(now) };
    }
    case 'lastMonth': {
      const firstOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const lastOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0);
      return { start: startOfDay(firstOfLastMonth), end: endOfDay(lastOfLastMonth) };
    }
    case 'custom':
      return {
        start: from ? startOfDay(from) : startOfDay(now),
        end: to ? endOfDay(to) : endOfDay(now),
      };
    case 'month':
    default: {
      const first = new Date(now.getFullYear(), now.getMonth(), 1);
      return { start: startOfDay(first), end: endOfDay(now) };
    }
  }
}

async function salesTotal(scope: Prisma.OrderWhereInput, start: Date, end: Date) {
  const result = await prisma.order.aggregate({
    where: { ...scope, ...salesEligibleFilter, orderDate: { gte: start, lte: end } },
    _sum: { total: true },
  });
  return result._sum.total ?? 0;
}

// Phase 13 §16/§17/§20: outstanding = what's owed minus what's actually been paid,
// summed across every non-cancelled order in scope — never a stored/cached figure,
// always derived fresh from Order.total and the Payment ledger, same "never let two
// numbers drift" principle as an individual order's own paymentStatus.
async function outstandingTotal(scope: Prisma.OrderWhereInput) {
  const eligible = { ...scope, ...salesEligibleFilter };
  const [orderTotals, paid] = await Promise.all([
    prisma.order.aggregate({ where: eligible, _sum: { total: true } }),
    prisma.payment.aggregate({ where: { order: { is: eligible } }, _sum: { amount: true } }),
  ]);
  return (orderTotals._sum.total ?? 0) - (paid._sum.amount ?? 0);
}

async function paymentsCollected(scope: Prisma.OrderWhereInput, start: Date, end: Date) {
  const result = await prisma.payment.aggregate({
    where: { order: { is: scope }, createdAt: { gte: start, lte: end } },
    _sum: { amount: true },
  });
  return result._sum.amount ?? 0;
}

// "Sold" follows the same rule as "sales" — a cancelled order's items were never
// actually fulfilled, so they don't count toward quantity sold either.
async function topProducts(scope: Prisma.OrderWhereInput, take: number) {
  const grouped = await prisma.orderItem.groupBy({
    by: ['productId'],
    where: { productId: { not: null }, order: { is: { ...scope, ...salesEligibleFilter } } },
    _sum: { quantity: true },
    orderBy: { _sum: { quantity: 'desc' } },
    take,
  });
  const products = await prisma.product.findMany({
    where: { id: { in: grouped.map((g) => g.productId!) } },
    select: { id: true, name: true, unit: true },
  });
  const byId = new Map(products.map((p) => [p.id, p]));
  return grouped
    .filter((g) => byId.has(g.productId!))
    .map((g) => ({
      productId: g.productId!,
      name: byId.get(g.productId!)!.name,
      unit: byId.get(g.productId!)!.unit,
      quantitySold: g._sum.quantity ?? 0,
    }));
}

export const dashboardService = {
  async getSummary(actingUser: ActingUser) {
    const oScope = orderScope(actingUser);
    const cScope = customerScope(actingUser);
    const now = new Date();
    const today = { start: startOfDay(now), end: endOfDay(now) };
    const week = resolveRange('week');
    const month = resolveRange('month');

    const [
      totalCustomers,
      newCustomersToday,
      totalOrders,
      ordersToday,
      byOrderStatus,
      byDeliveryStatus,
      salesToday,
      salesThisWeek,
      salesThisMonth,
      outstanding,
      paymentsToday,
      recentOrders,
      recentCustomers,
      top,
      lowStock,
      outOfStock,
    ] = await Promise.all([
      prisma.customer.count({ where: cScope }),
      prisma.customer.count({ where: { ...cScope, createdAt: { gte: today.start, lte: today.end } } }),
      prisma.order.count({ where: oScope }),
      prisma.order.count({ where: { ...oScope, orderDate: { gte: today.start, lte: today.end } } }),
      prisma.order.groupBy({ by: ['orderStatus'], where: oScope, _count: true }),
      prisma.order.groupBy({ by: ['deliveryStatus'], where: oScope, _count: true }),
      salesTotal(oScope, today.start, today.end),
      salesTotal(oScope, week.start, week.end),
      salesTotal(oScope, month.start, month.end),
      outstandingTotal(oScope),
      paymentsCollected(oScope, today.start, today.end),
      prisma.order.findMany({
        where: oScope,
        orderBy: { orderDate: 'desc' },
        take: 5,
        select: {
          id: true,
          orderNumber: true,
          total: true,
          orderStatus: true,
          deliveryStatus: true,
          orderDate: true,
          customer: { select: { name: true } },
        },
      }),
      prisma.customer.findMany({
        where: cScope,
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: { id: true, name: true, createdAt: true },
      }),
      topProducts(oScope, 5),
      productService.list({ stock: 'low', page: 1, pageSize: 5, sortBy: 'availableQty', sortDir: 'asc' }),
      productService.list({ stock: 'out', page: 1, pageSize: 5, sortBy: 'availableQty', sortDir: 'asc' }),
    ]);

    // "Today's Overview" wants how many orders were *newly* dispatched / put in transit
    // / delivered today, not the running totals (those are the Orders/Delivery Overview
    // sections below) — count distinct orders per status from today's tracking events,
    // not raw event rows, since IN_TRANSIT can legitimately be logged more than once
    // per order in a day.
    const trackingToday = await prisma.deliveryTracking.findMany({
      where: { createdAt: { gte: today.start, lte: today.end }, order: { is: oScope } },
      select: { orderId: true, status: true },
    });
    const todayDeliverySets: Record<string, Set<number>> = {};
    for (const t of trackingToday) {
      (todayDeliverySets[t.status] ??= new Set()).add(t.orderId);
    }
    const todayDeliveryStatusCounts = Object.fromEntries(
      Object.entries(todayDeliverySets).map(([k, v]) => [k, v.size])
    );

    const orderStatusCounts = Object.fromEntries(
      byOrderStatus.map((r) => [r.orderStatus, r._count])
    );
    const deliveryStatusCounts = Object.fromEntries(
      byDeliveryStatus.map((r) => [r.deliveryStatus, r._count])
    );

    return {
      customers: { total: totalCustomers, newToday: newCustomersToday },
      orders: {
        total: totalOrders,
        today: ordersToday,
        pending: orderStatusCounts.PENDING ?? 0,
        byStatus: orderStatusCounts,
        byDeliveryStatus: deliveryStatusCounts,
        todayDeliveryStatusCounts,
      },
      sales: { today: salesToday, thisWeek: salesThisWeek, thisMonth: salesThisMonth },
      outstanding,
      paymentsToday,
      lowStockCount: lowStock.total,
      outOfStockCount: outOfStock.total,
      lowStockProducts: lowStock.data.map((p) => ({
        id: p.id,
        name: p.name,
        unit: p.unit,
        availableQty: p.availableQty,
      })),
      recentOrders: recentOrders.map((o) => ({
        id: o.id,
        orderNumber: o.orderNumber,
        total: o.total,
        orderStatus: o.orderStatus,
        deliveryStatus: o.deliveryStatus,
        orderDate: o.orderDate,
        customerName: o.customer.name,
      })),
      recentCustomers: recentCustomers.map((c) => ({
        id: c.id,
        name: c.name,
        createdAt: c.createdAt,
      })),
      topProducts: top,
    };
  },

  async getSalesReport(actingUser: ActingUser, query: SalesReportQuery) {
    const scope = orderScope(actingUser);
    const { start, end } = resolveRange(query.range, query.from, query.to);

    const orders = await prisma.order.findMany({
      where: { ...scope, ...salesEligibleFilter, orderDate: { gte: start, lte: end } },
      select: { id: true, orderNumber: true, total: true, orderDate: true, customer: { select: { name: true } } },
      orderBy: { orderDate: 'desc' },
    });

    const totalOrders = orders.length;
    const totalSales = orders.reduce((sum, o) => sum + o.total, 0);
    const averageOrder = totalOrders > 0 ? totalSales / totalOrders : 0;

    const dailyMap = new Map<string, number>();
    for (const o of orders) {
      const key = startOfDay(o.orderDate).toISOString().slice(0, 10);
      dailyMap.set(key, (dailyMap.get(key) ?? 0) + o.total);
    }
    const dailyBreakdown = Array.from(dailyMap.entries())
      .map(([date, total]) => ({ date, total }))
      .sort((a, b) => a.date.localeCompare(b.date));

    return {
      range: { start, end },
      totalOrders,
      totalSales,
      averageOrder,
      dailyBreakdown,
      orders: orders.map((o) => ({
        id: o.id,
        orderNumber: o.orderNumber,
        customerName: o.customer.name,
        total: o.total,
        orderDate: o.orderDate,
      })),
    };
  },

  async getOrdersReport(actingUser: ActingUser, query: OrdersReportQuery) {
    const scope = orderScope(actingUser);
    const { start, end } = resolveRange(query.range, query.from, query.to);

    const where: Prisma.OrderWhereInput = {
      ...scope,
      orderDate: { gte: start, lte: end },
      ...(query.status && { orderStatus: query.status }),
      ...(actingUser.role === 'ADMIN' && query.employeeId && { assignedEmployeeId: query.employeeId }),
      ...(query.customerId && { customerId: query.customerId }),
    };

    const [total, byStatus, byDeliveryStatus] = await Promise.all([
      prisma.order.count({ where }),
      prisma.order.groupBy({ by: ['orderStatus'], where, _count: true }),
      prisma.order.groupBy({ by: ['deliveryStatus'], where, _count: true }),
    ]);

    return {
      range: { start, end },
      totalOrders: total,
      byStatus: Object.fromEntries(byStatus.map((r) => [r.orderStatus, r._count])),
      byDeliveryStatus: Object.fromEntries(byDeliveryStatus.map((r) => [r.deliveryStatus, r._count])),
    };
  },

  async getCustomersReport(actingUser: ActingUser, query: CustomersReportQuery) {
    const scope = customerScope(actingUser);
    const { start, end } = resolveRange(query.range);

    const [total, newInRange, active, topSpendersRaw] = await Promise.all([
      prisma.customer.count({ where: scope }),
      prisma.customer.count({ where: { ...scope, createdAt: { gte: start, lte: end } } }),
      prisma.customer.count({ where: { ...scope, status: 'ACTIVE' } }),
      prisma.order.groupBy({
        by: ['customerId'],
        where: { ...orderScope(actingUser), ...salesEligibleFilter },
        _sum: { total: true },
        orderBy: { _sum: { total: 'desc' } },
        take: 5,
      }),
    ]);

    const customers = await prisma.customer.findMany({
      where: { id: { in: topSpendersRaw.map((r) => r.customerId) } },
      select: { id: true, name: true },
    });
    const byId = new Map(customers.map((c) => [c.id, c.name]));

    return {
      range: { start, end },
      totalCustomers: total,
      newCustomers: newInRange,
      activeCustomers: active,
      topCustomers: topSpendersRaw
        .filter((r) => byId.has(r.customerId))
        .map((r) => ({
          customerId: r.customerId,
          name: byId.get(r.customerId)!,
          totalSpend: r._sum.total ?? 0,
        })),
    };
  },

  async getProductsReport(actingUser: ActingUser) {
    // Products themselves aren't assignment-scoped (no employee-owns-a-product
    // concept), so the catalog counts are global — only "best selling" is scoped, since
    // that's derived from this user's visible orders.
    const [total, active, low, out, top] = await Promise.all([
      prisma.product.count(),
      prisma.product.count({ where: { active: true } }),
      productService.list({ stock: 'low', page: 1, pageSize: 1, sortBy: 'availableQty', sortDir: 'asc' }),
      productService.list({ stock: 'out', page: 1, pageSize: 1, sortBy: 'availableQty', sortDir: 'asc' }),
      topProducts(orderScope(actingUser), 5),
    ]);

    return {
      totalProducts: total,
      activeProducts: active,
      lowStock: low.total,
      outOfStock: out.total,
      bestSelling: top,
    };
  },

  async getPaymentsReport(actingUser: ActingUser, query: PaymentsReportQuery) {
    const { start, end } = resolveRange(query.range, query.from, query.to);
    const where: Prisma.PaymentWhereInput = {
      order: {
        is: {
          ...orderScope(actingUser),
          ...(actingUser.role === 'ADMIN' &&
            query.employeeId && { assignedEmployeeId: query.employeeId }),
        },
      },
      createdAt: { gte: start, lte: end },
      ...(query.method && { method: query.method }),
    };

    const [totalCollected, byMethod, payments] = await Promise.all([
      prisma.payment.aggregate({ where, _sum: { amount: true } }),
      prisma.payment.groupBy({ by: ['method'], where, _sum: { amount: true } }),
      prisma.payment.findMany({
        where,
        select: {
          id: true,
          amount: true,
          method: true,
          referenceNumber: true,
          createdAt: true,
          order: { select: { orderNumber: true, customer: { select: { name: true } } } },
          createdBy: { select: { name: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    return {
      range: { start, end },
      totalCollected: totalCollected._sum.amount ?? 0,
      byMethod: Object.fromEntries(byMethod.map((r) => [r.method, r._sum.amount ?? 0])),
      payments: payments.map((p) => ({
        id: p.id,
        amount: p.amount,
        method: p.method,
        referenceNumber: p.referenceNumber,
        createdAt: p.createdAt,
        orderNumber: p.order.orderNumber,
        customerName: p.order.customer.name,
        createdByName: p.createdBy?.name ?? null,
      })),
    };
  },
};
