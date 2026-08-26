import prisma, { PrismaClientOrTx } from '../lib/prisma';
import { Prisma } from '../generated/prisma/client';
import type {
  OrderStatus,
  PaymentStatus,
  DeliveryStatus,
  PaymentMethod,
} from '../generated/prisma/enums';

interface OrderItemInput {
  productId: number;
  productName: string;
  productSKU: string;
  unit?: string;
  quantity: number;
  unitPrice: number;
  discount: number;
  totalPrice: number;
}

interface OrderAddressInput {
  addressLine: string;
  landmark?: string;
  city: string;
  district?: string;
  state: string;
  pincode: string;
  country?: string;
}

export const orderRepository = {
  // Every one of these excludes trashed orders by default — Trash (Phase 3
  // addendum) has its own dedicated findTrashed/restore/permanentDelete below. Note
  // this is about the Order itself being trashed, not its customer — an order whose
  // *customer* has been trashed still shows here normally (see phases.md's addendum).
  async findMany(
    where: Prisma.OrderWhereInput,
    options: { skip: number; take: number; orderBy: Prisma.OrderOrderByWithRelationInput }
  ) {
    const whereActive = { ...where, deletedAt: null };
    const [data, total] = await Promise.all([
      prisma.order.findMany({
        where: whereActive,
        include: {
          customer: {
            select: { id: true, name: true, phones: { where: { isPrimary: true }, take: 1 } },
          },
          assignedEmployees: { include: { employee: { select: { id: true, name: true } } } },
        },
        skip: options.skip,
        take: options.take,
        orderBy: options.orderBy,
      }),
      prisma.order.count({ where: whereActive }),
    ]);
    return { data, total };
  },

  findById(id: number) {
    return prisma.order.findFirst({
      where: { id, deletedAt: null },
      include: {
        items: {
          include: {
            product: {
              select: { id: true, name: true, image: true, weightValue: true, weightUnit: true },
            },
          },
        },
        address: true,
        // assignedEmployee.managedBy (Phase 18 item 3) is fetched here too, not just
        // in findAssignmentById — assertOrderAccessible (order.service.ts) runs
        // against this full object for the /number/:orderNumber lookup path, which
        // doesn't go through the checkOrderAccess middleware/findAssignmentById at
        // all. Without it here, a Manager's join-table fallback silently evaluates
        // to false and a legitimately-visible order 403s.
        customer: {
          include: {
            phones: true,
            addresses: true,
            assignedEmployee: { select: { managedBy: { select: { managerId: true } } } },
          },
        },
        assignedEmployees: { include: { employee: { select: { id: true, name: true } } } },
        createdBy: { select: { id: true, name: true } },
        cancelledBy: { select: { id: true, name: true } },
      },
    });
  },

  // Same shape as findById — the order-number URL (ORDER_DETAILS_UPGRADE_TODO.md §1)
  // resolves through this once, then everything else on the page uses the numeric id.
  findByOrderNumber(orderNumber: string) {
    return prisma.order.findFirst({
      where: { orderNumber, deletedAt: null },
      include: {
        items: {
          include: {
            product: {
              select: { id: true, name: true, image: true, weightValue: true, weightUnit: true },
            },
          },
        },
        address: true,
        // assignedEmployee.managedBy (Phase 18 item 3) is fetched here too, not just
        // in findAssignmentById — assertOrderAccessible (order.service.ts) runs
        // against this full object for the /number/:orderNumber lookup path, which
        // doesn't go through the checkOrderAccess middleware/findAssignmentById at
        // all. Without it here, a Manager's join-table fallback silently evaluates
        // to false and a legitimately-visible order 403s.
        customer: {
          include: {
            phones: true,
            addresses: true,
            assignedEmployee: { select: { managedBy: { select: { managerId: true } } } },
          },
        },
        assignedEmployees: { include: { employee: { select: { id: true, name: true } } } },
        createdBy: { select: { id: true, name: true } },
        cancelledBy: { select: { id: true, name: true } },
      },
    });
  },

  // Light select for checkOrderAccess — scopes by the order's customer's *live*
  // assignment (phases.md §44) OR the order's own assigned-employees join table
  // (Phase 18 — shared visibility, see utils/dataScope.ts's hasOrderDataAccess). Also
  // selects the customer's assigned Employee's own set of Managers (Phase 18 item 3)
  // for the same "no explicit manager chosen" fallback used on the Customer side.
  findAssignmentById(id: number) {
    return prisma.order.findFirst({
      where: { id, deletedAt: null },
      select: {
        id: true,
        customerId: true,
        orderStatus: true,
        customer: {
          select: {
            assignedEmployeeId: true,
            assignedManagerId: true,
            assignedEmployee: { select: { managedBy: { select: { managerId: true } } } },
          },
        },
        assignedEmployees: { select: { employeeId: true } },
      },
    });
  },

  async nextOrderNumber(client: PrismaClientOrTx = prisma) {
    const year = new Date().getFullYear();
    const count = await client.order.count({
      where: { orderNumber: { startsWith: `ORD-${year}-` } },
    });
    return `ORD-${year}-${String(count + 1).padStart(6, '0')}`;
  },

  // Generated alongside orderNumber at creation (Phase 13) — every order always has
  // an invoice number, same per-year sequential pattern.
  async nextInvoiceNumber(client: PrismaClientOrTx = prisma) {
    const year = new Date().getFullYear();
    const count = await client.order.count({
      where: { invoiceNumber: { startsWith: `INV-${year}-` } },
    });
    return `INV-${year}-${String(count + 1).padStart(6, '0')}`;
  },

  create(
    data: {
      orderNumber: string;
      invoiceNumber: string;
      customerId: number;
      subtotal: number;
      discount: number;
      shipping: number;
      total: number;
      paymentMethod: PaymentMethod;
      createdById?: number;
      assignedEmployeeIds?: number[];
      notes?: string;
      items: OrderItemInput[];
      address?: OrderAddressInput;
      articleNumber?: string | null;
      estimatedDeliveryCharges?: number | null;
    },
    client: PrismaClientOrTx = prisma
  ) {
    return client.order.create({
      data: {
        orderNumber: data.orderNumber,
        invoiceNumber: data.invoiceNumber,
        customerId: data.customerId,
        subtotal: data.subtotal,
        discount: data.discount,
        shipping: data.shipping,
        total: data.total,
        paymentMethod: data.paymentMethod,
        createdById: data.createdById,
        notes: data.notes,
        articleNumber: data.articleNumber,
        estimatedDeliveryCharges: data.estimatedDeliveryCharges,
        items: { create: data.items },
        ...(data.address && { address: { create: data.address } }),
        ...(data.assignedEmployeeIds &&
          data.assignedEmployeeIds.length > 0 && {
            assignedEmployees: {
              create: data.assignedEmployeeIds.map((employeeId) => ({ employeeId })),
            },
          }),
      },
      include: { items: true, address: true },
    });
  },

  async update(
    id: number,
    data: {
      items?: OrderItemInput[];
      subtotal?: number;
      discount?: number;
      shipping?: number;
      total?: number;
      address?: OrderAddressInput;
      notes?: string;
      assignedEmployeeIds?: number[];
      expectedDelivery?: Date;
      articleNumber?: string | null;
      estimatedDeliveryCharges?: number | null;
    },
    client: PrismaClientOrTx = prisma
  ) {
    if (data.items) {
      await client.orderItem.deleteMany({ where: { orderId: id } });
      await client.orderItem.createMany({
        data: data.items.map((item) => ({ ...item, orderId: id })),
      });
    }

    if (data.address) {
      await client.orderAddress.deleteMany({ where: { orderId: id } });
      await client.orderAddress.create({ data: { ...data.address, orderId: id } });
    }

    // Phase 18: assignedEmployeeIds, when present, is the full replacement set (not
    // a diff) — same convention as the schema comment. undefined means "don't touch".
    if (data.assignedEmployeeIds !== undefined) {
      await client.orderAssignedEmployee.deleteMany({ where: { orderId: id } });
      if (data.assignedEmployeeIds.length > 0) {
        await client.orderAssignedEmployee.createMany({
          data: data.assignedEmployeeIds.map((employeeId) => ({ orderId: id, employeeId })),
        });
      }
    }

    return client.order.update({
      where: { id },
      data: {
        subtotal: data.subtotal,
        discount: data.discount,
        shipping: data.shipping,
        total: data.total,
        notes: data.notes,
        expectedDelivery: data.expectedDelivery,
        articleNumber: data.articleNumber,
        estimatedDeliveryCharges: data.estimatedDeliveryCharges,
      },
      include: { items: true, address: true },
    });
  },

  updateStatus(id: number, orderStatus: OrderStatus, client: PrismaClientOrTx = prisma) {
    return client.order.update({ where: { id }, data: { orderStatus } });
  },

  // Written only by orderService's payment ledger logic (add/reverse a Payment),
  // never directly from a request body — see Payment model comment in schema.prisma.
  setPaymentStatus(
    id: number,
    paymentStatus: PaymentStatus,
    client: PrismaClientOrTx = prisma
  ) {
    return client.order.update({ where: { id }, data: { paymentStatus } });
  },

  // Writes the new status onto Order *and* appends a DeliveryTracking history row.
  // Takes an optional client so the Order Status auto-sync (Phase 17) can run in the
  // same outer transaction — see orderService.updateDeliveryStatus.
  async updateDeliveryStatus(
    id: number,
    data: {
      deliveryStatus: DeliveryStatus;
      location?: string;
      note?: string;
      receivedBy?: string;
      updatedById: number;
    },
    client: PrismaClientOrTx = prisma
  ) {
    const order = await client.order.update({
      where: { id },
      data: {
        deliveryStatus: data.deliveryStatus,
        // Status is manually revertible, so keep deliveredDate in sync in both
        // directions — set it when (re-)marking DELIVERED, clear it if reverted
        // away from DELIVERED so it doesn't show a stale delivery timestamp.
        deliveredDate: data.deliveryStatus === 'DELIVERED' ? new Date() : null,
      },
    });
    await client.deliveryTracking.create({
      data: {
        orderId: id,
        status: data.deliveryStatus,
        location: data.location,
        note: data.note,
        receivedBy: data.receivedBy,
        updatedById: data.updatedById,
      },
    });
    return order;
  },

  findTracking(orderId: number) {
    return prisma.deliveryTracking.findMany({
      where: { orderId },
      include: { updatedBy: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'asc' },
    });
  },

  cancel(
    id: number,
    data: { cancelledById: number; cancellationReason: string },
    client: PrismaClientOrTx = prisma
  ) {
    return client.order.update({
      where: { id },
      data: {
        orderStatus: 'CANCELLED',
        cancelledById: data.cancelledById,
        cancelledAt: new Date(),
        cancellationReason: data.cancellationReason,
      },
    });
  },

  recordActivity(
    orderId: number,
    action: string,
    createdById: number | undefined,
    oldValue?: string,
    newValue?: string,
    client: PrismaClientOrTx = prisma
  ) {
    return client.orderActivity.create({
      data: { orderId, action, oldValue, newValue, createdById },
    });
  },

  findActivity(orderId: number) {
    return prisma.orderActivity.findMany({
      where: { orderId },
      include: { createdBy: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'desc' },
    });
  },

  // Trash (Phase 3 addendum).
  findTrashedById(id: number) {
    return prisma.order.findFirst({ where: { id, deletedAt: { not: null } } });
  },

  findTrashed() {
    return prisma.order.findMany({
      where: { deletedAt: { not: null }, purgedAt: null },
      include: { deletedBy: { select: { id: true, name: true } } },
      orderBy: { deletedAt: 'desc' },
    });
  },

  softDelete(id: number, deletedById: number, deletionExpiresAt: Date) {
    return prisma.order.update({
      where: { id },
      data: { deletedAt: new Date(), deletedById, deletionExpiresAt },
    });
  },

  restore(id: number) {
    return prisma.order.update({
      where: { id },
      data: { deletedAt: null, deletedById: null, deletionExpiresAt: null },
    });
  },

  // Not a real DELETE FROM — blocked by its own OrderItem/Payment/etc. child rows,
  // and cascading into Payment would break the append-only ledger Phase 13 built.
  // Unlike Customer, nothing is scrubbed — an Order isn't personal data the way a
  // Customer's contact details are, just marked as permanently gone from Trash.
  permanentDelete(id: number) {
    return prisma.order.update({ where: { id }, data: { purgedAt: new Date() } });
  },

  findExpired() {
    return prisma.order.findMany({
      where: { deletedAt: { not: null }, purgedAt: null, deletionExpiresAt: { lte: new Date() } },
      select: { id: true, orderNumber: true },
    });
  },
};
